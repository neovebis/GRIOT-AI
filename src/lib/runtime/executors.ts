/**
 * GRIOT Action Executor.
 *
 * The Mobile client is deliberately not a fake shell: execution is delegated to
 * the authenticated GRIOT runtime endpoint. A missing runtime is reported as a
 * real failure instead of returning fabricated git/npm/test output.
 */

import { executeRemoteAction } from "./remote-executor";
import { executeLocalAction } from "./local-harness";
import { executeInGriotSandbox } from "./sandbox-executor";
import { getRuntimeMode, executeNativeCommand, isNativeAndroidPlatform } from "./native-terminal-bridge";
import type { GriotAction, GriotExecutionResult } from "./protocol";
import { getPrimaryWorkspaceId } from "@/lib/griot-api";
import { supabase } from "@/integrations/supabase/client";
import { executeUniversalConnector, normalizeConnectorId } from "@/lib/connectors-hub";
import {
  getConnectedPlugins,
  isPluginConnected,
  resolveActivePluginCredentials,
} from "@/lib/plugins-service";

export async function executeAction(action: GriotAction): Promise<GriotExecutionResult> {
  return defaultExecutor.execute(action);
}

export class GriotActionExecutor {
  async execute(action: GriotAction): Promise<GriotExecutionResult> {
    // 0. Conectores e Plugins externos (Matriz Universal dos 30 Conectores)
    if (action.category === "connector" || action.type === "connector.execute") {
      const startMs = Date.now();
      const connectorName = String(
        action.params.connector || action.params.plugin || action.params.name || "",
      )
        .toLowerCase()
        .trim();
      const normConnector = normalizeConnectorId(connectorName);
      const actionName = String(action.params.action || "default");
      const connectorParams = (action.params.params || action.params) as Record<string, unknown>;

      // Recupera credenciais ativas do plugin
      const resolvedCreds = resolveActivePluginCredentials(normConnector);

      const credential = String(
        action.params.credential ||
          action.params.token ||
          action.params.apiKey ||
          resolvedCreds.apiKey ||
          "",
      ).trim();

      const account = String(
        action.params.account ||
          action.params.accountName ||
          action.params.ref ||
          resolvedCreds.accountName ||
          resolvedCreds.projectRef ||
          "",
      ).trim();

      const customEndpoint = String(
        action.params.customEndpoint ||
          action.params.endpoint ||
          resolvedCreds.customEndpoint ||
          "",
      ).trim();

      const projectRef = String(
        action.params.ref ||
          action.params.projectRef ||
          action.params.project_id ||
          resolvedCreds.projectRef ||
          account ||
          "",
      ).trim();

      if (!isPluginConnected(normConnector) && !credential) {
        return {
          actionId: action.id,
          actionType: action.type,
          status: "failed",
          exitCode: 1,
          stdout: "",
          stderr: `⚠️ O conector "${connectorName.toUpperCase()}" não está configurado no GRIOT. Por favor, acede a Definições → Plugins e adiciona o teu token/chave para ${connectorName}.`,
          durationMs: Date.now() - startMs,
          timestamp: new Date().toISOString(),
        };
      }

      const res = await executeUniversalConnector(normConnector, {
        credential,
        account: account || projectRef || undefined,
        action: actionName,
        params: {
          ...connectorParams,
          ...(projectRef ? { ref: projectRef, projectRef, project_id: projectRef } : {}),
          ...(customEndpoint ? { customEndpoint } : {}),
        },
      });

      return {
        actionId: action.id,
        actionType: action.type,
        status: res.success ? "success" : "failed",
        exitCode: res.success ? 0 : 1,
        stdout: res.summary || (res.data ? JSON.stringify(res.data, null, 2) : "Ação concluída."),
        stderr: res.error || "",
        durationMs: Date.now() - startMs,
        timestamp: new Date().toISOString(),
      };
    }

    let workspaceId: string | null = null;
    try {
      const { data } = await supabase.auth.getUser();
      if (data.user?.id) workspaceId = await getPrimaryWorkspaceId(data.user.id);
    } catch {
      // Falhas de autenticação são tratadas localmente
    }

    const effectiveWsId = workspaceId || "local-default";

    // 1. Operações de sistema de ficheiros (fs.*), pesquisa (search.*), código (code.*) ou projetos (project.*) são geridas no workspace local
    if (
      action.category === "fs" ||
      action.category === "search" ||
      action.category === "project" ||
      action.category === "code" ||
      action.type.startsWith("code.") ||
      action.type.startsWith("project.") ||
      action.type.startsWith("opb.")
    ) {
      return executeLocalAction(action, effectiveWsId);
    }

    // 2. Ações explicitamente marcadas para Sandbox ou de execução em container isolado
    if (
      action.category === "sandbox" ||
      action.type.startsWith("sandbox.") ||
      action.params?.runtime === "sandbox"
    ) {
      return executeInGriotSandbox(action);
    }

    // 3. Comandos de Terminal / Shell / Git / Testes:
    // MODO SANDBOX: Conecta EXCLUSIVAMENTE ao GRIOT Sandbox real (runtimeProvider = "griot_sandbox")
    // Se o Sandbox falhar, a falha é reportada explicitamente sem fallback mascarado.
    if (getRuntimeMode() === "sandbox") {
      return executeInGriotSandbox(action);
    }

    // MODO NATIVO (Terminal / Emulator): Preserva o caminho original intacto
    if (getRuntimeMode() === "native") {
      const cmd = String(
        action.params.command ||
          action.params.cmd ||
          action.params.script ||
          (action.type.startsWith("git.") ? `git ${action.type.replace("git.", "")}` : "") ||
          "",
      );
      if (cmd) {
        const nativeRes = await executeNativeCommand(cmd, { cwd: String(action.params.cwd || "") });

        // Se o binário não existir no rootfs local (exit code 127) ou em ambiente web/preview,
        // tenta resolver através do GRIOT Sandbox isolado no Execution Gateway
        if (nativeRes.exitCode === 127 || !isNativeAndroidPlatform()) {
          const sandboxRes = await executeInGriotSandbox(action);
          if (sandboxRes.status === "success" || sandboxRes.exitCode === 0) {
            return sandboxRes;
          }
        }

        return {
          actionId: action.id,
          actionType: action.type,
          status: nativeRes.status,
          exitCode: nativeRes.exitCode,
          stdout: nativeRes.stdout,
          stderr: nativeRes.stderr,
          durationMs: nativeRes.durationMs,
          timestamp: new Date().toISOString(),
        };
      }
    }

    return executeLocalAction(action, effectiveWsId);
  }

  formatFeedbackForAI(result: GriotExecutionResult): string {
    return [
      "[GRIOT Action Execution Result]",
      `Action: ${result.actionType}`,
      `Status: ${result.status.toUpperCase()} (Exit Code: ${result.exitCode})`,
      `Duration: ${result.durationMs}ms`,
      result.stdout ? `--- STDOUT ---\n${result.stdout}` : "",
      result.stderr ? `--- STDERR ---\n${result.stderr}` : "",
      "[End of Execution Result]",
    ]
      .filter(Boolean)
      .join("\n");
  }
}

export const defaultExecutor = new GriotActionExecutor();
