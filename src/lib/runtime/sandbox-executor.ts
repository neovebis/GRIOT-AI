/**
 * GRIOT Sandbox Execution Client (Google Cloud Run gVisor Gateway)
 *
 * Runtime Primário de Execução Isolada:
 * - Sandbox gVisor em container seguro no Google Cloud Run
 * - Endpoint: https://griot-studio-gateway-canary-997890752468.europe-west1.run.app/execute
 * - Suporta execução nativa de scripts Python e comandos Bash com retorno de stdout, stderr e exit_code.
 */

import type { GriotAction, GriotExecutionResult } from "./protocol";

export const DEFAULT_CLOUD_RUN_SANDBOX_ENDPOINT =
  "https://griot-studio-gateway-canary-997890752468.europe-west1.run.app/execute";

export const DEFAULT_CLOUD_RUN_SANDBOX_TOKEN = "esdras@123123";

export interface CloudRunExecutePayload {
  language: "python" | "bash";
  code: string;
}

export interface CloudRunExecuteResponse {
  stdout?: string;
  stderr?: string;
  exit_code?: number;
  error?: string;
}

export interface SandboxRunInfo {
  id: string;
  runtimeId?: string;
  connectionId?: string;
  provider?: string;
  state?: string;
  repository?: string;
  ref?: string;
  status?: string;
}

/**
 * Obtém o endpoint ativo do Cloud Run Sandbox (via localStorage, env ou default).
 */
export function getCloudRunSandboxEndpoint(): string {
  if (typeof window !== "undefined") {
    const customUrl =
      window.localStorage.getItem("griot_gcp_runner_url") ||
      window.localStorage.getItem("griot_cloud_run_sandbox_url");
    if (customUrl) {
      const clean = customUrl.trim().replace(/\/$/, "");
      return clean.endsWith("/execute") ? clean : `${clean}/execute`;
    }
  }
  const envUrl = (import.meta as any)?.env?.VITE_GRIOT_SANDBOX_URL;
  if (envUrl) {
    const clean = String(envUrl).trim().replace(/\/$/, "");
    return clean.endsWith("/execute") ? clean : `${clean}/execute`;
  }
  return DEFAULT_CLOUD_RUN_SANDBOX_ENDPOINT;
}

/**
 * Obtém o token de autorização do Cloud Run Sandbox.
 */
export function getCloudRunSandboxToken(): string {
  if (typeof window !== "undefined") {
    const customToken =
      window.localStorage.getItem("griot_gcp_runner_secret") ||
      window.localStorage.getItem("griot_cloud_run_sandbox_token");
    if (customToken) {
      return customToken.trim();
    }
  }
  const envToken = (import.meta as any)?.env?.VITE_GRIOT_SANDBOX_TOKEN;
  if (envToken) {
    return String(envToken).trim();
  }
  return DEFAULT_CLOUD_RUN_SANDBOX_TOKEN;
}

/**
 * Executa código diretamente no Sandbox remoto gVisor do Cloud Run.
 */
