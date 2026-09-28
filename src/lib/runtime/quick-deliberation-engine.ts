/**
 * GRIOT Dynamic Quick Deliberation Room Runner
 *
 * Runs multi-agent room participants asynchronously and naturally.
 * - Concurrency: whichever model finishes first responds first ("oque terminar primeiro responde primeiro").
 * - Dynamic reactions: models can simply like/react to the message with an emoji (👍, ❤️, 🔥, 💡, 🚀)
 *   instead of producing verbose redundant replies.
 * - Natural interaction: models speak in their own voice and can address what preceding models said.
 */

import { streamDirectAI } from "@/lib/ai-client-mobile-entry";
import {
  chatExecutionManager,
  type ChatMessageRow,
  type MessageReaction,
} from "@/lib/chat-execution-manager";
import {
  DELIBERATION_MISSIONS,
  DELIBERATION_ROLES,
  type DeliberationMissionId,
  type DeliberationRoleId,
} from "@/lib/runtime/deliberation-room";
import { getModelDisplayName } from "@/components/griot/brand-icons";
import { getUserSavedApis } from "@/lib/user-apis";
import { supabase } from "@/integrations/supabase/client";
import { getPrimaryWorkspaceId } from "@/lib/griot-api";

export interface QuickDeliberationParams {
  userPrompt: string;
  conversationId: string;
  userId: string;
  missionId: DeliberationMissionId;
  roleEngines: Record<DeliberationRoleId, string>;
  history: ChatMessageRow[];
  targetUserMessageId?: string;
  signal?: AbortSignal;
  onRoleStart?: (roleId: DeliberationRoleId, modelId: string, roleName: string) => void;
  onRoleMessage?: (message: ChatMessageRow) => void;
  onRoleReaction?: (reaction: MessageReaction, targetMessageId: string) => void;
  onRoleDone?: (roleId: DeliberationRoleId) => void;
  onAllDone?: () => void;
}

const REACTION_REGEX = /\[(?:CURTIR|REACTION|LIKE)\s*:\s*([^\]]+)\]/i;

function cleanRoleContent(raw: string, roleLabel: string): string {
  let text = raw.replace(REACTION_REGEX, "").trim();
  // Remove prefixos redundantes como "Estrategista:", "**O Analista:**", etc.
  const prefixRegex = new RegExp(
    `^(?:\\*\\*)?(?:O\\s+)?(?:${roleLabel}|Strategist|Analyst|Critic|Innovator|Estrategista|Analista|Crítico|Inovador)(?:\\*\\*)?\\s*:\\s*`,
    "i",
  );
  text = text.replace(prefixRegex, "").trim();
  return text;
}

