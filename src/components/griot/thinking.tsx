import { useState, useEffect } from "react";
import {
  ChevronDown,
  FileText,
  Search,
  Code,
  PenLine,
  Brain,
  Check,
  AlertCircle,
} from "lucide-react";
import { GriotSymbol } from "@/components/griot/logo";
import { Shimmer } from "@/components/ai-elements/shimmer";
import { useT } from "@/lib/i18n";
import type { ExecutionPhase, ExecutionStepItem } from "@/lib/chat-execution-manager";
import {
  GithubLogo,
  GitlabLogo,
  VercelLogo,
  SupabaseLogo,
  FirebaseLogo,
  CloudflareLogo,
  DockerLogo,
  SentryLogo,
  LinearLogo,
  TrelloLogo,
  SlackLogo,
  NotionLogo,
  StripeLogo,
  GoogleDriveLogo,
  NeonLogo,
  MongoDbLogo,
  RedisLogo,
  UpstashLogo,
  QdrantLogo,
  HuggingFaceLogo,
  GoogleAnalyticsLogo,
  DiscordLogo,
  TelegramLogo,
  TwilioLogo,
  ResendLogo,
  AirtableLogo,
  PineconeLogo,
  JiraLogo,
  AwsLogo,
  DigitalOceanLogo,
  ShopifyLogo,
  PostHogLogo,
} from "@/components/griot/brand-icons";

type Props = {
  text?: string;
  active: boolean;
  steps: number;
  phase?: ExecutionPhase;
  actionDetail?: string;
  stepsList?: ExecutionStepItem[];
  modelId?: string;
  onStop?: () => void;
};

/**
 * Renderiza o ícone oficial da marca do plugin (estilo ChatGPT com a identidade visual do GRIOT)
 */
function renderPluginLogo(pluginId?: string, className: string = "size-3.5") {
  if (!pluginId) return null;
  const id = pluginId.toLowerCase().trim();
  switch (id) {
    case "github":
      return <GithubLogo className={className} />;
    case "gitlab":
      return <GitlabLogo className={className} />;
    case "vercel":
      return <VercelLogo className={className} />;
    case "supabase":
      return <SupabaseLogo className={className} />;
    case "firebase":
      return <FirebaseLogo className={className} />;
    case "cloudflare":
      return <CloudflareLogo className={className} />;
    case "docker":
      return <DockerLogo className={className} />;
    case "sentry":
      return <SentryLogo className={className} />;
    case "linear":
      return <LinearLogo className={className} />;
    case "trello":
      return <TrelloLogo className={className} />;
    case "slack":
      return <SlackLogo className={className} />;
    case "notion":
      return <NotionLogo className={className} />;
    case "stripe":
      return <StripeLogo className={className} />;
    case "google_drive":
    case "gdrive":
      return <GoogleDriveLogo className={className} />;
    case "neon":
      return <NeonLogo className={className} />;
    case "mongodb":
      return <MongoDbLogo className={className} />;
    case "redis":
      return <RedisLogo className={className} />;
    case "upstash":
      return <UpstashLogo className={className} />;
    case "qdrant":
      return <QdrantLogo className={className} />;
    case "huggingface":
      return <HuggingFaceLogo className={className} />;
    case "google_analytics":
    case "ga":
      return <GoogleAnalyticsLogo className={className} />;
    case "discord":
      return <DiscordLogo className={className} />;
    case "telegram":
      return <TelegramLogo className={className} />;
    case "twilio":
      return <TwilioLogo className={className} />;
    case "resend":
      return <ResendLogo className={className} />;
    case "airtable":
      return <AirtableLogo className={className} />;
    case "pinecone":
      return <PineconeLogo className={className} />;
    case "jira":
      return <JiraLogo className={className} />;
    case "aws":
      return <AwsLogo className={className} />;
    case "digitalocean":
      return <DigitalOceanLogo className={className} />;
    case "shopify":
      return <ShopifyLogo className={className} />;
    case "posthog":
      return <PostHogLogo className={className} />;
    default:
      return null;
  }
}

/**
 * Renderiza o ícone monocromático (sem cor) para o tipo de etapa
 */
