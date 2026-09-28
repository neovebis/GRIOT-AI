/**
 * GRIOT Elite Speech-to-Text (STT) Multimodal Engine
 *
 * Motor de transcrição de ultra-precisão client-side que processa o áudio do utilizador
 * diretamente através das APIs conectadas (Groq Whisper, Gemini Multimodal, OpenAI Whisper)
 * ou Web Speech nativo calibrado.
 */

import { getUserSavedApis } from "@/lib/user-apis";
import { loadPrefs } from "@/lib/settings";

export interface TranscribeOptions {
  language?: string;
  contextPrompt?: string;
  preferredProvider?: "gemini" | "groq" | "openai" | "auto";
  fallbackText?: string;
  signal?: AbortSignal;
}

export interface SpeechLanguageInfo {
  code: string; // ISO 639-1 (ex: "pt")
  bcp47: string; // BCP 47 (ex: "pt-PT")
  name: string; // Nome legível
}

/** Resolve o código e nome do idioma a partir das definições do app ou da prop */
export function resolveSpeechLanguage(langInput?: string): SpeechLanguageInfo {
  const prefs = typeof window !== "undefined" ? loadPrefs() : {};
  const raw =
    langInput ||
    (prefs.voiceLanguage as string) ||
    (prefs.appLanguage as string) ||
    "Português (Portugal)";

  const lower = raw.toLowerCase();

  if (lower.includes("brasil") || lower.includes("pt-br")) {
    return { code: "pt", bcp47: "pt-BR", name: "Português do Brasil" };
  }
  if (lower.includes("português") || lower.includes("portugues") || lower.includes("pt")) {
    return { code: "pt", bcp47: "pt-PT", name: "Português de Portugal" };
  }
  if (lower.includes("uk") || lower.includes("en-gb")) {
    return { code: "en", bcp47: "en-GB", name: "English (UK)" };
  }
  if (lower.includes("english") || lower.includes("inglês") || lower.includes("en")) {
    return { code: "en", bcp47: "en-US", name: "English (US)" };
  }
  if (lower.includes("español") || lower.includes("espanhol") || lower.includes("es")) {
    return { code: "es", bcp47: "es-ES", name: "Español" };
  }
  if (lower.includes("français") || lower.includes("francês") || lower.includes("fr")) {
    return { code: "fr", bcp47: "fr-FR", name: "Français" };
  }
  if (lower.includes("deutsch") || lower.includes("alemão") || lower.includes("de")) {
    return { code: "de", bcp47: "de-DE", name: "Deutsch" };
  }
  if (lower.includes("italiano") || lower.includes("it")) {
    return { code: "it", bcp47: "it-IT", name: "Italiano" };
  }
  if (lower.includes("русский") || lower.includes("russo") || lower.includes("ru")) {
    return { code: "ru", bcp47: "ru-RU", name: "Русский" };
  }
  if (lower.includes("中文") || lower.includes("zh")) {
    return { code: "zh", bcp47: "zh-CN", name: "中文" };
  }
  if (lower.includes("日本語") || lower.includes("ja")) {
    return { code: "ja", bcp47: "ja-JP", name: "日本語" };
  }

  return { code: "pt", bcp47: "pt-PT", name: "Português" };
}

/** Converte um Blob de áudio para Base64 */
export async function blobToBase64(blob: Blob): Promise<string> {
  const arrayBuffer = await blob.arrayBuffer();
  const bytes = new Uint8Array(arrayBuffer);
  let binary = "";
  const len = bytes.byteLength;
  const chunkSize = 8192;
  for (let i = 0; i < len; i += chunkSize) {
    const chunk = bytes.subarray(i, Math.min(i + chunkSize, len));
    binary += String.fromCharCode.apply(null, chunk as unknown as number[]);
  }
  return btoa(binary);
}

