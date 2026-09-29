/**
 * GRIOT Chat Execution Manager
 *
 * Singleton service that manages AI message generations in the background.
 * Decouples model execution from React component lifecycle:
 * - Switching conversations or views DOES NOT abort active generations.
 * - Progress (streaming text, reasoning, steps) and final messages are continuously
 *   persisted to localStorage ('griot_messages_${conversationId}') and Supabase.
 * - When users navigate back to the conversation, the UI seamlessly re-attaches.
 * - Only explicit user stops ('stopExecution') abort the active generation.
 */

import { supabase } from "@/integrations/supabase/client";
import { getPrimaryWorkspaceId } from "@/lib/griot-api";
import { GRIOT_OPB_SYSTEM_PROMPT } from "@/lib/opb-memory";
import { notifyIfBackgrounded } from "@/lib/native-notifications";
import { getUserSavedApis } from "@/lib/user-apis";
import { executeReActLoop } from "@/lib/runtime/react-loop";
import { streamDirectAI } from "@/lib/ai-client-mobile-entry";
import { modelLabel, isModelOS, isSheolModel } from "@/lib/griot";
import { observerEngine } from "@/lib/runtime";
import { parseProposals } from "@/lib/capsule-proposals";
import { stripActionBlocks } from "@/lib/runtime/parser";
import type { GriotProject } from "@/lib/project-service";
import { buildConnectedPluginsSystemPrompt, PLUGINS_LIST } from "@/lib/plugins-service";
import { GRIOT_CHART_SYSTEM_PROMPT } from "@/lib/chart-system-prompt";
import {
  fetchUserGcuWallet,
  checkGcuAllowance,
  consumeGcu,
  canUseSheol,
  markSheolTrialUsed,
} from "@/lib/gcu-service";

export interface ExecutionStepItem {
  id: string;
  type: "thinking" | "reading" | "searching" | "editing" | "writing" | "plugin";
  label: string;
  detail?: string;
  pluginId?: string;
  status: "running" | "done" | "error";
  timestamp: number;
}

export interface MessageReaction {
  emoji: string;
  by?: string;
  modelId?: string;
  roleId?: string;
  isUser?: boolean;
}

export interface ChatMessageRow {
  id: string;
  role: string;
  content: string;
  created_at: string;
  feedback?: string | null;
  model?: string;
  reasoning?: string;
  steps?: number;
  stepsList?: ExecutionStepItem[];
  reactions?: MessageReaction[];
  metadata?: Record<string, unknown>;
}

export type ExecutionPhase =
  "idle" | "reading" | "searching" | "editing" | "writing" | "thinking" | "plugin";

export interface PluginApprovalRequest {
  id: string;
  action: any;
  pluginId: string;
  pluginName: string;
  operation: string;
  details?: string;
}

export interface ExecutionState {
  conversationId: string;
  scope: "main" | "quick";
  busy: boolean;
  streaming: string;
  reasoning: string;
  steps: number;
  currentPhase?: ExecutionPhase;
  currentActionDetail?: string;
  currentPluginId?: string;
  stepsList?: ExecutionStepItem[];
  approvalRequest?: PluginApprovalRequest | null;
  error?: string | null;
}

export interface StartExecutionParams {
  conversationId: string;
  scope: "main" | "quick";
  userId: string;
  modelId: string;
  messages: Array<{ role: "user" | "assistant" | "system"; content: string }>;
  userPrompt: string;
  effort?: "low" | "medium" | "high";
  systemInstruction?: string;
  context?: string;
  currentProject?: GriotProject | null;
}

type ExecutionListener = (state: ExecutionState) => void;

interface ActiveExecution {
  controller: AbortController;
  state: ExecutionState;
  listeners: Set<ExecutionListener>;
  startedAt: number;
}

class ChatExecutionManager {
  private activeExecutions = new Map<string, ActiveExecution>();
  private listeners = new Map<string, Set<ExecutionListener>>();
  private pendingApprovals = new Map<
    string,
    {
      resolve: (approved: boolean) => void;
      request: PluginApprovalRequest;
    }
  >();

  /** Responde ao pedido de autorização do plugin pendente */
  public respondToApproval(conversationId: string, approved: boolean): void {
    const pending = this.pendingApprovals.get(conversationId);
    if (pending) {
      this.pendingApprovals.delete(conversationId);
      const active = this.activeExecutions.get(conversationId);
      if (active) {
        active.state.approvalRequest = null;
        this.notify(conversationId, { ...active.state });
      }
      pending.resolve(approved);
    }
  }