function renderStepIcon(step: ExecutionStepItem) {
  if (step.type === "plugin" && step.pluginId) {
    const brand = renderPluginLogo(step.pluginId, "size-3.5");
    if (brand) {
      return (
        <span className="grid size-5 shrink-0 place-items-center rounded-md border border-border/60 bg-background/90 shadow-2xs">
          {brand}
        </span>
      );
    }
  }

  // Ícones monocromáticos neutros (sem cor)
  switch (step.type) {
    case "reading":
      return (
        <span className="grid size-5 shrink-0 place-items-center rounded-md border border-border/40 bg-secondary/50 text-foreground/80">
          <FileText className="size-3" />
        </span>
      );
    case "searching":
      return (
        <span className="grid size-5 shrink-0 place-items-center rounded-md border border-border/40 bg-secondary/50 text-foreground/80">
          <Search className="size-3" />
        </span>
      );
    case "editing":
      return (
        <span className="grid size-5 shrink-0 place-items-center rounded-md border border-border/40 bg-secondary/50 text-foreground/80">
          <Code className="size-3" />
        </span>
      );
    case "writing":
      return (
        <span className="grid size-5 shrink-0 place-items-center rounded-md border border-border/40 bg-secondary/50 text-foreground/80">
          <PenLine className="size-3" />
        </span>
      );
    case "plugin":
    case "thinking":
    default:
      return (
        <span className="grid size-5 shrink-0 place-items-center rounded-md border border-border/40 bg-secondary/50 text-foreground/80">
          <Brain className="size-3" />
        </span>
      );
  }
}

/**
 * Painel Oficial de Processamento e Raciocínio GRIOT:
 * - Avatar à esquerda com o símbolo oficial do GRIOT (GriotMark).
 * - Expande dinamicamente durante a execução com etapas em tempo real.
 * - Ícones neutros monocromáticos (sem cor) e logos oficiais de plugins.
 * - Colapsa elegante e rapidamente para uma única barra compacta ao responder.
 * - Clique para expandir e rever todos os passos.
 */
