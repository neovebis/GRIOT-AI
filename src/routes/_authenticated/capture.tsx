import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useRef, useState } from "react";
import { Screen, Panel, Empty } from "@/components/griot/screen";
import { CAPTURE_KINDS, relativeTime, type CaptureKind } from "@/lib/griot";
import { toast } from "sonner";
import { Camera } from "lucide-react";
import { useT } from "@/lib/i18n";
import { CaptureDetail } from "@/components/griot/capture-detail";
import { useCurrentUser } from "@/hooks/use-user";
import { saveCapture, getStoredCaptures, type StoredCapture } from "@/lib/capture-service";
import { getActiveProjectSync, getUnifiedProjects } from "@/lib/project-service";
import type { CaptureRow } from "@/lib/capture-share";

export const Route = createFileRoute("/_authenticated/capture")({
  head: () => ({
    meta: [
      { title: "Capture — GRIOT Mobile" },
      {
        name: "description",
        content:
          "Foto, vídeo, galeria, documento, áudio, texto ou localização — tudo entra no projeto certo.",
      },
      { property: "og:title", content: "Capture — GRIOT Mobile" },
      {
        property: "og:description",
        content: "Captura qualquer coisa e envia para o projeto certo.",
      },
    ],
  }),
  component: CapturePage,
});

