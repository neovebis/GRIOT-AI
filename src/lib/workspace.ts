import { supabase } from "@/integrations/supabase/client";

/**
 * Resolve o espaço de trabalho (workspace) do utilizador autenticado.
 *
 * O backend real do GRIOT organiza carteira, projetos, conversas e eventos
 * por `workspace_id` — nunca por `user_id` diretamente. Este módulo é o único
 * sítio que faz essa tradução.
 */

let cache: { userId: string; workspaceId: string | null } | null = null;

export async function getCurrentWorkspaceId(userId?: string): Promise<string | null> {
  let uid = userId;
  if (!uid || uid === "anonymous") {
    const { data } = await supabase.auth.getUser();
    uid = data.user?.id;
  }
  if (!uid) return null;

  if (cache && cache.userId === uid) return cache.workspaceId;

  const { data, error } = await supabase
    .from("griot_workspace_members")
    .select("workspace_id")
    .eq("user_id", uid)
    .limit(1)
    .maybeSingle();

  if (error) {
    console.warn("[workspace] Não foi possível resolver o espaço de trabalho:", error.message);
  }

  let workspaceId = data?.workspace_id ?? null;

  // Se o utilizador tem sessão iniciada mas ainda não tem workspace associado,
  // aciona automaticamente o aprovisionamento na edge function griot-api/auth/me
  if (!workspaceId) {
    try {
      const { ensureGriotWorkspace } = await import("@/lib/griot-api");
      const provisioned = await ensureGriotWorkspace();
      if (provisioned.data?.workspace?.id) {
        workspaceId = provisioned.data.workspace.id;
      }
    } catch {}
  }

  cache = { userId: uid, workspaceId };
  return workspaceId;
}

export function clearWorkspaceCache(): void {
  cache = null;
}