export function Thinking({
  text = "",
  active,
  steps,
  phase = "thinking",
  actionDetail,
  stepsList = [],
  modelId,
}: Props) {
  const t = useT();

  // Deteta se está a ser utilizado o modelo BASE (ModelGPU)
  const isBase = Boolean(
    !modelId ||
    modelId.toLowerCase() === "base" ||
    modelId.toLowerCase().includes("modelgpu") ||
    text.toLowerCase().includes("modelgpu") ||
    text.toLowerCase().includes("[griot base]") ||
    text.toLowerCase().includes("(base)"),
  );

  // Remove o emoji de relâmpago (⚡) se o modelo for BASE
  const sanitizeTextForModel = (val: string) => {
    if (!val) return "";
    if (isBase) {
      return val.replace(/⚡\s*/g, "").trim();
    }
    return val;
  };

  // Se estiver ativo (a executar antes da resposta), começa expandido;
  // Quando responde (active === false), colapsa rapidamente para uma única barra.
  const [open, setOpen] = useState(active);

  useEffect(() => {
    if (!active) {
      setOpen(false);
    } else {
      setOpen(true);
    }
  }, [active]);

  const rawLines = text
    .split(/\n+/)
    .map((line) => sanitizeTextForModel(line.trim()))
    .filter(Boolean);

  // Unifica passos estruturados e comentários sem descartar nenhum dos dois.
  const normalizedStepText = new Set(
    stepsList.flatMap((step) => [
      sanitizeTextForModel(step.label.trim()).toLowerCase(),
      sanitizeTextForModel(step.detail?.trim() || "").toLowerCase(),
    ]),
  );
  const commentarySteps: ExecutionStepItem[] = rawLines
    .filter((line) => !normalizedStepText.has(line.toLowerCase()))
    .map((line, idx) => ({
      id: `step-comment-${idx}-${line.slice(0, 24)}`,
      type: "thinking",
      label: line,
      detail: t("Comentário do processamento"),
      status: active && idx === rawLines.length - 1 ? "running" : "done",
      timestamp: idx,
    }));
  const effectiveSteps: ExecutionStepItem[] = [
    ...stepsList.map((s) => ({
      ...s,
      label: sanitizeTextForModel(s.label),
      detail: s.detail ? sanitizeTextForModel(s.detail) : s.detail,
    })),
    ...commentarySteps,
  ];

  const stepsCount = Math.max(steps, effectiveSteps.length);

  // Título e estado do cabeçalho
  const getHeaderTitle = () => {
    if (active) {
      if (actionDetail) return sanitizeTextForModel(actionDetail);
      switch (phase) {
        case "reading":
          return t("A ler ficheiro...");
        case "searching":
          return t("A pesquisar no projeto...");
        case "editing":
          return t("A editar ficheiro...");
        case "writing":
          return t("A compor resposta...");
        case "plugin":
          return t("A consultar integração...");
        case "thinking":
        default:
          return t("A pensar...");
      }
    }
    return t("Processamento concluído");
  };

  return (
    <div className="rise my-2 overflow-hidden rounded-2xl border border-border/40 bg-secondary/25 backdrop-blur-md transition-all duration-300 ease-out">
      {/* Barra Principal (sempre visível, colapsada ou cabeçalho) */}
      <button
        type="button"
        onClick={() => setOpen((prev) => !prev)}
        className="flex w-full items-center justify-between gap-3 px-3.5 py-2 text-left hover:bg-secondary/40 active:scale-[0.99] transition-colors"
      >
        <div className="flex items-center gap-2.5 min-w-0 flex-1">
          {/* Avatar à esquerda com o SÍMBOLO OFICIAL DO GRIOT */}
          <div className="relative grid size-6 shrink-0 place-items-center rounded-full border border-border/50 bg-secondary/80">
            {active ? (
              <span className="pulse-ring absolute inset-0 rounded-full bg-foreground/15" />
            ) : null}
            <GriotSymbol className="size-3.5" />
          </div>

          <div className="min-w-0 flex-1 flex items-center gap-2">
            {active ? (
              <Shimmer className="truncate text-[12.5px] font-medium" duration={1.8}>
                {getHeaderTitle()}
              </Shimmer>
            ) : (
              <span className="truncate text-[12.5px] font-medium text-foreground/90">
                {getHeaderTitle()}
              </span>
            )}

            {stepsCount > 0 ? (
              <span className="text-[11px] text-muted-foreground/75 shrink-0">
                · {stepsCount} {stepsCount === 1 ? t("passo") : t("passos")}
              </span>
            ) : null}
          </div>
        </div>

        {/* Chevron para expandir/recolher */}
        <div className="grid size-6 shrink-0 place-items-center rounded-full text-muted-foreground hover:text-foreground">
          <ChevronDown
            className={`size-3.5 transition-transform duration-300 ease-out ${
              open ? "rotate-180" : ""
            }`}
          />
        </div>
      </button>

      {/* Lista de Passos Expandida */}
      {open ? (
        <div className="border-t border-border/30 bg-background/40 px-3.5 py-2.5 transition-all duration-300 ease-out">
          {effectiveSteps.length === 0 ? (
            <div className="flex items-center gap-2 py-1 text-[12px] text-muted-foreground">
              <span className="size-1.5 rounded-full bg-foreground/60 animate-pulse" />
              <span>{active ? t("A inicializar passos...") : t("Pronto a responder")}</span>
            </div>
          ) : (
            <div className="space-y-2 max-h-56 overflow-y-auto no-scrollbar py-0.5">
              {effectiveSteps.map((step) => {
                const isRunning = step.status === "running";
                const isDone = step.status === "done";
                const isError = step.status === "error";

                return (
                  <div
                    key={step.id}
                    className="flex items-start justify-between gap-2.5 rounded-xl px-2 py-1.5 hover:bg-secondary/40 transition-colors"
                  >
                    <div className="flex items-start gap-2.5 min-w-0 flex-1">
                      {/* Mini Avatar / Ícone Monocromático da Tarefa */}
                      {renderStepIcon(step)}

                      <div className="min-w-0 flex-1">
                        <div className="text-[12.5px] font-medium text-foreground/90 leading-snug whitespace-pre-wrap break-words">
                          {step.label}
                        </div>
                        {step.detail ? (
                          <div className="text-[11px] text-muted-foreground leading-snug break-words mt-0.5">
                            {step.detail}
                          </div>
                        ) : null}
                      </div>
                    </div>

                    {/* Indicador de Status Discreto */}
                    <div className="grid size-5 shrink-0 place-items-center">
                      {isRunning ? (
                        <span className="size-1.5 rounded-full bg-foreground/80 animate-ping" />
                      ) : isDone ? (
                        <Check className="size-3 text-muted-foreground/60" />
                      ) : isError ? (
                        <AlertCircle className="size-3 text-destructive/80" />
                      ) : null}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      ) : null}
    </div>
  );
}
