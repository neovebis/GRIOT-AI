import React from "react";
import {
  FolderArchive,
  FileCheck,
  FileText,
  ChevronRight,
  ImageIcon,
  Mic,
  Video,
  FileCode,
  FileSpreadsheet,
  File,
} from "lucide-react";
import { MarkdownContent } from "./markdown-content";
import { UserActions, AssistantActions } from "./message-actions";
import { parseAttachmentMeta, type AttachmentMetadata } from "@/lib/file-attachment-processor";
import { Thinking } from "./thinking";
import type { ExecutionStepItem, MessageReaction } from "@/lib/chat-execution-manager";
import { getAiLogo, getModelDisplayName } from "./brand-icons";
import { getUserSavedApis } from "@/lib/user-apis";
import { NativeAdSlot } from "./native-ad-slot";
import { PreviewBar, FunctionalPreviewModal, extractWebSiteFromContent } from "./preview-bar";

function getAttachmentDisplay(meta: AttachmentMetadata) {
  const name = (meta.fileName || "").toLowerCase();
  const kind = meta.kind;

  if (kind === "image" || /\.(png|jpe?g|gif|webp|bmp|svg|heic|avif)$/i.test(name)) {
    const ext = name.split(".").pop()?.toUpperCase();
    return {
      Icon: ImageIcon,
      label: ext ? `Imagem ${ext}` : "Imagem",
    };
  }

  if (kind === "audio" || /\.(mp3|wav|ogg|m4a|aac|flac|weba)$/i.test(name)) {
    return {
      Icon: Mic,
      label: "Áudio",
    };
  }

  if (kind === "video" || /\.(mp4|webm|mov|mkv|avi)$/i.test(name)) {
    return {
      Icon: Video,
      label: "Vídeo",
    };
  }

  if (
    kind === "code" ||
    /\.(js|jsx|ts|tsx|py|html|css|json|md|c|cpp|rs|go|php|rb|swift|kt)$/i.test(name)
  ) {
    const ext = name.split(".").pop()?.toUpperCase();
    return {
      Icon: FileCode,
      label: ext ? `Código ${ext}` : "Código",
    };
  }

  if (kind === "sheet" || /\.(csv|tsv|xlsx?|ods)$/i.test(name) || meta.category === "planilhas") {
    return {
      Icon: FileSpreadsheet,
      label: "Planilha",
    };
  }

  if (kind === "pdf" || /\.pdf$/i.test(name)) {
    return {
      Icon: FileText,
      label: "Documento PDF",
    };
  }

  if (kind === "doc" || /\.(docx?|odt|rtf|txt)$/i.test(name)) {
    return {
      Icon: FileText,
      label: "Documento de Texto",
    };
  }

  if (kind === "archive" || /\.(zip|tar|gz|rar|7z)$/i.test(name)) {
    return {
      Icon: FolderArchive,
      label: "Arquivo Comprimido",
    };
  }

  return {
    Icon: File,
    label: "Ficheiro Anexo",
  };
}

function AttachmentBubble({ meta }: { meta: AttachmentMetadata }) {
  const display = getAttachmentDisplay(meta);
  const Icon = display.Icon;

  return (
    <div className="max-w-[88%] rounded-3xl bg-secondary border border-hairline/70 p-3.5 shadow-xs overflow-hidden transition-all hover:border-hairline">
      <div className="flex items-center gap-3">
        <div className="grid size-10 shrink-0 place-items-center rounded-2xl bg-surface border border-hairline/80 text-foreground shadow-2xs">
          <Icon className="size-5" />
        </div>

        <div className="flex-1 min-w-0 pr-1">
          <div className="flex items-center gap-1.5">
            <span className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wider">
              {display.label}
            </span>
            <FileCheck className="size-3 text-emerald-500 shrink-0" />
          </div>
          <p
            className="text-[13.5px] font-medium text-foreground truncate mt-0.5"
            title={meta.fileName}
          >
            {meta.fileName}
          </p>
          {meta.extractedSummary && (
            <p className="text-[11.5px] text-muted-foreground/80 line-clamp-1 mt-0.5">
              {meta.extractedSummary}
            </p>
          )}
        </div>

        <ChevronRight className="size-4 shrink-0 text-muted-foreground/60" />
      </div>
    </div>
  );
}