/** Limpa transcrições eliminando aspas, introduções e tags */
function sanitizeTranscription(text: string): string {
  let clean = (text || "").trim();
  if (
    (clean.startsWith('"') && clean.endsWith('"')) ||
    (clean.startsWith("'") && clean.endsWith("'")) ||
    (clean.startsWith("«") && clean.endsWith("»")) ||
    (clean.startsWith("“") && clean.endsWith("”"))
  ) {
    clean = clean.slice(1, -1).trim();
  }

  clean = clean.replace(/^(transcrição|transcription|fala|áudio|texto):\s*/i, "");
  return clean.trim();
}

/**
 * Transcreve áudio com o mais alto padrão de fidelidade possível,
 * escolhendo de forma inteligente entre Groq Whisper, Gemini Multimodal e OpenAI Whisper.
 */
export async function transcribeAudioElite(
  audioBlob: Blob,
  options: TranscribeOptions = {},
): Promise<string> {
  if (!audioBlob || audioBlob.size < 600) {
    return "";
  }

  const lang = resolveSpeechLanguage(options.language);
  const userApis = getUserSavedApis();
  const context = (options.contextPrompt || "").trim().slice(0, 400);

  // 1. Tenta Groq Whisper (Ultra-rápido: ~150ms, modelo Whisper-large-v3 com 99% precisão)
  const groqApi = userApis.find((a) => a.providerId === "groq" && a.apiKey);
  if (groqApi && options.preferredProvider !== "gemini") {
    try {
      const result = await transcribeWithGroq(
        audioBlob,
        groqApi.apiKey,
        lang,
        context,
        options.signal,
      );
      if (result) return sanitizeTranscription(result);
    } catch (err) {
      console.warn("[GRIOT STT] Groq Whisper falhou, tentando fallback:", err);
    }
  }

  // 2. Tenta Google Gemini Multimodal (Fidelidade máxima para português e termos complexos)
  const geminiApi = userApis.find((a) => a.providerId === "gemini" && a.apiKey);
  if (geminiApi) {
    try {
      const result = await transcribeWithGemini(
        audioBlob,
        geminiApi.apiKey,
        lang,
        context,
        options.signal,
      );
      if (result) return sanitizeTranscription(result);
    } catch (err) {
      console.warn("[GRIOT STT] Gemini Multimodal falhou, tentando fallback:", err);
    }
  }

  // 3. Tenta OpenAI Whisper
  const openaiApi = userApis.find((a) => a.providerId === "openai" && a.apiKey);
  if (openaiApi) {
    try {
      const result = await transcribeWithOpenAI(
        audioBlob,
        openaiApi.apiKey,
        lang,
        context,
        options.signal,
      );
      if (result) return sanitizeTranscription(result);
    } catch (err) {
      console.warn("[GRIOT STT] OpenAI Whisper falhou, tentando fallback:", err);
    }
  }

  // 4. Fallback para rota /api/stt interna caso exista servidor local / proxy
  try {
    const form = new FormData();
    const mime = audioBlob.type || "audio/webm";
    const ext = mime.includes("wav") ? "wav" : "webm";
    form.append("audio", audioBlob, `audio.${ext}`);
    form.append("mode", "final");
    if (context) form.append("prompt", context);

    const res = await fetch("/api/stt", {
      method: "POST",
      body: form,
      signal: options.signal,
    });
    if (res.ok) {
      const json = await res.json();
      if (json.text) return sanitizeTranscription(json.text);
    }
  } catch {
    // Servidor local ausente
  }

  return (options.fallbackText || "").trim();
}

