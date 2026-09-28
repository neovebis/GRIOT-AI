import "@supabase/functions-js/edge-runtime.d.ts";
import { createClient, type SupabaseClient, type User } from "@supabase/supabase-js";
import {
  assertR2Configured,
  deleteObject,
  headObject,
  maxArtifactBytes,
  presignedDownload,
  presignedUpload,
} from "./r2.ts";

type Row = Record<string, any>;
type Ctx = {
  user: User;
  workspaceId: string;
  role: string;
  isPlatformAdmin: boolean;
  client: SupabaseClient;
  db: SupabaseClient;
};
const PROVIDERS = ["gemini", "openai", "anthropic", "groq", "openrouter"];
const PLUGINS = ["github", "supabase", "vercel", "cloudflare"];
const PIPELINE_ROLES = ["planner", "builder", "reviewer", "verifier"] as const;
type PipelineRole = (typeof PIPELINE_ROLES)[number];
type PipelineNodeConfig = {
  id: string;
  role: PipelineRole;
  label: string;
  providerId: string;
  model: string;
  credentialId: string;
  enabled: true;
  temperature: number;
  systemPrompt: string;
};
class ApiError extends Error {
  constructor(
    public status: number,
    message: string,
  ) {
    super(message);
  }
}

function config() {
  const url = Deno.env.get("SUPABASE_URL") || "";
  const anon = Deno.env.get("SUPABASE_ANON_KEY") || Deno.env.get("SUPABASE_PUBLISHABLE_KEY") || "";
  const service =
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || Deno.env.get("SUPABASE_SECRET_KEY") || "";
  if (!url || !anon || !service) throw new ApiError(503, "Supabase server keys are not configured");
  return {
    url,
    anon,
    service,
    origins: (
      Deno.env.get("WEB_ORIGIN") ||
      "https://griot.pt,http://localhost:3001,http://127.0.0.1:3001,http://localhost:5173"
    )
      .split(",")
      .map((v) => v.trim()),
  };
}
function cors(req: Request) {
  const origin = req.headers.get("origin"),
    allowed = config().origins,
    x = new Headers({
      "access-control-allow-methods": "GET,POST,PUT,DELETE,OPTIONS",
      "access-control-allow-headers": "authorization,apikey,content-type,x-griot-workspace-id",
      "access-control-max-age": "86400",
      vary: "Origin",
    });
  if (!origin || allowed.includes("*") || allowed.includes(origin))
    x.set("access-control-allow-origin", origin || allowed[0] || "*");
  return x;
}
function reply(req: Request, data: unknown, status = 200) {
  const x = cors(req);
  x.set("content-type", "application/json; charset=utf-8");
  return new Response(JSON.stringify(data), { status, headers: x });
}
function route(req: Request) {
  return (
    new URL(req.url).pathname
      .replace(/^\/functions\/v1\/griot-api/, "")
      .replace(/^\/griot-api/, "") || "/"
  );
}
async function json(req: Request): Promise<Row> {
  try {
    const v = await req.json();
    if (!v || typeof v !== "object" || Array.isArray(v)) throw 0;
    return v;
  } catch {
    throw new ApiError(400, "Invalid JSON body");
  }
}
function client(req?: Request) {
  const c = config(),
    authorization = req?.headers.get("authorization");
  return createClient(c.url, c.anon, {
    auth: { persistSession: false, autoRefreshToken: false },
    global: authorization ? { headers: { Authorization: authorization } } : undefined,
  });
}
function admin() {
  const c = config();
  return createClient(c.url, c.service, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}
async function makeWorkspace(db: SupabaseClient, user: User, name?: string) {
  const existing = await db
    .from("griot_workspace_members")
    .select("workspace_id,role,created_at")
    .eq("user_id", user.id)
    .order("created_at", { ascending: true })
    .limit(1)
    .maybeSingle();
  if (existing.error) throw new ApiError(500, "Could not resolve workspace");
  if (existing.data) return { id: existing.data.workspace_id, role: existing.data.role };
  const display = String(
    user.user_metadata?.display_name || user.email?.split("@")[0] || "GRIOT user",
  );
  await db
    .from("griot_user_profiles")
    .upsert({ id: user.id, display_name: display }, { onConflict: "id" });
  const workspace = await db
    .from("griot_workspaces")
    .insert({
      name: name || display + "'s workspace",
      slug: "workspace-" + user.id.replaceAll("-", "").slice(0, 16),
    })
    .select("id")
    .single();
  if (workspace.error || !workspace.data) throw new ApiError(500, "Could not create workspace");
  const member = await db
    .from("griot_workspace_members")
    .insert({ workspace_id: workspace.data.id, user_id: user.id, role: "owner" });
  if (member.error) throw new ApiError(500, "Could not attach user to workspace");
  const initialCredit = await db.rpc("griot_gcu_grant", {
    p_workspace_id: workspace.data.id,
    p_actor_id: user.id,
    p_amount: 5,
    p_idempotency_key: `free-welcome-${user.id}`,
    p_reason: "Crédito inicial do plano Free",
    p_source: "free_plan",
  });
  if (initialCredit.error) throw new ApiError(500, "Could not create initial GCU allowance");
  return { id: workspace.data.id, role: "owner" };
}
async function auth(req: Request): Promise<Ctx> {
  if (!req.headers.get("authorization")?.toLowerCase().startsWith("bearer "))
    throw new ApiError(401, "Authentication required");
  const userClient = client(req),
    result = await userClient.auth.getUser();
  if (result.error || !result.data.user) throw new ApiError(401, "Invalid or expired session");
  const db = admin(),
    requested = req.headers.get("x-griot-workspace-id")?.trim() || "";
  let q = db
    .from("griot_workspace_members")
    .select("workspace_id,role,created_at")
    .eq("user_id", result.data.user.id)
    .order("created_at", { ascending: true });
  q = requested ? q.eq("workspace_id", requested) : q.limit(1);
  let member = await q.maybeSingle();
  const platform = await db
    .from("griot_platform_admins")
    .select("user_id")
    .eq("user_id", result.data.user.id)
    .eq("active", true)
    .maybeSingle();
  const isPlatformAdmin = !platform.error && !!platform.data;
  const adminRequest = route(req).startsWith("/admin/");
  // Users created directly in Supabase Auth may not have gone through the
  // application's registration route. Provision only their own default
  // workspace when no workspace was explicitly requested; never turn an
  // arbitrary workspace header into access.
  if (!member.error && !member.data && !requested && !isPlatformAdmin) {
    const workspace = await makeWorkspace(db, result.data.user);
    member = {
      data: {
        workspace_id: workspace.id,
        role: workspace.role,
        created_at: new Date().toISOString(),
      },
      error: null,
    };
  }
  if ((member.error || !member.data) && (!isPlatformAdmin || !adminRequest))
    throw new ApiError(403, "No workspace access; use an audited admin route");
  return {
    user: result.data.user,
    workspaceId: member.data?.workspace_id || requested,
    role: isPlatformAdmin ? "platform_admin" : member.data!.role,
    isPlatformAdmin,
    client: userClient,
    db,
  };
}
function userJson(user: User) {
  return {
    id: user.id,
    email: user.email,
    displayName: user.user_metadata?.display_name || user.email?.split("@")[0] || "",
  };
}
function authRedirect(req: Request, mode: "confirm" | "reset") {
  const origin = req.headers.get("origin")?.trim() || "https://griot.pt";
  const allowed = config().origins;
  const base = allowed.includes("*") || allowed.includes(origin) ? origin : "https://griot.pt";
  // Supabase appends type=signup or type=recovery to the hash. Returning to
  // the site root keeps the redirect allow-list minimal and the web app picks
  // the correct auth screen from that signed callback state.
  void mode;
  return base.replace(/\/$/, "");
}
function b64(v: Uint8Array) {
  let s = "";
  for (const n of v) s += String.fromCharCode(n);
  return btoa(s);
}
function unb64(s: string) {
  const x = atob(s);
  return Uint8Array.from(x, (c) => c.charCodeAt(0));
}
async function vaultKey() {
  let raw: Uint8Array;
  try {
    raw = unb64(Deno.env.get("GRIOT_VAULT_MASTER_KEY") || "");
  } catch {
    throw new ApiError(503, "GRIOT_VAULT_MASTER_KEY must be Base64");
  }
  if (raw.length !== 32) throw new ApiError(503, "GRIOT_VAULT_MASTER_KEY must decode to 32 bytes");
  return crypto.subtle.importKey("raw", raw, { name: "AES-GCM" }, false, ["encrypt", "decrypt"]);
}
async function encrypt(secret: string) {
  const key = await vaultKey(),
    iv = crypto.getRandomValues(new Uint8Array(12)),
    text = new TextEncoder().encode(secret);
  const cipher = new Uint8Array(await crypto.subtle.encrypt({ name: "AES-GCM", iv }, key, text));
  const fingerprint = new Uint8Array(await crypto.subtle.digest("SHA-256", text));
  return { secret_ciphertext: b64(cipher), secret_iv: b64(iv), fingerprint: b64(fingerprint) };
}
async function decrypt(row: Row) {
  try {
    const value = await crypto.subtle.decrypt(
      { name: "AES-GCM", iv: unb64(row.secret_iv) },
      await vaultKey(),
      unb64(row.secret_ciphertext),
    );
    return new TextDecoder().decode(value);
  } catch {
    throw new ApiError(503, "Credential cannot be decrypted with the current vault key");
  }
}
async function credentialSecret(db: SupabaseClient, id: string) {
  const result = await db
    .from("griot_credential_secrets")
    .select("secret_ciphertext,secret_iv")
    .eq("credential_id", id)
    .maybeSingle();
  if (result.error || !result.data) throw new ApiError(503, "Credential secret is unavailable");
  return result.data as Row;
}
async function fetchTimeout(input: RequestInfo | URL, init: RequestInit = {}, timeout = 20000) {
  const controller = new AbortController(),
    timer = setTimeout(() => controller.abort(), timeout);
  try {
    return await fetch(input, { ...init, signal: controller.signal });
  } finally {
    clearTimeout(timer);
  }
}
async function providerError(result: Response) {
  try {
    const value = (await result.json()) as Row;
    return value.message || value.error?.message || value.error || result.statusText;
  } catch {
    return result.statusText || "HTTP " + result.status;
  }
}
async function verifyProvider(kind: string, id: string, secret: string) {
  let result: Response;
  if (kind === "plugin") {
    const urls: Row = {
      github: "https://api.github.com/user",
      supabase: "https://api.supabase.com/v1/projects?limit=1",
      vercel: "https://api.vercel.com/v2/user",
      cloudflare: "https://api.cloudflare.com/client/v4/user/tokens/verify",
    };
    result = await fetchTimeout(urls[id], {
      headers: { Authorization: "Bearer " + secret, Accept: "application/json" },
    });
  } else if (id === "gemini")
    result = await fetchTimeout(
      "https://generativelanguage.googleapis.com/v1beta/models?key=" + encodeURIComponent(secret),
    );
  else if (id === "anthropic")
    result = await fetchTimeout("https://api.anthropic.com/v1/models", {
      headers: { "x-api-key": secret, "anthropic-version": "2023-06-01" },
    });
  else {
    const base =
      id === "groq"
        ? "https://api.groq.com/openai/v1"
        : id === "openrouter"
          ? "https://openrouter.ai/api/v1"
          : "https://api.openai.com/v1";
    result = await fetchTimeout(base + "/models", {
      headers: { Authorization: "Bearer " + secret },
    });
  }
  return result.ok
    ? { ok: true, message: "API real: " + result.status }
    : {
        ok: false,
        message:
          "Provider rejected the credential (" +
          result.status +
          "): " +
          (await providerError(result)),
      };
}
type GenerateOptions = { timeout?: number; maxOutputTokens?: number; temperature?: number };
type GeneratedUsage = {
  inputTokens: number | null;
  outputTokens: number | null;
  cachedInputTokens: number | null;
  reasoningTokens: number | null;
  totalTokens: number | null;
  usageSource: "provider_response" | "unavailable";
  costConfidence: "unknown";
  estimatedCostUsd: number | null;
  currency: "USD";
};
type GeneratedResult = { text: string; usage: GeneratedUsage };

function integerMetric(value: unknown) {
  const number = Number(value);
  return Number.isSafeInteger(number) && number >= 0 ? number : null;
}

function generatedUsage(provider: string, response: Row): GeneratedUsage {
  const raw = response.usageMetadata || response.usage || {};
  let inputTokens: number | null = null;
  let outputTokens: number | null = null;
  let cachedInputTokens: number | null = null;
  let reasoningTokens: number | null = null;
  let totalTokens: number | null = null;

  if (provider === "gemini") {
    inputTokens = integerMetric(raw.promptTokenCount);
    outputTokens = integerMetric(raw.candidatesTokenCount);
    cachedInputTokens = integerMetric(raw.cachedContentTokenCount);
    totalTokens = integerMetric(raw.totalTokenCount);
  } else if (provider === "anthropic") {
    inputTokens = integerMetric(raw.input_tokens);
    outputTokens = integerMetric(raw.output_tokens);
    const cacheRead = integerMetric(raw.cache_read_input_tokens) || 0;
    const cacheCreation = integerMetric(raw.cache_creation_input_tokens) || 0;
    cachedInputTokens = cacheRead + cacheCreation > 0 ? cacheRead + cacheCreation : null;
    totalTokens = inputTokens !== null && outputTokens !== null ? inputTokens + outputTokens : null;
  } else {
    inputTokens = integerMetric(raw.prompt_tokens);
    outputTokens = integerMetric(raw.completion_tokens);
    totalTokens = integerMetric(raw.total_tokens);
    cachedInputTokens = integerMetric(raw.prompt_tokens_details?.cached_tokens);
    reasoningTokens = integerMetric(raw.completion_tokens_details?.reasoning_tokens);
    if (totalTokens === null && inputTokens !== null && outputTokens !== null)
      totalTokens = inputTokens + outputTokens;
  }

  const hasUsage = [
    inputTokens,
    outputTokens,
    cachedInputTokens,
    reasoningTokens,
    totalTokens,
  ].some((value) => value !== null);
  return {
    inputTokens,
    outputTokens,
    cachedInputTokens,
    reasoningTokens,
    totalTokens,
    usageSource: hasUsage ? "provider_response" : "unavailable",
    costConfidence: "unknown",
    estimatedCostUsd: null,
    currency: "USD",
  };
}

type UsageRecord = {
  workspaceId: string;
  userId: string;
  conversationId?: string | null;
  requestId: string;
  providerId: string;
  modelId: string;
  status: "succeeded" | "failed" | "blocked";
  startedAt: string;
  completedAt: string;
  usage?: GeneratedUsage;
  errorMessage?: string;
};

async function recordUsage(db: SupabaseClient, record: UsageRecord) {
  const usage = record.usage;
  const result = await db.from("griot_provider_usage_events").insert({
    workspace_id: record.workspaceId,
    user_id: record.userId,
    conversation_id: record.conversationId || null,
    request_id: record.requestId,
    provider_id: record.providerId,
    model_id: record.modelId,
    status: record.status,
    input_tokens: usage?.inputTokens ?? null,
    output_tokens: usage?.outputTokens ?? null,
    cached_input_tokens: usage?.cachedInputTokens ?? null,
    reasoning_tokens: usage?.reasoningTokens ?? null,
    total_tokens: usage?.totalTokens ?? null,
    request_count: 1,
    estimated_cost_usd: usage?.estimatedCostUsd ?? null,
    cost_confidence: usage?.costConfidence || "unknown",
    usage_source: usage?.usageSource || "unavailable",
    currency: usage?.currency || "USD",
    error_message: record.errorMessage ? clipped(record.errorMessage, 2000) : null,
    metadata: {
      providerResponseUsage: usage?.usageSource === "provider_response",
      costKnown: usage?.estimatedCostUsd !== null && usage?.estimatedCostUsd !== undefined,
    },
    started_at: record.startedAt,
    completed_at: record.completedAt,
    occurred_at: record.startedAt,
  });
  if (result.error) console.error("griot-usage-ledger", result.error.message);
}

async function generate(
  provider: string,
  model: string,
  secret: string,
  history: Row[],
  prompt: string,
  options: GenerateOptions = {},
): Promise<GeneratedResult> {
  if (provider === "gemini") {
    const contents = history.slice(-24).map((x) => ({
      role: x.actor_kind === "model" ? "model" : "user",
      parts: [{ text: String(x.content || "") }],
    }));
    contents.push({ role: "user", parts: [{ text: prompt }] });
    const generationConfig =
      options.maxOutputTokens || options.temperature !== undefined
        ? {
            ...(options.maxOutputTokens ? { maxOutputTokens: options.maxOutputTokens } : {}),
            ...(options.temperature !== undefined ? { temperature: options.temperature } : {}),
          }
        : undefined;
    const result = await fetchTimeout(
      "https://generativelanguage.googleapis.com/v1beta/models/" +
        encodeURIComponent(model) +
        ":generateContent?key=" +
        encodeURIComponent(secret),
      {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ contents, ...(generationConfig ? { generationConfig } : {}) }),
      },
      options.timeout || 120000,
    );
    if (!result.ok)
      throw new ApiError(
        502,
        "Gemini rejected the request (" + result.status + "): " + (await providerError(result)),
      );
    const value = (await result.json()) as Row,
      candidates = Array.isArray(value.candidates) ? (value.candidates as Row[]) : [];
    const text = candidates
      .flatMap((v) => (Array.isArray(v.content?.parts) ? (v.content.parts as Row[]) : []))
      .map((v) => String(v.text || ""))
      .join("")
      .trim();
    if (!text) throw new ApiError(502, "Gemini returned no text");
    return { text, usage: generatedUsage(provider, value) };
  }
  const messages = history.slice(-24).map((x) => ({
    role: x.actor_kind === "model" ? "assistant" : "user",
    content: String(x.content || ""),
  }));
  messages.push({ role: "user", content: prompt });
  let result: Response;
  if (provider === "anthropic")
    result = await fetchTimeout(
      "https://api.anthropic.com/v1/messages",
      {
        method: "POST",
        headers: {
          "content-type": "application/json",
          "x-api-key": secret,
          "anthropic-version": "2023-06-01",
        },
        body: JSON.stringify({ model, max_tokens: 4096, messages }),
      },
      120000,
    );
  else {
    const base =
      provider === "groq"
        ? "https://api.groq.com/openai/v1"
        : provider === "openrouter"
          ? "https://openrouter.ai/api/v1"
          : "https://api.openai.com/v1";
    result = await fetchTimeout(
      base + "/chat/completions",
      {
        method: "POST",
        headers: { "content-type": "application/json", Authorization: "Bearer " + secret },
        body: JSON.stringify({ model, messages }),
      },
      120000,
    );
  }
  if (!result.ok)
    throw new ApiError(
      502,
      provider + " rejected the request (" + result.status + "): " + (await providerError(result)),
    );
  const value = (await result.json()) as Row;
  const text =
    provider === "anthropic"
      ? Array.isArray(value.content)
        ? value.content.map((v: Row) => String(v.text || "")).join("")
        : ""
      : String(value.choices?.[0]?.message?.content || "");
  if (!text.trim()) throw new ApiError(502, provider + " returned no text");
  return { text: text.trim(), usage: generatedUsage(provider, value) };
}