function MessageReactionsList({
  reactions,
  onReact,
  messageId,
  isUser,
}: {
  reactions?: MessageReaction[];
  onReact?: (id: string, emoji: string) => void;
  messageId: string;
  isUser?: boolean;
}) {
  if (!reactions || reactions.length === 0) return null;

  return (
    <div
      className={`flex flex-wrap items-center gap-1.5 mt-1.5 px-1 ${
        isUser ? "justify-end" : "justify-start"
      }`}
    >
      {reactions.map((r, rIdx) => {
        const Logo = r.modelId ? getAiLogo(r.modelId) : null;
        return (
          <button
            key={rIdx}
            type="button"
            onClick={() => onReact?.(messageId, r.emoji)}
            className={`inline-flex items-center gap-1.5 rounded-full border px-2 py-0.5 text-[11px] shadow-2xs backdrop-blur-md transition-transform active:scale-95 ${
              r.isUser
                ? "border-primary/40 bg-primary/10 text-primary font-medium"
                : "border-hairline/80 bg-secondary/80 text-foreground"
            }`}
            title={r.by ? `${r.by} reagiu com ${r.emoji}` : r.emoji}
          >
            <span>{r.emoji}</span>
            {Logo && (
              <div className="grid size-3.5 place-items-center rounded-full">
                <Logo className="size-3 text-foreground" />
              </div>
            )}
            {r.by && (
              <span className="text-[10px] font-medium text-muted-foreground truncate max-w-[85px]">
                {r.by}
              </span>
            )}
          </button>
        );
      })}
    </div>
  );
}

export interface ChatMessageItemProps {
  message: {
    id: string;
    role: "user" | "assistant" | "system";
    content: string;
    model?: string;
    feedback?: "like" | "dislike" | null;
    reasoning?: string;
    steps?: number;
    stepsList?: ExecutionStepItem[];
    reactions?: MessageReaction[];
    metadata?: Record<string, any>;
  };
  scope: "main" | "quick";
  onEdit: (id: string) => void;
  onFeedback: (id: string, value: "like" | "dislike" | null) => void;
  onRegenerate: (id: string) => void;
  onReact?: (id: string, emoji: string) => void;
  t: (key: string) => string;
  parseQuickSegments: (content: string) => Array<{ roleRaw: string; content: string }>;
  getPersonaConfig: (roleRaw: string) => {
    name: string;
    badge: string;
    avatarBg: string;
    icon: React.ReactNode;
  };
  modelLabel: (model?: string) => string;
  showAdAfter?: boolean;
}