function CapturePage() {
  const t = useT();
  const { user } = useCurrentUser();
  const queryClient = useQueryClient();
  const [sheet, setSheet] = useState(false);
  const [note, setNote] = useState("");
  const [pending, setPending] = useState<CaptureKind | null>(null);
  const [detail, setDetail] = useState<CaptureRow | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const kindRef = useRef<CaptureKind>("photo");

  const { data, refetch } = useQuery({
    queryKey: ["captures"],
    queryFn: async () => {
      const [captures, projects] = await Promise.all([getStoredCaptures(), getUnifiedProjects()]);
      return { captures, projects };
    },
  });

  useEffect(() => {
    const handler = () => {
      void refetch();
    };
    window.addEventListener("griot-captures-changed", handler);
    return () => window.removeEventListener("griot-captures-changed", handler);
  }, [refetch]);

  const activeProject = getActiveProjectSync() || data?.projects?.[0] || null;

  async function handleFileUpload(file: File, kind: CaptureKind) {
    setPending(kind);
    try {
      await saveCapture({
        kind,
        note: note.trim() || null,
        file,
        fileName: file.name,
        fileType: file.type,
        userId: user?.id,
      });
      setNote("");
      setSheet(false);
      toast.success(t("Captura guardada com sucesso!"));
      await refetch();
      await queryClient.invalidateQueries({ queryKey: ["captures"] });
    } catch (err) {
      console.error("[Capture] Erro ao guardar ficheiro:", err);
      toast.error(t("Não foi possível guardar a captura."));
    } finally {
      setPending(null);
    }
  }

  function pick(kind: CaptureKind) {
    kindRef.current = kind;
    const input = inputRef.current;
    if (!input) return;

    if (kind === "gallery") {
      // Abre diretamente o seletor nativo da galeria para Fotos e Vídeos
      input.accept = "image/*,video/*";
      input.removeAttribute("capture");
    } else if (kind === "photo") {
      // Abre diretamente a câmara para tirar foto
      input.accept = "image/*";
      input.setAttribute("capture", "environment");
    } else if (kind === "video") {
      // Abre diretamente a câmara para gravar vídeo
      input.accept = "video/*";
      input.setAttribute("capture", "environment");
    } else if (kind === "audio") {
      input.accept = "audio/*";
      input.removeAttribute("capture");
    } else if (kind === "screen") {
      input.accept = "image/*";
      input.removeAttribute("capture");
    } else {
      input.accept = "*/*";
      input.removeAttribute("capture");
    }

    input.click();
  }

  function locate() {
    if (!navigator.geolocation) {
      toast.error(t("Localização indisponível neste dispositivo."));
      return;
    }
    setPending("location");
    navigator.geolocation.getCurrentPosition(
      async (position) => {
        try {
          await saveCapture({
            kind: "location",
            note: note.trim() || null,
            latitude: position.coords.latitude,
            longitude: position.coords.longitude,
            userId: user?.id,
          });
          setNote("");
          setSheet(false);
          toast.success(t("Localização guardada!"));
          await refetch();
          await queryClient.invalidateQueries({ queryKey: ["captures"] });
        } catch {
          toast.error(t("Não foi possível guardar a captura."));
        } finally {
          setPending(null);
        }
      },
      (err) => {
        setPending(null);
        console.warn("[Capture] Erro de geolocalização:", err);
        toast.error(t("Não foi possível obter a localização."));
      },
      { enableHighAccuracy: true, timeout: 10000 },
    );
  }

  async function handleKind(kind: CaptureKind) {
    if (kind === "location") return locate();
    if (kind === "text") {
      if (!note.trim()) {
        toast.error(t("Escreve alguma coisa primeiro."));
        return;
      }
      setPending("text");
      try {
        await saveCapture({
          kind: "text",
          note: note.trim(),
          userId: user?.id,
        });
        setNote("");
        setSheet(false);
        toast.success(t("Nota guardada!"));
        await refetch();
        await queryClient.invalidateQueries({ queryKey: ["captures"] });
      } catch {
        toast.error(t("Não foi possível guardar a captura."));
      } finally {
        setPending(null);
      }
      return;
    }
    if (kind === "screen") {
      if (typeof navigator !== "undefined" && navigator.mediaDevices?.getDisplayMedia) {
        try {
          const stream = await navigator.mediaDevices.getDisplayMedia({ video: true });
          const track = stream.getVideoTracks()[0];
          const imageCapture = (window as any).ImageCapture
            ? new (window as any).ImageCapture(track)
            : null;
          if (imageCapture) {
            const blob = await imageCapture.takePhoto();
            track.stop();
            await saveCapture({
              kind: "screen",
              note: note.trim() || "Captura de ecrã",
              file: blob,
              fileName: `screen-${Date.now()}.png`,
              fileType: "image/png",
              userId: user?.id,
            });
            setNote("");
            setSheet(false);
            toast.success(t("Captura de ecrã guardada!"));
            await refetch();
            await queryClient.invalidateQueries({ queryKey: ["captures"] });
            return;
          }
          track.stop();
        } catch {
          // Utilizador cancelou ou fallback para selecionar screenshot da galeria
        }
      }
      pick("screen");
      return;
    }
    pick(kind);
  }

  return (
    <Screen title={t("Capture")} subtitle={t("O mundo físico entra aqui")}>
      <button
        onClick={() => setSheet(true)}
        className="panel grid aspect-square w-full place-items-center transition-transform duration-200 active:scale-[0.98]"
      >
        <div className="text-center">
          <div className="mx-auto grid size-24 place-items-center rounded-full bg-primary text-primary-foreground">
            <Camera className="size-9" />
          </div>
          <p className="mt-6 text-[22px] font-semibold tracking-tight">{t("Capturar")}</p>
          <p className="mt-1 text-[13.5px] text-muted-foreground">
            {activeProject?.name
              ? `${t("Vai para")} ${activeProject.name}`
              : t("Sem projeto ativo")}
          </p>
        </div>
      </button>

      <input
        ref={inputRef}
        type="file"
        className="hidden"
        onChange={(event) => {
          const file = event.target.files?.[0];
          if (file) void handleFileUpload(file, kindRef.current);
          event.target.value = "";
        }}
      />

      <p className="pt-2 text-[12px] font-medium tracking-wide text-muted-foreground uppercase">
        {t("Recentes")}
      </p>
      {data?.captures.length ? (
        <Panel className="divide-y divide-hairline">
          {data.captures.map((capture: StoredCapture) => (
            <button
              key={capture.id}
              onClick={() => setDetail(capture as unknown as CaptureRow)}
              className="flex w-full items-center justify-between gap-3 py-3 text-left transition-opacity duration-200 first:pt-0 last:pb-0 active:opacity-60"
            >
              <div className="min-w-0">
                <p className="truncate text-[15px] font-medium">
                  {capture.note ??
                    capture.file_name ??
                    t(CAPTURE_KINDS.find((k) => k.id === capture.kind)?.label ?? "")}
                </p>
                <p className="text-[12.5px] text-muted-foreground">
                  {relativeTime(capture.created_at)}
                  {capture.project_name ? ` · ${capture.project_name}` : ""}
                </p>
              </div>
              <span className="shrink-0 rounded-full border border-hairline px-2.5 py-1 text-[12px] text-muted-foreground">
                {t(CAPTURE_KINDS.find((k) => k.id === capture.kind)?.label ?? "")}
              </span>
            </button>
          ))}
        </Panel>
      ) : (
        <Empty text={t("Ainda não capturaste nada.")} />
      )}

      {detail ? (
        <CaptureDetail
          capture={detail}
          userId={user?.id || "local_user"}
          onClose={() => setDetail(null)}
        />
      ) : null}

      {sheet ? (
        <div className="fixed inset-0 z-50 flex items-end" onClick={() => setSheet(false)}>
          <div className="absolute inset-0 bg-black/40 backdrop-blur-sm" />
          <div
            className="sheet-up relative w-full rounded-t-[28px] border-t border-hairline bg-surface px-5 pt-3 pb-[calc(env(safe-area-inset-bottom)+24px)]"
            onClick={(event) => event.stopPropagation()}
          >
            <div className="mx-auto h-1 w-10 rounded-full bg-muted" />
            <textarea
              rows={2}
              value={note}
              onChange={(event) => setNote(event.target.value)}
              placeholder={t("Nota ou contexto (opcional)")}
              className="mt-5 w-full resize-none rounded-2xl border border-hairline bg-background px-4 py-3 text-[15px] outline-none placeholder:text-muted-foreground"
            />
            <div className="mt-4 grid grid-cols-2 gap-2.5">
              {CAPTURE_KINDS.map((kind) => (
                <button
                  key={kind.id}
                  onClick={() => void handleKind(kind.id)}
                  disabled={pending !== null}
                  className="rounded-2xl border border-hairline py-3.5 text-[15px] font-medium transition-transform duration-200 active:scale-95 disabled:opacity-40"
                >
                  {pending === kind.id ? t("A enviar…") : t(kind.label)}
                </button>
              ))}
            </div>
          </div>
        </div>
      ) : null}
    </Screen>
  );
}
