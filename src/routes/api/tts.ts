import { createFileRoute } from "@tanstack/react-router";
import https from "node:https";
import { authenticateApiRequest, unauthorizedApiResponse } from "@/lib/api-auth";
import { checkRateLimit, SECURITY_HEADERS } from "@/lib/security-headers";

function splitText(text: string, maxLen = 180): string[] {
  const parts: string[] = [];
  const sentences = text.match(/[^.!?;\n]+[.!?;\n]+|[^.!?;\n]+/g) || [text];
  let cur = "";
  for (const s of sentences) {
    if ((cur + " " + s).trim().length <= maxLen) {
      cur = (cur + " " + s).trim();
    } else {
      if (cur) parts.push(cur);
      if (s.length <= maxLen) {
        cur = s.trim();
      } else {
        const words = s.split(" ");
        let sub = "";
        for (const w of words) {
          if ((sub + " " + w).trim().length <= maxLen) {
            sub = (sub + " " + w).trim();
          } else {
            if (sub) parts.push(sub);
            sub = w;
          }
        }
        cur = sub.trim();
      }
    }
  }
  if (cur) parts.push(cur);
  return parts;
}

function fetchGoogleTtsChunk(text: string, lang = "pt-PT"): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const url = `https://translate.google.com/translate_tts?ie=UTF-8&q=${encodeURIComponent(text)}&tl=${lang}&client=tw-ob`;
    https
      .get(
        url,
        {
          headers: {
            "User-Agent":
              "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36",
            Accept: "audio/mpeg, audio/*;q=0.9",
          },
        },
        (res) => {
          if (res.statusCode !== 200) {
            return reject(new Error(`TTS responded with status ${res.statusCode}`));
          }
          const chunks: Buffer[] = [];
          res.on("data", (c) => chunks.push(c));
          res.on("end", () => resolve(Buffer.concat(chunks)));
        },
      )
      .on("error", reject);
  });
}

async function synthesizeWithOpenAI(
  text: string,
  voice = "alloy",
  speed = 1.0,
): Promise<Buffer | null> {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) return null;
  try {
    const res = await fetch("https://api.openai.com/v1/audio/speech", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey.trim()}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "tts-1",
        voice: ["alloy", "echo", "fable", "onyx", "nova", "shimmer"].includes(voice.toLowerCase())
          ? voice.toLowerCase()
          : "alloy",
        input: text,
        speed: Math.max(0.75, Math.min(1.3, speed)),
      }),
    });
    if (res.ok) {
      const arr = await res.arrayBuffer();
      return Buffer.from(arr);
    }
  } catch (e) {
    console.warn("[GRIOT TTS] OpenAI TTS falhou:", e);
  }
  return null;
}

async function synthesizeWithElevenLabs(
  text: string,
  voiceId = "21m00Tcm4TlvDq8ikWAM",
): Promise<Buffer | null> {
  const apiKey = process.env.ELEVENLABS_API_KEY;
  if (!apiKey) return null;
  try {
    const res = await fetch(`https://api.elevenlabs.io/v1/text-to-speech/${voiceId}`, {
      method: "POST",
      headers: {
        "xi-api-key": apiKey.trim(),
        "Content-Type": "application/json",
        Accept: "audio/mpeg",
      },
      body: JSON.stringify({
        text,
        model_id: "eleven_multilingual_v2",
        voice_settings: { stability: 0.5, similarity_boost: 0.75 },
      }),
    });
    if (res.ok) {
      const arr = await res.arrayBuffer();
      return Buffer.from(arr);
    }
  } catch (e) {
    console.warn("[GRIOT TTS] ElevenLabs TTS falhou:", e);
  }
  return null;
}

async function synthesizeNeuralSpeech(
  text: string,
  lang = "pt-PT",
  voice = "alloy",
  speed = 1.0,
): Promise<Buffer> {
  // 1. Tenta OpenAI TTS se configurado no servidor
  const openaiAudio = await synthesizeWithOpenAI(text, voice, speed);
  if (openaiAudio && openaiAudio.length > 0) return openaiAudio;

  // 2. Tenta ElevenLabs se configurado no servidor
  const elevenAudio = await synthesizeWithElevenLabs(text);
  if (elevenAudio && elevenAudio.length > 0) return elevenAudio;

  // 3. Fallback de síntese com chunking inteligente
  const parts = splitText(text);
  if (parts.length === 0) return Buffer.alloc(0);
  const buffers = await Promise.all(parts.map((p) => fetchGoogleTtsChunk(p, lang)));
  return Buffer.concat(buffers);
}

/** Voz de síntese neural real para o modo de voz do GRIOT. */
export const Route = createFileRoute("/api/tts")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const clientIp = request.headers.get("x-forwarded-for") || "127.0.0.1";
        const rateLimit = checkRateLimit(clientIp, 60, 60000);
        if (!rateLimit.allowed) {
          return new Response(
            JSON.stringify({ error: "Demasiados pedidos. Tenta novamente mais tarde." }),
            { status: 429, headers: { "Content-Type": "application/json", ...SECURITY_HEADERS } },
          );
        }

        const authUser = await authenticateApiRequest(request);
        if (!authUser) {
          return unauthorizedApiResponse();
        }

        try {
          const body = (await request.json().catch(() => ({}))) as {
            text?: string;
            voice?: string;
            speed?: number;
            lang?: string;
            stream?: boolean;
            tone?: string;
            warmup?: boolean;
          };

          // Pré-aquecimento do canal de saída
          if (body.warmup) {
            return new Response(null, { status: 204 });
          }

          const rawText = (body.text ?? "").slice(0, 4000).trim();
          if (!rawText) return new Response("Sem texto", { status: 400 });

          // Resolução inteligente de idioma
          let lang = "pt-PT";
          const lowerLang = (body.lang || "").toLowerCase();
          const lowerVoice = (body.voice || "").toLowerCase();

          if (
            lowerVoice.includes("brasil") ||
            lowerVoice.includes("brazil") ||
            lowerLang.includes("br")
          ) {
            lang = "pt-BR";
          } else if (lowerLang.includes("en") || lowerVoice.includes("english")) {
            lang = "en";
          } else if (lowerLang.includes("es") || lowerVoice.includes("espan")) {
            lang = "es";
          } else if (lowerLang.includes("fr")) {
            lang = "fr";
          } else if (lowerLang.includes("de")) {
            lang = "de";
          } else {
            lang = "pt-PT";
          }

          const audioBuffer = await synthesizeNeuralSpeech(rawText, lang, body.voice, body.speed);
          if (audioBuffer.length === 0) {
            return new Response("Erro de síntese neural", { status: 502 });
          }

          return new Response(new Uint8Array(audioBuffer), {
            status: 200,
            headers: {
              "Content-Type": "audio/mpeg",
              "Content-Length": String(audioBuffer.length),
              "Cache-Control": "public, max-age=3600",
            },
          });
        } catch (error) {
          if (request.signal.aborted || (error as Error).name === "AbortError") {
            return new Response(null, { status: 499 });
          }
          console.error("[TTS Server Error]:", error);
          return new Response("Indisponível", { status: 500 });
        }
      },
    },
  },
});
