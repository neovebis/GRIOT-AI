/**
 * Thin client for the real GRIOT backend (Supabase Edge Function `griot-api`).
 *
 * The mobile app used to talk to Supabase tables that don't exist in the
 * production GRIOT database (profiles, wallets, conversations, agents...).
 * The real backend lives behind the `griot-api` Edge Function plus a set of
 * `griot_*` tables. This helper calls that Edge Function; RLS-safe reads that
 * don't need business logic still go straight through the Supabase client.
 */
import { supabase } from "@/integrations/supabase/client";
import { SUPABASE_PUBLISHABLE_KEY, SUPABASE_URL } from "@/integrations/supabase/config";

export type GriotApiResult<T> = { data: T | null; error: string | null; status: number };

// Coordenadas do projeto (chave publicável). Definidas num único sítio:
// src/integrations/supabase/config.ts
export const GRIOT_SUPABASE_URL = SUPABASE_URL;
export const GRIOT_SUPABASE_ANON_KEY = SUPABASE_PUBLISHABLE_KEY;

export async function callGriotApi<T = unknown>(
  path: string,
  options: { method?: "GET" | "POST" | "PATCH" | "PUT" | "DELETE"; body?: unknown } = {},
): Promise<GriotApiResult<T>> {
  const { method = "GET", body } = options;
  try {
    const { data, error } = await supabase.functions.invoke(`griot-api${path}`, {
      method,
      body: body === undefined ? undefined : JSON.stringify(body),
      headers: body === undefined ? undefined : { "content-type": "application/json" },
    });
    if (error) {
      return { data: null, error: error.message || "griot-api request failed", status: 0 };
    }
    if (data && typeof data === "object" && "error" in (data as Record<string, unknown>)) {
      return { data: null, error: String((data as Record<string, unknown>).error), status: 0 };
    }
    return { data: data as T, error: null, status: 200 };
  } catch (err) {
    return { data: null, error: err instanceof Error ? err.message : String(err), status: 0 };
  }
}

export async function callGriotStudioApi<T = unknown>(
  path: string,
  options: { method?: "GET" | "POST" | "PATCH" | "PUT" | "DELETE"; body?: unknown } = {},
): Promise<GriotApiResult<T>> {
  const { method = "GET", body } = options;
  try {
    const { data, error } = await supabase.functions.invoke(`griot-studio${path}`, {
      method,
      body: body === undefined ? undefined : JSON.stringify(body),
      headers: body === undefined ? undefined : { "content-type": "application/json" },
    });
    if (error) {
      return { data: null, error: error.message || "griot-studio request failed", status: 0 };
    }
    if (data && typeof data === "object" && "error" in (data as Record<string, unknown>)) {
      return { data: null, error: String((data as Record<string, unknown>).error), status: 0 };
    }
    return { data: data as T, error: null, status: 200 };
  } catch (err) {
    return { data: null, error: err instanceof Error ? err.message : String(err), status: 0 };
  }
}

/**
 * Ensures the signed-in user has a workspace + profile row on the real
 * backend. Safe to call repeatedly — griot-api auto-provisions a personal
 * workspace the first time an authenticated request is made and is a no-op
 * afterwards. Fire-and-forget; failures are non-fatal (e.g. offline).
 */
export async function ensureGriotWorkspace() {
  return callGriotApi<{
    user: { id: string; email: string; displayName: string };
    workspace: { id: string; role: string };
  }>("/auth/me");
}

/** Resolves the current user's primary (first-joined) workspace id, if any. */
export async function getPrimaryWorkspaceId(userId?: string | null): Promise<string | null> {
  if (!userId) return null;
  // NOTE: `griot_workspace_members` isn't in the generated `Database` types
  // yet (types.ts targets an older schema) — cast until it's regenerated
  // from the live "griot" project.
  const { data, error } = await (supabase as any)
    .from("griot_workspace_members")
    .select("workspace_id, created_at")
    .eq("user_id", userId)
    .order("created_at", { ascending: true })
    .limit(1)
    .maybeSingle();
  if (error || !data) return null;
  return (data as { workspace_id: string }).workspace_id;
}

export type GriotCredential = {
  id: string;
  kind: "provider" | "plugin";
  providerId: string;
  label: string;
  settings: Record<string, unknown>;
  status: "pending" | "active" | "revoked";
  secretHint: string;
};

/** Lists the current workspace's saved provider/plugin credentials. */
export async function listGriotCredentials(kind?: "provider" | "plugin") {
  return callGriotApi<{ credentials: GriotCredential[] }>(
    `/credentials${kind ? `?kind=${kind}` : ""}`,
  );
}

/** Saves a new credential (provider API key or plugin token) — stored encrypted server-side. */
export async function saveGriotCredential(input: {
  providerId: string;
  secret: string;
  kind?: "provider" | "plugin";
  label?: string;
  model?: string;
  settings?: Record<string, unknown>;
}) {
  const kind = input.kind || "provider";
  const settings = input.settings || (input.model ? { model: input.model } : {});
  return callGriotApi<{ credential: GriotCredential }>("/credentials", {
    method: "POST",
    body: {
      kind,
      providerId: input.providerId,
      secret: input.secret,
      label: input.label || input.providerId,
      settings,
    },
  });
}

/** Verifies a saved credential against the real provider API (marks it active/revoked). */
export async function verifyGriotCredential(credentialId: string) {
  return callGriotApi<{ valid: boolean; status: string; message: string }>(
    `/credentials/${credentialId}/verify`,
    { method: "POST" },
  );
}

export async function deleteGriotCredential(credentialId: string) {
  return callGriotApi<{ ok: boolean }>(`/credentials/${credentialId}`, { method: "DELETE" });
}
