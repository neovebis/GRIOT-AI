import { useState } from "react";
import { useT } from "@/lib/i18n";
import { Sparkles, ExternalLink, X, Loader2, Check } from "lucide-react";
import { saveGriotCredential, verifyGriotCredential } from "@/lib/griot-api";
import { saveUserApi, type UserSavedApi } from "@/lib/user-apis";
import { toast } from "sonner";
import { getAiLogo } from "@/components/griot/brand-icons";

export const PROVIDER_INFO: Record<
  string,
  {
    label: string;
    short: string;
    vendor: string;
    hint: string;
    docUrl: string;
    placeholder: string;
  }
> = {
  gemini: {
    label: "Google Gemini",
    short: "GE",
    vendor: "Google AI Studio",
    hint: "Multimodal & 2.5 Flash",
    docUrl: "https://aistudio.google.com/apikey",
    placeholder: "AIzaSy...",
  },
  openai: {
    label: "OpenAI",
    short: "OA",
    vendor: "OpenAI",
    hint: "GPT-4o & Raciocínio",
    docUrl: "https://platform.openai.com/api-keys",
    placeholder: "sk-proj-...",
  },
  anthropic: {
    label: "Anthropic Claude",
    short: "CL",
    vendor: "Anthropic",
    hint: "Claude 3.5 Sonnet",
    docUrl: "https://console.anthropic.com/settings/keys",
    placeholder: "sk-ant-...",
  },
  deepseek: {
    label: "DeepSeek",
    short: "DS",
    vendor: "DeepSeek",
    hint: "DeepSeek V3 / R1",
    docUrl: "https://platform.deepseek.com/api_keys",
    placeholder: "sk-...",
  },
  groq: {
    label: "Groq",
    short: "GQ",
    vendor: "Groq Cloud",
    hint: "Llama 3.3 Ultra-rápido",
    docUrl: "https://console.groq.com/keys",
    placeholder: "gsk_...",
  },
  elevenlabs: {
    label: "ElevenLabs Voz",
    short: "11",
    vendor: "ElevenLabs AI",
    hint: "TTS Neural Ultra-Realista",
    docUrl: "https://elevenlabs.io/app/speech-synthesis",
    placeholder: "sk_...",
  },
  openrouter: {
    label: "OpenRouter",
    short: "OR",
    vendor: "OpenRouter",
    hint: "Roteador Universal",
    docUrl: "https://openrouter.ai/keys",
    placeholder: "sk-or-...",
  },
  grok: {
    label: "xAI Grok",
    short: "GK",
    vendor: "xAI",
    hint: "Grok 2 / Grok 3",
    docUrl: "https://console.x.ai",
    placeholder: "xai-...",
  },
  perplexity: {
    label: "Perplexity",
    short: "PX",
    vendor: "Perplexity AI",
    hint: "Sonar & Busca Online",
    docUrl: "https://www.perplexity.ai/settings/api",
    placeholder: "pplx-...",
  },
  kimi: {
    label: "Moonshot Kimi",
    short: "KM",
    vendor: "Moonshot AI",
    hint: "Contexto Longo Kimi",
    docUrl: "https://platform.moonshot.cn",
    placeholder: "sk-...",
  },
  qwen: {
    label: "Alibaba Qwen",
    short: "QW",
    vendor: "Alibaba Cloud",
    hint: "Qwen 2.5 Max / Plus",
    docUrl: "https://dashscope.console.aliyun.com",
    placeholder: "sk-...",
  },
  ollama: {
    label: "Ollama Local",
    short: "OL",
    vendor: "Ollama",
    hint: "Modelos Locais & Offline",
    docUrl: "https://ollama.com",
    placeholder: "http://localhost:11434",
  },
  mistral: {
    label: "Mistral AI",
    short: "MS",
    vendor: "Mistral",
    hint: "Mistral Large & Codestral",
    docUrl: "https://console.mistral.ai",
    placeholder: "mis_...",
  },
  meta: {
    label: "Meta Llama",
    short: "MT",
    vendor: "Meta AI",
    hint: "Llama 3.3 Open-Source",
    docUrl: "https://llama.meta.com",
    placeholder: "Chave ou endpoint Llama...",
  },
  manus: {
    label: "Manus AI",
    short: "MN",
    vendor: "Manus",
    hint: "Agente Autónomo Geral",
    docUrl: "https://manus.im",
    placeholder: "mns_...",
  },
  zhipu: {
    label: "GLM / Zhipu AI",
    short: "ZM",
    vendor: "Zhipu AI / Z.ai",
    hint: "GLM-4 & GLM-4V Multimodal",
    docUrl: "https://open.bigmodel.cn",
    placeholder: "Chave de API Zhipu/GLM (ex: id.secret)...",
  },
  xiaomi: {
    label: "Xiaomi MiMo",
    short: "XM",
    vendor: "Xiaomi AI",
    hint: "MiMo-V2 & Modelos Xiaomi",
    docUrl: "https://ai.mi.com",
    placeholder: "Chave de API MiMo (mimo_...)",
  },
  bedrock: {
    label: "Amazon Bedrock",
    short: "AW",
    vendor: "AWS Cloud",
    hint: "AWS Titan & Nova",
    docUrl: "https://aws.amazon.com/bedrock",
    placeholder: "Chave / Bearer token AWS...",
  },
  azure: {
    label: "Azure OpenAI",
    short: "AZ",
    vendor: "Microsoft Azure",
    hint: "Endpoint & Chave Azure",
    docUrl: "https://portal.azure.com",
    placeholder: "Chave ou endpoint https://...",
  },
  cohere: {
    label: "Cohere",
    short: "CO",
    vendor: "Cohere AI",
    hint: "Command R+ & Embeddings",
    docUrl: "https://dashboard.cohere.com/api-keys",
    placeholder: "Chave de API Cohere...",
  },
  together: {
    label: "Together AI",
    short: "TG",
    vendor: "Together AI",
    hint: "Llama 3.3 & DeepSeek R1",
    docUrl: "https://api.together.ai/settings/api-keys",
    placeholder: "Chave Together AI...",
  },
  replicate: {
    label: "Replicate",
    short: "RP",
    vendor: "Replicate",
    hint: "Modelos Open-Source em Nuvem",
    docUrl: "https://replicate.com/account/api-tokens",
    placeholder: "r8_...",
  },
  fireworks: {
    label: "Fireworks AI",
    short: "FW",
    vendor: "Fireworks AI",
    hint: "Inferência Ultra-Rápida",
    docUrl: "https://fireworks.ai/api-keys",
    placeholder: "fw_...",
  },
  lmstudio: {
    label: "LM Studio",
    short: "LM",
    vendor: "LM Studio Local",
    hint: "Servidor Local OpenAI-compatível",
    docUrl: "https://lmstudio.ai",
    placeholder: "http://localhost:1234/v1",
  },
  localai: {
    label: "LocalAI",
    short: "LA",
    vendor: "LocalAI Community",
    hint: "Instância Local & Self-Hosted",
    docUrl: "https://localai.io",
    placeholder: "http://localhost:8080/v1",
  },
};

