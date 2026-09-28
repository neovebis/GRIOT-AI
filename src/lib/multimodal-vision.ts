/**
 * GRIOT Multimodal Vision Engine
 *
 * Motor de processamento e normalização multimodal para modelos de Inteligência Artificial.
 * Extrai, descarrega, comprime e estrutura imagens de mensagens (fotos da câmara, capturas,
 * uploads da galeria e capturas de ecrã) em payloads nativos de visão para:
 * - Google Gemini (inlineData com MIME e Base64)
 * - OpenAI / OpenRouter / Grok (image_url com DataURL)
 * - Anthropic Claude (source base64 com media_type)
 */

import { getStoredCapture } from "./capture-service";

export interface ExtractedImagePart {
  mimeType: string;
  base64: string;
  dataUrl: string;
  alt?: string;
}

export interface MultimodalExtractionResult {
  cleanText: string;
  images: ExtractedImagePart[];
}

// Cache em memória para evitar reprocessamento/re-download de imagens entre turnos de conversa
const imageCache = new Map<string, ExtractedImagePart>();

/** Converte um Blob em Base64 puro */
export async function blobToBase64(blob: Blob): Promise<string> {
  const buffer = await blob.arrayBuffer();
  const bytes = new Uint8Array(buffer);
  let binary = "";
  const len = bytes.byteLength;
  const chunkSize = 8192;
  for (let i = 0; i < len; i += chunkSize) {
    const chunk = bytes.subarray(i, Math.min(i + chunkSize, len));
    binary += String.fromCharCode.apply(null, chunk as unknown as number[]);
  }
  return btoa(binary);
}

/**
 * Redimensiona e comprime uma imagem para visão computacional ideal no cliente.
 * Limita a dimensão máxima (largura/altura) a 1600px e converte para JPEG com qualidade 0.85,
 * reduzindo ficheiros de 10MB para ~200-400KB sem perda de nitidez para OCR e raciocínio.
 */
export async function compressImageForVision(
  blob: Blob,
  maxDim = 1600,
  quality = 0.85,
): Promise<{ mimeType: string; base64: string; dataUrl: string }> {
  // Se estivermos em ambiente SSR / Node, recorre diretamente ao base64 bruto
  if (typeof window === "undefined" || typeof document === "undefined") {
    const rawBase64 = await blobToBase64(blob);
    const mime = blob.type || "image/jpeg";
    return {
      mimeType: mime,
      base64: rawBase64,
      dataUrl: `data:${mime};base64,${rawBase64}`,
    };
  }

  return new Promise((resolve) => {
    try {
      const url = URL.createObjectURL(blob);
      const img = new Image();

      img.onload = () => {
        try {
          URL.revokeObjectURL(url);
          let width = img.naturalWidth || img.width;
          let height = img.naturalHeight || img.height;

          // Se a imagem já for pequena e leve, usa o original
          if (width <= maxDim && height <= maxDim && blob.size < 800000) {
            void blobToBase64(blob).then((b64) => {
              const mime = blob.type || "image/jpeg";
              resolve({
                mimeType: mime,
                base64: b64,
                dataUrl: `data:${mime};base64,${b64}`,
              });
            });
            return;
          }

          if (width > maxDim || height > maxDim) {
            if (width > height) {
              height = Math.round((height * maxDim) / width);
              width = maxDim;
            } else {
              width = Math.round((width * maxDim) / height);
              height = maxDim;
            }
          }

          const canvas = document.createElement("canvas");
          canvas.width = width;
          canvas.height = height;
          const ctx = canvas.getContext("2d");

          if (!ctx) {
            throw new Error("Não foi possível obter o contexto 2D do Canvas");
          }

          ctx.drawImage(img, 0, 0, width, height);
          const dataUrl = canvas.toDataURL("image/jpeg", quality);
          const base64 = dataUrl.split(",")[1] || "";

          resolve({
            mimeType: "image/jpeg",
            base64,
            dataUrl,
          });
        } catch {
          // Fallback seguro em caso de falha de renderização
          void blobToBase64(blob).then((b64) => {
            const mime = blob.type || "image/jpeg";
            resolve({
              mimeType: mime,
              base64: b64,
              dataUrl: `data:${mime};base64,${b64}`,
            });
          });
        }
      };

      img.onerror = () => {
        URL.revokeObjectURL(url);
        void blobToBase64(blob).then((b64) => {
          const mime = blob.type || "image/jpeg";
          resolve({
            mimeType: mime,
            base64: b64,
            dataUrl: `data:${mime};base64,${b64}`,
          });
        });
      };

      img.src = url;
    } catch {
      void blobToBase64(blob).then((b64) => {
        const mime = blob.type || "image/jpeg";
        resolve({
          mimeType: mime,
          base64: b64,
          dataUrl: `data:${mime};base64,${b64}`,
        });
      });
    }
  });
}

