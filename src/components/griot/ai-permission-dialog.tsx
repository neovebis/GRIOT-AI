import { useEffect, useState } from "react";
import {
  AiPermissionRequest,
  subscribeToAiPermissions,
  requestRealCameraPermission,
  requestRealMicrophonePermission,
  requestRealLocationPermission,
  verifyRealBiometrics,
} from "@/lib/permissions";
import { Camera, Mic, MapPin, ShieldAlert, Cpu, Bell, Check, X, Smartphone } from "lucide-react";
import { useT } from "@/lib/i18n";
import { toast } from "sonner";

export function AiPermissionDialog() {
  const t = useT();
  const [request, setRequest] = useState<AiPermissionRequest | null>(null);
  const [processing, setProcessing] = useState(false);

  useEffect(() => {
    return subscribeToAiPermissions((req) => {
      setRequest(req);
    });
  }, []);

  if (!request) return null;

  const getIcon = () => {
    switch (request.type) {
      case "camera":
        return <Camera className="size-6 text-primary" />;
      case "microphone":
        return <Mic className="size-6 text-primary" />;
      case "geolocation":
        return <MapPin className="size-6 text-primary" />;
      case "notifications":
        return <Bell className="size-6 text-primary" />;
      case "biometrics":
        return <ShieldAlert className="size-6 text-primary" />;
      default:
        return <Cpu className="size-6 text-primary" />;
    }
  };

  const handleApprove = async () => {
    setProcessing(true);
    try {
      if (request.type === "camera") {
        const res = await requestRealCameraPermission();
        if (!res.granted) {
          toast.error(res.error || t("Permissão de câmara negada."));
        }
      } else if (request.type === "microphone") {
        const res = await requestRealMicrophonePermission();
        if (!res.granted) {
          toast.error(res.error || t("Permissão de microfone negada."));
        }
      } else if (request.type === "geolocation") {
        const res = await requestRealLocationPermission();
        if (!res.granted) {
          toast.error(res.error || t("Permissão de localização negada."));
        }
      } else if (request.type === "biometrics") {
        const res = await verifyRealBiometrics();
        if (!res.success) {
          toast.error(res.error || t("Falha na autenticação biométrica."));
        }
      }
      request.onApprove?.();
      toast.success(t("Permissão concedida para o GRIOT."));
    } finally {
      setProcessing(false);
    }
  };

  const handleDeny = () => {
    request.onDeny?.();
    toast.info(t("Pedido de permissão recusado."));
  };

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-3 bg-black/60 backdrop-blur-sm animate-in fade-in duration-200">
      <div className="w-full max-w-md rounded-[24px] border border-hairline bg-surface p-5 shadow-2xl space-y-4">
        <div className="flex items-start gap-3.5">
          <div className="grid size-12 shrink-0 place-items-center rounded-2xl bg-primary/10 border border-primary/20">
            {getIcon()}
          </div>
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-1.5 text-[11.5px] font-semibold uppercase tracking-wider text-primary">
              <Smartphone className="size-3.5" />
              <span>{request.requester || "ModelOS / GRIOT"}</span>
            </div>
            <h3 className="text-[17px] font-semibold text-foreground mt-0.5">{request.title}</h3>
            <p className="text-[13px] text-muted-foreground mt-1 leading-relaxed">
              {request.reason}
            </p>
          </div>
        </div>

        <div className="rounded-xl bg-secondary/40 border border-hairline p-3 text-[12px] text-muted-foreground">
          <p>
            {t("O assistente aguarda autorização para utilizar este recurso no seu dispositivo.")}
          </p>
        </div>

        <div className="flex items-center gap-2 pt-1">
          <button
            onClick={handleDeny}
            disabled={processing}
            className="flex-1 flex items-center justify-center gap-1.5 rounded-full border border-hairline py-2.5 text-[13.5px] font-medium text-muted-foreground hover:text-foreground hover:bg-secondary/50 transition-colors"
          >
            <X className="size-4" />
            <span>{t("Recusar")}</span>
          </button>
          <button
            onClick={handleApprove}
            disabled={processing}
            className="flex-1 flex items-center justify-center gap-1.5 rounded-full bg-primary text-primary-foreground py-2.5 text-[13.5px] font-semibold shadow-md hover:opacity-90 active:scale-95 transition-all"
          >
            <Check className="size-4" />
            <span>{processing ? t("A verificar…") : t("Autorizar Acesso")}</span>
          </button>
        </div>
      </div>
    </div>
  );
}
