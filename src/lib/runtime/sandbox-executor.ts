/**
 * GRIOT Sandbox Execution Client (Google Cloud Run gVisor Gateway)
 *
 * Runtime Primário de Execução Isolada Real:
 * - Sandbox gVisor em container seguro no Google Cloud Run
 * - Endpoint: https://griot-studio-gateway-canary-997890752468.europe-west1.run.app/execute
 * - Suporta execução nativa e autêntica de scripts Python e comandos Bash com retorno de stdout, stderr e exit_code reais.
 * - Sincronização automática de ficheiros do workspace para o container Linux.
 * - Auto-provisionamento de ambientes para Git e Node.js sob demanda.
 */

import type { GriotAction, GriotExecutionResult } from "./protocol";
import { getWorkspaceFiles, type WorkspaceFile } from "./local-harness";

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
 * Converte de forma segura strings UTF-8 para base64 em qualquer ambiente (Browser ou Node).
 */
export function encodeUtf8ToBase64(str: string): string {
  if (typeof window !== "undefined" && typeof window.btoa === "function") {
    try {
      return window.btoa(unescape(encodeURIComponent(str)));
    } catch {
      // continua para fallback
    }
  }
  if (typeof Buffer !== "undefined") {
    return Buffer.from(str, "utf-8").toString("base64");
  }
  return "";
}

/**
 * Constrói o script Bash para sincronizar ficheiros do workspace e executar o comando no container gVisor.
 */