const BENCHMARK_DEFAULT_TASK = [
  "You are working on the GRIOT production codebase.",
  "Design a production-safe fix for idempotent chat message submission in a Supabase Edge API.",
  "The fix must prevent duplicate human/model messages when a client retries, preserve workspace isolation and RLS boundaries, handle provider failure without claiming success, keep actor_kind constraints valid, and include a deterministic test plan for retries, provider failures, and cross-workspace access.",
  "Return an implementation-ready solution with concrete API/data-flow decisions, security risks, and verification steps. Do not invent successful tests or deployed resources.",
].join("\n");

function clipped(value: string, max = 18_000) {
  return value.length > max ? value.slice(0, max) + "\n[output clipped]" : value;
}

function pipelineRole(value: unknown): PipelineRole | null {
  return typeof value === "string" && (PIPELINE_ROLES as readonly string[]).includes(value)
    ? (value as PipelineRole)
    : null;
}

function normalizePipelineNodes(value: unknown): PipelineNodeConfig[] {
  if (!Array.isArray(value) || value.length !== PIPELINE_ROLES.length)
    throw new ApiError(400, "A pipeline must contain exactly four enabled roles");
  const roles = new Set<string>();
  return value.map((raw, index) => {
    if (!raw || typeof raw !== "object" || Array.isArray(raw))
      throw new ApiError(400, "Invalid pipeline role configuration");
    const item = raw as Row;
    const role = pipelineRole(item.role);
    const id = String(item.id || "").trim();
    const label = String(item.label || "").trim();
    const providerId = String(item.providerId || item.provider_id || "")
      .trim()
      .toLowerCase();
    const model = String(item.model || "").trim();
    const credentialId = String(item.credentialId || item.credential_id || "").trim();
    if (!role || roles.has(role) || role !== PIPELINE_ROLES[index])
      throw new ApiError(
        400,
        "Pipeline roles must be planner, builder, reviewer and verifier in order",
      );
    roles.add(role);
    if (!id || id.length > 80 || !label || label.length > 120)
      throw new ApiError(400, "Each pipeline role needs a valid id and label");
    if (!PROVIDERS.includes(providerId))
      throw new ApiError(400, "Unsupported pipeline provider: " + providerId);
    if (!model || model.length > 160) throw new ApiError(400, "Each pipeline role needs a model");
    if (!/^[0-9a-f-]{36}$/i.test(credentialId))
      throw new ApiError(400, "Each pipeline role needs a valid credentialId");
    const rawTemperature = item.temperature === undefined ? 0.2 : Number(item.temperature);
    if (!Number.isFinite(rawTemperature) || rawTemperature < 0 || rawTemperature > 1)
      throw new ApiError(400, "Pipeline temperature must be between 0 and 1");
    return {
      id,
      role,
      label,
      providerId,
      model,
      credentialId,
      enabled: true,
      temperature: Math.round(rawTemperature * 100) / 100,
      systemPrompt: clipped(String(item.systemPrompt || "").trim(), 3000),
    };
  });
}

