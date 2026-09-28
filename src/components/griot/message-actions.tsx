import { useState } from "react";
import {
  Copy,
  ThumbsUp,
  ThumbsDown,
  Volume2,
  RefreshCw,
  Square,
  Check,
} from "lucide-react";
import { toast } from "sonner";
import { applyStableVoice, waitForVoices } from "@/lib/tts-voice";

import { useT } from "@/lib/i18n";

function Action({
  label,
  onClick,
  active,
  children,
}: {
  label: string;
  onClick: () => void;
  active?: boolean;
  children: React.ReactNode;
}) {
  return (
    <button
      onClick={onClick}
      aria-label={label}
      className={`grid size-8 place-items-center rounded-full transition-all duration-200 active:scale-90 ${
        active ? "bg-secondary text-foreground" : "text-muted-foreground active:bg-secondary"
      }`}
    >
      {children}
    </button>
  );
}

export function UserActions({
  content,
  onEdit,
}: {
  content: string;
  onEdit?: () => void;
  onReact?: (emoji: string) => void;
  hasUserLiked?: boolean;
}) {
  const t = useT();
  const [copied, setCopied] = useState(false);

  return (
    <div className="relative mt-1.5 flex items-center justify-end gap-0.5 pr-0.5 opacity-80">
      <Action
        label={t("Copiar")}
        onClick={async () => {
          await navigator.clipboard.writeText(content);
          setCopied(true);
          window.setTimeout(() => setCopied(false), 1400);
        }}
      >
        {copied ? <Check className="size-[15px]" /> : <Copy className="size-[15px]" />}
      </Action>
    </div>
  );
}

export function AssistantActions({
  content,
  feedback,
  onFeedback,
  onRegenerate,
}: {
  content: string;
  feedback: string | null;
  onFeedback: (value: "like" | "dislike" | null) => void;
  onRegenerate: () => void;
  onReact?: (emoji: string) => void;
  hasUserLiked?: boolean;
}) {
  const t = useT();
  const [copied, setCopied] = useState(false);
  const [speaking, setSpeaking] = useState(false);

  function cleanTextForSpeech(raw: string): string {
    return raw
      .replace(/```[\s\S]*?```/g, " [Bloco de código] ") // substitui blocos de código
      .replace(/`([^`]+)`/g, "$1") // remove backticks
      .replace(/\[([^\]]+)\]\([^)]+\)/g, "$1") // converte markdown links para o texto
      .replace(/[#*_~`>]/g, "") // remove caracteres de marcação
      .replace(/\n+/g, " ") // normaliza quebras de linha
      .trim();
  }

  async function speak() {
    if (typeof window === "undefined" || !("speechSynthesis" in window)) {
      toast.error(t("Este dispositivo não permite leitura em voz alta."));
      return;
    }
    if (speaking) {
      window.speechSynthesis.cancel();
      setSpeaking(false);
      return;
    }

    const cleanText = cleanTextForSpeech(content);
    if (!cleanText) {
      toast.error(t("Nada para ler."));
      return;
    }

    await waitForVoices();
    const utterance = new SpeechSynthesisUtterance(cleanText);
    applyStableVoice(utterance);
    utterance.rate = 1.0;
    utterance.pitch = 1.0;

    // Keepalive watchdog para Android Webview não cortar aos 4 segundos
    let watchdog: any = null;
    const clearWatchdog = () => {
      if (watchdog) {
        clearInterval(watchdog);
        watchdog = null;
      }
    };

    utterance.onstart = () => {
      setSpeaking(true);
      watchdog = setInterval(() => {
        if (window.speechSynthesis.speaking) {
          window.speechSynthesis.pause();
          window.speechSynthesis.resume();
        } else {
          clearWatchdog();
        }
      }, 4500);
    };

    utterance.onend = () => {
      clearWatchdog();
      setSpeaking(false);
    };

    utterance.onerror = () => {
      clearWatchdog();
      setSpeaking(false);
    };

    window.speechSynthesis.cancel();
    window.setTimeout(() => {
      window.speechSynthesis.speak(utterance);
    }, 50);
  }

  return (
    <div className="relative mt-2 flex items-center gap-0.5">
      <Action
        label={t("Gosto")}
        active={feedback === "like"}
        onClick={() => onFeedback(feedback === "like" ? null : "like")}
      >
        <ThumbsUp className="size-[15px]" />
      </Action>
      <Action
        label={t("Não gosto")}
        active={feedback === "dislike"}
        onClick={() => onFeedback(feedback === "dislike" ? null : "dislike")}
      >
        <ThumbsDown className="size-[15px]" />
      </Action>
      <Action label={t("Ler em voz alta")} active={speaking} onClick={() => void speak()}>
        {speaking ? <Square className="size-[13px]" /> : <Volume2 className="size-[15px]" />}
      </Action>
      <Action label={t("Regenerar")} onClick={onRegenerate}>
        <RefreshCw className="size-[15px]" />
      </Action>
      <Action
        label={t("Copiar")}
        onClick={async () => {
          await navigator.clipboard.writeText(content);
          setCopied(true);
          window.setTimeout(() => setCopied(false), 1400);
        }}
      >
        {copied ? <Check className="size-[15px]" /> : <Copy className="size-[15px]" />}
      </Action>
    </div>
  );
}