export async function runQuickDeliberation(params: QuickDeliberationParams): Promise<void> {
  const {
    userPrompt,
    conversationId,
    userId,
    missionId,
    roleEngines,
    history,
    targetUserMessageId,
    signal,
    onRoleStart,
    onRoleMessage,
    onRoleReaction,
    onRoleDone,
    onAllDone,
  } = params;

  const missionObj =
    DELIBERATION_MISSIONS.find((m) => m.id === missionId) || DELIBERATION_MISSIONS[0];

  const rolesToRun: DeliberationRoleId[] = [
    "strategist",
    "analyst",
    "innovator",
    "critic",
  ];

  // Identifica o ID da mensagem do utilizador à qual anexar reações
  let userMsgId = targetUserMessageId;
  if (!userMsgId) {
    const lastUser = [...history].reverse().find((m) => m.role === "user");
    userMsgId = lastUser ? lastUser.id : `user-${Date.now()}`;
  }

  // Lista partilhada de respostas concluídas nesta ronda para permitir que modelos subsequentes dialoguem
  const completedInThisRound: Array<{
    roleId: DeliberationRoleId;
    roleName: string;
    modelName: string;
    content: string;
  }> = [];

  // Disparo assíncrono com ligeiro desfasamento (jitter) para simular comportamento humano e evitar contenção
  const promises = rolesToRun.map((roleId, index) => {
    return new Promise<void>((resolve) => {
      const delay = index * 180; // 0ms, 180ms, 360ms, 540ms
      const timer = window.setTimeout(async () => {
        if (signal?.aborted) {
          resolve();
          return;
        }

        const role = DELIBERATION_ROLES[roleId];
        const engineId = roleEngines[roleId] || role.defaultEngine || "gemini:gemini-2.5-flash";
        const userSavedApis = getUserSavedApis();
        const matchedUserApi = userSavedApis.find((a) => a.id === engineId);
        const modelDisplay = matchedUserApi?.label || getModelDisplayName(engineId);

        onRoleStart?.(roleId, engineId, role.label);

        // Prepara histórico conversacional recente
        const priorTurns = completedInThisRound
          .map((c) => `[${c.roleName} (${c.modelName})]: "${c.content}"`)
          .join("\n\n");

        const roleSysPrompt = `[GRIOT SALA DE DELIBERAÇÃO DINÂMICA]
Tu és: ${role.label}
Motor Oficial: ${modelDisplay} (${engineId})
Especialidade: ${role.duty}
Missão da Sala: ${missionObj.label} (${missionObj.description})

${priorTurns ? `Intervenções anteriores nesta ronda:\n${priorTurns}\n` : ""}

DIRETRIZES FUNDAMENTAIS DE COMPORTAMENTO:
1. Fala na tua voz natural, de forma viva, autêntica e conversacional, como um membro brilhante numa equipa de fundadores/engenheiros.
2. Sê conciso e acionável (máximo 1 a 2 parágrafos curtos). NUNCA uses listas mecânicas ou tópicos vazios.
3. Se outros colegas já tiverem respondido, podes concordar, discordar diretamente ou acrescentar à perspetiva deles.
4. OPÇÃO DE CURTIR / REAGIR:
   Se achares que a mensagem do utilizador ou a ideia proposta é clara, evidente ou se outro colega já sintetizou tudo na perfeição e tu simplesmente apoias, podes OPTAR POR SIMPLESMENTE CURTIR a mensagem em vez de redigir um texto!
   Para curtir a mensagem, devolve APENAS e estritamente:
   [CURTIR: 👍] ou [CURTIR: ❤️] ou [CURTIR: 🔥] ou [CURTIR: 💡] ou [CURTIR: 🚀]
   (Sem qualquer outro texto antes ou depois).
5. Se decidires responder com texto, concentra-te na tua especialidade (${role.label}) e oferece valor genuíno.`;

        const effectiveMessages: Array<{ role: "user" | "assistant" | "system"; content: string }> = [
          ...history.slice(-8).map((m) => ({
            role: m.role as "user" | "assistant" | "system",
            content: m.content,
          })),
        ];

        // Garante que o prompt do utilizador é a última mensagem
        const last = effectiveMessages[effectiveMessages.length - 1];
        if (!last || last.role !== "user" || last.content.trim() !== userPrompt.trim()) {
          effectiveMessages.push({ role: "user", content: userPrompt });
        }

        let fullOutput = "";

        try {
          const directRes = await streamDirectAI({
            modelId: engineId,
            messages: effectiveMessages,
            systemInstruction: roleSysPrompt,
            signal,
            callbacks: {
              onToken: (tok) => {
                if (signal?.aborted) return;
                fullOutput += tok;
              },
            },
          });

          const finalContent = (directRes?.text || fullOutput).trim();

          // Verifica se o modelo optou por curtir/reagir
          const reactionMatch = finalContent.match(REACTION_REGEX);
          const isPureReaction =
            reactionMatch !== null &&
            (finalContent.length < 24 || finalContent.startsWith("[CURTIR") || finalContent.startsWith("[REACTION"));

          if (isPureReaction && reactionMatch && userMsgId) {
            const rawEmoji = reactionMatch[1] || reactionMatch[0];
            const validEmoji = ["👍", "❤️", "🔥", "💡", "🚀"].includes(rawEmoji)
              ? rawEmoji
              : "👍";

            const reaction: MessageReaction = {
              emoji: validEmoji,
              by: matchedUserApi?.label || role.label,
              modelId: engineId,
              roleId,
            };

            // Adiciona a reação localmente e notifica a interface
            chatExecutionManager.addReaction(conversationId, userMsgId, reaction);
            onRoleReaction?.(reaction, userMsgId);
          } else {
            // O modelo escreveu uma resposta substantiva
            const cleanContent = cleanRoleContent(finalContent, role.label);

            if (cleanContent.length > 0) {
              const asstId = `asst-quick-${roleId}-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
              const asstMsg: ChatMessageRow = {
                id: asstId,
                role: "assistant",
                content: cleanContent,
                created_at: new Date().toISOString(),
                feedback: null,
                model: engineId,
                metadata: {
                  roleId,
                  roleName: role.label,
                  modelId: engineId,
                  userLabel: matchedUserApi?.label,
                  missionId,
                },
              };

              // Adiciona localmente e notifica UI
              chatExecutionManager.appendMessage(conversationId, asstMsg);
              onRoleMessage?.(asstMsg);

              // Adiciona à lista de intervenções concluídas para enriquecer os próximos
              completedInThisRound.push({
                roleId,
                roleName: role.label,
                modelName: modelDisplay,
                content: cleanContent,
              });

              // Gravação assíncrona no Supabase
              void (async () => {
                try {
                  const workspaceId = await getPrimaryWorkspaceId(userId);
                  await (supabase as any).from("griot_messages").insert({
                    id: asstId,
                    workspace_id: workspaceId || "c92b4b86-2ff1-4259-bc16-3ab66751d8b1",
                    conversation_id: conversationId,
                    actor_kind: "model",
                    content: cleanContent,
                    status: "succeeded",
                    metadata: {
                      roleId,
                      roleName: role.label,
                      model: engineId,
                      missionId,
                    },
                  });
                } catch (e) {
                  console.warn("[QuickDeliberation] Erro ao sincronizar mensagem remota:", e);
                }
              })();
            }
          }
        } catch (err) {
          console.warn(`[QuickDeliberation] Falha no motor ${engineId} (${roleId}):`, err);

          // Fallback resiliente: se o modelo configurado falhar (ex: chave ausente), executa com modelo base
          try {
            const fallbackRes = await streamDirectAI({
              modelId: "gemini:gemini-2.5-flash",
              messages: effectiveMessages,
              systemInstruction: roleSysPrompt,
              signal,
            });
            const fallbackContent = (fallbackRes?.text || "").trim();
            const cleanContent = cleanRoleContent(fallbackContent, role.label);

            if (cleanContent.length > 0) {
              const asstId = `asst-quick-${roleId}-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
              const asstMsg: ChatMessageRow = {
                id: asstId,
                role: "assistant",
                content: cleanContent,
                created_at: new Date().toISOString(),
                feedback: null,
                model: "gemini:gemini-2.5-flash",
                metadata: {
                  roleId,
                  roleName: role.label,
                  modelId: "gemini:gemini-2.5-flash",
                  missionId,
                },
              };
              chatExecutionManager.appendMessage(conversationId, asstMsg);
              onRoleMessage?.(asstMsg);
            }
          } catch {}
        } finally {
          onRoleDone?.(roleId);
          resolve();
        }
      }, delay);

      // Cancela o timer se a execução for abortada
      signal?.addEventListener("abort", () => {
        clearTimeout(timer);
        resolve();
      });
    });
  });

  await Promise.allSettled(promises);
  onAllDone?.();
}