export interface AddApiModalProps {
  open: boolean;
  onClose: () => void;
  onSuccess?: (newApi: UserSavedApi) => void;
}

export function AddApiModal({ open, onClose, onSuccess }: AddApiModalProps) {
  const t = useT();
  const [selectedProvider, setSelectedProvider] = useState<string>("gemini");
  const [apiKeyInput, setApiKeyInput] = useState("");
  const [apiLabelInput, setApiLabelInput] = useState("");
  const [modelInput, setModelInput] = useState<string>("openrouter/auto");
  const [customModelInput, setCustomModelInput] = useState<string>("");
  const [submitting, setSubmitting] = useState(false);

  if (!open) return null;

  async function handleSaveApi() {
    const secret = apiKeyInput.trim();
    if (!secret) {
      toast.error(t("Insere uma chave de API válida."));
      return;
    }

    setSubmitting(true);
    try {
      const pInfo = PROVIDER_INFO[selectedProvider];
      const customLabel = apiLabelInput.trim() || undefined;

      let finalModel: string | undefined = undefined;
      if (selectedProvider === "openrouter") {
        finalModel =
          modelInput === "custom"
            ? customModelInput.trim() || "openrouter/auto"
            : modelInput || "openrouter/auto";
      }

      // 1. Guarda na camada estruturada do utilizador (suporta ilimitadas chaves do mesmo provedor)
      const savedUserApi = await saveUserApi({
        providerId: selectedProvider,
        apiKey: secret,
        label: customLabel,
        model: finalModel,
      });

      // 2. Guarda também nas credenciais da conta do workspace
      try {
        const saved = await saveGriotCredential({
          providerId: selectedProvider,
          secret,
          label: customLabel || pInfo?.label || selectedProvider,
          model: finalModel,
        });

        if (saved.data?.credential?.id) {
          void verifyGriotCredential(saved.data.credential.id).catch(() => {});
        }
      } catch {
        // Modo offline / sem workspace
      }

      toast.success(t(`${savedUserApi.label} ligada com sucesso!`));

      setApiKeyInput("");
      setApiLabelInput("");
      onClose();
      onSuccess?.(savedUserApi);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      toast.error(msg || t("Não foi possível ligar a API."));
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/60 backdrop-blur-sm p-4 animate-in fade-in duration-200"
      onClick={onClose}
    >
      <div
        className="w-full max-w-md max-h-[90vh] overflow-y-auto rounded-3xl border border-hairline bg-surface p-5 shadow-2xl backdrop-blur-2xl animate-in slide-in-from-bottom-4 duration-200 no-scrollbar"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <span className="grid size-8 place-items-center rounded-full bg-secondary text-primary">
              <Sparkles className="size-4" />
            </span>
            <div>
              <h3 className="text-[16px] font-semibold leading-tight">{t("Ligar API de IA")}</h3>
              <p className="text-[12px] text-muted-foreground mt-0.5">
                {t("Chave direta de orquestração")}
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="grid size-8 place-items-center rounded-full text-muted-foreground hover:bg-secondary transition-colors"
          >
            <X className="size-4" />
          </button>
        </div>

        {/* Seletor de Provedor em Pills */}
        <div className="mt-4">
          <p className="text-[11px] font-medium tracking-wide text-muted-foreground uppercase">
            {t("Provedor")}
          </p>
          <div className="mt-2 grid grid-cols-3 gap-2 max-h-[240px] sm:max-h-[270px] overflow-y-auto pr-0.5 no-scrollbar">
            {Object.entries(PROVIDER_INFO).map(([pid, p]) => {
              const Logo = getAiLogo(pid);
              const labelWords = p.label.split(" ");
              const displayLabel =
                pid === "zhipu"
                  ? "GLM / Z.ai"
                  : pid === "xiaomi"
                    ? "Xiaomi"
                    : pid === "bedrock"
                      ? "Bedrock"
                      : pid === "azure"
                        ? "Azure"
                        : pid === "together"
                          ? "Together"
                          : pid === "fireworks"
                            ? "Fireworks"
                            : pid === "lmstudio"
                              ? "LM Studio"
                              : pid === "localai"
                                ? "LocalAI"
                                : labelWords[0];
              return (
                <button
                  key={pid}
                  type="button"
                  onClick={() => {
                    setSelectedProvider(pid);
                    setApiKeyInput("");
                  }}
                  className={`flex flex-col items-center justify-center rounded-2xl border p-2.5 text-center transition-all ${
                    selectedProvider === pid
                      ? "border-primary bg-primary/10 text-foreground ring-1 ring-primary/40"
                      : "border-hairline bg-secondary/30 text-muted-foreground hover:bg-secondary/60"
                  }`}
                >
                  <div className="flex items-center justify-center w-full">
                    <Logo className="size-5" />
                  </div>
                  <span className="mt-1.5 text-[11.5px] font-medium text-foreground truncate w-full text-center">
                    {displayLabel}
                  </span>
                </button>
              );
            })}
          </div>
        </div>

        {/* Rótulo / Nome da API (Opcional) */}
        <div className="mt-3.5">
          <label className="text-[11px] font-medium tracking-wide text-muted-foreground uppercase">
            {t("Nome / Rótulo da API")}
            <span className="text-muted-foreground/60 ml-1">({t("opcional")})</span>
          </label>
          <input
            type="text"
            value={apiLabelInput}
            onChange={(e) => setApiLabelInput(e.target.value)}
            placeholder={`Ex: ${PROVIDER_INFO[selectedProvider]?.label || selectedProvider} #1`}
            className="mt-1.5 w-full rounded-2xl border border-hairline bg-background px-4 py-2 text-[13.5px] outline-none placeholder:text-muted-foreground/50 focus:border-primary transition-colors"
          />
        </div>

        {/* Modelo OpenRouter (quando selecionado) */}
        {selectedProvider === "openrouter" && (
          <div className="mt-3.5 animate-in fade-in slide-in-from-top-1 duration-150">
            <div className="flex items-center justify-between">
              <label className="text-[11px] font-medium tracking-wide text-muted-foreground uppercase">
                {t("Modelo OpenRouter")}
              </label>
              <span className="text-[11px] text-primary/80 font-medium">
                {t("openrouter/auto (padrão)")}
              </span>
            </div>
            <select
              value={modelInput}
              onChange={(e) => setModelInput(e.target.value)}
              className="mt-1.5 w-full rounded-2xl border border-hairline bg-background px-3 py-2 text-[13px] outline-none focus:border-primary transition-colors text-foreground cursor-pointer"
            >
              <option value="openrouter/auto">
                {t("openrouter/auto — Roteador Automático Oficial (Recomendado)")}
              </option>
              <option value="meta-llama/llama-3.3-70b-instruct">
                meta-llama/llama-3.3-70b-instruct (Meta Llama 3.3)
              </option>
              <option value="google/gemini-2.5-flash">
                google/gemini-2.5-flash (Google Gemini 2.5)
              </option>
              <option value="deepseek/deepseek-chat">
                deepseek/deepseek-chat (DeepSeek V3)
              </option>
              <option value="anthropic/claude-3.5-sonnet">
                anthropic/claude-3.5-sonnet (Claude 3.5 Sonnet)
              </option>
              <option value="nvidia/nemotron-4-340b-instruct">
                nvidia/nemotron-4-340b-instruct (NVIDIA Nemotron)
              </option>
              <option value="custom">
                {t("Outro modelo do catálogo OpenRouter...")}
              </option>
            </select>
            {modelInput === "custom" && (
              <input
                type="text"
                value={customModelInput}
                onChange={(e) => setCustomModelInput(e.target.value)}
                placeholder="Ex: mistralai/mistral-large-2411"
                className="mt-2 w-full rounded-2xl border border-hairline bg-background px-4 py-2 text-[13px] outline-none placeholder:text-muted-foreground/50 focus:border-primary transition-colors"
                autoFocus
              />
            )}
          </div>
        )}

        {/* Input da Chave */}
        <div className="mt-3.5">
          <div className="flex items-center justify-between">
            <label className="text-[11px] font-medium tracking-wide text-muted-foreground uppercase">
              {t("Chave de API")}
            </label>
            {PROVIDER_INFO[selectedProvider]?.docUrl && (
              <a
                href={PROVIDER_INFO[selectedProvider].docUrl}
                target="_blank"
                rel="noreferrer"
                className="inline-flex items-center gap-1 text-[11px] text-primary hover:underline"
              >
                {t("Obter chave")}
                <ExternalLink className="size-2.5" />
              </a>
            )}
          </div>
          <input
            type="password"
            value={apiKeyInput}
            onChange={(e) => setApiKeyInput(e.target.value)}
            placeholder={PROVIDER_INFO[selectedProvider]?.placeholder || "Colar chave de API..."}
            className="mt-1.5 w-full rounded-2xl border border-hairline bg-background px-4 py-2.5 text-[14px] outline-none placeholder:text-muted-foreground/60 focus:border-primary transition-colors"
            autoFocus
          />
        </div>

        {/* Ações */}
        <div className="mt-5 flex gap-2">
          <button
            type="button"
            onClick={onClose}
            className="flex-1 rounded-2xl border border-hairline bg-secondary/50 py-2.5 text-[13.5px] font-medium text-foreground hover:bg-secondary transition-colors"
          >
            {t("Cancelar")}
          </button>
          <button
            type="button"
            onClick={() => void handleSaveApi()}
            disabled={submitting || !apiKeyInput.trim()}
            className="flex-1 flex items-center justify-center gap-1.5 rounded-2xl bg-primary py-2.5 text-[13.5px] font-medium text-primary-foreground hover:opacity-90 disabled:opacity-40 transition-all active:scale-[0.98]"
          >
            {submitting ? (
              <>
                <Loader2 className="size-3.5 animate-spin" />
                <span>{t("A ligar...")}</span>
              </>
            ) : (
              <>
                <Check className="size-3.5" />
                <span>{t("Ligar API")}</span>
              </>
            )}
          </button>
        </div>
      </div>
    </div>
  );
}