export const ChatMessageItem = React.memo(
  function ChatMessageItem({
    message,
    scope,
    onEdit,
    onFeedback,
    onRegenerate,
    onReact,
    t,
    parseQuickSegments,
    getPersonaConfig,
    modelLabel,
    showAdAfter = false,
  }: ChatMessageItemProps) {
    const webSiteData = React.useMemo(
      () => (message.role === "assistant" ? extractWebSiteFromContent(message.content) : null),
      [message.role, message.content],
    );
    const [previewModalOpen, setPreviewModalOpen] = React.useState(false);

    if (message.role === "user") {
      const parsedAttachment = parseAttachmentMeta(message.content);

      if (parsedAttachment.meta) {
        return (
          <div className="flex flex-col items-end max-w-full">
            <AttachmentBubble meta={parsedAttachment.meta} />
            {scope === "quick" && (
              <MessageReactionsList reactions={message.reactions} messageId={message.id} isUser />
            )}
            <UserActions content={message.content} onEdit={() => onEdit(message.id)} />
          </div>
        );
      }

      return (
        <div className="flex flex-col items-end max-w-full">
          <div className="max-w-[88%] rounded-3xl bg-primary px-4 py-2.5 text-[15.5px] leading-relaxed text-primary-foreground shadow-xs overflow-hidden">
            <MarkdownContent content={message.content} isUser />
          </div>
          {scope === "quick" && (
            <MessageReactionsList reactions={message.reactions} messageId={message.id} isUser />
          )}
          <UserActions content={message.content} onEdit={() => onEdit(message.id)} />
        </div>
      );
    }

    if (scope === "quick") {
      const segments = parseQuickSegments(message.content);

      // Caso seja uma mensagem legada com múltiplos segmentos de persona
      if (segments.length > 0) {
        return (
          <div className="space-y-3">
            {segments.map((segment, sIdx) => {
              const cfg = getPersonaConfig(segment.roleRaw);
              return (
                <div key={sIdx} className="flex items-start gap-2.5 my-2 animate-fade-in">
                  <div
                    className={`relative grid size-9 shrink-0 place-items-center rounded-2xl border shadow-xs ${cfg.avatarBg}`}
                    title={cfg.name}
                  >
                    {cfg.icon}
                  </div>

                  <div className="flex-1 min-w-0 max-w-[88%]">
                    <div className="flex items-center justify-between gap-2 mb-1 px-1">
                      <span className="text-[12px] font-semibold text-foreground tracking-tight truncate">
                        {cfg.name}
                      </span>
                      <span className="rounded-md bg-secondary/80 px-2 py-0.5 text-[9.5px] font-semibold text-muted-foreground uppercase tracking-wider shrink-0 border border-border/40">
                        {cfg.badge}
                      </span>
                    </div>
                    <div className="rounded-3xl rounded-tl-sm border border-hairline/80 bg-surface/90 px-4 py-3 text-[15px] leading-relaxed text-foreground shadow-xs">
                      <MarkdownContent content={segment.content} />
                    </div>
                  </div>
                </div>
              );
            })}
            <MessageReactionsList reactions={message.reactions} messageId={message.id} />
            <AssistantActions
              content={message.content}
              feedback={message.feedback ?? null}
              onFeedback={(value) => onFeedback(message.id, value)}
              onRegenerate={() => onRegenerate(message.id)}
            />
            {showAdAfter ? <NativeAdSlot slotId={`quick-${message.id}`} /> : null}
          </div>
        );
      }

      // Caso seja uma resposta individual e natural de um dos modelos da Sala Quick
      const savedApis = typeof window !== "undefined" ? getUserSavedApis() : [];
      const matchedUserApi = savedApis.find(
        (a) => a.id === message.model || a.id === message.metadata?.modelId,
      );

      // Nome dado pelo utilizador (ex: "Joel", "Jogjoson") ou o nome oficial do modelo
      const userModelName =
        matchedUserApi?.label || message.metadata?.userLabel || getModelDisplayName(message.model);

      // Logo oficial do modelo/provedor de IA (Gemini, Claude, OpenAI, DeepSeek, etc.) e nunca do Griot
      const ModelLogo = getAiLogo(
        matchedUserApi?.providerId || matchedUserApi?.model || message.model,
      );

      // Papel/função do modelo na sala (ex: "Crítico", "Analista", "Estrategista", "Inovador")
      const roleDisplayName = message.metadata?.roleName || "Especialista";

      return (
        <div className="flex items-start gap-2.5 my-2 animate-fade-in">
          <div
            className="relative grid size-9 shrink-0 place-items-center rounded-2xl border border-hairline/80 bg-surface shadow-2xs"
            title={`${userModelName} · ${roleDisplayName}`}
          >
            <ModelLogo className="size-4.5 text-foreground" />
          </div>

          <div className="flex-1 min-w-0 max-w-[88%]">
            <div className="flex items-center justify-between gap-2 mb-1 px-1">
              <span className="text-[12.5px] font-semibold text-foreground tracking-tight truncate">
                {userModelName}
              </span>
              <span className="rounded-md bg-secondary/80 px-2 py-0.5 text-[9.5px] font-semibold text-muted-foreground uppercase tracking-wider shrink-0 border border-border/40">
                {roleDisplayName}
              </span>
            </div>
            <div className="rounded-3xl rounded-tl-sm border border-hairline/80 bg-surface/90 px-4 py-3 text-[15px] leading-relaxed text-foreground shadow-xs">
              <MarkdownContent content={message.content} />
              {webSiteData?.hasSite ? (
                <PreviewBar
                  title={webSiteData.title}
                  subtitle="Live Preview no dispositivo"
                  onPreview={() => setPreviewModalOpen(true)}
                />
              ) : null}
            </div>
            <MessageReactionsList reactions={message.reactions} messageId={message.id} />
            <AssistantActions
              content={message.content}
              feedback={message.feedback ?? null}
              onFeedback={(value) => onFeedback(message.id, value)}
              onRegenerate={() => onRegenerate(message.id)}
            />
            {showAdAfter ? <NativeAdSlot slotId={`quick-${message.id}`} /> : null}
            {webSiteData?.hasSite ? (
              <FunctionalPreviewModal
                open={previewModalOpen}
                onClose={() => setPreviewModalOpen(false)}
                srcDoc={webSiteData.html}
                title={webSiteData.title}
              />
            ) : null}
          </div>
        </div>
      );
    }

    // Modo Main Chat
    const isAppModel = (message.model || "").startsWith("app:");
    const msgStepsList = message.stepsList || message.metadata?.stepsList || [];
    const msgReasoning = message.reasoning || message.metadata?.reasoning || "";
    const msgStepsCount = message.steps || message.metadata?.steps || msgStepsList.length;

    const hasProcessingInfo =
      msgStepsList.length > 0 ||
      (typeof msgReasoning === "string" && msgReasoning.trim().length > 0);

    return (
      <div>
        {isAppModel ? (
          <div className="mb-1.5 flex items-center gap-1.5 text-[11px] font-medium text-emerald-600 dark:text-emerald-400">
            <span className="size-1.5 rounded-full bg-emerald-500" />
            <span>{modelLabel(message.model)}</span>
          </div>
        ) : null}

        {hasProcessingInfo ? (
          <Thinking
            text={msgReasoning}
            active={false}
            steps={msgStepsCount}
            stepsList={msgStepsList}
            modelId={message.model}
          />
        ) : null}

        <MarkdownContent content={message.content} />
        {webSiteData?.hasSite ? (
          <PreviewBar
            title={webSiteData.title}
            subtitle="index.html · Live Preview no dispositivo"
            onPreview={() => setPreviewModalOpen(true)}
          />
        ) : null}
        <AssistantActions
          content={message.content}
          feedback={message.feedback ?? null}
          onFeedback={(value) => onFeedback(message.id, value)}
          onRegenerate={() => onRegenerate(message.id)}
        />
        {showAdAfter ? <NativeAdSlot slotId={`main-${message.id}`} /> : null}
        {webSiteData?.hasSite ? (
          <FunctionalPreviewModal
            open={previewModalOpen}
            onClose={() => setPreviewModalOpen(false)}
            srcDoc={webSiteData.html}
            title={webSiteData.title}
          />
        ) : null}
      </div>
    );
  },
  (prev, next) => {
    return (
      prev.message.id === next.message.id &&
      prev.message.content === next.message.content &&
      prev.message.feedback === next.message.feedback &&
      prev.message.model === next.message.model &&
      prev.message.reasoning === next.message.reasoning &&
      prev.scope === next.scope &&
      prev.message.steps === next.message.steps &&
      prev.message.stepsList?.length === next.message.stepsList?.length &&
      JSON.stringify(prev.message.reactions) === JSON.stringify(next.message.reactions)
    );
  },
);