  /** Retorna o estado atual da execução de uma conversa se estiver a decorrer */
  public getExecutionState(conversationId: string): ExecutionState | null {
    const active = this.activeExecutions.get(conversationId);
    return active ? { ...active.state } : null;
  }

  /** Verifica se uma conversa específica tem geração ativa */
  public isExecuting(conversationId: string): boolean {
    return this.activeExecutions.has(conversationId);
  }

  /** Subscreve a atualizações de uma conversa específica de forma persistente */
  public subscribe(conversationId: string, listener: ExecutionListener): () => void {
    if (!this.listeners.has(conversationId)) {
      this.listeners.set(conversationId, new Set());
    }
    const set = this.listeners.get(conversationId)!;
    set.add(listener);

    // Emite o estado atual imediatamente (seja ativo ou ocioso)
    const active = this.activeExecutions.get(conversationId);
    if (active) {
      listener({ ...active.state });
    } else {
      listener({
        conversationId,
        scope: "main",
        busy: false,
        streaming: "",
        reasoning: "",
        steps: 0,
      });
    }

    return () => {
      set.delete(listener);
      if (set.size === 0) {
        this.listeners.delete(conversationId);
      }
    };
  }

  /** Cancela explicitamente uma geração ativa para uma conversa */
  public stopExecution(conversationId: string): void {
    const active = this.activeExecutions.get(conversationId);
    if (!active) return;

    try {
      active.controller.abort();
    } catch {}

    // Se já havia texto gerado, guarda o fragmento até ao momento
    if (active.state.streaming.trim()) {
      void this.finalizeAssistantMessage(
        conversationId,
        active.state.streaming.trim(),
        "anonymous",
        "custom",
      );
    }

    this.activeExecutions.delete(conversationId);
    this.notify(conversationId, {
      ...active.state,
      busy: false,
      streaming: "",
      reasoning: "",
      steps: 0,
    });
  }