/**
 * Resolve qualquer referência de imagem (DataURL, local://, blob:, https://)
 * para uma representação uniforme com Base64 e MIME type.
 */
export async function resolveImageToData(imageRef: string): Promise<ExtractedImagePart | null> {
  const trimmed = (imageRef || "").trim();
  if (!trimmed) return null;

  if (imageCache.has(trimmed)) {
    return imageCache.get(trimmed)!;
  }

  try {
    // 1. Data URLs diretos (data:image/...)
    if (trimmed.startsWith("data:image/")) {
      const match = trimmed.match(/^data:(image\/[a-zA-Z0-9.+_-]+);base64,(.+)$/);
      if (match && match[1] && match[2]) {
        const part: ExtractedImagePart = {
          mimeType: match[1],
          base64: match[2],
          dataUrl: trimmed,
        };
        imageCache.set(trimmed, part);
        return part;
      }
    }

    // 2. Registos locais persistidos no IndexedDB (local://<id>)
    if (trimmed.startsWith("local://")) {
      const captureId = trimmed.replace("local://", "").trim();
      const stored = await getStoredCapture(captureId);
      if (stored) {
        if (stored.blob) {
          const comp = await compressImageForVision(stored.blob);
          imageCache.set(trimmed, comp);
          return comp;
        }
        if (stored.data_url) {
          return resolveImageToData(stored.data_url);
        }
      }
    }

    // 3. Blob URLs ou URLs HTTP/HTTPS (Supabase Storage, CDN ou links públicos)
    if (
      trimmed.startsWith("blob:") ||
      trimmed.startsWith("http://") ||
      trimmed.startsWith("https://")
    ) {
      const res = await fetch(trimmed, { mode: "cors" });
      if (!res.ok) {
        console.warn(`[GRIOT Vision] Falha ao descarregar imagem (${res.status}): ${trimmed}`);
        return null;
      }
      const blob = await res.blob();
      if (!blob.type.startsWith("image/") && !blob.type.includes("octet-stream")) {
        console.warn(`[GRIOT Vision] Ficheiro não é imagem: ${blob.type}`);
        return null;
      }
      const comp = await compressImageForVision(blob);
      imageCache.set(trimmed, comp);
      return comp;
    }
  } catch (err) {
    console.warn("[GRIOT Vision] Erro ao resolver imagem:", trimmed, err);
  }

  return null;
}

/**
 * Extrai todas as referências de imagem contidas numa string de mensagem
 * (Markdown `![alt](url)`, URLs diretos ou Base64) e devolve o texto limpo + imagens estruturadas.
 */
