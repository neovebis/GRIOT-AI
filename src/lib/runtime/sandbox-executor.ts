/**
 * GRIOT Sandbox Execution Client
 *
 * Arquitetura Primária de Execução do GRIOT Studio:
 * GRIOT Studio → Studio Compute (Edge Function griot-studio-compute)
 *              → Connected Compute (Execution Gateway)
 *              → GRIOT Sandbox (Container isolado)
 *              → Execução
 *
 * Regras Fundamentais:
 * 1. Runtime primário: griot_sandbox.
 * 2. Reconciliação / Inicialização do container isolado no Execution Gateway.
 * 3. Se o Sandbox falhar, falha explicitamente com erro legível.
 * 4. NÃO fazer fallback automático para Cloud Run.
 * 5. NÃO fazer fallback para Google Cloud Shell.
 * 6. NÃO criar mocks ou simulações locais como substituição.
 */

import { supabase } from "@/integrations/supabase/client";
import { getActiveProjectSync, ensureActiveProject, isValidUuid } from "@/lib/project-service";
import { getCurrentWorkspaceId } from "@/lib/workspace";
import type { GriotAction, GriotExecutionResult } from "./protocol";

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
 * Obtém ou inicia um run ativo do GRIOT Sandbox para o projeto.
 */
export async function getOrStartSandboxRun(
  projectId: string,
  objective = "GRIOT Studio Execution",
): Promise<{ run: SandboxRunInfo | null; error: string | null }> {
  try {
    const { data: userAuth } = await supabase.auth.getUser();
    const workspaceId = userAuth?.user?.id ? await getCurrentWorkspaceId(userAuth.user.id) : null;
    const reqHeaders: Record<string, string> = { "content-type": "application/json" };
    if (workspaceId) {
      reqHeaders["x-griot-workspace-id"] = workspaceId;
    }

    // 1. Tenta obter o run ativo mais recente
    const { data: latestData, error: latestErr } = await supabase.functions.invoke(
      `griot-studio-compute/projects/${projectId}/runs/latest`,
      { method: "GET", headers: reqHeaders },
    );

    if (!latestErr && latestData?.run?.id && latestData.run.status === "ready") {
      return { run: latestData.run, error: null };
    }

    // 2. Se não houver run pronto, solicita inicialização do GRIOT Sandbox
    const { data: startData, error: startErr } = await supabase.functions.invoke(
      `griot-studio-compute/projects/${projectId}/runs`,
      {
        method: "POST",
        body: { objective, runtimeProvider: "griot_sandbox" },
        headers: reqHeaders,
      },
    );

    if (startErr) {
      return {
        run: null,
        error: `[GRIOT Sandbox]: Falha ao provisionar container de execução isolada: ${startErr.message}`,
      };
    }

    if (!startData?.run?.id) {
      return {
        run: null,
        error: `[GRIOT Sandbox]: O Execution Gateway não retornou uma identidade de execução válida.`,
      };
    }

    return { run: startData.run, error: null };
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return {
      run: null,
      error: `[GRIOT Sandbox]: Erro ao comunicar com o Studio Compute: ${msg}`,
    };
  }
}

/**
 * Executa um comando ou processo isolado diretamente no GRIOT Sandbox.
 */
export async function executeInGriotSandbox(
  action: GriotAction,
  targetProjectId?: string,
): Promise<GriotExecutionResult> {
  const start = Date.now();
  const cmd = String(
    action.params?.command ||
      action.params?.cmd ||
      action.params?.script ||
      action.params?.program ||
      (action.type.startsWith("git.") ? `git ${action.type.replace("git.", "")}` : "") ||
      (action.type === "test.run" ? `npm test -- ${action.params?.filter || ""}` : "") ||
      (action.type === "build.run" ? `npm run build` : "") ||
      "",
  ).trim();

  let projectId = targetProjectId || getActiveProjectSync()?.id || "";

  if (!projectId || !isValidUuid(projectId)) {
    try {
      const activeProj = await ensureActiveProject();
      projectId = activeProj.id;
    } catch {
      // Ignora erro e valida abaixo
    }
  }

  if (!projectId || !isValidUuid(projectId)) {
    return {
      actionId: action.id,
      actionType: action.type,
      status: "failed",
      exitCode: 1,
      stdout: "",
      stderr: `[GRIOT Sandbox]: Nenhum projeto ativo com UUID válido foi encontrado para execução isolada.`,
      durationMs: Date.now() - start,
      timestamp: new Date().toISOString(),
    };
  }

  // 1. Inicia / Reconcilia o GRIOT Sandbox
  const { run, error: runError } = await getOrStartSandboxRun(
    projectId,
    `Comando: ${cmd || action.type}`,
  );

  if (runError || !run) {
    // FALHA EXPLÍCITA — SEM FALLBACK PARA CLOUD SHELL OU CLOUD RUN
    return {
      actionId: action.id,
      actionType: action.type,
      status: "failed",
      exitCode: 1,
      stdout: "",
      stderr: runError || `[GRIOT Sandbox]: Runtime isolado indisponível no Execution Gateway.`,
      durationMs: Date.now() - start,
      timestamp: new Date().toISOString(),
    };
  }

  // 2. Executa o comando no container isolado
  try {
    const { data: userAuth } = await supabase.auth.getUser();
    const workspaceId = userAuth?.user?.id ? await getCurrentWorkspaceId(userAuth.user.id) : null;
    const reqHeaders: Record<string, string> = { "content-type": "application/json" };
    if (workspaceId) {
      reqHeaders["x-griot-workspace-id"] = workspaceId;
    }

    const { data: execData, error: execErr } = await supabase.functions.invoke(
      `griot-studio-compute/runs/${run.id}/execute?projectId=${encodeURIComponent(projectId)}`,
      {
        method: "POST",
        body: {
          command: cmd,
          program: "sh",
          args: ["-c", cmd],
        },
        headers: reqHeaders,
      },
    );

    if (execErr) {
      return {
        actionId: action.id,
        actionType: action.type,
        status: "failed",
        exitCode: 1,
        stdout: "",
        stderr: `[GRIOT Sandbox]: Erro na execução remota do processo: ${execErr.message}`,
        durationMs: Date.now() - start,
        timestamp: new Date().toISOString(),
      };
    }

    const state = execData?.state;
    if (state === "approval_required") {
      return {
        actionId: action.id,
        actionType: action.type,
        status: "failed",
        exitCode: 126,
        stdout: execData?.stdout || "",
        stderr: `[GRIOT Sandbox]: Esta operação no container requer aprovação de segurança da equipa/projeto.`,
        durationMs: Date.now() - start,
        timestamp: new Date().toISOString(),
      };
    }

    const isSuccess =
      execData?.exitCode === 0 || execData?.status === "success" || (!execData?.stderr && execData?.stdout);

    return {
      actionId: action.id,
      actionType: action.type,
      status: isSuccess ? "success" : "failed",
      exitCode: typeof execData?.exitCode === "number" ? execData.exitCode : (isSuccess ? 0 : 1),
      stdout:
        execData?.stdout ||
        (isSuccess ? `[GRIOT Sandbox] Comando concluído no container isolado.` : ""),
      stderr: execData?.stderr || "",
      durationMs: Date.now() - start,
      timestamp: new Date().toISOString(),
    };
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return {
      actionId: action.id,
      actionType: action.type,
      status: "failed",
      exitCode: 1,
      stdout: "",
      stderr: `[GRIOT Sandbox]: Falha de comunicação com o container remoto: ${msg}`,
      durationMs: Date.now() - start,
      timestamp: new Date().toISOString(),
    };
  }
}