async function storedPipeline(c: Ctx) {
  const result = await c.db
    .from("griot_pipeline_configs")
    .select("workspace_id,version,nodes,updated_at")
    .eq("workspace_id", c.workspaceId)
    .maybeSingle();
  if (result.error) throw new ApiError(500, "Could not load the workspace pipeline");
  if (!result.data) return null;
  return {
    version: Number(result.data.version),
    nodes: normalizePipelineNodes(result.data.nodes),
    updatedAt: result.data.updated_at,
  };
}

function requirePipelineAdmin(c: Ctx) {
  if (c.role !== "owner" && c.role !== "admin" && c.role !== "platform_admin")
    throw new ApiError(403, "Only workspace administrators can change or run the pipeline");
}

async function pipelineConfig(c: Ctx, req: Request) {
  const pathName = route(req);
  if (req.method === "GET" && pathName === "/pipeline/config") {
    const stored = await storedPipeline(c);
    return reply(
      req,
      stored
        ? { configured: true, ...stored }
        : { configured: false, version: 0, nodes: [], updatedAt: null },
    );
  }
  if (req.method !== "POST" || pathName !== "/pipeline/config")
    throw new ApiError(405, "Method not allowed");
  requirePipelineAdmin(c);
  const input = await json(req),
    nodes = normalizePipelineNodes(input.nodes);
  const credentialIds = [...new Set(nodes.map((node) => node.credentialId))];
  const credentials = await c.db
    .from("griot_credentials")
    .select("id,provider_id,kind,status,workspace_id,created_by")
    .eq("workspace_id", c.workspaceId)
    .eq("kind", "provider")
    .eq("status", "active")
    .eq("created_by", c.user.id)
    .in("id", credentialIds);
  if (credentials.error) throw new ApiError(500, "Could not validate pipeline credentials");
  const byId = new Map((credentials.data || []).map((credential) => [credential.id, credential]));
  for (const node of nodes) {
    const credential = byId.get(node.credentialId);
    if (!credential)
      throw new ApiError(
        409,
        "Role " + node.role + " references a credential that is not active in this workspace",
      );
    if (credential.provider_id !== node.providerId)
      throw new ApiError(409, "Role " + node.role + " provider does not match its credential");
  }
  const current = await storedPipeline(c);
  const version = (current?.version || 0) + 1;
  const saved = await c.db
    .from("griot_pipeline_configs")
    .upsert(
      {
        workspace_id: c.workspaceId,
        created_by: c.user.id,
        version,
        nodes,
        updated_at: new Date().toISOString(),
      },
      { onConflict: "workspace_id" },
    )
    .select("workspace_id,version,nodes,updated_at")
    .single();
  if (saved.error || !saved.data)
    throw new ApiError(500, "Could not persist the workspace pipeline");
  return reply(req, {
    configured: true,
    version: Number(saved.data.version),
    nodes: normalizePipelineNodes(saved.data.nodes),
    updatedAt: saved.data.updated_at,
  });
}

type PipelineExecutionResult = {
  role: string;
  status: "succeeded" | "failed";
  latencyMs: number;
  providerId: string;
  model: string;
  credentialId: string;
  output?: string;
  usage?: GeneratedUsage;
  error?: string;
};

async function benchmark(c: Ctx, req: Request) {
  if (Deno.env.get("GRIOT_BENCHMARK_ENABLED") !== "true")
    throw new ApiError(404, "Benchmark is disabled");
  requirePipelineAdmin(c);
  const stored = await storedPipeline(c);
  if (!stored) throw new ApiError(409, "Apply a four-role pipeline before running the benchmark");
  const input = await json(req);
  const task = clipped(String(input.task || BENCHMARK_DEFAULT_TASK).trim(), 50_000);
  if (!task) throw new ApiError(400, "Benchmark task is required");
  const credentialIds = [...new Set(stored.nodes.map((node) => node.credentialId))];
  const credentials = await c.db
    .from("griot_credentials")
    .select("id,provider_id,status,kind,workspace_id,created_by")
    .eq("workspace_id", c.workspaceId)
    .eq("kind", "provider")
    .eq("status", "active")
    .eq("created_by", c.user.id)
    .in("id", credentialIds);
  if (credentials.error) throw new ApiError(500, "Could not load pipeline credentials");
  const byId = new Map((credentials.data || []).map((credential) => [credential.id, credential]));
  const secrets = new Map<string, string>();
  for (const node of stored.nodes) {
    const credential = byId.get(node.credentialId);
    if (!credential || credential.provider_id !== node.providerId)
      throw new ApiError(409, "Pipeline credential is no longer active for role " + node.role);
    if (!secrets.has(node.credentialId))
      secrets.set(
        node.credentialId,
        await decrypt(await credentialSecret(c.db, node.credentialId)),
      );
  }

  const invoke = async (
    node: PipelineNodeConfig,
    role: string,
    prompt: string,
  ): Promise<PipelineExecutionResult> => {
    const started = Date.now();
    const startedAt = new Date().toISOString();
    const requestId = crypto.randomUUID();
    try {
      const secret = secrets.get(node.credentialId);
      if (!secret)
        throw new ApiError(409, "Credential secret is unavailable for role " + node.role);
      const rolePrompt = [
        node.systemPrompt ? "ROLE SYSTEM INSTRUCTION:\n" + node.systemPrompt : "",
        prompt,
      ]
        .filter(Boolean)
        .join("\n\n");
      const generated = await generate(
        node.providerId,
        node.model,
        secret,
        [],
        clipped(rolePrompt, 14_000),
        { timeout: 120000, maxOutputTokens: 1600, temperature: node.temperature },
      );
      await recordUsage(c.db, {
        workspaceId: c.workspaceId,
        userId: c.user.id,
        requestId,
        providerId: node.providerId,
        modelId: node.model,
        status: "succeeded",
        usage: generated.usage,
        startedAt,
        completedAt: new Date().toISOString(),
      });
      return {
        role,
        status: "succeeded",
        latencyMs: Date.now() - started,
        providerId: node.providerId,
        model: node.model,
        credentialId: node.credentialId,
        output: generated.text,
        usage: generated.usage,
      };
    } catch (error) {
      await recordUsage(c.db, {
        workspaceId: c.workspaceId,
        userId: c.user.id,
        requestId,
        providerId: node.providerId,
        modelId: node.model,
        status: "failed",
        startedAt,
        completedAt: new Date().toISOString(),
        errorMessage: error instanceof Error ? error.message : String(error),
      });
      return {
        role,
        status: "failed",
        latencyMs: Date.now() - started,
        providerId: node.providerId,
        model: node.model,
        credentialId: node.credentialId,
        output: "",
        error: error instanceof Error ? error.message : String(error),
      };
    }
  };

  const [direct, planner] = await Promise.all([
    invoke(
      stored.nodes[0],
      "single-model-baseline",
      [
        "Solve the task below as one model with no planner, reviewer, or repair pass.",
        "Be explicit about assumptions and do not claim execution you cannot verify.",
        "TASK:\n" + task,
      ].join("\n\n"),
    ),
    invoke(
      stored.nodes[0],
      "planner",
      [
        "You are the planning role in a four-role GRIOT run.",
        "Break the task into an implementation sequence, invariants, failure modes, and acceptance checks.",
        "Do not write a final answer or claim that code was changed.",
        "TASK:\n" + task,
      ].join("\n\n"),
    ),
  ]);
  const protocol = {
    sameTask: true,
    baselineCalls: 1,
    griotCalls: 4,
    roles: stored.nodes.map((node) => node.role),
    configVersion: stored.version,
    distinctCredentials: new Set(stored.nodes.map((node) => node.credentialId)).size,
    distinctProviders: new Set(stored.nodes.map((node) => node.providerId)).size,
    distinctModels: new Set(stored.nodes.map((node) => node.providerId + ":" + node.model)).size,
  };
  const fail = (roles: PipelineExecutionResult[], failedAt: string) =>
    reply(req, {
      task,
      protocol,
      direct,
      griot: { status: "failed", failedAt, roles },
      warning: "The benchmark completed with a real provider failure; no success was claimed.",
    });
  if (planner.status !== "succeeded") return fail([planner], planner.role);

  const builder = await invoke(
    stored.nodes[1],
    "builder",
    [
      "You are the implementation role in a four-role GRIOT run.",
      "Produce the strongest implementation-ready solution using the plan. Include concrete data flow, API behavior, migrations or indexes where needed, and tests.",
      "Do not hide uncertainty or claim that external systems were changed.",
      "TASK:\n" + task,
      "PLAN:\n" + clipped(planner.output, 6000),
    ].join("\n\n"),
  );
  if (builder.status !== "succeeded") return fail([planner, builder], builder.role);

  const reviewer = await invoke(
    stored.nodes[2],
    "reviewer",
    [
      "You are the adversarial review role in a four-role GRIOT run.",
      "Find correctness, security, data-integrity, concurrency, and test-coverage failures in the proposed solution. Give precise repairs, not vague criticism.",
      "TASK:\n" + task,
      "PLAN:\n" + clipped(planner.output, 6000),
      "PROPOSAL:\n" + clipped(builder.output, 6000),
    ].join("\n\n"),
  );
  if (reviewer.status !== "succeeded") return fail([planner, builder, reviewer], reviewer.role);

  const verifier = await invoke(
    stored.nodes[3],
    "verifier",
    [
      "You are the final verification role in a four-role GRIOT run.",
      "Compare the single-model baseline with the orchestrated proposal, apply the review findings, and produce the final answer.",
      "Score both solutions from 0 to 100 against: correctness, security, data integrity, completeness, and verifiability. Include a short reason for each score and state clearly when the evidence is insufficient.",
      "TASK:\n" + task,
      "SINGLE-MODEL BASELINE:\n" +
        clipped(direct.output || direct.error || "baseline failed", 6000),
      "PLAN:\n" + clipped(planner.output, 6000),
      "PROPOSAL:\n" + clipped(builder.output, 6000),
      "REVIEW:\n" + clipped(reviewer.output, 6000),
    ].join("\n\n"),
  );

  const roles = [planner, builder, reviewer, verifier];
  return reply(req, {
    task,
    protocol,
    direct: { ...direct, output: direct.output ? clipped(direct.output, 6000) : undefined },
    griot: {
      status: verifier.status,
      roles: roles.map((item) => ({
        ...item,
        output: item.output ? clipped(item.output, 6000) : undefined,
      })),
      final: verifier.output ? clipped(verifier.output, 8000) : undefined,
    },
    warning:
      "The four calls used the provider, model and credential selected for each sphere. Distinct-provider/model counts are reported in protocol; reusing one credential across roles is supported.",
  });
}