  /** Inicia a geração de mensagem em background */
  public async startExecution(params: StartExecutionParams): Promise<void> {
    console.log("[GRIOT_DEBUG] startExecution: entrou", { conversationId: params.conversationId });
    const {
      conversationId,
      scope,
      userId,
      modelId,
      messages: baseMessages,
      userPrompt,
      effort = "medium",
      systemInstruction = "És o GRIOT, o assistente de engenharia de software e inteligência artificial de elite.",
      context,
      currentProject,
    } = params;

    // Se já houver execução ativa para esta conversa, aborta-a de imediato para dar prioridade à nova ação
    const existing = this.activeExecutions.get(conversationId);
    if (existing) {
      try {
        existing.controller.abort(new Error("Substituída por nova execução"));
      } catch {}
      this.activeExecutions.delete(conversationId);
    }

    const isFastMode = effort === "low" || scope === "quick";
    // Limite de segurança de 1 hora (3600000 ms) para análises completas, ou 10 minutos em modo rápido
    const executionTimeoutMs = isFastMode ? 600000 : 3600000;
    const controller = new AbortController();
    const hardTimeoutTimer = setTimeout(() => {
      if (!controller.signal.aborted) {
        console.warn(
          `[ChatExecutionManager] Watchdog de execução atingiu ${executionTimeoutMs / 1000}s. Abortando execução travada...`,
        );
        try {
          controller.abort(
            new Error(
              `Tempo limite de execução atingido (${Math.round(executionTimeoutMs / 60000)} minutos).`,
            ),
          );
        } catch {}
      }
    }, executionTimeoutMs);

    const hasAttachment =
      userPrompt.includes("[Arquivo ZIP Descompactado:") ||
      userPrompt.includes("[Ficheiro Anexado:") ||
      userPrompt.includes("<!--GRIOT_ATTACHMENT_META:");

    let attachmentName = "";
    const nameMatch = userPrompt.match(/\[Ficheiro Anexado:\s*([^\]\n]+)\]/);
    if (nameMatch) {
      attachmentName = nameMatch[1].trim();
    } else {
      const zipMatch = userPrompt.match(/\[Arquivo ZIP Descompactado:\s*([^\]\n]+)\]/);
      if (zipMatch) attachmentName = zipMatch[1].trim();
    }

    const stepsList: ExecutionStepItem[] = [];

    if (hasAttachment) {
      stepsList.push({
        id: "step-attach",
        type: "reading",
        label: attachmentName ? `A ler ficheiro ${attachmentName}` : "A ler ficheiros e anexos",
        detail: "Análise de conteúdo",
        status: "done",
        timestamp: Date.now(),
      });
    }

    stepsList.push({
      id: "step-think-init",
      type: "thinking",
      label: "A pensar na resposta",
      detail: "Interpretação e plano de ação",
      status: "running",
      timestamp: Date.now(),
    });

    const initialPhase: ExecutionPhase = hasAttachment ? "reading" : "thinking";
    const initialDetail = hasAttachment
      ? attachmentName
        ? `A ler ficheiro ${attachmentName}...`
        : "A ler ficheiros anexados..."
      : "A pensar...";

    const active: ActiveExecution = {
      controller,
      state: {
        conversationId,
        scope,
        busy: true,
        streaming: "",
        reasoning: "",
        steps: stepsList.length,
        currentPhase: initialPhase,
        currentActionDetail: initialDetail,
        stepsList: [...stepsList],
      },
      listeners: new Set(),
      startedAt: Date.now(),
    };

    this.activeExecutions.set(conversationId, active);
    this.notify(conversationId, { ...active.state });

    // Restrição de uso exclusivo para o modelo SHEOL (o chat normal não tem bloqueio de GCU)
    if (isSheolModel(modelId)) {
      const wallet = await fetchUserGcuWallet(userId);
      const sheolBlocked = !canUseSheol(userId, wallet.tier);

      if (sheolBlocked) {
        const errorMsg = `⚠️ **SHEOL disponível só 1 vez no plano Free**\n\nJá usaste a tua experiência do SHEOL. Continua com o **BASE** ou assina o plano **BASE (7€)** ou superior para usar o SHEOL sempre.\n\nAbre **Planos & Faturação** para subir de plano.`;
        const finalAssistantMsg: any = {
          id: `asst-sheol-${Date.now()}`,
          role: "assistant",
          content: errorMsg,
          created_at: new Date().toISOString(),
          feedback: null,
        };
        this.appendMessageLocally(conversationId, finalAssistantMsg);
        active.state.streaming = "";
        active.state.reasoning = "";
        active.state.stepsList = [];
        active.state.busy = false;
        active.state.currentPhase = "idle";
        this.notify(conversationId, { ...active.state });
        this.activeExecutions.delete(conversationId);
        clearTimeout(hardTimeoutTimer);
        return;
      }
      markSheolTrialUsed(userId);
    }

    // 1. Registar a mensagem do utilizador localmente apenas se ainda não existir
    if (userPrompt && userPrompt.trim()) {
      const userMsgId = `user-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
      const userMsg: ChatMessageRow = {
        id: userMsgId,
        role: "user",
        content: userPrompt,
        created_at: new Date().toISOString(),
        feedback: null,
      };
      this.appendMessageLocally(conversationId, userMsg);

      // Salva a mensagem do utilizador no Supabase em segundo plano
      void (async () => {
        try {
          const workspaceId = await getPrimaryWorkspaceId(userId);
          await (supabase as any).from("griot_messages").insert({
            id: userMsgId,
            workspace_id: workspaceId || "c92b4b86-2ff1-4259-bc16-3ab66751d8b1",
            conversation_id: conversationId,
            actor_kind: "human",
            content: userPrompt,
            status: "succeeded",
          });
        } catch {}
      })();
    }

    let answer = "";
    let fullReasoning = "";
    let effectiveModelId =
      modelId && modelId !== "Selecionar API" ? modelId : getUserSavedApis()[0]?.id || "gemini";
    let effectiveSystemInstruction = systemInstruction;

    try {
      const pluginsPrompt = buildConnectedPluginsSystemPrompt();
      if (pluginsPrompt) {
        effectiveSystemInstruction = `${effectiveSystemInstruction}\n\n${pluginsPrompt}`;
      }
    } catch (pluginPromptErr) {
      console.warn("[GRIOT] Erro ao injetar prompt de plugins conectados:", pluginPromptErr);
    }

    if (!effectiveSystemInstruction?.includes("[FERRAMENTA NATIVA DE GRÁFICOS")) {
      effectiveSystemInstruction = `${effectiveSystemInstruction || ""}\n\n${GRIOT_CHART_SYSTEM_PROMPT}`;
    }

    if (!effectiveSystemInstruction?.includes("[MEMÓRIA OPB")) {
      effectiveSystemInstruction = `${effectiveSystemInstruction || ""}\n\n${GRIOT_OPB_SYSTEM_PROMPT}`;
    }

    // Prepara mensagens garantindo que o prompt do utilizador está presente sem duplicar
    const effectiveMessages: Array<{ role: "user" | "assistant" | "system"; content: string }> =
      baseMessages.map((m) => ({
        role: m.role as "user" | "assistant" | "system",
        content: m.content,
      }));
    const lastMsg = effectiveMessages[effectiveMessages.length - 1];
    if (!lastMsg || lastMsg.role !== "user" || lastMsg.content.trim() !== userPrompt.trim()) {
      if (userPrompt && userPrompt.trim()) {
        effectiveMessages.push({ role: "user", content: userPrompt.trim() });
      }
    }

    console.log("[GRIOT_DEBUG] startExecution: antes do try, isFastMode=", isFastMode);
    try {
      const mLabel = isModelOS(modelId) ? "ModelOS" : modelLabel(modelId);

      console.log("[GRIOT_DEBUG] chamando streamDirectAI ou executeReActLoop", { isFastMode });

      // Em modo rápido, o cliente móvel marca explicitamente o Fast Path do Orchestrator.
      if (isFastMode) {
        const directRes = await streamDirectAI({
          modelId: effectiveModelId,
          messages: effectiveMessages,
          systemInstruction: `[GRIOT_FAST_PATH]\n${effectiveSystemInstruction}`,
          callbacks: {
            onToken: (tok) => {
              if (controller.signal.aborted) return;
              answer += tok;
              active.state.streaming = answer;
              active.state.currentPhase = "writing";
              active.state.currentActionDetail = "A compor resposta...";

              for (const s of stepsList) {
                if (s.status === "running") s.status = "done";
              }
              if (!stepsList.some((s) => s.type === "writing")) {
                stepsList.push({
                  id: "step-writing",
                  type: "writing",
                  label: "A escrever resposta",
                  detail: "Geração de texto",
                  status: "running",
                  timestamp: Date.now(),
                });
              }
              active.state.stepsList = [...stepsList];
              active.state.steps = stepsList.length;
              this.notify(conversationId, { ...active.state });
            },
            onReasoning: (r) => {
              if (controller.signal.aborted) return;
              fullReasoning += r;
              active.state.reasoning = fullReasoning;
              active.state.currentPhase = "thinking";
              active.state.currentActionDetail = "A pensar...";
              this.notify(conversationId, { ...active.state });
            },
          },
          signal: controller.signal,
        });

        console.log("[GRIOT_DEBUG] streamDirectAI/executeReActLoop retornou", {
          textoRecebido: directRes.text?.length || answer?.length || 0,
        });

        if (directRes.text && !answer.trim()) {
          answer = directRes.text;
          active.state.streaming = answer;
          this.notify(conversationId, { ...active.state });
        }
      } else {
        // Modo equilibrado (até 8 iterações autônomas) / profundo (até 16 iterações com reflexão extensiva)
        const maxIter = effort === "high" ? 16 : 8;
        const loopResult = await executeReActLoop({
          modelId: effectiveModelId,
          messages: effectiveMessages,
          systemInstruction: effectiveSystemInstruction,
          context,
          maxIterations: maxIter,
          callbacks: {
            onToken: (tok) => {
              if (controller.signal.aborted) return;
              answer += tok;
              active.state.streaming = answer;
              active.state.currentPhase = "writing";
              active.state.currentActionDetail = "A compor resposta...";

              for (const s of stepsList) {
                if (s.status === "running") s.status = "done";
              }
              if (!stepsList.some((s) => s.type === "writing")) {
                stepsList.push({
                  id: "step-writing",
                  type: "writing",
                  label: "A escrever resposta",
                  detail: "Geração de texto",
                  status: "running",
                  timestamp: Date.now(),
                });
              }
              active.state.stepsList = [...stepsList];
              active.state.steps = stepsList.length;
              this.notify(conversationId, { ...active.state });
            },
            onReasoning: (r) => {
              if (controller.signal.aborted) return;
              fullReasoning += r;
              active.state.reasoning = fullReasoning;
              active.state.currentPhase = "thinking";
              active.state.currentActionDetail = "A ponderar alternativas...";
              this.notify(conversationId, { ...active.state });
            },
            onCommentary: (comment) => {
              if (controller.signal.aborted || !comment.trim()) return;
              const clean = comment.replace(/^\[.*?\]\s*/, "").trim();
              const firstSentence = clean.split(/\r?\n|[.!?]\s/)[0]?.trim() || clean.slice(0, 95);
              if (firstSentence && firstSentence.length > 3) {
                const display = firstSentence.length > 90 ? `${firstSentence.slice(0, 87)}…` : firstSentence;
                active.state.currentActionDetail = display;
                active.state.currentPhase = "thinking";
                const last = stepsList[stepsList.length - 1];
                if (!last || last.label !== display) {
                  stepsList.push({
                    id: `step-comment-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
                    type: "thinking",
                    label: display,
                    detail: "Raciocínio intermédio da IA",
                    status: "running",
                    timestamp: Date.now(),
                  });
                  active.state.stepsList = [...stepsList];
                  active.state.steps = stepsList.length;
                }
                this.notify(conversationId, { ...active.state });
              }
            },
            onStepChange: (st) => {
              if (controller.signal.aborted) return;
              active.state.steps = Math.max(st, stepsList.length);
              this.notify(conversationId, { ...active.state });
            },
            onActionStart: (action) => {
              if (controller.signal.aborted) return;
              for (const s of stepsList) {
                if (s.status === "running") s.status = "done";
              }

              let stepType: ExecutionStepItem["type"] = "thinking";
              let label = "A executar ação...";
              let detail: string | undefined;
              let pluginId: string | undefined;

              if (action.type === "connector.execute" || action.category === "connector") {
                const connId = (action.params as any)?.connector || action.type.split(".")[0];
                const connAction = (action.params as any)?.action || action.type;
                const def = PLUGINS_LIST.find((p) => p.id === connId);
                const pName = def?.name || connId;
                stepType = "plugin";
                pluginId = connId;
                label = `A consultar plugin ${pName}`;
                detail = connAction;
                active.state.currentPhase = "plugin";
                active.state.currentPluginId = connId;
                active.state.currentActionDetail = `A consultar ${pName}...`;
              } else if (action.type.startsWith("fs.read") || action.type.startsWith("fs_read")) {
                const path = (action.params as any)?.path || "ficheiro";
                stepType = "reading";
                label = `A ler ficheiro ${path}`;
                detail = "Leitura cirúrgica no projeto";
                active.state.currentPhase = "reading";
                active.state.currentActionDetail = `A ler ${path}...`;
              } else if (action.type.startsWith("search") || action.type.startsWith("code_search") || action.type.startsWith("find_files")) {
                const q = (action.params as any)?.query || (action.params as any)?.pattern || "código";
                stepType = "searching";
                label = `A pesquisar "${q}"`;
                detail = "Busca profunda no repositório";
                active.state.currentPhase = "searching";
                active.state.currentActionDetail = `A pesquisar "${q}"...`;
              } else if (action.type.startsWith("fs.patch") || action.type.startsWith("fs_patch")) {
                const path = (action.params as any)?.path || "código";
                stepType = "editing";
                label = `A aplicar patch em ${path}`;
                detail = "Substituição cirúrgica";
                active.state.currentPhase = "editing";
                active.state.currentActionDetail = `A editar ${path}...`;
              } else if (action.type.startsWith("fs.write") || action.type.startsWith("fs_write")) {
                const path = (action.params as any)?.path || "ficheiro";
                stepType = "editing";
                label = `A criar/gravar ${path}`;
                detail = "Criação de ficheiro no workspace";
                active.state.currentPhase = "editing";
                active.state.currentActionDetail = `A gravar ${path}...`;
              } else if (action.type.startsWith("terminal") || action.type.startsWith("shell")) {
                const cmd = (action.params as any)?.command || (action.params as any)?.cmd || "";
                stepType = "editing";
                label = cmd ? `A executar ${cmd}` : "A executar comando de terminal";
                detail = "Comando de terminal";
                active.state.currentPhase = "editing";
                active.state.currentActionDetail = cmd
                  ? `A executar ${cmd}...`
                  : "A executar comando...";
              } else if (action.type.startsWith("project")) {
                stepType = "reading";
                label = "A consultar projetos";
                detail = "Inventário de projetos";
                active.state.currentPhase = "reading";
                active.state.currentActionDetail = "A listar projetos...";
              } else if (action.type.startsWith("git")) {
                stepType = "editing";
                label = `Git: ${action.type}`;
                detail = "Operação Git";
                active.state.currentPhase = "editing";
                active.state.currentActionDetail = `A executar ${action.type}...`;
              } else if (action.type.startsWith("test")) {
                stepType = "editing";
                label = "A executar testes";
                detail = "Verificação de testes";
                active.state.currentPhase = "editing";
                active.state.currentActionDetail = "A executar testes...";
              } else {
                label = "A ponderar alternativas...";
                active.state.currentPhase = "thinking";
                active.state.currentActionDetail = "A pensar...";
              }

              stepsList.push({
                id: `step-action-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
                type: stepType,
                label,
                detail,
                pluginId,
                status: "running",
                timestamp: Date.now(),
              });

              active.state.stepsList = [...stepsList];
              active.state.steps = stepsList.length;
              this.notify(conversationId, { ...active.state });
            },
            onActionApprovalRequired: async (action) => {
              if (controller.signal.aborted) return false;

              const pluginId = (action.params as any)?.connector || action.type.split(".")[0];
              const op = (action.params as any)?.action || action.type;
              const def = PLUGINS_LIST.find((p) => p.id === pluginId);
              const pName =
                def?.name ||
                (pluginId
                  ? pluginId.charAt(0).toUpperCase() + pluginId.slice(1)
                  : "Plugin Externo");

              const req: PluginApprovalRequest = {
                id: `req-${Date.now()}`,
                action,
                pluginId,
                pluginName: pName,
                operation: op,
                details: JSON.stringify(action.params || {}),
              };

              active.state.approvalRequest = req;
              this.notify(conversationId, { ...active.state });

              return new Promise<boolean>((resolve) => {
                this.pendingApprovals.set(conversationId, {
                  resolve,
                  request: req,
                });
              });
            },
            onActionCompleted: (_action, result) => {
              if (controller.signal.aborted) return;
              const last = stepsList[stepsList.length - 1];
              if (last && last.status === "running") {
                last.status =
                  result.status === "failed" || result.exitCode !== 0 ? "error" : "done";
                const output = (result.status === "failed" ? result.stderr : result.stdout).trim();
                if (output) {
                  const firstLine = output.split(/\r?\n/, 1)[0] || "";
                  last.detail = firstLine.length > 140 ? `${firstLine.slice(0, 137)}…` : firstLine;
                } else if (result.durationMs >= 0) {
                  last.detail =
                    result.status === "failed"
                      ? "A ação terminou com erro"
                      : `Concluído em ${Math.max(1, Math.round(result.durationMs))} ms`;
                }
              }
              active.state.stepsList = [...stepsList];
              this.notify(conversationId, { ...active.state });
            },
          },
          signal: controller.signal,
        });

        console.log("[GRIOT_DEBUG] streamDirectAI/executeReActLoop retornou", {
          textoRecebido: loopResult.finalAnswer?.length || answer?.length || 0,
        });

        if (loopResult.finalAnswer) {
          answer = loopResult.finalAnswer;
          active.state.streaming = answer;
          this.notify(conversationId, { ...active.state });
        }
      }

      // Se por qualquer anomalia de rede a resposta ficou vazia
      if (!answer.trim() && !controller.signal.aborted) {
        answer = `⚠️ **O modelo de IA não devolveu resposta.**\n\nPor favor verifica a tua ligação à Internet e a chave de API em **Definições**.`;
      }
    } catch (err: any) {
      console.error("[GRIOT_DEBUG] startExecution catch:", err?.message, err);
      const isTimeout =
        (controller.signal.aborted && String(controller.signal.reason).includes("Tempo limite")) ||
        String(err?.message).includes("Tempo limite") ||
        String(err?.message).includes("Timeout");

      if (controller.signal.aborted && !isTimeout) {
        return;
      }
      console.warn("[ChatExecutionManager] Falha na execução da IA:", err);
      const mLabel = isModelOS(modelId) ? "ModelOS" : modelLabel(modelId);
      const is403 =
        String(err?.message).includes("403") ||
        String(err?.message).includes("PERMISSION_DENIED") ||
        String(err?.message).includes("permission");

      if (is403) {
        answer = `⚠️ **Permissão Negada na API Google Gemini (Erro 403)**\n\nA chave de API Google Gemini configurada não tem permissão para aceder aos modelos de IA.\n\n**Como resolver:**\n1. Ativa a **Generative Language API** no teu projeto Google Cloud Console.\n2. Verifica se a chave não tem restrições de IP ou domínio que bloqueiem o acesso.\n3. Ou obtém uma nova chave gratuita em **[Google AI Studio](https://aistudio.google.com/)** e atualiza-a em **Definições → Chaves de API**.`;
      } else {
        const timeoutDisplay =
          Math.round(executionTimeoutMs / 60000) >= 60
            ? `${Math.round(executionTimeoutMs / 3600000)}h`
            : `${Math.round(executionTimeoutMs / 60000)} min`;
        answer = `⚠️ **Não foi possível obter resposta do modelo ${mLabel}.**\n\n${isTimeout ? `A execução excedeu o limite de segurança de ${timeoutDisplay}.` : err?.message || "Ocorreu uma falha na ligação com o fornecedor de IA."}\n\n👉 Tenta novamente ou verifica a tua chave em **Definições → Chave Google Gemini**.`;
      }
    } finally {
      clearTimeout(hardTimeoutTimer);
      console.log("[GRIOT_DEBUG] startExecution: entrou no finally", {
        aborted: controller.signal.aborted,
        respostaVazia: !answer.trim(),
      });

      const requiredGcu = 1;

      try {
        // 2. Finalizar e salvar a mensagem do assistente localmente e no Supabase
        if (answer.trim()) {
          if (!controller.signal.aborted) {
            try {
              void consumeGcu({
                userId,
                amount: requiredGcu,
                label: isSheolModel(effectiveModelId)
                  ? `Execução SHEOL (${modelLabel(effectiveModelId)})`
                  : `Execução BASE (${modelLabel(effectiveModelId)})`,
                modelId: effectiveModelId,
              });
            } catch (gcuErr) {
              console.warn("[ChatExecutionManager] Falha ao debitar GCU:", gcuErr);
            }
          }

          const cleaned = stripActionBlocks(parseProposals(answer).clean || answer);

          let appKey = "custom";
          if (isModelOS(modelId)) {
            appKey = "modelos";
          } else {
            const m = modelId.toLowerCase();
            appKey = m.includes("claude")
              ? "claude"
              : m.includes("gemini")
                ? "gemini"
                : m.includes("gpt")
                  ? "chatgpt"
                  : m.includes("deepseek")
                    ? "deepseek"
                    : m.includes("groq")
                      ? "groq"
                      : "custom";
          }

          try {
            void observerEngine.processIncomingAIMessage(
              {
                provider: appKey as any,
                model: modelId,
                sessionTitle: isModelOS(modelId) ? "ModelOS Cluster" : "Sessão Ativa",
                appId: appKey,
              },
              cleaned,
              conversationId || "main",
            );
          } catch (obsErr) {
            console.warn("[ChatExecutionManager] Observer non-critical:", obsErr);
          }

          for (const s of stepsList) {
            if (s.status === "running") s.status = "done";
          }

          await this.finalizeAssistantMessage(
            conversationId,
            cleaned,
            userId,
            isModelOS(modelId) ? "modelos" : modelId,
            stepsList,
            fullReasoning,
          );

          // Notificação real só quando o utilizador não está dentro do app.
          void notifyIfBackgrounded({
            type: "message",
            title: "GRIOT",
            message: cleaned.replace(/\s+/g, " ").trim().slice(0, 140) || "Resposta concluída.",
            url: `/chat?c=${encodeURIComponent(conversationId)}`,
            sender: "GRIOT",
          });
        }
      } catch (finalizeErr) {
        console.error("[ChatExecutionManager] Erro na finalização da mensagem:", finalizeErr);
      }

      // Desregistar execução ativa
      this.activeExecutions.delete(conversationId);
      console.log("[GRIOT_DEBUG] startExecution: prestes a notificar busy=false");
      this.notify(conversationId, {
        conversationId,
        scope,
        busy: false,
        streaming: "",
        reasoning: "",
        steps: 0,
        stepsList: [],
      });
      console.log("[GRIOT_DEBUG] startExecution: notify enviado");

      // Disparar evento para a UI atualizar lista de conversas
      if (typeof window !== "undefined") {
        window.dispatchEvent(new CustomEvent("griot_conversations_changed"));
      }
    }
  }

  /** Adiciona mensagem diretamente à conversa local */
  public appendMessage(conversationId: string, msg: ChatMessageRow): void {
    this.appendMessageLocally(conversationId, msg);
  }

  /** Adiciona ou alterna uma reação numa mensagem específica */
  public addReaction(conversationId: string, messageId: string, reaction: MessageReaction): void {
    if (typeof window === "undefined" || !conversationId || !messageId) return;
    try {
      const storageKey = "griot_messages_" + conversationId;
      const raw = localStorage.getItem(storageKey);
      if (!raw) return;
      const list: ChatMessageRow[] = JSON.parse(raw);
      const target = list.find((m) => m.id === messageId);
      if (!target) return;
      const current = target.reactions ? [...target.reactions] : [];
      if (reaction.isUser) {
        const existingIdx = current.findIndex((r) => r.isUser && r.emoji === reaction.emoji);
        if (existingIdx >= 0) {
          current.splice(existingIdx, 1);
        } else {
          current.push(reaction);
        }
      } else {
        const existingIdx = current.findIndex(
          (r) => r.roleId === reaction.roleId && r.emoji === reaction.emoji,
        );
        if (existingIdx < 0) {
          current.push(reaction);
        }
      }
      target.reactions = current;
      localStorage.setItem(storageKey, JSON.stringify(list));
      window.dispatchEvent(
        new CustomEvent("griot_message_reaction", {
          detail: { conversationId, messageId, reactions: current },
        }),
      );
    } catch (e) {
      console.warn("[ChatExecutionManager] Erro ao gravar reação:", e);
    }
  }

  /** Adiciona mensagem localmente de forma resiliente e síncrona */
  private appendMessageLocally(conversationId: string, msg: ChatMessageRow): void {
    if (typeof window === "undefined" || !conversationId) return;
    try {
      const storageKey = "griot_messages_" + conversationId;
      const raw = localStorage.getItem(storageKey);
      const list: ChatMessageRow[] = raw ? JSON.parse(raw) : [];

      // Evita duplicação por ID
      if (list.some((m) => m.id === msg.id)) return;

      // Evita duplicar se a última mensagem já tiver o mesmo papel e conteúdo idêntico
      const last = list[list.length - 1];
      if (last && last.role === msg.role && last.content.trim() === msg.content.trim()) {
        return;
      }

      list.push(msg);
      localStorage.setItem(storageKey, JSON.stringify(list));
      window.dispatchEvent(
        new CustomEvent("griot_message_saved", { detail: { conversationId, msg } }),
      );
    } catch (e) {
      console.warn("[ChatExecutionManager] Erro ao gravar localmente:", e);
    }
  }

  /** Finaliza a gravação da mensagem do assistente */
  private async finalizeAssistantMessage(
    conversationId: string,
    content: string,
    userId: string,
    modelId: string,
    stepsList?: ExecutionStepItem[],
    reasoning?: string,
  ): Promise<void> {
    const asstId = `asst-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
    const asstMsg: ChatMessageRow = {
      id: asstId,
      role: "assistant",
      content,
      created_at: new Date().toISOString(),
      feedback: null,
      model: modelId,
      stepsList: stepsList && stepsList.length > 0 ? stepsList : undefined,
      reasoning: reasoning?.trim() || undefined,
      steps: stepsList?.length || 0,
    };

    // 1. Gravação local imediata (disponível instantaneamente mesmo offline ou ao navegar)
    this.appendMessageLocally(conversationId, asstMsg);

    // 2. Gravação no Supabase desacoplada em segundo plano (fire-and-forget sem reter o ciclo de vida)
    void (async () => {
      try {
        const workspaceId = await getPrimaryWorkspaceId(userId);
        await (supabase as any).from("griot_messages").insert({
          id: asstId,
          workspace_id: workspaceId || "c92b4b86-2ff1-4259-bc16-3ab66751d8b1",
          conversation_id: conversationId,
          actor_kind: "model",
          content,
          status: "succeeded",
          metadata: {
            model: modelId,
            stepsList: stepsList && stepsList.length > 0 ? stepsList : undefined,
            reasoning: reasoning?.trim() || undefined,
          },
        });

        // Atualiza timestamp da conversa
        await (supabase as any)
          .from("griot_conversations")
          .update({ updated_at: new Date().toISOString() })
          .eq("id", conversationId);
      } catch (supabaseErr) {
        console.warn("[ChatExecutionManager] Sincronização Supabase em background:", supabaseErr);
      }
    })();
  }

  private notify(conversationId: string, state: ExecutionState): void {
    const active = this.activeExecutions.get(conversationId);
    if (active) {
      active.state = { ...state };
    }
    const set = this.listeners.get(conversationId);
    if (set) {
      for (const listener of set) {
        try {
          listener({ ...state });
        } catch (e) {
          console.warn("[ChatExecutionManager] Listener error:", e);
        }
      }
    }
  }
}

export const chatExecutionManager = new ChatExecutionManager();
