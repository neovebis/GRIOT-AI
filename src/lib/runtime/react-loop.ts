/**
 * GRIOT ReAct Loop Engine
 *
 * Implements the full iterative ReAct cycle:
 * User Prompt -> LLM -> Tool Call / Action -> Execution -> Observation -> LLM -> Final Response.
 * Includes Reflection & Self-healing on tool failures.
 */

import { streamDirectAI } from "@/lib/ai-client-mobile-entry";
import type { ChatMessage, StreamCallbacks } from "@/lib/ai-client";
import { defaultExecutor } from "./executors";
import { parseGriotActions } from "./parser";
import type { GriotAction, GriotExecutionResult } from "./protocol";
import { validateSyntaxBalance } from "./semantic-patcher";

export interface ReActExecutionStep {
  stepIndex: number;
  thought?: string;
  action?: GriotAction;
  result?: GriotExecutionResult;
}

export interface ReActLoopResult {
  finalAnswer: string;
  reasoning: string;
  steps: ReActExecutionStep[];
  actionsExecuted: GriotAction[];
}

export interface ReActLoopOptions {
  modelId: string;
  messages: Array<{ role: "user" | "assistant" | "system"; content: string }>;
  systemInstruction?: string;
  context?: string;
  maxIterations?: number;
  callbacks?: StreamCallbacks & {
    onActionStart?: (action: GriotAction) => void;
    onActionCompleted?: (action: GriotAction, result: GriotExecutionResult) => void;
    onActionApprovalRequired?: (action: GriotAction) => Promise<boolean>;
    onStepChange?: (step: number) => void;
  };
  signal?: AbortSignal;
}

const MAX_DEFAULT_ITERATIONS = 8;

/**
 * Janela inteligente de contexto (Output Windowing):
 * Se o output de uma ferramenta ou comando for demasiado extenso,
 * preserva o topo (cabeçalhos) e o fundo (erros e sumário), omitindo o miolo.
 */
function compactObservationOutput(text: string, maxLines = 80, maxChars = 3500): string {
  if (!text) return "";
  if (text.length <= maxChars && text.split("\n").length <= maxLines) {
    return text;
  }
  const lines = text.split("\n");
  if (lines.length > maxLines) {
    const headCount = Math.floor(maxLines * 0.4);
    const tailCount = Math.floor(maxLines * 0.5);
    const omitted = lines.length - headCount - tailCount;
    const head = lines.slice(0, headCount).join("\n");
    const tail = lines.slice(lines.length - tailCount).join("\n");
    return `${head}\n\n... [${omitted} linhas intermédias omitidas pelo GRIOT Context Window Manager para poupar tokens] ...\n\n${tail}`;
  }
  return `${text.slice(0, Math.floor(maxChars * 0.5))}\n\n... [output truncado pelo GRIOT Context Window Manager para poupar tokens] ...\n\n${text.slice(-Math.floor(maxChars * 0.4))}`;
}

/**
 * Compactação rolante do histórico:
 * Preserva o prompt original do utilizador e as interações recentes completas,
 * compactando observações antigas de passos intermédios para evitar estouro da janela de contexto.
 */
function compactMessageHistory(messages: ChatMessage[], keepRecentTurns = 3): ChatMessage[] {
  if (messages.length <= 8) return messages;
  const systemMessages = messages.filter((m) => m.role === "system");
  const conversationMessages = messages.filter((m) => m.role !== "system");
  if (conversationMessages.length <= keepRecentTurns * 2) return messages;

  const olderMessages = conversationMessages.slice(
    0,
    conversationMessages.length - keepRecentTurns * 2,
  );
  const recentMessages = conversationMessages.slice(
    conversationMessages.length - keepRecentTurns * 2,
  );

  const compactedOlder = olderMessages.map((msg) => {
    if (msg.role === "user" && msg.content.startsWith("[OBSERVAÇÃO DA EXECUÇÃO]")) {
      const firstLine = msg.content.split("\n")[1] || "Ação de ferramenta executada";
      return {
        role: "user" as const,
        content: `[Resumo Histórico Passo]: ${firstLine.slice(0, 160)} (concluído)`,
      };
    }
    if (msg.role === "assistant" && msg.content.length > 400) {
      return {
        role: "assistant" as const,
        content: `${msg.content.slice(0, 200)}... [ações prosseguiram]`,
      };
    }
    return msg;
  });

  return [...systemMessages, ...compactedOlder, ...recentMessages];
}