async function publicAuth(req: Request, pathName: string): Promise<Response | null> {
  if (req.method === "GET" && pathName === "/auth/config")
    return reply(req, {
      provider: "supabase",
      registrationEnabled: true,
      emailConfirmationEnabled: true,
      passwordRecoveryEnabled: true,
    });
  if (req.method === "POST" && (pathName === "/auth/register" || pathName === "/auth/login")) {
    const input = await json(req),
      email = String(input.email || "")
        .trim()
        .toLowerCase(),
      password = String(input.password || ""),
      register = pathName.endsWith("register");
    if (!email || !password) throw new ApiError(400, "Email and password are required");
    const result = register
      ? await client().auth.signUp({
          email,
          password,
          options: {
            data: { display_name: String(input.displayName || "").trim() },
            emailRedirectTo: authRedirect(req, "confirm"),
          },
        })
      : await client().auth.signInWithPassword({ email, password });
    if (result.error || !result.data.user)
      throw new ApiError(register ? 400 : 401, result.error?.message || "Invalid credentials");
    if (register && !result.data.session)
      return reply(
        req,
        {
          requiresEmailConfirmation: true,
          email,
          user: userJson(result.data.user),
          message: "Check your email to confirm the account before signing in.",
        },
        202,
      );
    if (!result.data.session) throw new ApiError(401, "Invalid or expired session");
    const workspace = await makeWorkspace(
      admin(),
      result.data.user,
      String(input.workspaceName || "").trim() || undefined,
    );
    return reply(req, {
      token: result.data.session.access_token,
      refreshToken: result.data.session.refresh_token,
      user: userJson(result.data.user),
      workspace,
    });
  }
  if (req.method === "POST" && pathName === "/auth/resend-confirmation") {
    const input = await json(req),
      email = String(input.email || "")
        .trim()
        .toLowerCase();
    if (!email) throw new ApiError(400, "Email is required");
    const result = await client().auth.resend({
      type: "signup",
      email,
      options: { emailRedirectTo: authRedirect(req, "confirm") },
    });
    if (result.error) throw new ApiError(400, result.error.message);
    return reply(req, {
      ok: true,
      message: "If this account needs confirmation, a new email was requested.",
    });
  }
  if (req.method === "POST" && pathName === "/auth/request-password-reset") {
    const input = await json(req),
      email = String(input.email || "")
        .trim()
        .toLowerCase();
    if (!email) throw new ApiError(400, "Email is required");
    const result = await client().auth.resetPasswordForEmail(email, {
      redirectTo: authRedirect(req, "reset"),
    });
    if (result.error) throw new ApiError(400, result.error.message);
    return reply(req, {
      ok: true,
      message: "If an account exists for this email, a password reset email was requested.",
    });
  }
  if (req.method === "POST" && pathName === "/auth/update-password") {
    if (!req.headers.get("authorization")?.toLowerCase().startsWith("bearer "))
      throw new ApiError(401, "Recovery session required");
    const input = await json(req),
      password = String(input.password || "");
    if (!password) throw new ApiError(400, "Password is required");
    const authorization = req.headers.get("authorization")!,
      recoveryClient = client(req),
      current = await recoveryClient.auth.getUser();
    if (current.error || !current.data.user)
      throw new ApiError(401, "Recovery link is invalid or expired");
    const c = config();
    const result = await fetch(c.url + "/auth/v1/user", {
      method: "PUT",
      headers: { apikey: c.anon, Authorization: authorization, "content-type": "application/json" },
      body: JSON.stringify({ password }),
    });
    if (!result.ok) {
      let value: Row = {};
      try {
        value = (await result.json()) as Row;
      } catch {
        /* keep a stable public error */
      }
      throw new ApiError(
        result.status === 422 ? 400 : result.status,
        String(
          value.msg || value.message || value.error_description || "Could not update password",
        ),
      );
    }
    return reply(req, {
      ok: true,
      user: userJson(current.data.user),
      message: "Password updated. You can sign in now.",
    });
  }
  if (req.method === "POST" && pathName === "/auth/logout") {
    const c = await auth(req);
    await c.client.auth.signOut();
    return reply(req, { ok: true });
  }
  if (req.method === "GET" && pathName === "/auth/me") {
    const c = await auth(req);
    return reply(req, {
      user: userJson(c.user),
      workspace: { id: c.workspaceId || null, role: c.role },
      platformAdmin: c.isPlatformAdmin,
    });
  }
  return null;
}
async function credentials(c: Ctx, req: Request) {
  const pathName = route(req);
  if (req.method === "GET" && pathName === "/credentials") {
    let q = c.db
      .from("griot_credentials")
      .select("id,kind,provider_id,label,settings,status,secret_hint")
      .eq("workspace_id", c.workspaceId)
      .eq("created_by", c.user.id)
      .order("updated_at", { ascending: false });
    const kind = new URL(req.url).searchParams.get("kind");
    if (kind === "provider" || kind === "plugin") q = q.eq("kind", kind);
    const result = await q;
    if (result.error) throw new ApiError(500, "Could not list credentials");
    return reply(req, {
      credentials: (result.data || []).map((v) => ({
        id: v.id,
        kind: v.kind,
        providerId: v.provider_id,
        label: v.label,
        settings: v.settings || {},
        status: v.status,
        secretHint: v.secret_hint,
      })),
    });
  }
  if (req.method === "POST" && pathName === "/credentials") {
    const input = await json(req),
      kind = String(input.kind || "provider"),
      id = String(input.providerId || input.provider_id || ""),
      secret = String(input.secret || input.apiKey || "").trim();
    if (!(kind === "provider" ? PROVIDERS : PLUGINS).includes(id))
      throw new ApiError(400, "Unsupported credential provider");
    if (!secret) throw new ApiError(400, "Credential secret is required");
    const encrypted = await encrypt(secret);
    const result = await c.db
      .from("griot_credentials")
      .insert({
        workspace_id: c.workspaceId,
        kind,
        provider_id: id,
        label: String(input.label || id).slice(0, 120),
        settings: input.settings || {},
        status: "pending",
        secret_hint: "************" + secret.slice(-4),
        fingerprint: encrypted.fingerprint,
        created_by: c.user.id,
      })
      .select("id,kind,provider_id,label,settings,status,secret_hint")
      .single();
    if (result.error || !result.data) throw new ApiError(500, "Could not save credential");
    const stored = await c.db.from("griot_credential_secrets").insert({
      credential_id: result.data.id,
      secret_ciphertext: encrypted.secret_ciphertext,
      secret_iv: encrypted.secret_iv,
    });
    if (stored.error) {
      await c.db
        .from("griot_credentials")
        .delete()
        .eq("id", result.data.id)
        .eq("workspace_id", c.workspaceId);
      throw new ApiError(500, "Could not protect credential secret");
    }
    return reply(
      req,
      {
        credential: {
          id: result.data.id,
          kind: result.data.kind,
          providerId: result.data.provider_id,
          label: result.data.label,
          settings: result.data.settings,
          status: result.data.status,
          secretHint: result.data.secret_hint,
        },
      },
      201,
    );
  }
  const verifyMatch = pathName.match(/^\/credentials\/([^/]+)\/verify$/),
    idMatch = pathName.match(/^\/credentials\/([^/]+)$/),
    id = verifyMatch?.[1] || idMatch?.[1];
  if (!id) throw new ApiError(404, "Credential route not found");
  const row = await c.db
    .from("griot_credentials")
    .select("id,kind,provider_id,label,settings,status,secret_hint,workspace_id")
    .eq("id", id)
    .eq("workspace_id", c.workspaceId)
    .eq("created_by", c.user.id)
    .maybeSingle();
  if (row.error || !row.data) throw new ApiError(404, "Credential not found");
  if (req.method === "POST" && verifyMatch) {
    const secret = await credentialSecret(c.db, id);
    const result = await verifyProvider(row.data.kind, row.data.provider_id, await decrypt(secret));
    await c.db
      .from("griot_credentials")
      .update({ status: result.ok ? "active" : "revoked", updated_at: new Date().toISOString() })
      .eq("id", id)
      .eq("workspace_id", c.workspaceId);
    return reply(req, {
      valid: result.ok,
      status: result.ok ? "active" : "revoked",
      message: result.message,
    });
  }
  if (req.method === "DELETE" && idMatch) {
    const removed = await c.db.from("griot_credential_secrets").delete().eq("credential_id", id);
    if (removed.error) throw new ApiError(500, "Could not remove credential secret");
    const revoked = await c.db
      .from("griot_credentials")
      .update({ status: "revoked", updated_at: new Date().toISOString() })
      .eq("id", id)
      .eq("workspace_id", c.workspaceId);
    if (revoked.error) throw new ApiError(500, "Could not revoke credential");
    return reply(req, { ok: true });
  }
  throw new ApiError(405, "Method not allowed");
}
async function conversations(c: Ctx, req: Request) {
  const pathName = route(req);
  if (req.method === "GET" && pathName === "/conversations") {
    const result = await c.db
      .from("griot_conversations")
      .select(
        "id,title,project_id,owner_id,visibility,training_opt_in,training_review_status,created_at,updated_at",
      )
      .eq("workspace_id", c.workspaceId)
      .or("owner_id.eq." + c.user.id + ",visibility.eq.workspace")
      .order("updated_at", { ascending: false })
      .limit(100);
    if (result.error) throw new ApiError(500, "Could not list conversations");
    return reply(req, { enabled: true, conversations: result.data || [] });
  }
  if (req.method === "POST" && pathName === "/conversations") {
    const input = await json(req),
      result = await c.db
        .from("griot_conversations")
        .insert({
          workspace_id: c.workspaceId,
          title: String(input.title || "New conversation").slice(0, 200),
          created_by: c.user.id,
          owner_id: c.user.id,
        })
        .select(
          "id,title,project_id,owner_id,visibility,training_opt_in,training_review_status,created_at,updated_at",
        )
        .single();
    if (result.error || !result.data) throw new ApiError(500, "Could not create conversation");
    return reply(req, result.data, 201);
  }

  const match = pathName.match(/^\/conversations\/([^/]+)(?:\/(messages|privacy))?$/);
  if (!match) throw new ApiError(404, "Conversation route not found");
  const conversation = await c.db
    .from("griot_conversations")
    .select(
      "id,title,project_id,workspace_id,created_by,owner_id,visibility,training_opt_in,training_review_status,created_at,updated_at",
    )
    .eq("id", match[1])
    .eq("workspace_id", c.workspaceId)
    .or("owner_id.eq." + c.user.id + ",visibility.eq.workspace")
    .maybeSingle();
  if (conversation.error || !conversation.data) throw new ApiError(404, "Conversation not found");

  if (req.method === "PATCH" && match[2] === "privacy") {
    if (conversation.data.owner_id !== c.user.id)
      throw new ApiError(403, "Only the conversation owner can change privacy");
    const input = await json(req);
    if (typeof input.trainingOptIn !== "boolean")
      throw new ApiError(400, "trainingOptIn must be a boolean");
    const now = new Date().toISOString();
    const changes = input.trainingOptIn
      ? {
          training_opt_in: true,
          training_opted_in_by: c.user.id,
          training_opted_in_at: now,
          training_review_status: "pending",
          training_reviewed_by: null,
          training_reviewed_at: null,
        }
      : {
          training_opt_in: false,
          training_opted_in_by: null,
          training_opted_in_at: null,
          training_review_status: "not_requested",
          training_reviewed_by: null,
          training_reviewed_at: null,
        };
    const updated = await c.db
      .from("griot_conversations")
      .update(changes)
      .eq("id", match[1])
      .eq("workspace_id", c.workspaceId)
      .eq("owner_id", c.user.id)
      .select("id,training_opt_in,training_review_status,training_opted_in_at")
      .single();
    if (updated.error || !updated.data)
      throw new ApiError(500, "Could not update conversation privacy");
    return reply(req, { privacy: updated.data });
  }

  if (req.method === "GET" && match[2] !== "privacy") {
    const messages = await c.db
      .from("griot_messages")
      .select("id,actor_kind,status,content,metadata,error_message,created_at")
      .eq("conversation_id", match[1])
      .eq("workspace_id", c.workspaceId)
      .order("created_at", { ascending: true });
    if (messages.error) throw new ApiError(500, "Could not load conversation");
    return reply(req, {
      conversation: conversation.data,
      messages: (messages.data || []).map((v) => ({
        ...v,
        role: v.actor_kind,
        sender: v.actor_kind,
      })),
    });
  }

  if (req.method !== "POST" || match[2] !== "messages")
    throw new ApiError(405, "Method not allowed");
  const input = await json(req),
    content = String(input.content || "").trim(),
    provider = String(input.provider || "gemini"),
    model = String(
      input.model ||
        Deno.env.get(provider.toUpperCase() + "_DEFAULT_MODEL") ||
        (provider === "gemini" ? "gemini-3.6-flash" : ""),
    );
  if (!content || content.length > 50000 || !PROVIDERS.includes(provider) || !model)
    throw new ApiError(400, "Message, provider and model are required");
  const history = await c.db
    .from("griot_messages")
    .select("actor_kind,content")
    .eq("conversation_id", match[1])
    .eq("workspace_id", c.workspaceId)
    .eq("status", "succeeded")
    .order("created_at", { ascending: true })
    .limit(24);
  const human = await c.db
    .from("griot_messages")
    .insert({
      conversation_id: match[1],
      workspace_id: c.workspaceId,
      actor_kind: "human",
      status: "succeeded",
      content,
      metadata: { provider, model },
    })
    .select("id")
    .single();
  let q = c.db
    .from("griot_credentials")
    .select("id,kind,provider_id,status,workspace_id")
    .eq("workspace_id", c.workspaceId)
    .eq("created_by", c.user.id)
    .eq("kind", "provider")
    .eq("provider_id", provider)
    .eq("status", "active");
  if (input.credentialId) q = q.eq("id", String(input.credentialId));
  const credential = await q.order("updated_at", { ascending: false }).limit(1).maybeSingle();
  if (history.error || human.error || !human.data)
    throw new ApiError(500, "Could not persist message");
  if (credential.error || !credential.data)
    throw new ApiError(409, "No verified " + provider + " credential is configured");
  const secret = await credentialSecret(c.db, credential.data.id);
  const requestId = crypto.randomUUID(),
    startedAt = new Date().toISOString();
  let generated: GeneratedResult;
  try {
    generated = await generate(
      provider,
      model,
      await decrypt(secret),
      (history.data || []) as Row[],
      content,
    );
    await recordUsage(c.db, {
      workspaceId: c.workspaceId,
      userId: c.user.id,
      conversationId: match[1],
      requestId,
      providerId: provider,
      modelId: model,
      status: "succeeded",
      usage: generated.usage,
      startedAt,
      completedAt: new Date().toISOString(),
    });
  } catch (error) {
    await recordUsage(c.db, {
      workspaceId: c.workspaceId,
      userId: c.user.id,
      conversationId: match[1],
      requestId,
      providerId: provider,
      modelId: model,
      status: "failed",
      startedAt,
      completedAt: new Date().toISOString(),
      errorMessage: error instanceof Error ? error.message : String(error),
    });
    throw error;
  }
  const text = generated.text;
  const answer = await c.db
    .from("griot_messages")
    .insert({
      conversation_id: match[1],
      workspace_id: c.workspaceId,
      actor_kind: "model",
      status: "succeeded",
      content: text,
      metadata: {
        provider,
        model,
        credentialId: credential.data.id,
        requestId,
        usage: generated.usage,
      },
    })
    .select("id,actor_kind,status,content,metadata,created_at")
    .single();
  await c.db
    .from("griot_conversations")
    .update({ updated_at: new Date().toISOString() })
    .eq("id", match[1])
    .eq("workspace_id", c.workspaceId);
  if (answer.error || !answer.data) throw new ApiError(500, "Could not persist model response");
  return reply(req, { message: answer.data, result: { content: text, usage: generated.usage } });
}
function artifactView(row: Row) {
  return {
    id: row.id,
    conversationId: row.conversation_id,
    filename: row.filename,
    contentType: row.content_type,
    byteSize: Number(row.byte_size),
    status: row.status,
    etag: row.etag,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function artifactFilename(value: unknown) {
  const filename = String(value || "")
    .trim()
    .replace(/[\/\\\u0000-\u001f]/g, "-")
    .replace(/\s+/g, " ")
    .slice(0, 200);
  if (!filename || filename === "." || filename === "..")
    throw new ApiError(400, "Artifact filename is required");
  return filename;
}

async function artifactRow(c: Ctx, id: string) {
  const result = await c.db
    .from("griot_artifacts")
    .select("*")
    .eq("id", id)
    .eq("workspace_id", c.workspaceId)
    .eq("created_by", c.user.id)
    .maybeSingle();
  if (result.error || !result.data) throw new ApiError(404, "Artifact not found");
  return result.data as Row;
}

async function artifacts(c: Ctx, req: Request) {
  const pathName = route(req);
  if (Deno.env.get("GRIOT_ARTIFACTS_ENABLED") === "false")
    throw new ApiError(404, "Artifacts are disabled");
  try {
    assertR2Configured();
  } catch {
    throw new ApiError(503, "R2 artifacts are not configured");
  }

  if (req.method === "GET" && pathName === "/artifacts") {
    const result = await c.db
      .from("griot_artifacts")
      .select(
        "id,conversation_id,filename,content_type,byte_size,status,etag,created_at,updated_at",
      )
      .eq("workspace_id", c.workspaceId)
      .eq("created_by", c.user.id)
      .neq("status", "deleted")
      .order("created_at", { ascending: false })
      .limit(200);
    if (result.error) throw new ApiError(500, "Could not list artifacts");
    return reply(req, { artifacts: (result.data || []).map(artifactView) });
  }

  if (req.method === "POST" && pathName === "/artifacts") {
    const input = await json(req);
    const filename = artifactFilename(input.filename);
    const contentType = String(input.contentType || "application/octet-stream")
      .trim()
      .slice(0, 180);
    if (!contentType || contentType.includes("\n") || contentType.includes("\r"))
      throw new ApiError(400, "Artifact content type is invalid");
    const byteSize = Number(input.byteSize ?? input.size);
    const limit = maxArtifactBytes();
    if (!Number.isSafeInteger(byteSize) || byteSize < 0)
      throw new ApiError(400, "Artifact size is invalid");
    if (byteSize > limit) throw new ApiError(413, "Artifact exceeds the " + limit + " byte limit");

    const conversationId = input.conversationId ? String(input.conversationId) : null;
    if (conversationId) {
      const conversation = await c.db
        .from("griot_conversations")
        .select("id")
        .eq("id", conversationId)
        .eq("workspace_id", c.workspaceId)
        .or("owner_id.eq." + c.user.id + ",visibility.eq.workspace")
        .maybeSingle();
      if (conversation.error) throw new ApiError(500, "Could not validate artifact conversation");
      if (!conversation.data) throw new ApiError(404, "Conversation not found");
    }

    const id = crypto.randomUUID();
    const objectKey = "workspaces/" + c.workspaceId + "/artifacts/" + id + "/" + filename;
    const created = await c.db
      .from("griot_artifacts")
      .insert({
        id,
        workspace_id: c.workspaceId,
        conversation_id: conversationId,
        created_by: c.user.id,
        object_key: objectKey,
        filename,
        content_type: contentType,
        byte_size: byteSize,
        status: "pending",
      })
      .select("*")
      .single();
    if (created.error || !created.data) throw new ApiError(500, "Could not create artifact record");

    let upload: Awaited<ReturnType<typeof presignedUpload>>;
    try {
      upload = await presignedUpload(objectKey, contentType);
    } catch {
      await c.db.from("griot_artifacts").delete().eq("id", id).eq("workspace_id", c.workspaceId);
      throw new ApiError(503, "Could not create the R2 upload URL");
    }
    return reply(req, { artifact: artifactView(created.data), upload }, 201);
  }

  const match = pathName.match(/^\/artifacts\/([0-9a-f-]{36})(?:\/(complete|download))?$/i);
  if (!match) throw new ApiError(404, "Artifact route not found");
  const row = await artifactRow(c, match[1]);
  if (req.method === "POST" && match[2] === "complete") {
    if (row.status === "ready") return reply(req, { artifact: artifactView(row) });
    const remote = await headObject(row.object_key);
    if (!remote.ok) throw new ApiError(409, "R2 upload was not found; upload the file again");
    if (remote.size === null || remote.size !== Number(row.byte_size)) {
      try {
        await deleteObject(row.object_key);
      } catch {
        /* orphan cleanup is best effort */
      }
      await c.db
        .from("griot_artifacts")
        .update({ status: "deleted", updated_at: new Date().toISOString() })
        .eq("id", row.id)
        .eq("workspace_id", c.workspaceId);
      throw new ApiError(409, "R2 upload size does not match the declared artifact size");
    }
    const updated = await c.db
      .from("griot_artifacts")
      .update({ status: "ready", etag: remote.etag, updated_at: new Date().toISOString() })
      .eq("id", row.id)
      .eq("workspace_id", c.workspaceId)
      .select("*")
      .single();
    if (updated.error || !updated.data) throw new ApiError(500, "Could not finalize artifact");
    return reply(req, { artifact: artifactView(updated.data) });
  }
  if (req.method === "GET" && match[2] === "download") {
    if (row.status !== "ready") throw new ApiError(409, "Artifact is not ready");
    let download: Awaited<ReturnType<typeof presignedDownload>>;
    try {
      download = await presignedDownload(row.object_key);
    } catch {
      throw new ApiError(503, "Could not create the R2 download URL");
    }
    return reply(req, { artifact: artifactView(row), download });
  }
  if (req.method === "DELETE" && !match[2]) {
    if (row.status !== "deleted") {
      try {
        await deleteObject(row.object_key);
      } catch {
        throw new ApiError(502, "Could not delete artifact from R2");
      }
    }
    const updated = await c.db
      .from("griot_artifacts")
      .update({ status: "deleted", updated_at: new Date().toISOString() })
      .eq("id", row.id)
      .eq("workspace_id", c.workspaceId);
    if (updated.error) throw new ApiError(500, "Could not delete artifact record");
    return reply(req, { ok: true });
  }
  throw new ApiError(405, "Method not allowed");
}
async function workspaceRoutes(c: Ctx, req: Request) {
  const pathName = route(req);
  if (req.method === "GET" && pathName === "/workspace/providers") {
    const result = await c.db
      .from("griot_credentials")
      .select("id,provider_id,label,settings,status,secret_hint")
      .eq("workspace_id", c.workspaceId)
      .eq("created_by", c.user.id)
      .eq("kind", "provider")
      .order("updated_at", { ascending: false });
    if (result.error) throw new ApiError(500, "Could not list workspace providers");
    return reply(req, {
      providers: (result.data || []).map((v) => ({
        id: v.id,
        providerId: v.provider_id,
        label: v.label,
        model: v.settings?.model || null,
        configured: v.status === "active",
        status: v.status,
        secretHint: v.secret_hint,
      })),
    });
  }
  if (req.method === "GET" && pathName === "/workspace/plugins") {
    const result = await c.db
      .from("griot_credentials")
      .select("id,provider_id,label,status")
      .eq("workspace_id", c.workspaceId)
      .eq("created_by", c.user.id)
      .eq("kind", "plugin");
    if (result.error) throw new ApiError(500, "Could not list workspace plugins");
    const configured = new Map((result.data || []).map((v) => [v.provider_id, v]));
    return reply(req, {
      executionEnabled: false,
      plugins: PLUGINS.map((id) => ({
        id,
        configured: configured.has(id),
        credentialId: configured.get(id)?.id || null,
        writeEnabled: false,
        actions: [{ id: "connection.verify", effect: "read", approvalRequired: false }],
      })),
    });
  }
  const match = pathName.match(
    /^\/workspace\/plugins\/([^/]+)\/actions\/connection\.verify\/execute$/,
  );
  if (req.method === "POST" && match) {
    const row = await c.db
      .from("griot_credentials")
      .select("id,kind,provider_id,status,workspace_id")
      .eq("workspace_id", c.workspaceId)
      .eq("created_by", c.user.id)
      .eq("kind", "plugin")
      .eq("provider_id", match[1])
      .eq("status", "active")
      .maybeSingle();
    if (row.error || !row.data) throw new ApiError(409, "Plugin is not connected");
    const secret = await credentialSecret(c.db, row.data.id),
      result = await verifyProvider("plugin", match[1], await decrypt(secret));
    return reply(req, {
      ok: result.ok,
      status: result.ok ? "succeeded" : "failed",
      message: result.message,
    });
  }
  throw new ApiError(404, "Workspace route not found");
}

type UsagePeriod = "24h" | "7d" | "30d" | "all";

function usagePeriod(value: string | null): UsagePeriod {
  return value === "24h" || value === "7d" || value === "30d" || value === "all" ? value : "all";
}

function usagePeriodStart(period: UsagePeriod) {
  if (period === "all") return null;
  const milliseconds =
    period === "24h"
      ? 24 * 60 * 60 * 1000
      : period === "7d"
        ? 7 * 24 * 60 * 60 * 1000
        : 30 * 24 * 60 * 60 * 1000;
  return new Date(Date.now() - milliseconds).toISOString();
}

function monthStart() {
  const now = new Date();
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1)).toISOString();
}

