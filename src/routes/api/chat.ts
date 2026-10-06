import { createFileRoute } from "@tanstack/react-router";
import { GRIOT_SUPABASE_ANON_KEY, GRIOT_SUPABASE_URL } from "@/lib/griot-api";
import { checkRateLimit, sanitizeInput, SECURITY_HEADERS } from "@/lib/security-headers";
import { prepareMultimodalGeminiParts } from "@/lib/multimodal-vision";
import { authenticateApiRequest } from "@/lib/api-auth";

type ChatMessage = { role: "user" | "assistant" | "system"; content: string };

export const Route = createFileRoute("/api/chat")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const clientIp = request.headers.get("x-forwarded-for") || "127.0.0.1";
        const rateLimit = checkRateLimit(clientIp, 60, 60000);
        if (!rateLimit.allowed) {
          return new Response(
            JSON.stringify({ error: "Demasiados pedidos. Tenta daqui a pouco." }),
            { status: 429, headers: { "Content-Type": "application/json", ...SECURITY_HEADERS } },
          );
        }

        const authUser = await authenticateApiRequest(request);
        const authorization = request.headers.get("authorization") || request.headers.get("Authorization") || "";
        if (!authUser) {
          return new Response(
            JSON.stringify({ error: "Sessão não autenticada. Inicia sessão novamente." }),
            { status: 401, headers: { "Content-Type": "application/json", ...SECURITY_HEADERS } },
          );
        }

        const body = (await request.json()) as {
          messages?: ChatMessage[];
          model?: string;
          effort?: "low" | "medium" | "high";
          conversationId?: string;
          conversationTitle?: string;
          systemInstruction?: string;
        };
        const rawMessages = body.messages ?? [];
        if (rawMessages.length === 0) {
          return new Response("Sem mensagens", { status: 400, headers: SECURITY_HEADERS });
        }

        const lastUserMessage = [...rawMessages].reverse().find((m) => m.role === "user");
        const prompt = sanitizeInput(lastUserMessage?.content || "", 120000);
        if (!prompt) {
          return new Response("Mensagem vazia", { status: 400, headers: SECURITY_HEADERS });
        }

        const rawModel = typeof body.model === "string" ? body.model : "";
        let provider = "gemini";
        let model: string | undefined = undefined;

        if (rawModel === "modelos" || rawModel === "model-os") {
          provider = "gemini";
          model = "gemini-flash-latest";
        } else if (rawModel === "base" || rawModel === "modelgpu" || rawModel === "modelgpu-base") {
          provider = "gemini";
          model = "gemini-flash-latest";
        } else if (rawModel === "sheol" || rawModel === "griotgpu" || rawModel === "griotgpu-v2") {
          provider = "gemini";
          model = "gemini-flash-latest";
        } else {
          const delimiter = rawModel.includes("/") ? "/" : rawModel.includes(":") ? ":" : null;
          if (delimiter) {
            const [maybeProvider, ...modelParts] = rawModel.split(delimiter);
            const p = maybeProvider?.toLowerCase();
            provider =
              p === "google"
                ? "gemini"
                : ["gemini", "openai", "anthropic", "groq", "openrouter", "deepseek"].includes(p)
                  ? p
                  : "gemini";
            model = modelParts.join(delimiter);
          } else {
            provider = "gemini";
            model = rawModel || "gemini-flash-latest";
          }
        }

        const encoder = new TextEncoder();
        const stream = new ReadableStream<Uint8Array>({
          async start(controller) {
            const emit = (t: "text" | "reason" | "step", d: string) => {
              controller.enqueue(encoder.encode(`${JSON.stringify({ t, d })}\n`));
            };

            if (process.env.GEMINI_API_KEY && (provider === "gemini" || rawModel === "modelos")) {
              try {
                const { generateContentStreamWithFallback, resolveModelChain } =
                  await import("@/lib/gemini.server");
                const contents = await Promise.all(
                  rawMessages.slice(-20).map(async (m) => ({
                    role: (m.role === "assistant" ? "model" : "user") as "user" | "model",
                    parts:
                      m.role === "assistant"
                        ? [{ text: m.content }]
                        : await prepareMultimodalGeminiParts(m.content),
                  })),
                );

                const modelsToTry = resolveModelChain(model);

                const { stream: genStream } = await generateContentStreamWithFallback({
                  models: modelsToTry,
                  contents,
                  config: {
                    temperature: 0.7,
                    maxOutputTokens: 8192,
                    systemInstruction: body.systemInstruction || undefined,
                  },
                });

                for await (const chunk of genStream) {
                  const chunkText = chunk.text;
                  if (chunkText) {
                    emit("text", chunkText);
                  }
                }
                controller.close();
                return;
              } catch (directErr) {
                console.warn(
                  "[GRIOT Server] Streaming direto Gemini falhou, caindo para orquestrador:",
                  directErr,
                );
              }
            }

            try {
              const upstream = await fetch(
                `${GRIOT_SUPABASE_URL}/functions/v1/griot-orchestrator/ask`,
                {
                  method: "POST",
                  headers: {
                    "content-type": "application/json",
                    ...(authorization ? { authorization } : {}),
                    apikey: GRIOT_SUPABASE_ANON_KEY,
                  },
                  body: JSON.stringify({
                    prompt,
                    messages: rawMessages.slice(-20),
                    provider,
                    model,
                    conversationId: body.conversationId || undefined,
                    conversationTitle: body.conversationTitle || undefined,
                  }),
                },
              );

              if (!upstream.ok) {
                const payload = (await upstream.json().catch(() => ({}))) as { error?: string };
                const message =
                  upstream.status === 409
                    ? "Ainda não ligaste uma chave de API de IA. Vai a Definições → Chave de IA para ligar uma (ex.: Gemini) antes de conversar."
                    : payload.error || "O GRIOT não conseguiu responder agora.";
                emit("text", message);
                controller.close();
                return;
              }

              if (upstream.body) {
                const reader = upstream.body.getReader();
                const decoder = new TextDecoder();
                let accumulated = "";

                while (true) {
                  const { done, value } = await reader.read();
                  if (done) break;
                  const chunk = decoder.decode(value, { stream: true });
                  accumulated += chunk;

                  const lines = accumulated.split("\n");
                  accumulated = lines.pop() || "";

                  for (const line of lines) {
                    const trimmed = line.trim();
                    if (!trimmed) continue;
                    if (trimmed.startsWith("data: ")) {
                      try {
                        const json = JSON.parse(trimmed.slice(6));
                        const token = json.text || json.content || json.delta || "";
                        if (token) emit("text", token);
                      } catch {
                        emit("text", trimmed.slice(6));
                      }
                    } else {
                      try {
                        const json = JSON.parse(trimmed);
                        if (json.text) emit("text", json.text);
                        else if (json.result?.content) emit("text", json.result.content);
                      } catch {
                        emit("text", trimmed);
                      }
                    }
                  }
                }

                if (accumulated.trim()) {
                  try {
                    const json = JSON.parse(accumulated.trim());
                    if (json.text) emit("text", json.text);
                    else if (json.result?.content) emit("text", json.result.content);
                  } catch {
                    emit("text", accumulated.trim());
                  }
                }
              } else {
                const payload = (await upstream.json().catch(() => ({}))) as {
                  result?: { content?: string };
                };
                const text = payload.result?.content || "";
                if (text) {
                  emit("text", text);
                } else {
                  emit("text", "O modelo não devolveu texto.");
                }
              }
            } catch (error) {
              console.error("api/chat -> griot-orchestrator error:", error);
              emit("text", "Não foi possível contactar o GRIOT. Verifica a tua ligação.");
            } finally {
              controller.close();
            }
          },
        });

        return new Response(stream, {
          headers: {
            "Content-Type": "text/plain; charset=utf-8",
            "Cache-Control": "no-cache, no-store, must-revalidate",
            ...SECURITY_HEADERS,
          },
        });
      },
    },
  },
});
