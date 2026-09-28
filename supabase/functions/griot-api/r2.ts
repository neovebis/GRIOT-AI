type R2Config = {
  endpoint: string;
  host: string;
  bucket: string;
  accessKeyId: string;
  secretAccessKey: string;
  ttlSeconds: number;
};

export type R2HeadResult = {
  ok: boolean;
  status: number;
  size: number | null;
  etag: string | null;
  contentType: string | null;
};

export type R2SignedUrl = {
  url: string;
  method: "GET" | "PUT" | "HEAD" | "DELETE";
  headers: Record<string, string>;
  expiresIn: number;
};

function bytes(value: string) {
  return new TextEncoder().encode(value);
}

function hex(value: Uint8Array) {
  return Array.from(value).map((item) => item.toString(16).padStart(2, "0")).join("");
}

function rfc3986(value: string) {
  return encodeURIComponent(value).replace(/[!'()*]/g, (item) => "%" + item.charCodeAt(0).toString(16).toUpperCase());
}

function objectPath(bucket: string, key: string) {
  const segments = key.split("/").filter(Boolean);
  if (!segments.length || segments.some((item) => item === "." || item === "..")) throw new Error("Invalid R2 object key");
  return "/" + [bucket, ...segments].map(rfc3986).join("/");
}

function canonicalQuery(values: Record<string, string>) {
  return Object.entries(values)
    .map(([key, value]) => [rfc3986(key), rfc3986(value)] as const)
    .sort(([keyA, valueA], [keyB, valueB]) => keyA === keyB ? (valueA < valueB ? -1 : valueA > valueB ? 1 : 0) : (keyA < keyB ? -1 : 1))
    .map(([key, value]) => key + "=" + value)
    .join("&");
}

function normalizeHeader(value: string) {
  return value.trim().replace(/\s+/g, " ");
}

async function sha256(value: string) {
  return hex(new Uint8Array(await crypto.subtle.digest("SHA-256", bytes(value))));
}

async function hmac(key: Uint8Array, value: string) {
  const cryptoKey = await crypto.subtle.importKey("raw", key, { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  return new Uint8Array(await crypto.subtle.sign("HMAC", cryptoKey, bytes(value)));
}

async function signingKey(secret: string, date: string, region: string, service: string) {
  const dateKey = await hmac(bytes("AWS4" + secret), date);
  const regionKey = await hmac(dateKey, region);
  const serviceKey = await hmac(regionKey, service);
  return hmac(serviceKey, "aws4_request");
}

function config(): R2Config {
  const accountId = Deno.env.get("GRIOT_R2_ACCOUNT_ID") || "";
  const configuredEndpoint = Deno.env.get("GRIOT_R2_ENDPOINT") || (accountId ? "https://" + accountId + ".r2.cloudflarestorage.com" : "");
  const bucket = Deno.env.get("GRIOT_R2_BUCKET") || "";
  const accessKeyId = Deno.env.get("GRIOT_R2_ACCESS_KEY_ID") || "";
  const secretAccessKey = Deno.env.get("GRIOT_R2_SECRET_ACCESS_KEY") || "";
  if (!configuredEndpoint || !bucket || !accessKeyId || !secretAccessKey) throw new Error("R2 is not configured");
  let parsed: URL;
  try { parsed = new URL(configuredEndpoint); } catch { throw new Error("GRIOT_R2_ENDPOINT is invalid"); }
  if (parsed.protocol !== "https:" || parsed.pathname !== "/" || parsed.search || parsed.hash) throw new Error("GRIOT_R2_ENDPOINT must be a base HTTPS URL");
  if (!/^[a-z0-9][a-z0-9.-]{1,61}[a-z0-9]$/.test(bucket)) throw new Error("GRIOT_R2_BUCKET is invalid");
  const rawTtl = Number(Deno.env.get("GRIOT_UPLOAD_URL_TTL_SECONDS") || "900");
  const ttlSeconds = Number.isFinite(rawTtl) ? Math.min(604800, Math.max(60, Math.floor(rawTtl))) : 900;
  return { endpoint: parsed.toString().replace(/\/$/, ""), host: parsed.host, bucket, accessKeyId, secretAccessKey, ttlSeconds };
}

export function assertR2Configured() {
  config();
}

export function maxArtifactBytes() {
  const configured = Number(Deno.env.get("GRIOT_ARTIFACT_MAX_BYTES") || "26214400");
  if (!Number.isFinite(configured) || configured <= 0) return 26214400;
  return Math.min(Math.floor(configured), 104857600);
}

async function presign(method: "GET" | "PUT" | "HEAD" | "DELETE", key: string, contentType?: string): Promise<R2SignedUrl> {
  const current = config();
  const now = new Date();
  const amzDate = now.toISOString().replace(/\.\d{3}Z$/, "Z").replace(/[:-]/g, "");
  const shortDate = amzDate.slice(0, 8);
  const region = "auto";
  const service = "s3";
  const scope = shortDate + "/" + region + "/" + service + "/aws4_request";
  const headers: Record<string, string> = { host: current.host };
  if (method === "PUT") {
    if (!contentType) throw new Error("R2 PUT requires a content type");
    headers["content-type"] = normalizeHeader(contentType);
  }
  const signedHeaders = Object.keys(headers).sort().join(";");
  const canonicalHeaders = Object.keys(headers).sort().map((key) => key + ":" + normalizeHeader(headers[key]) + "\n").join("");
  const query: Record<string, string> = {
    "X-Amz-Algorithm": "AWS4-HMAC-SHA256",
    "X-Amz-Credential": current.accessKeyId + "/" + scope,
    "X-Amz-Date": amzDate,
    "X-Amz-Expires": String(current.ttlSeconds),
    "X-Amz-SignedHeaders": signedHeaders,
  };
  const path = objectPath(current.bucket, key);
  const queryString = canonicalQuery(query);
  const canonicalRequest = [method, path, queryString, canonicalHeaders, signedHeaders, "UNSIGNED-PAYLOAD"].join("\n");
  const stringToSign = ["AWS4-HMAC-SHA256", amzDate, scope, await sha256(canonicalRequest)].join("\n");
  const signature = hex(await signingKey(current.secretAccessKey, shortDate, region, service).then((key) => hmac(key, stringToSign)));
  return {
    url: current.endpoint + path + "?" + queryString + "&X-Amz-Signature=" + signature,
    method,
    headers: method === "PUT" ? { "content-type": headers["content-type"] } : {},
    expiresIn: current.ttlSeconds,
  };
}

export function presignedUpload(key: string, contentType: string) {
  return presign("PUT", key, contentType);
}

export function presignedDownload(key: string) {
  return presign("GET", key);
}

async function signedRequest(method: "HEAD" | "DELETE", key: string) {
  const signed = await presign(method, key);
  const response = await fetch(signed.url, { method, signal: AbortSignal.timeout(20000) });
  return { response, signed };
}

export async function headObject(key: string): Promise<R2HeadResult> {
  const { response } = await signedRequest("HEAD", key);
  return {
    ok: response.ok,
    status: response.status,
    size: response.headers.get("content-length") ? Number(response.headers.get("content-length")) : null,
    etag: response.headers.get("etag"),
    contentType: response.headers.get("content-type"),
  };
}

export async function deleteObject(key: string) {
  const { response } = await signedRequest("DELETE", key);
  if (!response.ok && response.status !== 404) throw new Error("R2 delete failed with HTTP " + response.status);
}