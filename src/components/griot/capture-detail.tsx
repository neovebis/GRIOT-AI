import { useEffect, useState } from "react";
import { toast } from "sonner";
import { Eye, EyeOff, FileText } from "lucide-react";
import { useT } from "@/lib/i18n";
import { CAPTURE_KINDS } from "@/lib/griot";
import {
  captureTitle,
  captureUrl,
  exactDateTime,
  type CaptureRow,
} from "@/lib/capture-share";

/** Barra de detalhe de uma captura: data e hora exatas e visualização de conteúdo. */
export function CaptureDetail({
  capture,
  userId: _userId,
  onClose,
}: {
  capture: CaptureRow;
  userId: string;
  onClose: () => void;
}) {
  const t = useT();
  const [url, setUrl] = useState<string | null>(null);
  const [preview, setPreview] = useState(false);
  const [textContent, setTextContent] = useState<string | null>(null);
  const [loadingText, setLoadingText] = useState(false);

  useEffect(() => {
    let alive = true;
    void captureUrl(capture.storage_path, capture).then((value) => {
      if (alive) setUrl(value);
    });
    return () => {
      alive = false;
    };
  }, [capture]);

  const isLocation = capture.kind === "location";
  const isImage = Boolean(
    url &&
      (capture.mime_type?.startsWith("image/") ||
        capture.kind === "photo" ||
        capture.kind === "gallery" ||
        capture.kind === "screen"),
  );
  const isVideo = Boolean(
    url && (capture.mime_type?.startsWith("video/") || capture.kind === "video"),
  );
  const isAudio = Boolean(
    url && (capture.mime_type?.startsWith("audio/") || capture.kind === "audio"),
  );
  const isPdf = Boolean(
    url &&
      (capture.mime_type === "application/pdf" ||
        capture.file_name?.toLowerCase().endsWith(".pdf")),
  );

  const kindLabel = t(
    CAPTURE_KINDS.find((kind) => kind.id === capture.kind)?.label ?? capture.kind,
  );

  // Carrega conteúdo de texto ou notas se for documento, texto ou ficheiro legível
  useEffect(() => {
    if (!preview) return;
    if (capture.note?.trim()) {
      setTextContent(capture.note.trim());
      return;
    }
    const isReadableFile =
      capture.kind === "text" ||
      capture.kind === "document" ||
      capture.mime_type?.startsWith("text/") ||
      capture.mime_type?.includes("json") ||
      Boolean(
        capture.file_name?.match(
          /\.(txt|md|json|js|ts|tsx|jsx|html|css|py|csv|xml|yaml|yml|sh|log)$/i,
        ),
      );

    if (url && isReadableFile) {
      setLoadingText(true);
      fetch(url)
        .then((res) => res.text())
        .then((text) => setTextContent(text))
        .catch(() => setTextContent(null))
        .finally(() => setLoadingText(false));
    }
  }, [preview, url, capture]);

  return (
    <div className="fixed inset-0 z-50 flex items-end" onClick={onClose}>
      <div className="absolute inset-0 bg-black/40 backdrop-blur-sm" />
      <div
        className="sheet-up relative w-full rounded-t-[28px] border-t border-hairline bg-surface px-5 pt-3 pb-[calc(env(safe-area-inset-bottom)+24px)] max-h-[85vh] overflow-y-auto"
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
            {isLocation && capture.latitude != null && capture.longitude != null && (
              <p className="mt-1 text-[12px] text-muted-foreground tabular-nums">
                Lat: {capture.latitude.toFixed(6)} · Lon: {capture.longitude.toFixed(6)}
              </p>
            )}
          </div>
          <span className="shrink-0 rounded-full border border-hairline px-2.5 py-1 text-[12px] text-muted-foreground">
            {kindLabel}
          </span>
        </div>

        {preview && (
          <div className="mt-4 animate-in fade-in zoom-in-95 duration-200">
            {isImage && url && (
              <img
                src={url}
                alt={captureTitle(capture)}
                className="max-h-[42vh] w-full rounded-2xl object-cover border border-hairline/40 shadow-xs"
              />
            )}
            {isVideo && url && (
              <video src={url} controls className="max-h-[42vh] w-full rounded-2xl bg-black" />
            )}
            {isAudio && url && (
              <div className="rounded-2xl border border-hairline bg-background/60 p-4">
                <audio src={url} controls className="w-full" />
              </div>
            )}
            {isPdf && url && (
              <iframe
                src={url}
                title={captureTitle(capture)}
                className="h-[42vh] w-full rounded-2xl border border-hairline"
              />
            )}
            {!isImage && !isVideo && !isAudio && !isPdf && (
              <div className="max-h-[42vh] w-full overflow-y-auto rounded-2xl border border-hairline bg-background/80 p-4 text-[13.5px] leading-relaxed text-foreground select-text whitespace-pre-wrap font-sans">
                {loadingText ? (
                  <p className="text-muted-foreground">{t("A carregar conteúdo…")}</p>
                ) : textContent || capture.note ? (
                  textContent || capture.note
                ) : url ? (
                  <div className="flex items-center gap-2 text-muted-foreground">
                    <FileText className="size-4 shrink-0" />
                    <span className="truncate">{capture.file_name || url}</span>
                  </div>
                ) : (
                  <p className="text-muted-foreground">
                    {t("Sem conteúdo adicional para visualização.")}
                  </p>
                )}
              </div>
            )}
          </div>
        )}

        {!isLocation && (
          <button
            type="button"
            onClick={() => {
              if (!url && !capture.note) {
                toast(t("Esta captura não tem ficheiro ou texto."));
                return;
              }
              setPreview((current) => !current);
            }}
            className="mt-4 flex w-full items-center justify-center gap-2 rounded-2xl border border-hairline py-3.5 text-[15px] font-medium transition-transform duration-200 active:scale-[0.98] bg-secondary/50 hover:bg-secondary"
          >
            {preview ? <EyeOff className="size-4" /> : <Eye className="size-4" />}
            {preview ? t("Esconder conteúdo") : t("Ver conteúdo")}
          </button>
        )}
      </div>
    </div>
  );
}
