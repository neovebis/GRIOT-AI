import { createClient, type SupabaseClient } from "npm:@supabase/supabase-js@^2";
import {
  StudioComputeAssertionIssueError,
  StudioComputeAssertionVerifyError,
  verifyStudioComputeAssertion,
  type StudioComputeAssertionClaims,
} from "./compute-assertion.ts";

type Row = Record<string, any>;
const MAX_ARCHIVE_BYTES = 256 * 1024 * 1024;

/**
 * Server-to-server source broker for Connected Compute.
 *
 * The execution gateway receives project bytes, never the user's GitHub token.
 * The requested mutable ref is resolved to an immutable GitHub commit and tree
 * before the archive is requested. Both immutable identities are returned as
 * evidence so the gateway can reconstruct the tree locally and fail closed if
 * archive contents do not match GitHub's commit object.
 */
export async function handleStudioSourceArchive(request: Request): Promise<Response> {
  try {
    await requireGateway(request);
    const body = await jsonBody(request);
    const token = String(body.assertion || "");
    const claims = await verifyStudioComputeAssertion(token);
    const db = adminClient();
    const binding = await requireBinding(db, claims);
    const secret = await githubSecret(db, binding, claims);
    const resolved = await resolveCommit(secret, claims.repository.fullName, claims.repository.ref);
    const archive = await fetchArchive(secret, claims.repository.fullName, resolved.commitSha);
    return sourceResponse(archive, claims, resolved);
  } catch (error) {
    const status = error instanceof SourceBrokerError ? error.status
      : error instanceof StudioComputeAssertionVerifyError ? 401
      : error instanceof StudioComputeAssertionIssueError ? 503
      : 500;
    const message = error instanceof Error ? error.message : "Source broker failed";
    if (status >= 500) console.error("griot-studio-source-broker", message);
    return jsonError(status, status >= 500 ? "Connected Compute source broker is unavailable" : message);
  }
}

class SourceBrokerError extends Error {
  constructor(readonly status: number, message: string) {
    super(message);
    this.name = "SourceBrokerError";
  }
}

function config() {
  const url = Deno.env.get("SUPABASE_URL") || "";
  const service = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || Deno.env.get("SUPABASE_SECRET_KEY") || "";
  if (!url || !service) throw new SourceBrokerError(503, "Supabase server configuration is unavailable");
  return { url, service };
}

function adminClient(): SupabaseClient {
  const cfg = config();
  return createClient(cfg.url, cfg.service, { auth: { persistSession: false, autoRefreshToken: false } });
}

async function requireGateway(request: Request) {
  const expected = Deno.env.get("GRIOT_EXECUTION_GATEWAY_INTERNAL_KEY") || "";
  const supplied = request.headers.get("x-griot-execution-gateway-key") || "";
  if (expected.length < 32) throw new SourceBrokerError(503, "Execution gateway source brokerage is not configured");
  if (supplied.length < 32) throw new SourceBrokerError(403, "Execution gateway is not authorized");
  const [expectedDigest, suppliedDigest] = await Promise.all([digest(expected), digest(supplied)]);
  if (expectedDigest !== suppliedDigest) throw new SourceBrokerError(403, "Execution gateway is not authorized");
}

async function jsonBody(request: Request): Promise<Row> {
  try {
    const value = await request.json();
    if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error("not an object");
    return value as Row;
  } catch {
    throw new SourceBrokerError(400, "Invalid source broker request");
  }
}

