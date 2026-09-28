/**
 * GRIOT Observer Bridge & Loop Coordinator
 * Connects external AI events (ChatGPT, Claude, Gemini, etc.) to the GRIOT Runtime ReAct loop.
 */

import {
  ObserverEvent,
  ObserverSource,
  ObserverState,
  GriotAction,
  GriotExecutionResult,
} from "./protocol";
import { parseGriotActions } from "./parser";
import { PolicyGuard } from "./policy";
import { defaultExecutor } from "./executors";
import { AI_OBSERVER_APPS, getObserverSourceForApp } from "./apps";
import { loadPrefs, AI_CHAT_APPS } from "@/lib/settings";
import { supabase } from "@/integrations/supabase/client";
import { getPrimaryWorkspaceId } from "@/lib/griot-api";

async function notify(options: any) {
  try {
    const mod = await import("@/lib/native-notifications");
    if (mod?.sendGriotNotification) {
      await mod.sendGriotNotification(options);
    }
  } catch {}
}

type EventListener = (event: ObserverEvent) => void;
type ActionEventListener = (action: GriotAction, result?: GriotExecutionResult) => void;

export class GriotObserverEngine {
  private state: ObserverState = {
    active: true,
    connectedApps: [],
    pendingActions: [],
    executionHistory: [],
  };

  private policyGuard = new PolicyGuard();
  private eventListeners: Set<EventListener> = new Set();
  private actionListeners: Set<ActionEventListener> = new Set();

  constructor() {
    this.refreshConnectedApps();
    if (typeof window !== "undefined") {
      window.addEventListener("storage", () => this.refreshConnectedApps());
      window.addEventListener("griot:prefs-changed", () => this.refreshConnectedApps());
    }
  }

  /** Atualiza o estado das 8 apps com base nas preferências do utilizador */
  refreshConnectedApps(): ObserverSource[] {
    const prefs = loadPrefs();
    const apps: ObserverSource[] = AI_CHAT_APPS.map((app) => {
      const isConnected =
        prefs[`acp:${app.id}`] === true ||
        prefs[`chat:${app.id}`] === true ||
        prefs[`app:${app.id}`] === true ||
        prefs[app.id] === true;

      const appConfig = AI_OBSERVER_APPS[app.id];
      return {
        provider: (app.id as any) || "custom",
        appId: app.id,
        appPackage: appConfig?.androidPackage || `com.ai.${app.id}`,
        sessionTitle: app.label,
        vendor: app.vendor,
        model: appConfig?.defaultModel,
        connected: isConnected,
      };
    });

    this.state.connectedApps = apps;
    return apps;
  }

  getState(): ObserverState {
    return {
      ...this.state,
      connectedApps: this.refreshConnectedApps(),
    };
  }

  /** Permite ligar ou desligar uma app de IA diretamente */
  setAppConnected(appId: string, connected: boolean) {
    const prefs = loadPrefs();
    prefs[`acp:${appId}`] = connected;
    prefs[`chat:${appId}`] = connected;
    if (typeof window !== "undefined") {
      window.localStorage.setItem("griot_user_prefs", JSON.stringify(prefs));
      window.dispatchEvent(new CustomEvent("griot:prefs-changed", { detail: prefs }));
      window.dispatchEvent(new Event("storage"));
    }
    this.refreshConnectedApps();
    this.notifyEvent({
      id: "evt_" + Math.random().toString(36).substring(2, 9),
      type: connected ? "observer.connected" : "observer.disconnected",
      source: getObserverSourceForApp(appId),
      sessionId: "global",
      timestamp: new Date().toISOString(),
      metadata: { appId, connected },
    });
  }

  /** Dispara uma simulação ou emissão de evento de uma das 8 apps */
  async simulateAppMessage(appId: string, content: string, sessionId: string = "chat_session") {
    const source = getObserverSourceForApp(appId);
    return this.processIncomingAIMessage(source, content, sessionId);
  }

  subscribeEvents(listener: EventListener): () => void {
    this.eventListeners.add(listener);
    return () => this.eventListeners.delete(listener);
  }

  subscribeActions(listener: ActionEventListener): () => void {
    this.actionListeners.add(listener);
    return () => this.actionListeners.delete(listener);
  }

  private notifyEvent(event: ObserverEvent) {
    this.state.lastEvent = event;
    this.eventListeners.forEach((l) => l(event));
  }

  private notifyAction(action: GriotAction, result?: GriotExecutionResult) {
    this.actionListeners.forEach((l) => l(action, result));
  }