function nullableNumber(value: unknown, label: string) {
  if (value === null || value === undefined || value === "") return null;
  const number = Number(value);
  if (!Number.isFinite(number) || number < 0)
    throw new ApiError(400, label + " must be a non-negative number or null");
  return number;
}

function usageProviderName(providerId: string) {
  return providerId === "openrouter"
    ? "OpenRouter"
    : providerId.slice(0, 1).toUpperCase() + providerId.slice(1);
}

function sumUsageMetric(rows: Row[], field: string) {
  return rows.reduce((total, row) => total + (integerMetric(row[field]) || 0), 0);
}

function usageCost(rows: Row[]) {
  const known =
    rows.length === 0 ||
    rows.every((row) => row.estimated_cost_usd !== null && row.estimated_cost_usd !== undefined);
  const total = rows.reduce((sum, row) => sum + (Number(row.estimated_cost_usd) || 0), 0);
  return { known, total };
}

function usageConfidence(rows: Row[]) {
  if (
    rows.some(
      (row) =>
        row.cost_confidence === "exact" ||
        row.cost_confidence === "calculated" ||
        row.cost_confidence === "estimated",
    )
  )
    return "calculated" as const;
  if (rows.some((row) => row.usage_source === "provider_response")) return "authoritative" as const;
  return "unavailable" as const;
}

