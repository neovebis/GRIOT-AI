export const APP_LANGUAGES = [
  { id: "en-US", label: "English (US)" },
  { id: "en-GB", label: "English (UK)" },
  { id: "pt-PT", label: "Português (Portugal)" },
  { id: "pt-BR", label: "Português (Brasil)" },
  { id: "es-ES", label: "Español (España)" },
  { id: "es-419", label: "Español (Latinoamérica)" },
  { id: "fr-FR", label: "Français" },
  { id: "de-DE", label: "Deutsch" },
  { id: "it-IT", label: "Italiano" },
  { id: "nl-NL", label: "Nederlands" },
  { id: "pl-PL", label: "Polski" },
  { id: "uk-UA", label: "Українська" },
  { id: "ru-RU", label: "Русский" },
  { id: "tr-TR", label: "Türkçe" },
  { id: "ar", label: "العربية" },
  { id: "hi-IN", label: "हिन्दी" },
  { id: "zh-Hans", label: "中文 — Simplificado" },
  { id: "zh-Hant", label: "中文 — Tradicional" },
  { id: "ja-JP", label: "日本語" },
  { id: "ko-KR", label: "한국어" },
  { id: "id-ID", label: "Bahasa Indonesia" },
  { id: "vi-VN", label: "Tiếng Việt" },
  { id: "th-TH", label: "ไทย" },
  { id: "sw", label: "Kiswahili" },
  { id: "sv-SE", label: "Svenska" },
  { id: "nb-NO", label: "Norsk" },
  { id: "da-DK", label: "Dansk" },
  { id: "fi-FI", label: "Suomi" },
  { id: "cs-CZ", label: "Čeština" },
  { id: "ro-RO", label: "Română" },
  { id: "he-IL", label: "עברית" },
  { id: "ms-MY", label: "Bahasa Melayu" },
] as const;

export const NOTIFICATION_TYPES = [
  { id: "taskDone", label: "Tarefas concluídas" },
  { id: "approval", label: "Agentes que precisam de aprovação" },
  { id: "buildFailed", label: "Build falhou" },
  { id: "deployDone", label: "Deploy concluído" },
  { id: "projectError", label: "Projeto com erro" },
  { id: "longAnswer", label: "Resposta longa concluída" },
  { id: "nearLimit", label: "Uso próximo do limite" },
  { id: "criticalOnly", label: "Alertas críticos apenas" },
  { id: "quietHours", label: "Horário silencioso" },
] as const;

export const CONNECTIONS = [
  "GitHub",
  "Drive",
  "Gmail",
  "Calendar",
  "Vercel",
  "Cloudflare",
  "Backend GRIOT",
] as const;

export type Prefs = Record<string, string | boolean>;

const KEY = "griot-settings";

export const DEFAULT_PREFS: Prefs = {
  // Quick Chat & Modelos
  saveHistory: true,
  qualityMode: "Equilíbrio",
  // Voz & Áudio
  voice: "GRIOT Nativa (Português)",
  voiceSpeed: "1.0×",
  voiceLanguage: "Português (Portugal)",
  autoSpeak: false,
  allowInterrupt: true,
  // Notificações reais
  "notify:taskDone": true,
  "notify:approval": true,
  "notify:buildFailed": true,
  "notify:deployDone": true,
  "notify:projectError": true,
  // Permissões reais
  permCamera: true,
  permMic: true,
  permLocation: false,
  biometrics: true,
  // Aparência & Estilo reais
  appearance: "Sistema",
  textSize: "Padrão",
  reduceMotion: false,
  haptics: true,
  // Idioma
  appLanguage: "Português (Portugal)",
  answerLanguage: "Automático",
  // Sistema
  developerMode: false,
};

export function loadPrefs(): Prefs {
  try {
    const raw = window.localStorage.getItem(KEY);
    return { ...DEFAULT_PREFS, ...(raw ? (JSON.parse(raw) as Prefs) : {}) };
  } catch {
    return { ...DEFAULT_PREFS };
  }
}

export function savePrefs(prefs: Prefs) {
  if (typeof window !== "undefined") {
    window.localStorage.setItem(KEY, JSON.stringify(prefs));
    window.dispatchEvent(new CustomEvent("griot:prefs-changed", { detail: prefs }));
    window.dispatchEvent(new Event("storage"));
  }
}

/** Apps de Chat de IA Mobile suportados pelo GRIOT Observer. */
export const AI_CHAT_APPS = [
  { id: "chatgpt", label: "ChatGPT", short: "GPT", vendor: "OpenAI" },
  { id: "claude", label: "Claude", short: "CL", vendor: "Anthropic" },
  { id: "gemini", label: "Gemini", short: "GE", vendor: "Google" },
  { id: "deepseek", label: "DeepSeek", short: "DS", vendor: "DeepSeek" },
  { id: "kimi", label: "Kimi", short: "KM", vendor: "Moonshot AI" },
  { id: "grok", label: "Grok", short: "GR", vendor: "xAI" },
  { id: "perplexity", label: "Perplexity", short: "PX", vendor: "Perplexity" },
  { id: "mistral", label: "Le Chat", short: "LC", vendor: "Mistral AI" },
] as const;

export const ACP_CLIENTS = AI_CHAT_APPS;

export type AiChatAppId = (typeof AI_CHAT_APPS)[number]["id"];
export type AcpClientId = AiChatAppId;