  /**
   * Called whenever an AI message or streaming chunk arrives from any source.
   */
  async processIncomingAIMessage(
    source: ObserverSource,
    content: string,
    sessionId: string = "default_session",
  ): Promise<{
    actionsDetected: GriotAction[];
    executionResults: GriotExecutionResult[];
    feedbackPrompt: string;
  }> {
    const eventId = "evt_" + Math.random().toString(36).substring(2, 9);
    const event: ObserverEvent = {
      id: eventId,
      type: "ai.response.completed",
      source,
      sessionId,
      content,
      timestamp: new Date().toISOString(),
    };

    this.notifyEvent(event);

    // 1. Parse actions from text
    const actions = parseGriotActions(content);
    const executionResults: GriotExecutionResult[] = [];

    for (const action of actions) {
      const evaluation = this.policyGuard.evaluate(action);
      action.requiresApproval = evaluation.requiresUserApproval;

      if (!evaluation.allowed) {
        action.status = "rejected";
        const rejectedResult: GriotExecutionResult = {
          actionId: action.id,
          actionType: action.type,
          status: "rejected",
          exitCode: 126,
          stdout: "",
          stderr: evaluation.reason || "Ação bloqueada pelas políticas de segurança do GRIOT.",
          durationMs: 0,
          timestamp: new Date().toISOString(),
        };
        executionResults.push(rejectedResult);
        this.notifyAction(action, rejectedResult);
        continue;
      }

      if (action.requiresApproval) {
        action.status = "pending";
        this.state.pendingActions.push(action);
        this.notifyAction(action);

        // Notificação nativa com logo do GRIOT e botões Aprovar / Rejeitar
        const payloadStr = JSON.stringify(action.params);
        void notify({
          type: "approval",
          title: `Aprovação Requerida (${action.type})`,
          message: payloadStr.slice(0, 160),
          actionId: action.id,
        });

        // Sensitive action waiting for user consent in UI
        continue;
      }

      // Safe action -> auto execute
      action.status = "executing";
      this.notifyAction(action);
      const result = await defaultExecutor.execute(action);
      action.status = result.status === "success" ? "success" : "failed";
      executionResults.push(result);
      this.state.executionHistory.unshift(result);
      this.notifyAction(action, result);

      // Notificação nativa se for deploy ou comando executado
      if (result.status === "success") {
        if (
          action.type === "deploy" ||
          (action.type === "shell.exec" && JSON.stringify(action.params).includes("deploy"))
        ) {
          const deployUrl = result.stdout.match(/https?:\/\/[^\s]+/)?.[0] || "https://griot.ai";
          void notify({
            type: "deploy",
            title: "Site Deployado com Sucesso! 🚀",
            message: `O teu projeto está ativo no ar.`,
            url: deployUrl,
          });
        } else if (action.type === "shell.exec" || action.type === "fs.write_file") {
          void notify({
            type: "task",
            title: `Tarefa Concluída (${action.type})`,
            message: result.stdout?.slice(0, 120) || "Comando executado com sucesso.",
          });
        }
      }

      // Async record to Supabase opb events
      this.recordToDatabase(action, result, sessionId);
    }

    // Generate formatted feedback loop text to return to the AI
    const feedbackPrompt = executionResults
      .map((res) => defaultExecutor.formatFeedbackForAI(res))
      .join("\n");

    return {
      actionsDetected: actions,
      executionResults,
      feedbackPrompt,
    };
  }

  /**
   * Approves and runs a pending action (e.g. from user tapping "Confirm" in the UI).
   */
  async approveAndExecute(actionId: string): Promise<GriotExecutionResult | null> {
    const actionIndex = this.state.pendingActions.findIndex((a) => a.id === actionId);
    if (actionIndex === -1) return null;

    const [action] = this.state.pendingActions.splice(actionIndex, 1);
    action.status = "executing";
    action.approved = true;
    this.notifyAction(action);

    const result = await defaultExecutor.execute(action);
    action.status = result.status === "success" ? "success" : "failed";
    this.state.executionHistory.unshift(result);
    this.notifyAction(action, result);

    if (result.status === "success") {
      if (
        action.type === "deploy" ||
        (action.type === "shell.exec" && JSON.stringify(action.params).includes("deploy"))
      ) {
        const deployUrl = result.stdout.match(/https?:\/\/[^\s]+/)?.[0] || "https://griot.ai";
        void notify({
          type: "deploy",
          title: "Site Deployado com Sucesso! 🚀",
          message: `O teu projeto está ativo no ar.`,
          url: deployUrl,
        });
      } else {
        void notify({
          type: "task",
          title: `Ação Concluída (${action.type})`,
          message: result.stdout?.slice(0, 120) || "Execução aprovada finalizada com êxito.",
        });
      }
    }

    this.recordToDatabase(action, result);
    return result;
  }

  async rejectAction(actionId: string, reason = "Cancelado pelo utilizador."): Promise<void> {
    const actionIndex = this.state.pendingActions.findIndex((a) => a.id === actionId);
    if (actionIndex === -1) return;

    const [action] = this.state.pendingActions.splice(actionIndex, 1);
    action.status = "rejected";
    const result: GriotExecutionResult = {
      actionId: action.id,
      actionType: action.type,
      status: "rejected",
      exitCode: 1,
      stdout: "",
      stderr: reason,
      durationMs: 0,
      timestamp: new Date().toISOString(),
    };
    this.state.executionHistory.unshift(result);
    this.notifyAction(action, result);
  }

  private async recordToDatabase(
    action: GriotAction,
    result: GriotExecutionResult,
    sessionId?: string,
  ) {
    try {
      // Real backend: griot_opb_events (workspace-scoped, NOT NULL). The
      // table used to be called "opb_events" here, which doesn't exist —
      // every Observer action silently failed to reach the Project Brain.
      const { data: userData } = await supabase.auth.getUser();
      const userId = userData?.user?.id;
      if (!userId) return;
      const workspaceId = await getPrimaryWorkspaceId(userId);
      if (!workspaceId) return;

      await (supabase as any).from("griot_opb_events").insert({
        workspace_id: workspaceId,
        actor_id: userId,
        event_type: `runtime.${action.type}`,
        payload: {
          action,
          result,
          sessionId,
        },
      });
    } catch {
      // Graceful offline/local mode
    }
  }
}

export const observerEngine = new GriotObserverEngine();
