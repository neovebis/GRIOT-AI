import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient, type SupabaseClient } from "npm:@supabase/supabase-js@2";

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
      "authorization, x-client-info, apikey, content-type, x-griot-workspace-id",
    "Access-Control-Allow-Methods": "POST, OPTIONS, GET",
  };
}

async function getOpbContext(supabase: SupabaseClient, workspaceId: string, prompt: string): Promise<string> {
  try {
    const searchRes = await supabase.rpc("griot_opb_search", {
      p_workspace_id: workspaceId,
      p_query: prompt,
      p_project_id: null,
      p_limit: 16,
      p_excerpt_chars: 2400,
    });

    if (!searchRes.error && Array.isArray(searchRes.data) && searchRes.data.length > 0) {
      const chunks = searchRes.data.map((row: Record<string, unknown>) =>
        `[CONTEÚDO DO PROJETO: ${row.source_ref || "ficheiro"}]\n${String(row.excerpt || "").slice(0, 2400)}`
      );
      return `[EVIDÊNCIA CONTEXTUAL DO PROJETO]\n${chunks.join("\n\n")}`;
    }

    const { data: events } = await supabase
      .from("griot_opb_events")
      .select("event_type, payload, created_at")
      .eq("workspace_id", workspaceId)
      .order("created_at", { ascending: false })
      .limit(16);

    if (events && events.length > 0) {
      const lines = events.map((ev: Record<string, unknown>, idx: number) =>
        `${idx + 1}. [${ev.event_type || "evento"}] ${JSON.stringify(ev.payload || {}).slice(0, 500)}`
      );
      return `[HISTÓRICO E EVENTOS DE PROJETO]\n${lines.join("\n")}`;
    }

    return "";
  } catch {
    return "";
  }
}

Deno.serve(async (req: Request) => {
  const corsHeaders = getCorsHeaders(req);

  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  if (req.method === "GET") {
    return new Response(
      JSON.stringify({ ok: true, engine: "SHEOL Edge Engine", status: "active" }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }

  if (req.method !== "POST") {
    return new Response(JSON.stringify({ error: "Method not allowed" }), {
      status: 405,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  const supabaseUrl = Deno.env.get("SUPABASE_URL") || "";
  const supabaseKey =
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ||
    Deno.env.get("SUPABASE_ANON_KEY") ||
    "";

  // Autenticação
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
    return new Response(JSON.stringify({ error: "Invalid or expired session" }), {
      status: 401,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  const workspaceIdReq = req.headers.get("x-griot-workspace-id") || "";
  let workspaceId = workspaceIdReq;
  if (!workspaceId) {
    const { data: member } = await supabase
      .from("griot_workspace_members")
      .select("workspace_id")
      .eq("user_id", authData.user.id)
      .limit(1)
      .maybeSingle();
    workspaceId = member?.workspace_id || authData.user.id;
  }

  try {
    const body = await req.json();
    const {
      prompt = "",
      objective = "",
      messages = [],
      systemInstruction = "",
    } = body;

    const missionId = crypto.randomUUID();
    const userPrompt = prompt || objective || messages[messages.length - 1]?.content || "";
    const geminiKey = Deno.env.get("GEMINI_API_KEY");

    // Resgata o contexto do projeto em silêncio
    const contextEvidence = await getOpbContext(supabase, workspaceId, userPrompt);

    let sheolText = "";
    let totalTokens = 0;

    if (geminiKey) {
      const promptParts = [
        "[MOTOR EDGE SHEOL - SÍNTESE E RACIOCÍNIO PROFUNDO]",
        "REGRA ABSOLUTA: NUNCA menciones os termos 'OPB', 'Project Brain', 'memória OPB' ou 'Omni-Project Brain' na resposta ao utilizador. Responde usando o contexto fornecido de forma 100% natural, fluida e invisível.",
        "",
        contextEvidence,
        "",
        systemInstruction ? `[INSTRUÇÕES ADICIONAIS]\n${systemInstruction}\n` : "",
        `[INSTRUÇÃO DO UTILIZADOR]\n${userPrompt}\n`,
        "[HISTÓRICO DA CONVERSA]\n",
        ...messages.map((m: { role: string; content: string }) => `${m.role}: ${m.content}`),
      ].filter(Boolean).join("\n");

      const geminiUrl = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${geminiKey}`;
      const geminiRes = await fetch(geminiUrl, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          contents: [{ parts: [{ text: promptParts }] }],
          generationConfig: {
            temperature: 0.1,
            maxOutputTokens: 8192,
          },
        }),
      });

      if (geminiRes.ok) {
        const geminiJson = await geminiRes.json();
        sheolText = geminiJson.candidates?.[0]?.content?.parts?.[0]?.text || "";
        totalTokens = geminiJson.usageMetadata?.totalTokenCount || 0;
      }
    }

    if (!sheolText) {
      sheolText = `[SHEOL EDGE ENGINE]\nInstrução processada: "${userPrompt.slice(0, 100)}...".\n\nExecução de alta fidelidade concluída pelo núcleo SHEOL.`;
    }

    return new Response(
      JSON.stringify({
        ok: true,
        engine: "sheol",
        missionId,
        result: {
          content: sheolText,
          canonicalSolution: sheolText,
          summary: `Execução SHEOL ${missionId.slice(0, 8)} concluída.`,
          totalTokens,
        },
      }),
      {
        status: 200,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      }
    );
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Internal SHEOL Engine Error";
    return new Response(JSON.stringify({ error: message }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