export async function executeReActLoop(options: ReActLoopOptions): Promise<ReActLoopResult> {
  const {
    modelId,
    messages: baseMessages,
    systemInstruction = "És o GRIOT, o assistente de engenharia de software e inteligência artificial de elite. Quando precisares de inspecionar ou modificar ficheiros ou executar comandos, utiliza as ferramentas disponíveis com disciplina rigorosa (inspecionar antes de editar, verificar após alterar).",
    context,
    maxIterations = MAX_DEFAULT_ITERATIONS,
    callbacks,
    signal,
  } = options;

  const steps: ReActExecutionStep[] = [];
  const actionsExecuted: GriotAction[] = [];
  const actionSignatures: string[] = [];

  let currentMessages: ChatMessage[] = baseMessages.map((m) => ({
    role: m.role,
    content: m.content,
  }));

  if (context) {
    currentMessages.unshift({
      role: "system",
      content: `[CONTEXTO DO PROJETO GRIOT]\n${context}`,
    });
  }

  let finalAnswer = "";
  let fullReasoning = "";
  let accumulatedText = "";

  for (let iteration = 1; iteration <= maxIterations; iteration++) {
    callbacks?.onStepChange?.(iteration);

    let iterationText = "";
    let iterationReasoning = "";

    // Aplica compactação de histórico se a cadeia de passos for longa
    const optimizedMessages = compactMessageHistory(currentMessages);

    const response = await streamDirectAI({
      modelId,
      messages: optimizedMessages,
      systemInstruction,
      callbacks: {
        onToken: (token) => {
          iterationText += token;
          callbacks?.onToken?.(token);
        },
        onReasoning: (r) => {
          iterationReasoning += r;
          callbacks?.onReasoning?.(r);
        },
        onStep: () => callbacks?.onStep?.(),
      },
      signal,
    });

    const candidateActions: GriotAction[] = [...response.toolCalls];

    // Se o modelo gerou blocos de ação em XML / Markdown mas não via tool call nativo
    const parsedFromText = parseGriotActions(response.text);
    for (const pa of parsedFromText) {
      if (
        !candidateActions.some(
          (ca) => ca.type === pa.type && JSON.stringify(ca.params) === JSON.stringify(pa.params),
        )
      ) {
        candidateActions.push(pa);
      }
    }

    fullReasoning += iterationReasoning;

    // Armazena texto explicativo válido desta iteração
    if (response.text && response.text.trim()) {
      accumulatedText = response.text.trim();
    }

    // Se não há ferramentas a executar, chegámos à resposta final
    if (candidateActions.length === 0) {
      finalAnswer = response.text;
      break;
    }

    // Executa as ações detetadas
    const stepRecord: ReActExecutionStep = {
      stepIndex: iteration,
      thought: iterationReasoning || undefined,
    };

    let observationText = "";

    for (const action of candidateActions) {
      // 1. Deteção de Anti-Stalling / Loops Infinitos
      const actionSig = `${action.type}::${JSON.stringify(action.params)}`;
      const recentDuplicates = actionSignatures.filter((sig) => sig === actionSig).length;
      actionSignatures.push(actionSig);

      if (recentDuplicates >= 2) {
        observationText += `\n[ALERTA DE ANTI-STALLING DO HARNESS]: Esta exata ação com os mesmos parâmetros já foi executada 2 vezes no loop. NÃO repitas a mesma chamada. Altera a estratégia, tenta outros ficheiros ou explica o impedimento ao utilizador.\n`;
      }

      // Se a ação requer confirmação do utilizador (Human-in-the-Loop para ações de risco / destrutivas)
      if (action.requiresApproval && callbacks?.onActionApprovalRequired) {
        const approved = await callbacks.onActionApprovalRequired(action);
        if (!approved) {
          const rejectResult: GriotExecutionResult = {
            actionId: action.id,
            actionType: action.type,
            status: "failed",
            exitCode: 1,
            stdout: "",
            stderr: "Ação cancelada: O utilizador não autorizou a execução deste plugin/comando.",
            durationMs: 0,
            timestamp: new Date().toISOString(),
          };
          callbacks?.onActionCompleted?.(action, rejectResult);
          stepRecord.action = action;
          stepRecord.result = rejectResult;
          observationText += `\n[Permissão Recusada]: O utilizador não autorizou a execução de ${action.type}. Por favor informa o utilizador sobre a recusa e formula uma alternativa ou continua sem executar esta ação.\n`;
          continue;
        }
      }

      callbacks?.onActionStart?.(action);
      actionsExecuted.push(action);

      let result: GriotExecutionResult;
      try {
        result = await defaultExecutor.execute(action);
      } catch (execErr) {
        result = {
          actionId: action.id,
          actionType: action.type,
          status: "failed",
          exitCode: 1,
          stdout: "",
          stderr: execErr instanceof Error ? execErr.message : String(execErr),
          durationMs: 0,
          timestamp: new Date().toISOString(),
        };
      }

      callbacks?.onActionCompleted?.(action, result);
      stepRecord.action = action;
      stepRecord.result = result;

      // 2. Validação sintática em tempo real para escritas ou patches de código
      if (
        (action.type === "fs.write_file" || action.type === "fs.patch") &&
        result.status === "success"
      ) {
        const filePath = String(action.params?.path || "");
        const content = String(action.params?.content || action.params?.replacement || "");
        if (
          filePath.endsWith(".ts") ||
          filePath.endsWith(".tsx") ||
          filePath.endsWith(".js") ||
          filePath.endsWith(".jsx")
        ) {
          if (content.length > 0) {
            const balance = validateSyntaxBalance(content);
            if (!balance.valid) {
              result.stderr = `⚠️ [Aviso de Sintaxe Estrutural]: ${balance.error}. Corrige os blocos e delimitadores.`;
            }
          }
        }
      }

      // 3. Compactação inteligente do feedback da ação (Output Windowing)
      const formattedFeedback = defaultExecutor.formatFeedbackForAI(result);
      observationText += `\n${compactObservationOutput(formattedFeedback)}\n`;

      if (result.status === "failed" || result.exitCode !== 0) {
        observationText += `[Aviso de Auto-Correção]: A ação ${action.type} falhou com código ${result.exitCode}. Analisa o erro em STDERR acima e formula uma alternativa ou correção.\n`;
      }
    }

    steps.push(stepRecord);

    // Se esta era a última iteração permitida, solicita a síntese final para não cortar a resposta
    if (iteration === maxIterations) {
      try {
        const finalRes = await streamDirectAI({
          modelId,
          messages: [
            ...currentMessages,
            { role: "assistant", content: response.text || "[Ações executadas]" },
            {
              role: "user",
              content: `[OBSERVAÇÕES DA EXECUÇÃO]\n${observationText}\nCom base em todas as observações acima, fornece agora a tua resposta final completa e conclusiva para o utilizador. Não chames novas ferramentas.`,
            },
          ],
          systemInstruction,
          callbacks: {
            onToken: (tok) => callbacks?.onToken?.(tok),
            onReasoning: (r) => callbacks?.onReasoning?.(r),
          },
          signal,
        });
        if (finalRes?.text?.trim()) {
          finalAnswer = finalRes.text.trim();
        }
      } catch {
        finalAnswer = accumulatedText || response.text || "Execução concluída com sucesso.";
      }
      break;
    }

    // Alimenta o loop ReAct adicionando a resposta do assistente e a observação compactada
    currentMessages = [
      ...currentMessages,
      { role: "assistant", content: response.text || "[Executando ferramenta...]" },
      {
        role: "user",
        content: `[OBSERVAÇÃO DA EXECUÇÃO]\n${observationText}\nPor favor analisa os resultados e avança para o próximo passo ou conclui a resposta.`,
      },
    ];
  }

  return {
    finalAnswer: finalAnswer || accumulatedText || "Execução concluída.",
    reasoning: fullReasoning,
    steps,
    actionsExecuted,
  };
}
