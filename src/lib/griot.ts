import { getUserSavedApis } from "@/lib/user-apis";

export type ModelOption = {
  id: string;
  label: string;
  hint: string;
  isApp?: boolean;
  vendor?: string;
};

export const BASE_MODEL_ID = "base";
export const SHEOL_MODEL_ID = "sheol";
export const MODEL_OS_ID = "modelos";

export function isBaseModel(id?: string): boolean {
  if (!id) return false;
  const lower = id.toLowerCase();
  return (
    lower === "base" ||
    lower === "modelgpu" ||
    lower === "modelgpu-base" ||
    lower.includes("modelgpu")
  );
}

export function isSheolModel(id?: string): boolean {
  if (!id) return false;
  const lower = id.toLowerCase();
  return (
    lower === "sheol" ||
    lower === "griotgpu" ||
    lower === "griotgpu-v2" ||
    lower.includes("griotgpu")
  );
}

export function isGpuModel(id?: string): boolean {
  return isBaseModel(id) || isSheolModel(id);
}

// Não há modelos de exemplo hardcoded — apenas as APIs reais adicionadas pelo utilizador
export const BASE_CHAT_MODELS: ModelOption[] = [];
export const QUICK_CHAT_MODELS: ModelOption[] = [];

// Engine e provider/model são estados separados. O modelo default é a primeira API real ligada.
export function getDefaultModel(): string {
  return getUserSavedApis()[0]?.id || "";
}

export const DEFAULT_MODEL = getDefaultModel();

// Mantida por compatibilidade com a lógica de logo/etiqueta na UI (ex.: chat-surface.tsx)
export function isModelOS(id?: string): boolean {
  if (!id) return false;
  return (
    isGpuModel(id) ||
    id === "modelos" ||
    id === "model-os" ||
    id === "ModelOS" ||
    id.toLowerCase().includes("modelos")
  );
}

export function getAvailableModels(_prefs?: Record<string, unknown>): ModelOption[] {
  const options: ModelOption[] = [];
  const userApis = getUserSavedApis();
  for (const api of userApis) {
    options.push({
      id: api.id,
      label: api.label,
      hint: `${api.providerId.toUpperCase()} · API Conectada`,
      vendor: api.providerId,
    });
  }
  return options;
}

export function modelLabel(id: string) {
  if (!id) return "Selecionar API";
  if (isBaseModel(id)) return "BASE";
  if (isSheolModel(id)) return "SHEOL";
  if (isModelOS(id)) return "ModelOS";

  const userApis = getUserSavedApis();
  const match = userApis.find((a) => a.id === id);
  if (match) return match.label;

  if (id.includes("gemini")) return "Google Gemini";
  if (id.includes("gpt")) return "OpenAI GPT";
  if (id.includes("claude")) return "Anthropic Claude";
  if (id.includes("deepseek")) return "DeepSeek";
  if (id.includes("groq")) return "Groq Llama";
  if (id.includes("zhipu") || id.includes("glm")) return "GLM / Zhipu AI";
  if (id.includes("xiaomi") || id.includes("mimo")) return "Xiaomi MiMo";
  if (id.includes("bedrock") || id.includes("titan") || id.includes("nova")) return "Amazon Bedrock";
  if (id.includes("azure")) return "Azure OpenAI";
  if (id.includes("cohere")) return "Cohere";
  if (id.includes("together")) return "Together AI";
  if (id.includes("replicate")) return "Replicate";
  if (id.includes("fireworks")) return "Fireworks AI";
  if (id.includes("lmstudio") || id.includes("lm-studio")) return "LM Studio";
  if (id.includes("localai") || id.includes("local-ai")) return "LocalAI";
  if (id.includes("ollama")) return "Ollama Local";
  if (id.includes("mistral")) return "Mistral AI";
  if (id.includes("grok") || id.includes("xai")) return "xAI Grok";
  if (id.includes("perplexity") || id.includes("sonar")) return "Perplexity";
  if (id.includes("kimi") || id.includes("moonshot")) return "Moonshot Kimi";
  if (id.includes("qwen")) return "Alibaba Qwen";

  return id;
}

export const CAPTURE_KINDS = [
  { id: "photo", label: "Foto" },
  { id: "video", label: "Vídeo" },
  { id: "gallery", label: "Galeria" },
  { id: "document", label: "Documento" },
  { id: "audio", label: "Áudio" },
  { id: "screen", label: "Ecrã" },
  { id: "text", label: "Texto" },
  { id: "location", label: "Localização" },
] as const;

export type CaptureKind = (typeof CAPTURE_KINDS)[number]["id"];

export function greeting(date = new Date()) {
  const hour = date.getHours();
  if (hour < 6) return "Boa noite";
  if (hour < 13) return "Bom dia";
  if (hour < 20) return "Boa tarde";
  return "Boa noite";
}

export function relativeTime(iso: string) {
  const diff = Date.now() - new Date(iso).getTime();
  const minutes = Math.round(diff / 60000);
  if (minutes < 1) return "agora mesmo";
  if (minutes < 60) return `há ${minutes} min`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return `há ${hours} h`;
  const days = Math.round(hours / 24);
  return `há ${days} d`;
}