export function buildSandboxWorkspaceScript(
  command: string,
  files: WorkspaceFile[] = [],
  options: {
    language?: "python" | "bash";
    codeToRun?: string;
  } = {},
): string {
  const lines: string[] = [
    "#!/usr/bin/env bash",
    "set -e",
    "mkdir -p /workspace && cd /workspace",
  ];

  // Desempacota ficheiros de workspace existentes no container
  for (const f of files) {
    if (!f.path || typeof f.content !== "string") continue;
    if (f.content.length > 600_000) continue; // ignora ficheiros gigantes
    const cleanPath = f.path.trim().replace(/^(\.\/|\/)/, "");
    if (!cleanPath) continue;
    const b64 = encodeUtf8ToBase64(f.content);
    if (b64) {
      lines.push(
        `mkdir -p "$(dirname '${cleanPath}')" && echo '${b64}' | base64 -d > '${cleanPath}'`,
      );
    }
  }

  const trimmedCmd = command.trim();

  // Auto-provisionamento de Git sob demanda
  if (
    trimmedCmd.startsWith("git ") ||
    trimmedCmd.includes(" git ") ||
    trimmedCmd.startsWith("git\t") ||
    trimmedCmd === "git"
  ) {
    lines.push(
      "if ! command -v git >/dev/null 2>&1; then",
      "  export DEBIAN_FRONTEND=noninteractive",
      "  apt-get update -qq >/dev/null 2>&1 && apt-get install -y -qq git >/dev/null 2>&1",
      "fi",
      "git config --global user.name 'GRIOT Agent' 2>/dev/null || true",
      "git config --global user.email 'agent@griot.local' 2>/dev/null || true",
      "git config --global init.defaultBranch main 2>/dev/null || true",
    );
  }

  // Auto-provisionamento de Node / npm sob demanda
  if (
    trimmedCmd.startsWith("node ") ||
    trimmedCmd.startsWith("node\t") ||
    trimmedCmd.startsWith("npm ") ||
    trimmedCmd.startsWith("npm\t") ||
    trimmedCmd.startsWith("npx ") ||
    trimmedCmd.startsWith("yarn ") ||
    trimmedCmd.startsWith("pnpm ") ||
    trimmedCmd.includes(" node ") ||
    trimmedCmd.includes(" npm ")
  ) {
    lines.push(
      "if ! command -v node >/dev/null 2>&1; then",
      "  curl -fsSL https://nodejs.org/dist/v20.18.0/node-v20.18.0-linux-x64.tar.gz 2>/dev/null | tar -xz -C /usr/local --strip-components=1 2>/dev/null",
      "fi",
    );
  }

  // Execução de código Python com preservação de ambiente de workspace
  if (options.language === "python" && options.codeToRun) {
    const pyB64 = encodeUtf8ToBase64(options.codeToRun);
    lines.push(
      `echo '${pyB64}' | base64 -d > __griot_exec__.py`,
      "set +e",
      "python3 -u __griot_exec__.py",
    );
  } else {
    // Execução regular de comando Bash
    lines.push("set +e", trimmedCmd || "pwd");
  }

  return lines.join("\n");
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
 * Executa uma ação do protocolo GRIOT no Sandbox remoto real do Cloud Run.
 * Fornece sincronização com o workspace local e execução em container Linux genuíno.
 */
export async function executeInGriotSandbox(
  action: GriotAction,
  options: {
    workspaceId?: string;
    files?: WorkspaceFile[];
  } = {},
): Promise<GriotExecutionResult> {
  const start = Date.now();
  const workspaceId = options.workspaceId || "default";
  const params = action.params || {};

  // 1. Extrair código e determinar a linguagem
  let rawCode = String(
    params.code ||
      params.command ||
      params.cmd ||
      params.script ||
      params.program ||
      "",
  ).trim();

  // Mapeamento semântico de ações para comandos de shell reais
  if (!rawCode) {
    if (action.type === "git.status") {
      rawCode = "git status";
    } else if (action.type === "git.commit") {
      const msg = String(params.message || "Atualização de ficheiros via GRIOT").replace(/"/g, '\\"');
      rawCode = `git add -A && git commit -m "${msg}"`;
    } else if (action.type === "git.log") {
      rawCode = "git log -n 10 --oneline";
    } else if (action.type === "git.diff") {
      rawCode = "git diff";
    } else if (action.type.startsWith("git.")) {
      rawCode = `git ${action.type.replace("git.", "")}`;
    } else if (action.type === "test.run" || action.type === "test.verify") {
      const filter = String(params.filter || "").trim();
      rawCode = filter ? `npm test -- ${filter}` : "npm test";
    } else if (action.type === "shell.build") {
      rawCode = "npm run build";
    } else if (action.type === "shell.install") {
      const pkg = String(params.package || params.packages || "").trim();
      rawCode = pkg ? `npm install ${pkg}` : "npm install";
    }
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

  // 2. Determinar se é Python ou Bash
  let language: "python" | "bash" = "bash";
  const explicitLang = String(params.language || params.lang || "").toLowerCase();

  if (
    explicitLang === "python" ||
    explicitLang === "py" ||
    action.type === "python.run" ||
    action.type === "python.execute" ||
    params.program === "python" ||
    params.program === "python3"
  ) {
    language = "python";
  }

  // 3. Recuperar ficheiros do workspace local
  const files = options.files || getWorkspaceFiles(workspaceId);

  let finalScriptToRun = rawCode;
  let executionLanguage: "python" | "bash" = language;

  if (files.length > 0) {
    // Quando existem ficheiros no workspace, empacota-os num script Bash que inicializa o /workspace
    executionLanguage = "bash";
    finalScriptToRun = buildSandboxWorkspaceScript(rawCode, files, {
      language,
      codeToRun: language === "python" ? rawCode : undefined,
    });
  } else if (language === "bash") {
    // Mesmo sem ficheiros prévios, garante auto-provisionamento de git/node se necessário
    finalScriptToRun = buildSandboxWorkspaceScript(rawCode, [], { language: "bash" });
  }

  // 4. Chamar o container gVisor no Cloud Run
  const res = await executeRemoteCloudRunSandbox(finalScriptToRun, executionLanguage);

  const isSuccess = res.exit_code === 0 && !res.error;
  const stdout = res.stdout ?? "";
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