function usageEventView(row: Row) {
  const cost =
    row.estimated_cost_usd === null || row.estimated_cost_usd === undefined
      ? null
      : Math.round(Number(row.estimated_cost_usd) * 100);
  const tokenKnown = [row.input_tokens, row.output_tokens, row.total_tokens].some(
    (value) => value !== null && value !== undefined,
  );
  return {
    id: row.id,
    organizationId: row.workspace_id,
    userId: row.user_id,
    conversationId: row.conversation_id || undefined,
    requestId: row.request_id,
    provider: row.provider_id,
    model: row.model_id,
    inputTokens: integerMetric(row.input_tokens),
    outputTokens: integerMetric(row.output_tokens),
    cachedInputTokens: integerMetric(row.cached_input_tokens),
    reasoningTokens: integerMetric(row.reasoning_tokens),
    totalTokens: integerMetric(row.total_tokens),
    requestCount: Number(row.request_count || 1),
    estimatedCostMinor: cost,
    costMinor: cost,
    currency: row.currency || "USD",
    usageSource: row.usage_source === "provider_response" ? "provider_response" : "unavailable",
    confidence:
      row.cost_confidence !== "unknown"
        ? "calculated"
        : tokenKnown
          ? "authoritative"
          : "unavailable",
    startedAt: row.started_at,
    completedAt: row.completed_at || undefined,
    status:
      row.status === "succeeded" ? "completed" : row.status === "blocked" ? "cancelled" : "failed",
    metadata: row.metadata || {},
    timestamp: row.occurred_at,
  };
}

