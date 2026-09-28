import { useState, useEffect, useMemo } from "react";
import { Link } from "@tanstack/react-router";
import { useT } from "@/lib/i18n";
import {
  ChevronRight,
  Cpu,
  Plus,
  Key,
  Check,
  Trash2,
  Sparkles,
  ExternalLink,
  X,
  Loader2,
} from "lucide-react";
import {
  listGriotCredentials,
  saveGriotCredential,
  verifyGriotCredential,
  deleteGriotCredential,
  type GriotCredential,
} from "@/lib/griot-api";
import { AddApiModal } from "@/components/griot/add-api-modal";
import { getUserSavedApis, saveUserApi, deleteUserApi, type UserSavedApi } from "@/lib/user-apis";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { getAiLogo } from "@/components/griot/brand-icons";

export interface ConnectedApiItem {
  id: string;
  providerId: string;
  label: string;
  short: string;
  vendor: string;
  hint: string;
  secretHint?: string;
  status: "active" | "pending" | "revoked";
  isLocalOnly?: boolean;
}

const PROVIDER_INFO: Record<
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
    hint: "Multimodal & 2.0 Flash",
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
    placeholder: "Chave de API Zhipu/GLM...",
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

/**
 * Painel de APIs: mostra exclusivamente as APIs de IA que o utilizador adicionou
 * e configurou no GRIOT. Se não houver nenhuma, apresenta um estado limpo
 * com um botão elegante para ligar a primeira API.
 */