/** Transcrição direta via Groq Whisper Large v3 */
async function transcribeWithGroq(
  audioBlob: Blob,
  apiKey: string,
  lang: SpeechLanguageInfo,
  context: string,
  signal?: AbortSignal,
): Promise<string> {
  const form = new FormData();
  const mime = audioBlob.type || "audio/webm";
  const ext = mime.includes("wav") ? "wav" : mime.includes("mp4") ? "mp4" : "webm";
  form.append("file", audioBlob, `speech.${ext}`);
  form.append("model", "whisper-large-v3");
  form.append("language", lang.code);
  form.append("temperature", "0");
  if (context) {
    form.append("prompt", `Conversa em ${lang.name}. Contexto: ${context}`);
  }

  const res = await fetch("https://api.groq.com/openai/v1/audio/transcriptions", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey.trim()}`,
    },
    body: form,
    signal,
  });

  if (!res.ok) {
    const errText = await res.text().catch(() => "");
    throw new Error(`Groq HTTP ${res.status}: ${errText}`);
  }

  const data = await res.json();
  return data.text || "";
}

/** Transcrição direta via Google Gemini Multimodal */
async function transcribeWithGemini(
  audioBlob: Blob,
  apiKey: string,
  lang: SpeechLanguageInfo,
  context: string,
  signal?: AbortSignal,
): Promise<string> {
  const base64Audio = await blobToBase64(audioBlob);
  let mimeType = (audioBlob.type || "audio/webm").split(";")[0].toLowerCase();
  if (!mimeType || mimeType === "application/octet-stream") {
    mimeType = "audio/wav";
  }

  const candidateModels = ["gemini-2.5-flash", "gemini-3.6-flash", "gemini-flash-latest"];

  for (const model of candidateModels) {
    try {
      const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey.trim()}`;
      const promptText = context
        ? `Transcreve este áudio com fidelidade fonética e ortográfica absoluta no idioma ${lang.name} (${lang.bcp47}). Contexto da conversa: ${context}. Responde exclusivamente com a fala transcrita, sem pontuações artificiais nem explicações adicionais.`
        : `Transcreve este áudio com fidelidade fonética e ortográfica absoluta no idioma ${lang.name} (${lang.bcp47}). Responde exclusivamente com a fala transcrita, sem introduções ou explicações.`;

      const body = {
        contents: [
          {
            parts: [
              {
                inlineData: {
                  mimeType,
                  data: base64Audio,
                },
              },
              {
                text: promptText,
              },
            ],
          },
        ],
        systemInstruction: {
          parts: [
            {
              text: `És o motor de Speech-to-Text de ultra-precisão do GRIOT. A tua tarefa é converter a voz em texto no idioma ${lang.name}. Devolve unicamente o texto falado. Se o áudio for silêncio, tosse ou ruído ambiente, devolve vazio.`,
            },
          ],
        },
        generationConfig: {
          temperature: 0,
          maxOutputTokens: 1024,
        },
      };

      const res = await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
        signal,
      });

      if (!res.ok) continue;

      const data = await res.json();
      const text = data?.candidates?.[0]?.content?.parts?.[0]?.text;
      if (text !== undefined) return text;
    } catch (err) {
      if ((err as Error).name === "AbortError") throw err;
    }
  }

  return "";
}

/** Transcrição direta via OpenAI Whisper */
async function transcribeWithOpenAI(
  audioBlob: Blob,
  apiKey: string,
  lang: SpeechLanguageInfo,
  context: string,
  signal?: AbortSignal,
): Promise<string> {
  const form = new FormData();
  const mime = audioBlob.type || "audio/webm";
  const ext = mime.includes("wav") ? "wav" : mime.includes("mp4") ? "mp4" : "webm";
  form.append("file", audioBlob, `audio.${ext}`);
  form.append("model", "whisper-1");
  form.append("language", lang.code);
  form.append("temperature", "0");
  if (context) {
    form.append("prompt", `Conversa em ${lang.name}. Contexto: ${context}`);
  }

  const res = await fetch("https://api.openai.com/v1/audio/transcriptions", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey.trim()}`,
    },
    body: form,
    signal,
  });

  if (!res.ok) {
    const errText = await res.text().catch(() => "");
    throw new Error(`OpenAI HTTP ${res.status}: ${errText}`);
  }

  const data = await res.json();
  return data.text || "";
}
