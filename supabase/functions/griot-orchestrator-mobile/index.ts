import "jsr:@supabase/functions-js/edge-runtime.d.ts";

const ALLOWED_ORIGINS = new Set([
  "https://griot.pt",
  "https://localhost",
  "capacitor://localhost",
  "ionic://localhost",
  "http://localhost",
  "http://localhost:3001",
  "http://127.0.0.1:3001",
  "http://localhost:5173",
]);

function corsHeaders(req: Request) {
  const origin = req.headers.get("origin") || "";
  const headers = new Headers({
    "access-control-allow-methods": "POST,OPTIONS",
    "access-control-allow-headers": "authorization,apikey,content-type,x-griot-workspace-id,x-griot-idempotency-key",
    "access-control-max-age": "86400",
    "vary": "Origin",
  });
  if (!origin || ALLOWED_ORIGINS.has(origin)) {
    headers.set("access-control-allow-origin", origin || "https://griot.pt");
  }
  return headers;
}

Deno.serve(async (req) => {
  const headers = corsHeaders(req);
  if (req.method === "OPTIONS") return new Response(null, { status: 204, headers });
  if (req.method !== "POST") {
    headers.set("content-type", "application/json; charset=utf-8");
    return new Response(JSON.stringify({ error: "Method not allowed" }), { status: 405, headers });
  }

  const supabaseUrl = Deno.env.get("SUPABASE_URL") || "";
  const anonKey = Deno.env.get("SUPABASE_ANON_KEY") || Deno.env.get("SUPABASE_PUBLISHABLE_KEY") || "";
  if (!supabaseUrl || !anonKey) {
    headers.set("content-type", "application/json; charset=utf-8");
    return new Response(JSON.stringify({ error: "Supabase server configuration is incomplete" }), { status: 503, headers });
  }

  const authorization = req.headers.get("authorization") || "";
  if (!authorization.toLowerCase().startsWith("bearer ")) {
    headers.set("content-type", "application/json; charset=utf-8");
    return new Response(JSON.stringify({ error: "Authentication required" }), { status: 401, headers });
  }

  let body: string;
  try {
    body = await req.text();
  } catch {
    headers.set("content-type", "application/json; charset=utf-8");
    return new Response(JSON.stringify({ error: "Invalid request body" }), { status: 400, headers });
  }

  const upstreamHeaders = new Headers({
    "content-type": "application/json",
    authorization,
    apikey: req.headers.get("apikey") || anonKey,
  });
  for (const name of ["x-griot-workspace-id", "x-griot-idempotency-key"]) {
    const value = req.headers.get(name);
    if (value) upstreamHeaders.set(name, value);
  }

  let normalizedBody = body;
  try {
    const parsed = JSON.parse(body);
    let mutated = false;
    const model = String(parsed.model || "").toLowerCase();
    const provider = String(parsed.provider || "").toLowerCase();
    if (model === "base" || model === "modelgpu" || model === "modelgpu-base" || provider === "base") {
      parsed.provider = "gemini";
      parsed.model = "gemini-3.6-flash";
      parsed.systemInstruction = (parsed.systemInstruction ? parsed.systemInstruction + "\n\n" : "") + "[GRIOT_KERNEL: ModelGPU BASE]";
      mutated = true;
    } else if (model === "sheol" || model === "griotgpu" || model === "griotgpu-v2" || provider === "sheol") {
      parsed.provider = "gemini";
      parsed.model = "gemini-3.6-flash";
      parsed.systemInstruction = (parsed.systemInstruction ? parsed.systemInstruction + "\n\n" : "") + "[GRIOT_KERNEL: GriotGPU v2 SHEOL]";
      mutated = true;
    }
    if (mutated) {
      normalizedBody = JSON.stringify(parsed);
    }
  } catch {
    // Mantém body original se não for JSON válido
  }

  try {
    const upstream = await fetch(`${supabaseUrl}/functions/v1/griot-orchestrator/ask`, {
      method: "POST",
      headers: upstreamHeaders,
      body: normalizedBody,
    });
    const responseBody = await upstream.text();
    headers.set("content-type", upstream.headers.get("content-type") || "application/json; charset=utf-8");
    headers.set("cache-control", "no-store");
    return new Response(responseBody, { status: upstream.status, headers });
  } catch (error) {
    headers.set("content-type", "application/json; charset=utf-8");
    return new Response(JSON.stringify({ error: error instanceof Error ? error.message : "Upstream orchestrator unavailable" }), { status: 502, headers });
  }
});