import { GoogleGenAI } from "@google/genai";

let geminiClient: GoogleGenAI | null = null;

export function getGemini(): GoogleGenAI {
  if (!geminiClient) {
    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey) {
      throw new Error("GEMINI_API_KEY environment variable is required");
    }
    geminiClient = new GoogleGenAI({
      apiKey,
      httpOptions: {
        headers: {
          "User-Agent": "aistudio-build",
        },
      },
    });
  }
  return geminiClient;
}

/** Modelos disponíveis e suportados para texto e raciocínio (conforme SKILL.md) */
export const TEXT_MODEL_CASCADE = [
  "gemini-3.7-flash",
  "gemini-3.1-flash-lite",
  "gemini-flash-latest",
] as const;

export function isTransientGeminiError(error: unknown): boolean {
  if (!error) return false;
  const err = error as Record<string, unknown>;
  const msg = String(err.message || error);
  const status = Number(err.status || err.code || 0);

  if (status === 503 || status === 429 || status === 500 || status === 502 || status === 504) {
    return true;
  }

  const lower = msg.toLowerCase();
  return (
    lower.includes("503") ||
    lower.includes("429") ||
    lower.includes("high demand") ||
    lower.includes("spikes in demand") ||
    lower.includes("unavailable") ||
    lower.includes("resource_exhausted") ||
    lower.includes("service unavailable") ||
    lower.includes("rate limit") ||
    lower.includes("too many requests") ||
    lower.includes("overloaded") ||
    lower.includes("temporarily unavailable")
  );
}

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

/**
 * Resolve a cascata ordenada de modelos a tentar com base no modelo solicitado e modo rápido.
 */
export function resolveModelChain(requestedModel?: string, fast = false): string[] {
  const chain: string[] = [];

  if (fast) {
    chain.push("gemini-3.1-flash-lite", "gemini-3.7-flash", "gemini-flash-latest");
    return Array.from(new Set(chain));
  }

  if (requestedModel) {
    const lower = requestedModel.toLowerCase();
    if (lower.includes("lite")) {
      chain.push("gemini-3.1-flash-lite");
    } else if (lower.includes("3.7") || lower.includes("flash-latest")) {
      chain.push("gemini-3.7-flash", "gemini-3.1-flash-lite", "gemini-flash-latest");
    } else if (lower.includes("pro")) {
      chain.push("gemini-3.1-pro-preview", "gemini-3.7-flash", "gemini-3.1-flash-lite");
    }
  }

  chain.push("gemini-3.7-flash", "gemini-3.1-flash-lite", "gemini-flash-latest");
  return Array.from(new Set(chain));
}

/**
 * Executa generateContent com tentativa por modelo e backoff para erros transitórios (503 / 429 / 500).
 */
export async function generateContentWithFallback(params: {
  models?: string[];
  contents: Parameters<GoogleGenAI["models"]["generateContent"]>[0]["contents"];
  config?: Parameters<GoogleGenAI["models"]["generateContent"]>[0]["config"];
}) {
  const ai = getGemini();
  const modelsToTry =
    params.models && params.models.length > 0 ? params.models : TEXT_MODEL_CASCADE;

  let lastError: unknown = null;

  for (const model of modelsToTry) {
    // Até 2 tentativas por modelo se for transitório
    for (let attempt = 0; attempt < 2; attempt++) {
      try {
        const result = await ai.models.generateContent({
          model,
          contents: params.contents,
          config: params.config,
        });
        return { result, modelUsed: model };
      } catch (err) {
        lastError = err;
        if (isTransientGeminiError(err)) {
          console.warn(
            `[Gemini Resilience] Model ${model} returned transient error (attempt ${attempt + 1}/2):`,
            (err as Error)?.message || err,
          );
          if (attempt === 0) {
            await sleep(400 + Math.random() * 400);
            continue;
          }
        }
        // Se falhou as tentativas transitórias ou for erro deste modelo específico, passa ao próximo modelo
        break;
      }
    }
  }

  throw lastError ?? new Error("Todos os modelos da cascata falharam.");
}

/**
 * Executa generateContentStream com fallback automático de modelos em caso de 503 / 429 / indisponibilidade.
 */
export async function generateContentStreamWithFallback(params: {
  models?: string[];
  contents: Parameters<GoogleGenAI["models"]["generateContentStream"]>[0]["contents"];
  config?: Parameters<GoogleGenAI["models"]["generateContentStream"]>[0]["config"];
}) {
  const ai = getGemini();
  const modelsToTry =
    params.models && params.models.length > 0 ? params.models : TEXT_MODEL_CASCADE;

  let lastError: unknown = null;

  for (const model of modelsToTry) {
    for (let attempt = 0; attempt < 2; attempt++) {
      try {
        const stream = await ai.models.generateContentStream({
          model,
          contents: params.contents,
          config: params.config,
        });
        return { stream, modelUsed: model };
      } catch (err) {
        lastError = err;
        if (isTransientGeminiError(err)) {
          console.warn(
            `[Gemini Resilience] Stream setup for ${model} unavailable (attempt ${attempt + 1}/2):`,
            (err as Error)?.message || err,
          );
          if (attempt === 0) {
            await sleep(400 + Math.random() * 400);
            continue;
          }
        }
        break;
      }
    }
  }

  throw lastError ?? new Error("Todos os modelos da cascata falharam ao iniciar stream.");
}