export function ApisPanel({
  connected = {},
  desktopOnline = false,
}: {
  connected?: Record<string, boolean>;
  desktopOnline?: boolean;
}) {
  const t = useT();
  const [loading, setLoading] = useState(false);
  const [credentials, setCredentials] = useState<GriotCredential[]>([]);
  const [modalOpen, setModalOpen] = useState(false);
  const [apiToDelete, setApiToDelete] = useState<ConnectedApiItem | null>(null);
  const [localApis, setLocalApis] = useState<UserSavedApi[]>(() => getUserSavedApis());

  // Carrega as credenciais ativas do backend e localStorage instantaneamente
  const refreshApis = async () => {
    setLocalApis(getUserSavedApis());
    try {
      // 1. Consulta rápida direta às tabelas PostgREST (50ms)
      const { data } = await (supabase as any)
        .from("griot_credentials")
        .select("id, provider_id, label, kind, status")
        .eq("status", "active");

      if (Array.isArray(data) && data.length > 0) {
        setCredentials(
          data.map((d: any) => ({
            id: d.id,
            kind: d.kind || "provider",
            providerId: d.provider_id,
            label: d.label || d.provider_id,
            settings: {},
            status: d.status || "active",
            secretHint: "••••••••",
          })),
        );
      }
    } catch {
      // continua para a função remota
    }

    try {
      const res = await listGriotCredentials("provider");
      if (res.data?.credentials && res.data.credentials.length > 0) {
        setCredentials(res.data.credentials);
      }
    } catch (err) {
      console.warn("Não foi possível listar credenciais remotas:", err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void refreshApis();
    const handleUpdate = () => void refreshApis();
    window.addEventListener("griot-apis-updated", handleUpdate);
    return () => window.removeEventListener("griot-apis-updated", handleUpdate);
  }, []);

  // Mapeia TODAS as APIs adicionadas com deduplicação rigorosa (ID e Rótulo/Provedor)
  const connectedApis = useMemo(() => {
    const list: ConnectedApiItem[] = [];
    const seenIds = new Set<string>();
    const seenKeys = new Set<string>();

    // 1. APIs locais (suportam múltiplas chaves do mesmo provedor, mas não duplicatas idênticas)
    for (const api of localApis) {
      const normKey = `${(api.label || "").trim().toLowerCase()}::${api.providerId}`;
      if (seenKeys.has(normKey)) continue;

      const p = PROVIDER_INFO[api.providerId] || {
        label: api.label,
        short: api.providerId.slice(0, 2).toUpperCase(),
        vendor: api.providerId,
        hint: "API Configurada",
        docUrl: "",
        placeholder: "",
      };
      seenIds.add(api.id);
      if (api.remoteId) seenIds.add(api.remoteId);
      seenKeys.add(normKey);

      list.push({
        id: api.id,
        providerId: api.providerId,
        label: api.label || p.label,
        short: p.short,
        vendor: p.vendor,
        hint: p.hint,
        secretHint: api.secretHint,
        status: api.status === "active" ? "active" : "revoked",
        isLocalOnly: true,
      });
    }

    // 2. APIs remotas do Supabase (se ainda não constarem localmente nem com o mesmo rótulo/provedor)
    for (const cred of credentials) {
      const credLabel = cred.label || cred.providerId;
      const normKey = `${credLabel.trim().toLowerCase()}::${cred.providerId}`;

      if (!seenIds.has(cred.id) && !seenKeys.has(normKey)) {
        const p = PROVIDER_INFO[cred.providerId] || {
          label: credLabel,
          short: cred.providerId.slice(0, 2).toUpperCase(),
          vendor: cred.providerId,
          hint: "API Configurada",
          docUrl: "",
          placeholder: "",
        };
        seenIds.add(cred.id);
        seenKeys.add(normKey);

        list.push({
          id: cred.id,
          providerId: cred.providerId,
          label: credLabel,
          short: p.short,
          vendor: p.vendor,
          hint: p.hint,
          secretHint: cred.secretHint,
          status: cred.status,
        });
      }
    }

    return list;
  }, [localApis, credentials]);

  const handleDelete = async (api: ConnectedApiItem) => {
    try {
      // Atualização otimista imediata para evitar que o utilizador veja a API reaparecer
      setLocalApis((prev) =>
        prev.filter(
          (a) =>
            a.id !== api.id &&
            a.label?.trim().toLowerCase() !== api.label?.trim().toLowerCase(),
        ),
      );
      setCredentials((prev) =>
        prev.filter(
          (c) =>
            c.id !== api.id &&
            (c.label || "").trim().toLowerCase() !== api.label?.trim().toLowerCase(),
        ),
      );

      await deleteUserApi(api.id);
      toast.success(t(`API ${api.label} removida.`));
      await refreshApis();
      if (typeof window !== "undefined") {
        window.dispatchEvent(new Event("griot-apis-updated"));
      }
    } catch {
      toast.error(t("Erro ao remover API."));
      await refreshApis();
    }
  };

  return (
    <>
      <div className="panel overflow-hidden px-5 pt-4 pb-2">
        {/* Cabeçalho */}
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <p className="text-[11px] font-medium tracking-[0.14em] text-muted-foreground uppercase">
              {t("APIs")}
            </p>
            <p className="mt-1.5 text-[27px] leading-none font-semibold tracking-tight tabular-nums">
              {connectedApis.length}
              <span className="text-[14px] font-medium text-muted-foreground ml-1.5">
                {connectedApis.length === 1 ? t("ativa") : t("ativas")}
              </span>
            </p>
            <p className="mt-1.5 text-[12.5px] text-muted-foreground">
              {connectedApis.length > 0
                ? t("Orquestração de modelos pronta")
                : t("Nenhuma API ligada")}
            </p>
          </div>
          <span className="grid size-9 shrink-0 place-items-center rounded-full bg-secondary">
            <Cpu className="size-[17px] text-foreground/80" />
          </span>
        </div>

        {/* Lista de APIs ligadas ou Estado Vazio */}
        {connectedApis.length === 0 ? (
          <div className="my-4 rounded-2xl border border-hairline/70 bg-secondary/20 p-4 text-center">
            <div className="mx-auto grid size-8 place-items-center rounded-full bg-secondary/80 text-muted-foreground">
              <Key className="size-4" />
            </div>
            <p className="mt-2 text-[13.5px] font-medium text-foreground">
              {t("Nenhuma API ligada ainda")}
            </p>
            <p className="mt-1 text-[12px] text-muted-foreground leading-relaxed">
              {t(
                "Adiciona uma chave de API (Gemini, OpenAI, Claude, DeepSeek) para orquestrar respostas.",
              )}
            </p>
          </div>
        ) : (
          <ul className="mt-3 divide-y divide-hairline">
            {connectedApis.map((api) =>
              apiToDelete?.id === api.id ? (
                <li
                  key={api.id}
                  className="flex items-center justify-between gap-2.5 py-2.5 px-3 my-1.5 rounded-2xl bg-destructive/10 border border-destructive/30 animate-fade-in"
                >
                  <div className="flex items-center gap-2 min-w-0 flex-1">
                    <Trash2 className="size-4 text-destructive shrink-0" />
                    <span className="truncate text-[13px] font-medium text-foreground">
                      {t("Eliminar")}{" "}
                      <strong className="text-destructive font-semibold">{api.label}</strong>?
                    </span>
                  </div>
                  <div className="flex items-center gap-1.5 shrink-0">
                    <button
                      type="button"
                      onClick={() => setApiToDelete(null)}
                      className="rounded-xl border border-hairline bg-surface/90 px-3 py-1.5 text-[12px] font-medium text-muted-foreground hover:text-foreground active:scale-95 transition-all"
                    >
                      {t("Cancelar")}
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        void handleDelete(api);
                        setApiToDelete(null);
                      }}
                      className="rounded-xl bg-destructive px-3 py-1.5 text-[12px] font-semibold text-destructive-foreground shadow-xs hover:opacity-90 active:scale-95 transition-all"
                    >
                      {t("Eliminar")}
                    </button>
                  </div>
                </li>
              ) : (
                <li key={api.id} className="flex items-center gap-3 py-3">
                  {(() => {
                    const Logo = getAiLogo(api.providerId);
                    return (
                      <span className="relative grid size-9 shrink-0 place-items-center rounded-full border border-hairline bg-surface text-foreground shadow-xs">
                        <span className="pulse-ring absolute inset-0 rounded-full bg-emerald-500/20" />
                        <Logo className="size-5" />
                      </span>
                    );
                  })()}
                  <span className="min-w-0 flex-1">
                    <span className="flex items-center gap-2">
                      <span className="truncate text-[14.5px] font-medium">{api.label}</span>
                    </span>
                    <span className="block truncate text-[12px] text-muted-foreground">
                      {t("Ligada ·")} {api.hint}
                    </span>
                  </span>
                  <div className="flex items-center gap-2 shrink-0">
                    <span className="size-2 rounded-full bg-emerald-500 shadow-[0_0_8px_rgba(16,185,129,0.5)]" />
                    <button
                      type="button"
                      onClick={() => setApiToDelete(api)}
                      className="grid size-7 place-items-center rounded-full text-muted-foreground hover:text-destructive hover:bg-destructive/10 transition-colors active:scale-95"
                      title={t("Remover API")}
                    >
                      <Trash2 className="size-3.5" />
                    </button>
                  </div>
                </li>
              ),
            )}
          </ul>
        )}

        {/* Botão Elegante para Adicionar API no estilo refinado GRIOT */}
        <button
          onClick={() => setModalOpen(true)}
          className="group relative mt-2 flex w-full items-center justify-center gap-2 rounded-2xl border border-hairline/80 bg-secondary/40 py-2.5 text-[13px] font-medium text-foreground transition-all duration-200 hover:bg-secondary hover:border-hairline active:scale-[0.98]"
        >
          <span className="grid size-5 place-items-center rounded-full bg-background border border-hairline transition-transform duration-200 group-hover:scale-110">
            <Plus className="size-3 text-foreground" />
          </span>
          <span>{t("Adicionar API")}</span>
        </button>

        {/* Link de Rodapé para Definições */}
        <Link
          to="/settings"
          className="-mx-5 mt-3 flex items-center justify-between border-t border-hairline px-5 py-3.5 text-[13.5px] font-medium text-foreground transition-colors hover:bg-secondary/30"
        >
          {t("Gerir Chaves de IA")}
          <ChevronRight className="size-4 text-muted-foreground" />
        </Link>
      </div>

      {/* Modal / Dialog Elegante para Adicionar API */}
      <AddApiModal
        open={modalOpen}
        onClose={() => setModalOpen(false)}
        onSuccess={() => void refreshApis()}
      />
    </>
  );
}

// Exportação compatível com o nome antigo para garantir retrocompatibilidade total
export const AcpPanel = ApisPanel;