async function usage(c: Ctx, req: Request) {
  const pathName = route(req);
  if (req.method === "GET" && pathName === "/usage/board") {
    const period = usagePeriod(new URL(req.url).searchParams.get("period"));
    const periodStart = usagePeriodStart(period);
    const monthlyStart = monthStart();
    const queryStart =
      period === "all"
        ? null
        : periodStart && periodStart < monthlyStart
          ? periodStart
          : monthlyStart;
    let eventsQuery = c.db
      .from("griot_provider_usage_events")
      .select(
        "id,workspace_id,user_id,conversation_id,request_id,provider_id,model_id,status,input_tokens,output_tokens,cached_input_tokens,reasoning_tokens,total_tokens,request_count,estimated_cost_usd,cost_confidence,usage_source,currency,error_message,metadata,started_at,completed_at,occurred_at",
      )
      .eq("workspace_id", c.workspaceId)
      .order("occurred_at", { ascending: false })
      .limit(2000);
    if (queryStart) eventsQuery = eventsQuery.gte("occurred_at", queryStart);
    const [eventsResult, credentialsResult, policiesResult] = await Promise.all([
      eventsQuery,
      c.db
        .from("griot_credentials")
        .select("provider_id,label,status,updated_at")
        .eq("workspace_id", c.workspaceId)
        .eq("created_by", c.user.id)
        .eq("kind", "provider"),
      c.db
        .from("griot_provider_usage_policies")
        .select(
          "workspace_id,provider_id,monthly_budget_usd,daily_request_limit,daily_token_limit,warning_percent,critical_percent,hard_stop_percent,auto_economy,paid_fallback_requires_approval,updated_at",
        )
        .eq("workspace_id", c.workspaceId),
    ]);
    if (eventsResult.error || credentialsResult.error || policiesResult.error)
      throw new ApiError(500, "Could not load the usage ledger");

    const allEvents = (eventsResult.data || []) as Row[];
    const events =
      period === "all" ? allEvents : allEvents.filter((row) => row.occurred_at >= periodStart!);
    const currentMonthEvents = allEvents.filter((row) => row.occurred_at >= monthlyStart);
    const credentials = (credentialsResult.data || []) as Row[];
    const policies = (policiesResult.data || []) as Row[];
    const policiesByProvider = new Map(policies.map((row) => [String(row.provider_id), row]));
    const credentialsByProvider = new Map(credentials.map((row) => [String(row.provider_id), row]));
    const providerIds = new Set<string>();
    for (const row of events) providerIds.add(String(row.provider_id));
    for (const row of credentials) providerIds.add(String(row.provider_id));
    for (const row of policies)
      if (row.provider_id !== "__global__") providerIds.add(String(row.provider_id));

    const providers = [...providerIds].sort().map((providerId) => {
      const providerEvents = events.filter((row) => row.provider_id === providerId);
      const monthlyEvents = currentMonthEvents.filter((row) => row.provider_id === providerId);
      const cost = usageCost(providerEvents),
        monthlyCost = usageCost(monthlyEvents);
      const policy = policiesByProvider.get(providerId);
      const credential = credentialsByProvider.get(providerId);
      const latest = providerEvents[0];
      const budget =
        policy?.monthly_budget_usd === null || policy?.monthly_budget_usd === undefined
          ? null
          : Number(policy.monthly_budget_usd);
      const monthlyRemaining =
        budget !== null && monthlyCost.known ? Math.max(0, budget - monthlyCost.total) : null;
      const failed = providerEvents.find((row) => row.status === "failed");
      return {
        providerId,
        providerName: credential?.label || usageProviderName(providerId),
        status:
          credential?.status === "active"
            ? "connected"
            : providerEvents.length
              ? "error"
              : "unconfigured",
        capabilities: {
          authoritativeBalance: false,
          authoritativeSpend: false,
          authoritativeQuota: false,
          responseTokenUsage: providerEvents.some(
            (row) => row.usage_source === "provider_response",
          ),
          rateLimitHeaders: false,
          billingApi: false,
          budgetApi: true,
          usageApi: false,
        },
        confidence: usageConfidence(providerEvents),
        totalRequests: providerEvents.reduce((sum, row) => sum + Number(row.request_count || 1), 0),
        inputTokens: sumUsageMetric(providerEvents, "input_tokens"),
        outputTokens: sumUsageMetric(providerEvents, "output_tokens"),
        cachedTokens: sumUsageMetric(providerEvents, "cached_input_tokens"),
        cachedInputTokens: sumUsageMetric(providerEvents, "cached_input_tokens"),
        totalTokens: sumUsageMetric(providerEvents, "total_tokens"),
        totalCostMinor: cost.known ? Math.round(cost.total * 100) : 0,
        currency: "USD",
        authoritativeBalanceMinor: null,
        configuredBudgetMinor: budget === null ? null : Math.round(budget * 100),
        remainingBudgetMinor: monthlyRemaining === null ? null : Math.round(monthlyRemaining * 100),
        totalCostFormatted:
          providerEvents.length === 0 ? "0.00" : cost.known ? cost.total.toFixed(4) : undefined,
        costFormatted:
          providerEvents.length === 0 ? "0.00" : cost.known ? cost.total.toFixed(4) : undefined,
        budgetFormatted: budget === null ? undefined : budget.toFixed(2),
        budgetRemainingFormatted:
          monthlyRemaining === null ? undefined : monthlyRemaining.toFixed(2),
        lastSyncedAt: latest?.occurred_at || credential?.updated_at || new Date().toISOString(),
        syncStatus: failed ? "failed" : providerEvents.length ? "synced" : "never",
        errorMessage: failed?.error_message || undefined,
      };
    });

    const globalPolicy = policiesByProvider.get("__global__");
    const globalBudget =
      globalPolicy?.monthly_budget_usd === null || globalPolicy?.monthly_budget_usd === undefined
        ? policies
            .filter(
              (row) =>
                row.provider_id !== "__global__" &&
                row.monthly_budget_usd !== null &&
                row.monthly_budget_usd !== undefined,
            )
            .reduce((sum, row) => sum + Number(row.monthly_budget_usd), 0) || null
        : Number(globalPolicy.monthly_budget_usd);
    const globalCost = usageCost(events),
      globalMonthlyCost = usageCost(currentMonthEvents);
    const globalRemaining =
      globalBudget !== null && globalMonthlyCost.known
        ? Math.max(0, globalBudget - globalMonthlyCost.total)
        : null;
    const byModel = new Map<string, number>();
    const byProvider = new Map<string, number>();
    for (const row of events) {
      byModel.set(row.model_id, (byModel.get(row.model_id) || 0) + Number(row.request_count || 1));
      byProvider.set(
        row.provider_id,
        (byProvider.get(row.provider_id) || 0) + Number(row.request_count || 1),
      );
    }
    const top = (values: Map<string, number>) =>
      [...values.entries()].sort((a, b) => b[1] - a[1])[0]?.[0] || null;
    const global = {
      period,
      totalSpendMinor: globalCost.known ? Math.round(globalCost.total * 100) : 0,
      configuredBudgetMinor: globalBudget === null ? null : Math.round(globalBudget * 100),
      remainingBudgetMinor: globalRemaining === null ? null : Math.round(globalRemaining * 100),
      totalTokens: sumUsageMetric(events, "total_tokens"),
      totalRequests: events.reduce((sum, row) => sum + Number(row.request_count || 1), 0),
      topProvider: top(byProvider),
      topModel: top(byModel),
      confidenceBreakdown: events.reduce(
        (result, row) => {
          const confidence =
            row.cost_confidence !== "unknown"
              ? "calculated"
              : [row.input_tokens, row.output_tokens, row.total_tokens].some(
                    (value) => value !== null && value !== undefined,
                  )
                ? "authoritative"
                : "unavailable";
          result[confidence] = (result[confidence] || 0) + 1;
          return result;
        },
        { authoritative: 0, calculated: 0, estimated: 0, unavailable: 0 } as Row,
      ),
      currency: "USD",
      lastSyncAt: events[0]?.occurred_at || new Date().toISOString(),
      totalCostFormatted:
        events.length === 0 ? "0.00" : globalCost.known ? globalCost.total.toFixed(4) : undefined,
      budgetFormatted: globalBudget === null ? undefined : globalBudget.toFixed(2),
      budgetRemainingFormatted: globalRemaining === null ? undefined : globalRemaining.toFixed(2),
      cachedTokens: sumUsageMetric(events, "cached_input_tokens"),
    };
    return reply(req, {
      global,
      providers,
      history: events.slice(0, 500).map(usageEventView),
      alerts: { rules: [], events: [] },
      policies: policies.map((row) => ({
        ...row,
        monthlyBudgetUsd: row.monthly_budget_usd === null ? null : Number(row.monthly_budget_usd),
      })),
    });
  }

  if (req.method === "GET" && pathName === "/usage/policies") {
    const result = await c.db
      .from("griot_provider_usage_policies")
      .select("*")
      .eq("workspace_id", c.workspaceId);
    if (result.error) throw new ApiError(500, "Could not load usage policies");
    return reply(req, { policies: result.data || [] });
  }

  const policyMatch = pathName.match(/^\/usage\/policies\/([^/]+)$/);
  if (req.method === "PUT" && policyMatch) {
    requirePipelineAdmin(c);
    const providerId = policyMatch[1] === "global" ? "__global__" : policyMatch[1].toLowerCase();
    if (providerId !== "__global__" && !PROVIDERS.includes(providerId))
      throw new ApiError(400, "Unsupported usage policy provider");
    const input = await json(req);
    const monthlyBudgetUsd = nullableNumber(input.monthlyBudgetUsd, "monthlyBudgetUsd");
    const dailyRequestLimit = nullableNumber(input.dailyRequestLimit, "dailyRequestLimit");
    const dailyTokenLimit = nullableNumber(input.dailyTokenLimit, "dailyTokenLimit");
    const warningPercent = Number(input.warningPercent ?? 75);
    const criticalPercent = Number(input.criticalPercent ?? 90);
    const hardStopPercent = Number(input.hardStopPercent ?? 98);
    if (
      ![warningPercent, criticalPercent, hardStopPercent].every(
        (value) => Number.isFinite(value) && value > 0 && value <= 100,
      ) ||
      warningPercent >= criticalPercent ||
      criticalPercent > hardStopPercent
    )
      throw new ApiError(400, "Usage thresholds must be ordered between 0 and 100");
    const saved = await c.db
      .from("griot_provider_usage_policies")
      .upsert(
        {
          workspace_id: c.workspaceId,
          provider_id: providerId,
          monthly_budget_usd: monthlyBudgetUsd,
          daily_request_limit: dailyRequestLimit,
          daily_token_limit: dailyTokenLimit,
          warning_percent: warningPercent,
          critical_percent: criticalPercent,
          hard_stop_percent: hardStopPercent,
          auto_economy: input.autoEconomy === undefined ? true : Boolean(input.autoEconomy),
          paid_fallback_requires_approval:
            input.paidFallbackRequiresApproval === undefined
              ? true
              : Boolean(input.paidFallbackRequiresApproval),
          updated_by: c.user.id,
          updated_at: new Date().toISOString(),
        },
        { onConflict: "workspace_id,provider_id" },
      )
      .select("*")
      .single();
    if (saved.error || !saved.data) throw new ApiError(500, "Could not save usage policy");
    return reply(req, { policy: saved.data });
  }

  throw new ApiError(404, "Usage route not found");
}
function adminReason(req: Request, input?: Row) {
  const query = new URL(req.url).searchParams.get("reason");
  return String(input?.reason || req.headers.get("x-griot-admin-reason") || query || "").trim();
}
function requireAdminReason(reason: string) {
  if (reason.length < 8 || reason.length > 500)
    throw new ApiError(400, "An audit reason of 8-500 characters is required");
}
async function recordAdminAudit(
  c: Ctx,
  action: "conversation.view" | "training.review" | "training.view",
  reason: string,
  values: Row = {},
) {
  requireAdminReason(reason);
  const result = await c.db.from("griot_admin_audit_events").insert({
    actor_id: c.user.id,
    action,
    reason,
    workspace_id: values.workspaceId || null,
    conversation_id: values.conversationId || null,
    message_id: values.messageId || null,
    metadata: { requestId: crypto.randomUUID(), ...(values.metadata || {}) },
  });
  if (result.error) throw new ApiError(500, "Admin audit could not be recorded");
}
async function loadAdminConversation(db: SupabaseClient, conversationId: string) {
  const conversation = await db
    .from("griot_conversations")
    .select(
      "id,title,workspace_id,owner_id,created_by,visibility,training_opt_in,training_review_status,training_opted_in_at,created_at,updated_at",
    )
    .eq("id", conversationId)
    .maybeSingle();
  if (conversation.error || !conversation.data) throw new ApiError(404, "Conversation not found");
  const messages = await db
    .from("griot_messages")
    .select("id,actor_kind,status,content,metadata,error_message,created_at")
    .eq("conversation_id", conversationId)
    .eq("workspace_id", conversation.data.workspace_id)
    .order("created_at", { ascending: true });
  if (messages.error) throw new ApiError(500, "Could not load conversation");
  return { conversation: conversation.data, messages: messages.data || [] };
}
async function adminRoutes(c: Ctx, req: Request) {
  if (!c.isPlatformAdmin) throw new ApiError(403, "Platform administrator access required");
  const pathName = route(req);
  const supportMatch = pathName.match(/^\/admin\/conversations\/([0-9a-f-]{36})$/i);
  if (req.method === "GET" && supportMatch) {
    const reason = adminReason(req);
    requireAdminReason(reason);
    const data = await loadAdminConversation(c.db, supportMatch[1]);
    await recordAdminAudit(c, "conversation.view", reason, {
      workspaceId: data.conversation.workspace_id,
      conversationId: data.conversation.id,
      metadata: { messageCount: data.messages.length, purpose: "support_or_safety_review" },
    });
    return reply(req, data);
  }

  const trainingConversationMatch = pathName.match(
    /^\/admin\/training\/conversations\/([0-9a-f-]{36})$/i,
  );
  if (req.method === "GET" && trainingConversationMatch) {
    const reason = adminReason(req);
    requireAdminReason(reason);
    const data = await loadAdminConversation(c.db, trainingConversationMatch[1]);
    if (
      !data.conversation.training_opt_in ||
      data.conversation.training_review_status !== "approved"
    )
      throw new ApiError(403, "Training access requires explicit consent and approval");
    await recordAdminAudit(c, "training.view", reason, {
      workspaceId: data.conversation.workspace_id,
      conversationId: data.conversation.id,
      metadata: { messageCount: data.messages.length, purpose: "approved_training_review" },
    });
    return reply(req, data);
  }

  const workspaceConversations = pathName.match(
    /^\/admin\/workspaces\/([0-9a-f-]{36})\/conversations$/i,
  );
  if (req.method === "GET" && workspaceConversations) {
    const reason = adminReason(req);
    requireAdminReason(reason);
    const rawLimit = Number(new URL(req.url).searchParams.get("limit") || 100);
    const limit = Number.isSafeInteger(rawLimit) ? Math.min(Math.max(rawLimit, 1), 200) : 100;
    const result = await c.db
      .from("griot_conversations")
      .select(
        "id,title,workspace_id,owner_id,created_by,visibility,training_opt_in,training_review_status,created_at,updated_at",
      )
      .eq("workspace_id", workspaceConversations[1])
      .order("updated_at", { ascending: false })
      .limit(limit);
    if (result.error) throw new ApiError(500, "Could not list workspace conversations");
    await recordAdminAudit(c, "conversation.view", reason, {
      workspaceId: workspaceConversations[1],
      metadata: {
        conversationCount: (result.data || []).length,
        purpose: "support_or_safety_review",
      },
    });
    return reply(req, { conversations: result.data || [] });
  }

  const trainingList = pathName === "/admin/training/conversations";
  if (req.method === "GET" && trainingList) {
    const reason = adminReason(req);
    requireAdminReason(reason);
    const workspaceId = new URL(req.url).searchParams.get("workspaceId")?.trim() || "";
    let query = c.db
      .from("griot_conversations")
      .select(
        "id,title,workspace_id,owner_id,training_opt_in,training_review_status,created_at,updated_at",
      )
      .eq("training_opt_in", true)
      .eq("training_review_status", "approved")
      .order("updated_at", { ascending: false })
      .limit(200);
    if (workspaceId) query = query.eq("workspace_id", workspaceId);
    const result = await query;
    if (result.error) throw new ApiError(500, "Could not list approved training conversations");
    await recordAdminAudit(c, "training.view", reason, {
      workspaceId: workspaceId || null,
      metadata: {
        conversationCount: (result.data || []).length,
        purpose: "approved_training_review",
      },
    });
    return reply(req, { conversations: result.data || [] });
  }

  const reviewMatch = pathName.match(/^\/admin\/conversations\/([0-9a-f-]{36})\/training-review$/i);
  if (req.method === "POST" && reviewMatch) {
    const input = await json(req),
      reason = adminReason(req, input),
      status = String(input.status || "").trim();
    requireAdminReason(reason);
    if (!["pending", "approved", "rejected"].includes(status))
      throw new ApiError(400, "Training review status is invalid");
    const existing = await c.db
      .from("griot_conversations")
      .select("id,workspace_id,training_opt_in")
      .eq("id", reviewMatch[1])
      .maybeSingle();
    if (existing.error || !existing.data) throw new ApiError(404, "Conversation not found");
    if (status === "approved" && !existing.data.training_opt_in)
      throw new ApiError(409, "The conversation owner must opt in before training approval");
    const now = new Date().toISOString();
    const updated = await c.db
      .from("griot_conversations")
      .update({
        training_review_status: status,
        training_reviewed_by: c.user.id,
        training_reviewed_at: now,
      })
      .eq("id", reviewMatch[1])
      .select("id,training_opt_in,training_review_status,training_reviewed_by,training_reviewed_at")
      .single();
    if (updated.error || !updated.data) throw new ApiError(500, "Could not update training review");
    await recordAdminAudit(c, "training.review", reason, {
      workspaceId: existing.data.workspace_id,
      conversationId: existing.data.id,
      metadata: { status, purpose: "training_review" },
    });
    return reply(req, { review: updated.data });
  }

  throw new ApiError(404, "Admin route not found");
}
async function dispatch(req: Request) {
  const pathName = route(req);
  if (req.method === "OPTIONS") return new Response(null, { status: 204, headers: cors(req) });
  const origin = req.headers.get("origin"),
    allowed = config().origins;
  if (origin && !allowed.includes("*") && !allowed.includes(origin))
    throw new ApiError(403, "Origin is not allowed");
  if (req.method === "GET" && (pathName === "/" || pathName === "/live"))
    return reply(req, { ok: true, service: "griot-edge-api", runtime: "supabase-edge-functions" });
  const publicResult = await publicAuth(req, pathName);
  if (publicResult) return publicResult;
  if (req.method === "GET" && pathName === "/providers")
    return reply(req, { providers: PROVIDERS });
  if (req.method === "GET" && pathName === "/plugins") return reply(req, { plugins: PLUGINS });
  const current = await auth(req);
  if (pathName.startsWith("/admin/")) return adminRoutes(current, req);
  if (pathName === "/pipeline/config") return pipelineConfig(current, req);
  if (pathName === "/benchmark/compare") return benchmark(current, req);
  if (pathName.startsWith("/usage/")) return usage(current, req);
  if (pathName.startsWith("/artifacts")) return artifacts(current, req);
  if (pathName.startsWith("/credentials")) return credentials(current, req);
  if (pathName.startsWith("/conversations")) return conversations(current, req);
  if (pathName.startsWith("/workspace/")) return workspaceRoutes(current, req);
  throw new ApiError(404, "Route not found");
}
Deno.serve(async (req) => {
  try {
    return await dispatch(req);
  } catch (error) {
    if (error instanceof ApiError) return reply(req, { error: error.message }, error.status);
    console.error("griot-edge-api", error);
    return reply(req, { error: "Internal server error" }, 500);
  }
});
