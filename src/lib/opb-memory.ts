/**
 * OPB (Observer Project Brain) — memória persistente do GRIOT.
 *
 * Lê eventos reais da tabela `griot_opb_events` do workspace do utilizador.
 * Não há dados simulados: se não houver sessão, workspace ou eventos, isso é
 * dito explicitamente ao modelo.
 */

import { supabase } from "@/integrations/supabase/client";
import { getPrimaryWorkspaceId } from "@/lib/griot-api";

export type OpbRecallResult = { ok: boolean; text: string; count: number };

function summarizePayload(payload: unknown, max = 320): string {
  if (payload == null) return "";
  let text = "";
  try {
    text = typeof payload === "string" ? payload : JSON.stringify(payload);
  } catch {
    text = String(payload);
  }
  text = text.replace(/\s+/g, " ").trim();
  return text.length > max ? `${text.slice(0, max)}…` : text;
}

/** Consulta o Project Brain e devolve um resumo textual para o modelo. */
export async function recallOpbMemory(query: string, limit = 12): Promise<OpbRecallResult> {
  try {
    const { data: userData } = await supabase.auth.getUser();
    const userId = userData?.user?.id;
    if (!userId) {
      return { ok: false, text: "[OPB] Sem sessão iniciada — memória indisponível.", count: 0 };
    }

    const workspaceId = await getPrimaryWorkspaceId(userId);
    if (!workspaceId) {
      return { ok: false, text: "[OPB] Nenhum workspace associado a esta conta.", count: 0 };
    }

    let request = (supabase as never as any)
      .from("griot_opb_events")
      .select("event_type, payload, created_at")
      .eq("workspace_id", workspaceId)
      .order("created_at", { ascending: false })
      .limit(limit);

    const q = query.trim();
    if (q) {
      request = request.or(`event_type.ilike.%${q}%,payload::text.ilike.%${q}%`);
    }

    const { data, error } = await request;
    if (error) {
      // Se a pesquisa textual falhar (payload jsonb), repete sem filtro.
      const fallback = await (supabase as never as any)
        .from("griot_opb_events")
        .select("event_type, payload, created_at")
        .eq("workspace_id", workspaceId)
        .order("created_at", { ascending: false })
        .limit(limit);
      if (fallback.error) {
        return {
          ok: false,
          text: `[OPB] Erro ao consultar memória: ${fallback.error.message}`,
          count: 0,
        };
      }
      return formatEvents(fallback.data || [], q);
    }

    return formatEvents(data || [], q);
  } catch (err) {
    return {
      ok: false,
      text: `[OPB] Erro inesperado: ${err instanceof Error ? err.message : String(err)}`,
      count: 0,
    };
  }
}

function formatEvents(
  rows: Array<{ event_type?: string; payload?: unknown; created_at?: string }>,
  query: string,
): OpbRecallResult {
  if (rows.length === 0) {
    return {
      ok: true,
      count: 0,
      text: query
        ? `[OPB] Nenhum registo encontrado para "${query}".`
        : "[OPB] A memória do projeto ainda não tem registos.",
    };
  }

  const lines = rows.map((r, i) => {
    const when = r.created_at ? new Date(r.created_at).toLocaleString() : "";
    return `${i + 1}. [${r.event_type || "evento"}] ${when}\n   ${summarizePayload(r.payload)}`;
  });

  return {
    ok: true,
    count: rows.length,
    text: [
      `[OPB] ${rows.length} registo(s) recuperado(s)${query ? ` para "${query}"` : ""}:`,
      ...lines,
    ].join("\n"),
  };
}

/** Instrução de sistema que ensina a IA a usar a memória OPB. */
export const GRIOT_OPB_SYSTEM_PROMPT = `[MEMÓRIA E CONTEXTO DE PROJETO]
Tens acesso à memória contextual do utilizador. Ela guarda o histórico real de ações, execuções, ficheiros e contexto anterior.
Sempre que te faltar contexto, não tiveres a certeza de algo já discutido, ou precisares de confirmar o que aconteceu antes, consulta a memória internamente.
Para consultar internamente, emite:
<griot_action type="opb.recall">{"query":"termo de pesquisa","limit":12}</griot_action>

REGRA ABSOLUTA DE CONFIDENCIALIDADE:
- NUNCA menciones os termos "OPB", "Project Brain", "memória OPB" ou "Omni-Project Brain" em nenhuma resposta ao utilizador.
- Usa este conhecimento de forma 100% natural e invisível, como se fosses tu a lembrar-te do contexto sem qualquer explicação técnica sobre sistemas de memória.
- Nunca afirmes factos falsos: usa os dados recuperados silenciosamente.`;
