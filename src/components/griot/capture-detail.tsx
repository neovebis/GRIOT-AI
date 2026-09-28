import { useEffect, useState } from "react";
import { toast } from "sonner";
import { Eye, MapPin, MessageSquare, Plus, SlidersHorizontal } from "lucide-react";
import { useT } from "@/lib/i18n";
import { CAPTURE_KINDS } from "@/lib/griot";
import {
  captureTitle,
  captureUrl,
  exactDateTime,
  pushQuickCapture,
  sendCaptureToControl,
  sendCaptureToConversation,
  type CaptureRow,
} from "@/lib/capture-share";

/** Barra de detalhe de uma captura: data e hora exatas, ver conteúdo e enviar. */
export function CaptureDetail({
  capture,
  userId,
  onClose,
}: {
  capture: CaptureRow;
  userId: string;
  onClose: () => void;
}) {
  const t = useT();
  const [url, setUrl] = useState<string | null>(null);
  const [preview, setPreview] = useState(false);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    let alive = true;
    void captureUrl(capture.storage_path, capture).then((value) => {
      if (alive) setUrl(value);
    });
    return () => {
      alive = false;
    };
  }, [capture]);

  const kindLabel = t(
    CAPTURE_KINDS.find((kind) => kind.id === capture.kind)?.label ?? capture.kind,
  );
  const maps =
    capture.latitude != null && capture.longitude != null
      ? `https://www.google.com/maps?q=${capture.latitude},${capture.longitude}`
      : null;
  const target = url ?? maps;

  async function guard(action: () => Promise<void>, message: string) {
    setBusy(true);
    try {
      await action();
      toast.success(message);
    } catch {
      toast.error(t("Não foi possível enviar a captura."));
    } finally {
      setBusy(false);
    }
  }

  const sends = [
    {
      id: "chat",
      label: t("Conversa"),
      Icon: MessageSquare,
      run: () =>
        guard(async () => {
          await sendCaptureToConversation(capture, userId);
        }, t("Enviado para a conversa.")),
    },
    {
      id: "quick",
      label: t("Quick"),
      Icon: Plus,
      run: () =>
        guard(async () => {
          pushQuickCapture(capture.id);
        }, t("Disponível no + do chat.")),
    },
    {
      id: "control",
      label: t("Control"),
      Icon: SlidersHorizontal,
      run: () =>
        guard(async () => {
          await sendCaptureToControl(capture, userId);
        }, t("Enviado para o Control.")),
    },
  ];

  return (
    <div className="fixed inset-0 z-50 flex items-end" onClick={onClose}>
      <div className="absolute inset-0 bg-black/40 backdrop-blur-sm" />
      <div
        className="sheet-up relative w-full rounded-t-[28px] border-t border-hairline bg-surface px-5 pt-3 pb-[calc(env(safe-area-inset-bottom)+24px)]"
        onClick={(event) => event.stopPropagation()}
      >
        <div className="mx-auto h-1 w-10 rounded-full bg-muted" />

        <div className="mt-5 flex items-start justify-between gap-3">
          <div className="min-w-0">
            <p className="truncate text-[17px] font-semibold tracking-tight">
              {captureTitle(capture)}
            </p>
            <p className="mt-1 text-[12.5px] text-muted-foreground">
              {kindLabel} · {exactDateTime(capture.created_at)}
            </p>
          </div>
          <span className="shrink-0 rounded-full border border-hairline px-2.5 py-1 text-[12px] text-muted-foreground">
            {kindLabel}
          </span>
        </div>

        {preview &&
        url &&
        (capture.mime_type?.startsWith("image/") ||
          capture.kind === "photo" ||
          capture.kind === "gallery") ? (
          <img
            src={url}
            alt={captureTitle(capture)}
            className="mt-4 max-h-[42vh] w-full rounded-2xl object-cover"
          />
        ) : null}
        {preview && url && (capture.mime_type?.startsWith("video/") || capture.kind === "video") ? (
          <video src={url} controls className="mt-4 max-h-[42vh] w-full rounded-2xl" />
        ) : null}
        {preview && url && (capture.mime_type?.startsWith("audio/") || capture.kind === "audio") ? (
          <audio src={url} controls className="mt-4 w-full" />
        ) : null}

        <button
          onClick={() => {
            if (!target) {
              toast(t("Esta captura não tem ficheiro."));
              return;
            }
            const inline =
              capture.mime_type?.startsWith("image/") ||
              capture.mime_type?.startsWith("video/") ||
              capture.mime_type?.startsWith("audio/") ||
              capture.kind === "photo" ||
              capture.kind === "video" ||
              capture.kind === "gallery" ||
              capture.kind === "audio";
            if (inline && url) setPreview((current) => !current);
            else window.open(target, "_blank", "noopener");
          }}
          className="mt-4 flex w-full items-center justify-center gap-2 rounded-2xl border border-hairline py-3.5 text-[15px] font-medium transition-transform duration-200 active:scale-[0.98]"
        >
          {maps && !url ? <MapPin className="size-4" /> : <Eye className="size-4" />}
          {preview ? t("Esconder conteúdo") : t("Ver conteúdo")}
        </button>

        <p className="mt-5 text-[12px] font-medium tracking-wide text-muted-foreground uppercase">
          {t("Enviar para")}
        </p>
        <div className="mt-2.5 grid grid-cols-3 gap-2.5">
          {sends.map(({ id, label, Icon, run }) => (
            <button
              key={id}
              disabled={busy}
              onClick={() => void run()}
              className="grid place-items-center gap-1.5 rounded-2xl border border-hairline py-3.5 text-[13.5px] font-medium transition-transform duration-200 active:scale-95 disabled:opacity-40"
            >
              <Icon className="size-[18px]" />
              {label}
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}