export async function extractImagesFromMessage(
  text: string,
): Promise<MultimodalExtractionResult> {
  if (!text || typeof text !== "string") {
    return { cleanText: "", images: [] };
  }

  const images: ExtractedImagePart[] = [];
  let workingText = text;

  // Regex para Markdown image: ![alt](url)
  const mdRegex = /!\[([^\]]*)\]\(([^)]+)\)/g;
  let match: RegExpExecArray | null;
  const replacements: Array<{ original: string; replacement: string }> = [];

  while ((match = mdRegex.exec(text)) !== null) {
    const originalTag = match[0];
    const alt = match[1] || "imagem";
    const src = match[2];

    const resolved = await resolveImageToData(src);
    if (resolved) {
      images.push({ ...resolved, alt });
      replacements.push({
        original: originalTag,
        replacement: `[Imagem anexada: ${alt}]`,
      });
    }
  }

  for (const rep of replacements) {
    workingText = workingText.replace(rep.original, rep.replacement);
  }

  // Regex para Data URLs soltos não capturados por markdown
  const standaloneDataUrlRegex = /(data:image\/[a-zA-Z0-9.+_-]+;base64,[A-Za-z0-9+/=]{100,})/g;
  workingText = workingText.replace(standaloneDataUrlRegex, (dataUrl) => {
    const match = dataUrl.match(/^data:(image\/[a-zA-Z0-9.+_-]+);base64,(.+)$/);
    if (match && match[1] && match[2]) {
      images.push({
        mimeType: match[1],
        base64: match[2],
        dataUrl,
        alt: "imagem",
      });
      return "[Imagem anexada]";
    }
    return dataUrl;
  });

  return {
    cleanText: workingText.trim(),
    images,
  };
}

/**
 * Prepara partes multimodais estruturadas para a API Google Gemini REST
 */
export async function prepareMultimodalGeminiParts(
  text: string,
): Promise<Array<{ text: string } | { inlineData: { mimeType: string; data: string } }>> {
  const { cleanText, images } = await extractImagesFromMessage(text);
  const parts: Array<{ text: string } | { inlineData: { mimeType: string; data: string } }> = [];

  if (cleanText) {
    parts.push({ text: cleanText });
  }

  for (const img of images) {
    parts.push({
      inlineData: {
        mimeType: img.mimeType,
        data: img.base64,
      },
    });
  }

  if (parts.length === 0) {
    parts.push({ text: "" });
  }

  return parts;
}

/**
 * Prepara o conteúdo da mensagem para a API OpenAI / OpenRouter / Grok.
 * Se houver imagens, devolve array [{ type: "text" }, { type: "image_url" }].
 * Se não houver imagens, devolve string simples para compatibilidade total.
 */
export async function prepareMultimodalOpenAIContent(
  text: string,
): Promise<string | Array<{ type: "text"; text: string } | { type: "image_url"; image_url: { url: string } }>> {
  const { cleanText, images } = await extractImagesFromMessage(text);

  if (images.length === 0) {
    return cleanText || text;
  }

  const content: Array<
    | { type: "text"; text: string }
    | { type: "image_url"; image_url: { url: string } }
  > = [];

  if (cleanText) {
    content.push({ type: "text", text: cleanText });
  }

  for (const img of images) {
    content.push({
      type: "image_url",
      image_url: {
        url: img.dataUrl,
      },
    });
  }

  return content;
}

/**
 * Prepara o conteúdo da mensagem para a API Anthropic Claude.
 * Se houver imagens, devolve array [{ type: "text" }, { type: "image" }].
 * Se não houver imagens, devolve string simples.
 */
export async function prepareMultimodalAnthropicContent(
  text: string,
): Promise<
  | string
  | Array<
      | { type: "text"; text: string }
      | { type: "image"; source: { type: "base64"; media_type: string; data: string } }
    >
> {
  const { cleanText, images } = await extractImagesFromMessage(text);

  if (images.length === 0) {
    return cleanText || text;
  }

  const content: Array<
    | { type: "text"; text: string }
    | { type: "image"; source: { type: "base64"; media_type: string; data: string } }
  > = [];

  if (cleanText) {
    content.push({ type: "text", text: cleanText });
  }

  for (const img of images) {
    content.push({
      type: "image",
      source: {
        type: "base64",
        media_type: img.mimeType,
        data: img.base64,
      },
    });
  }

  return content;
}
