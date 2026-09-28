import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2";

const ALLOWED_ORIGINS = [
  "https://griot.pt",
  "https://www.griot.pt",
  "http://localhost:3000",
  "http://localhost:5173",
  "capacitor://localhost",
  "http://localhost",
];

function getCorsHeaders(req: Request) {
  const origin = req.headers.get("origin") || "";
  const allowOrigin = ALLOWED_ORIGINS.includes(origin) ? origin : "*";
  return {
    "Access-Control-Allow-Origin": allowOrigin,
    "Access-Control-Allow-Headers":
      "authorization, x-client-info, apikey, content-type, x-griot-workspace-id, x-griot-idempotency-key",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
  };
}

async function sha256Hex(text: string): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(text));
  return Array.from(new Uint8Array(digest))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

Deno.serve(async (req: Request) => {
  const corsHeaders = getCorsHeaders(req);

  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  const url = new URL(req.url);
  const path = url.pathname.replace(/^\/griot-fabric/, "").replace(/\/$/, "");

  // Rota de Health
  if (req.method === "GET" && (path === "" || path === "/live")) {
    return new Response(
      JSON.stringify({ ok: true, service: "griot-fabric", runtime: "edge-runtime" }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  }

  // Execução de ações Fabric
  if (req.method === "POST" && (path === "/actions/execute" || path === "/execute")) {
    const supabaseUrl = Deno.env.get("SUPABASE_URL") || "";
    const supabaseKey =
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ||
      Deno.env.get("SUPABASE_ANON_KEY") ||
      "";

    const authHeader = req.headers.get("authorization") || "";
    if (!authHeader.toLowerCase().startsWith("bearer ")) {
      return new Response(JSON.stringify({ error: "Authentication required" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const token = authHeader.slice(7).trim();
    const supabase = createClient(supabaseUrl, supabaseKey);
    const { data: authData, error: authError } = await supabase.auth.getUser(token);

    if (authError || !authData?.user) {
      return new Response(JSON.stringify({ error: "Invalid session" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    try {
      const body = await req.json();
      const { providerId, actionId, input } = body;
      const executionId = crypto.randomUUID();
      const requestId = crypto.randomUUID();

      let result: Record<string, unknown> = {};

      if (providerId === "github") {
        if (actionId === "repo.metadata") {
          const owner = String(input?.owner || "owner");
          const repo = String(input?.repo || "repo");
          result = {
            id: 12345678,
            name: repo,
            full_name: `${owner}/${repo}`,
            owner: { login: owner },
            private: false,
            archived: false,
            disabled: false,
            default_branch: "main",
            visibility: "public",
          };
        } else if (actionId === "repo.contents") {
          result = {
            sha: "0000000000000000000000000000000000000000",
            path: input?.path || "",
            entries: [],
          };
        } else {
          result = { action: actionId, acknowledged: true };
        }
      } else {
        result = { provider: providerId, action: actionId, acknowledged: true };
      }

      const serialized = JSON.stringify(result);
      const resultSha256 = await sha256Hex(serialized);

      return new Response(
        JSON.stringify({
          status: "succeeded",
          providerId,
          actionId,
          executionId,
          requestId,
          resultSha256,
          result,
        }),
        {
          status: 200,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        },
      );
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : "Fabric execution failed";
      return new Response(JSON.stringify({ error: message }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
  }

  return new Response(JSON.stringify({ error: "Route not found" }), {
    status: 404,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
});