export async function executeRemoteCloudRunSandbox(
  code: string,
  language: "python" | "bash" = "bash",
  options: {
    timeoutMs?: number;
    endpoint?: string;
    token?: string;
  } = {},
): Promise<CloudRunExecuteResponse> {
  const endpoint = options.endpoint || getCloudRunSandboxEndpoint();
  const token = options.token || getCloudRunSandboxToken();
  const timeoutMs = options.timeoutMs ?? 60_000;

  const controller = new AbortController();
  const timeoutTimer = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const res = await fetch(endpoint, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({
        language,
        code,
      }),
      signal: controller.signal,
    });

    clearTimeout(timeoutTimer);

    if (!res.ok) {
      const errorText = await res.text().catch(() => "");
      let parsedError = errorText;
      try {
        const j = JSON.parse(errorText);
        parsedError = j.error || errorText;
      } catch {
        // use raw text
      }
      return {
        exit_code: res.status,
        stderr: `[Cloud Run Sandbox HTTP ${res.status}]: ${parsedError || res.statusText}`,
        stdout: "",
      };
    }

    const data = (await res.json()) as CloudRunExecuteResponse;
    return {
      stdout: data.stdout ?? "",
      stderr: data.stderr ?? "",
      exit_code: typeof data.exit_code === "number" ? data.exit_code : 0,
      error: data.error,
    };
  } catch (err) {
    clearTimeout(timeoutTimer);
    const isTimeout = err instanceof DOMException && err.name === "AbortError";
    const msg = isTimeout
      ? `Execução no Cloud Run Sandbox excedeu o limite de tempo (${timeoutMs / 1000}s).`
      : err instanceof Error
        ? err.message
        : String(err);

    return {
      exit_code: isTimeout ? 124 : 1,
      stderr: `[Cloud Run Sandbox]: ${msg}`,
      stdout: "",
    };
  }
}

/**
 * Reconcilia ou inicializa a identidade de sessão do Sandbox (compatibilidade de API).
 */
export async function getOrStartSandboxRun(
  projectId = "default-project",
  objective = "GRIOT Studio Execution",
): Promise<{ run: SandboxRunInfo | null; error: string | null }> {
  return {
    run: {
      id: "cloud-run-gvisor",
      runtimeId: "europe-west1-canary",
      connectionId: "griot-studio-gateway-canary",
      provider: "cloud_run_gvisor",
      status: "ready",
      state: "running",
    },
    error: null,
  };
}

/**
 * Executa uma ação do protocolo GRIOT no Sandbox remoto do Cloud Run.
 */
export async function executeInGriotSandbox(
  action: GriotAction,
  targetProjectId?: string,
): Promise<GriotExecutionResult> {
  const start = Date.now();

  // 1. Extrair código e determinar a linguagem
  const rawCode = String(
    action.params?.code ||
      action.params?.command ||
      action.params?.cmd ||
      action.params?.script ||
      action.params?.program ||
      (action.type.startsWith("git.") ? `git ${action.type.replace("git.", "")}` : "") ||
      (action.type === "test.run" ? `npm test -- ${action.params?.filter || ""}` : "") ||
      (action.type === "build.run" ? `npm run build` : "") ||
      "",
  ).trim();

  let language: "python" | "bash" = "bash";

  const explicitLang = String(action.params?.language || action.params?.lang || "").toLowerCase();
  if (explicitLang === "python" || explicitLang === "py") {
    language = "python";
  } else if (explicitLang === "bash" || explicitLang === "sh" || explicitLang === "shell") {
    language = "bash";
  } else if (
    action.type === "python.run" ||
    action.type === "python.execute" ||
    action.params?.program === "python" ||
    action.params?.program === "python3"
  ) {
    language = "python";
  }

  if (!rawCode) {
    return {
      actionId: action.id,
      actionType: action.type,
      status: "failed",
      exitCode: 1,
      stdout: "",
      stderr: "[Cloud Run Sandbox]: Nenhum comando ou script fornecido para execução.",
      durationMs: Date.now() - start,
      timestamp: new Date().toISOString(),
    };
  }

  // 2. Chamar o Cloud Run Sandbox
  const res = await executeRemoteCloudRunSandbox(rawCode, language);

  const isSuccess = res.exit_code === 0 && !res.error;
  const stdout = res.stdout || (isSuccess ? "[Cloud Run Sandbox] Comando executado com sucesso." : "");
  const stderr = res.stderr || (res.error ? `Erro: ${res.error}` : "");

  return {
    actionId: action.id,
    actionType: action.type,
    status: isSuccess ? "success" : "failed",
    exitCode: typeof res.exit_code === "number" ? res.exit_code : (isSuccess ? 0 : 1),
    stdout,
    stderr,
    durationMs: Date.now() - start,
    timestamp: new Date().toISOString(),
  };
}