async function requireBinding(db: SupabaseClient, claims: StudioComputeAssertionClaims): Promise<Row> {
  const result = await db.from("griot_studio_repository_bindings")
    .select("id,workspace_id,project_id,credential_id,repository_id,repository_owner,repository_name,repository_full_name,ref,binding_sha256,status,verified_by")
    .eq("id", claims.bindingId)
    .eq("workspace_id", claims.workspaceId)
    .eq("project_id", claims.studioProjectId)
    .eq("status", "verified")
    .maybeSingle();
  if (result.error) throw new SourceBrokerError(503, "Verified source binding could not be loaded");
  if (!result.data) throw new SourceBrokerError(409, "Verified source binding is no longer active");
  const binding = result.data as Row;
  if (
    String(binding.binding_sha256).toLowerCase() !== claims.bindingSha256
    || String(binding.repository_id) !== claims.repository.id
    || String(binding.repository_full_name) !== claims.repository.fullName
    || String(binding.ref) !== claims.repository.ref
  ) {
    throw new SourceBrokerError(409, "Verified source binding changed after compute authorization");
  }
  // V1 deliberately does not lend a personal GitHub credential across users.
  // Shared/team repository credentials can be introduced later as a distinct
  // workspace-owned credential kind with explicit policy.
  if (String(binding.verified_by) !== claims.sub) {
    throw new SourceBrokerError(403, "Compute actor does not own the repository binding credential");
  }
  return binding;
}

async function githubSecret(db: SupabaseClient, binding: Row, claims: StudioComputeAssertionClaims): Promise<string> {
  const credential = await db.from("griot_credentials")
    .select("id,workspace_id,kind,provider_id,status,created_by")
    .eq("id", binding.credential_id)
    .eq("workspace_id", claims.workspaceId)
    .eq("created_by", claims.sub)
    .eq("kind", "plugin")
    .eq("provider_id", "github")
    .eq("status", "active")
    .maybeSingle();
  if (credential.error) throw new SourceBrokerError(503, "GitHub credential state could not be loaded");
  if (!credential.data) throw new SourceBrokerError(409, "GitHub credential is no longer active for this compute actor");

  const secret = await db.from("griot_credential_secrets")
    .select("secret_ciphertext,secret_iv")
    .eq("credential_id", credential.data.id)
    .maybeSingle();
  if (secret.error || !secret.data) throw new SourceBrokerError(503, "GitHub credential secret is unavailable");
  return decryptSecret(secret.data as Row);
}

async function decryptSecret(secret: Row): Promise<string> {
  const encodedKey = Deno.env.get("GRIOT_VAULT_MASTER_KEY") || "";
  let rawKey: Uint8Array;
  try { rawKey = decodeBase64(encodedKey); }
  catch { throw new SourceBrokerError(503, "Credential vault key is invalid"); }
  if (rawKey.length !== 32) throw new SourceBrokerError(503, "Credential vault key must contain 256 bits");
  try {
    const key = await crypto.subtle.importKey("raw", rawKey, { name: "AES-GCM" }, false, ["decrypt"]);
    const plaintext = await crypto.subtle.decrypt(
      { name: "AES-GCM", iv: decodeBase64(String(secret.secret_iv || "")) },
      key,
      decodeBase64(String(secret.secret_ciphertext || "")),
    );
    const value = new TextDecoder().decode(plaintext);
    if (!value) throw new Error("empty credential");
    return value;
  } catch {
    throw new SourceBrokerError(503, "GitHub credential could not be decrypted");
  }
}

async function resolveCommit(
  secret: string,
  fullName: string,
  ref: string,
): Promise<{ commitSha: string; treeSha: string }> {
  const [owner, repo] = fullName.split("/") as [string, string];
  const response = await fetch(
    `https://api.github.com/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}/commits/${encodeURIComponent(ref)}`,
    {
      headers: githubHeaders(secret),
      signal: AbortSignal.timeout(30_000),
    },
  );
  const text = await response.text();
  if (!response.ok) {
    throw new SourceBrokerError(response.status === 404 ? 409 : 502, `GitHub could not resolve the verified ref (${response.status})`);
  }
  let payload: Row;
  try { payload = JSON.parse(text) as Row; }
  catch { throw new SourceBrokerError(502, "GitHub commit resolution returned invalid JSON"); }
  const commitSha = String(payload.sha || "").toLowerCase();
  const treeSha = String(payload.commit?.tree?.sha || "").toLowerCase();
  if (!/^[0-9a-f]{40}$/.test(commitSha)) {
    throw new SourceBrokerError(502, "GitHub commit resolution omitted a valid commit SHA");
  }
  if (!/^[0-9a-f]{40}$/.test(treeSha)) {
    throw new SourceBrokerError(502, "GitHub commit resolution omitted a valid tree SHA");
  }
  return { commitSha, treeSha };
}

