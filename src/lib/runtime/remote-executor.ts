import type { GriotAction, GriotExecutionResult } from "./protocol";
import { supabase } from "@/integrations/supabase/client";

const DEFAULT_ENDPOINT = "/api/runtime/execute";
const MAX_RESPONSE_BYTES = 2_000_000;

function timeoutSignal(ms: number): AbortSignal {
  if (typeof AbortSignal !== "undefined" && "timeout" in AbortSignal) {
    return AbortSignal.timeout(ms);
  }
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), ms);
  return controller.signal;
}

export async function executeRemoteAction(
  action: GriotAction,
  options: { endpoint?: string; timeoutMs?: number; workspaceId?: string | null } = {},
): Promise<GriotExecutionResult> {
  const start = Date.now();
  const customRunnerUrl =
    typeof window !== "undefined" ? window.localStorage.getItem("griot_gcp_runner_url") || "" : "";
  const customRunnerSecret =
    typeof window !== "undefined"
      ? window.localStorage.getItem("griot_gcp_runner_secret") || ""
      : "";

  let authToken = "";
  try {
    const { data } = await supabase.auth.getSession();
    if (data.session?.access_token) {
      authToken = data.session.access_token;
    }
  } catch {
    // Auth session unavailable or offline
  }

  const endpoint = options.endpoint || DEFAULT_ENDPOINT;
  try {
    const response = await fetch(endpoint, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        ...(authToken ? { Authorization: `Bearer ${authToken}` } : {}),
        ...(customRunnerUrl ? { "x-griot-custom-runner": customRunnerUrl } : {}),
        ...(customRunnerSecret ? { "x-griot-custom-secret": customRunnerSecret } : {}),
      },
      credentials: "include",
      body: JSON.stringify({
        action,
        workspaceId: options.workspaceId || undefined,
      }),
      signal: timeoutSignal(options.timeoutMs ?? 25_000),
    });

    const text = await response.text();
    if (text.length > MAX_RESPONSE_BYTES) {
      throw new Error("Runtime response exceeds the safety limit.");
    }

    let payload: unknown = null;
    try {
      payload = text ? JSON.parse(text) : null;
    } catch {
      payload = null;
    }

    if (!response.ok) {
      const message =
        payload && typeof payload === "object" && "error" in payload
          ? String((payload as Record<string, unknown>).error)
          : `Remote runtime returned HTTP ${response.status}.`;
      return failedResult(action, message, Date.now() - start, response.status);
    }

    if (!payload || typeof payload !== "object" || !("result" in payload)) {
      return failedResult(
        action,
        "Remote runtime returned an invalid result.",
        Date.now() - start,
        1,
      );
    }

    return normalizeRemoteResult(
      action,
      (payload as { result: unknown }).result,
      Date.now() - start,
    );
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return failedResult(action, `Runtime unavailable: ${message}`, Date.now() - start, 1);
  }
}

function normalizeRemoteResult(
  action: GriotAction,
  value: unknown,
  fallbackDurationMs: number,
): GriotExecutionResult {
  if (!value || typeof value !== "object") {
    return failedResult(
      action,
      "Remote runtime returned a malformed execution object.",
      fallbackDurationMs,
      1,
    );
  }
  const raw = value as Partial<GriotExecutionResult>;
  return {
    actionId: String(raw.actionId || action.id),
    actionType: action.type,
    status: raw.status === "success" || raw.status === "rejected" ? raw.status : "failed",
    exitCode: Number.isFinite(raw.exitCode) ? Number(raw.exitCode) : 1,
    stdout: typeof raw.stdout === "string" ? raw.stdout : "",
    stderr: typeof raw.stderr === "string" ? raw.stderr : "",
    durationMs: Number.isFinite(raw.durationMs) ? Number(raw.durationMs) : fallbackDurationMs,
    data:
      raw.data && typeof raw.data === "object" ? (raw.data as Record<string, unknown>) : undefined,
    diff: typeof raw.diff === "string" ? raw.diff : undefined,
    timestamp: typeof raw.timestamp === "string" ? raw.timestamp : new Date().toISOString(),
  };
}

function failedResult(
  action: GriotAction,
  stderr: string,
  durationMs: number,
  exitCode = 1,
): GriotExecutionResult {
  return {
    actionId: action.id,
    actionType: action.type,
    status: "failed",
    exitCode,
    stdout: "",
    stderr,
    durationMs,
    timestamp: new Date().toISOString(),
  };
}