async function fetchArchive(secret: string, fullName: string, commitSha: string): Promise<Response> {
  const [owner, repo] = fullName.split("/") as [string, string];
  const response = await fetch(
    `https://api.github.com/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}/tarball/${commitSha}`,
    {
      headers: githubHeaders(secret),
      redirect: "follow",
      signal: AbortSignal.timeout(120_000),
    },
  );
  if (!response.ok || !response.body) {
    await response.body?.cancel().catch(() => undefined);
    throw new SourceBrokerError(response.status === 404 ? 409 : 502, `GitHub source archive request failed (${response.status})`);
  }
  const length = Number(response.headers.get("content-length") || "0");
  if (Number.isFinite(length) && length > MAX_ARCHIVE_BYTES) {
    await response.body.cancel().catch(() => undefined);
    throw new SourceBrokerError(413, "Repository archive exceeds the Connected Compute source limit");
  }
  return response;
}

function sourceResponse(
  upstream: Response,
  claims: StudioComputeAssertionClaims,
  resolved: { commitSha: string; treeSha: string },
): Response {
  let transferred = 0;
  const limited = upstream.body!.pipeThrough(new TransformStream<Uint8Array, Uint8Array>({
    transform(chunk, controller) {
      transferred += chunk.byteLength;
      if (transferred > MAX_ARCHIVE_BYTES) {
        controller.error(new Error("Repository archive exceeded the Connected Compute source limit while streaming"));
        return;
      }
      controller.enqueue(chunk);
    },
  }));
  const headers = new Headers({
    "content-type": upstream.headers.get("content-type") || "application/x-gzip",
    "cache-control": "private, no-store, max-age=0",
    "content-disposition": `attachment; filename="griot-source-${resolved.commitSha.slice(0, 12)}.tar.gz"`,
    "x-content-type-options": "nosniff",
    "x-griot-source-archive-kind": "github-tarball",
    "x-griot-source-binding-sha256": claims.bindingSha256,
    "x-griot-source-commit-sha": resolved.commitSha,
    "x-griot-source-tree-sha": resolved.treeSha,
    "x-griot-source-repository-id": claims.repository.id,
    "x-griot-source-ref-encoded": encodeURIComponent(claims.repository.ref),
  });
  const contentLength = upstream.headers.get("content-length");
  if (contentLength) headers.set("content-length", contentLength);
  return new Response(limited, { status: 200, headers });
}

function githubHeaders(secret: string): HeadersInit {
  return {
    Authorization: `Bearer ${secret}`,
    Accept: "application/vnd.github+json",
    "User-Agent": "GRIOT-Connected-Compute-Source-Broker/1",
    "X-GitHub-Api-Version": "2022-11-28",
  };
}

function jsonError(status: number, message: string): Response {
  return new Response(JSON.stringify({ error: message }), {
    status,
    headers: {
      "content-type": "application/json; charset=utf-8",
      "cache-control": "no-store",
    },
  });
}

async function digest(value: string): Promise<string> {
  const bytes = new Uint8Array(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value)));
  return Array.from(bytes).map((byte) => byte.toString(16).padStart(2, "0")).join("");
}

function decodeBase64(value: string): Uint8Array {
  const normalized = value.trim();
  if (!normalized || !/^[A-Za-z0-9+/]+={0,2}$/.test(normalized)) throw new Error("invalid base64");
  const binary = atob(normalized);
  return Uint8Array.from(binary, (char) => char.charCodeAt(0));
}
