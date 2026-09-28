/**
 * Sistema Unificado de Notificações Nativas e de Permissões do GRIOT.
 * Funciona tanto em APK Nativo (Android NotificationManager + Canais)
 * como no ambiente Web/Preview (Web Notifications + Interatividade de UI).
 */

import { toast } from "sonner";
import { observerEngine } from "./runtime/observer";
import { loadPrefs, savePrefs } from "./settings";

export type NotificationType = "approval" | "message" | "deploy" | "task";

export interface GriotNotificationOptions {
  type: NotificationType;
  title: string;
  message: string;
  actionId?: string;
  url?: string;
  sender?: string;
}

/**
 * Dispara uma notificação nativa real com a identidade visual do GRIOT
 */
export async function sendGriotNotification(options: GriotNotificationOptions): Promise<boolean> {
  const { type, title, message, actionId, url, sender } = options;

  // 1. APK Nativo Android via Plugin Capacitor
  if (typeof window !== "undefined" && (window as any).Capacitor?.isNativePlatform?.()) {
    try {
      const plugin = (window as any).Capacitor?.Plugins?.GriotObserverPlugin;
      if (plugin?.sendNativeNotification) {
        await plugin.sendNativeNotification({
          type,
          title: title || (sender ? `GRIOT (${sender})` : "GRIOT"),
          message,
          actionId: actionId || `act_${Date.now()}`,
          url: url || "https://griot.ai",
        });
        return true;
      }
    } catch (e) {
      console.warn("Falha ao emitir notificação nativa Capacitor:", e);
    }
  }

  // 2. Web Notifications API (se suportado e autorizado)
  if (typeof window !== "undefined" && "Notification" in window) {
    if (Notification.permission === "granted") {
      try {
        const notif = new Notification(title, {
          body: message,
          icon: "/griot-mark.svg",
          badge: "/griot-mark.svg",
          tag: actionId || `griot_${type}_${Date.now()}`,
        });

        notif.onclick = () => {
          window.focus();
          if (url) window.open(url, "_blank");
        };
      } catch (err) {
        console.warn("Falha ao instanciar Web Notification:", err);
      }
    } else if (Notification.permission === "default") {
      void Notification.requestPermission();
    }
  }

  // 3. Feedback visual e interativo instantâneo na UI
  switch (type) {
    case "approval":
      toast(title || "Aprovação Requerida - GRIOT", {
        description: message,
        action: actionId
          ? {
              label: "Aprovar",
              onClick: () => {
                void observerEngine.approveAndExecute(actionId);
                toast.success("Ação aprovada e enviada para execução!");
              },
            }
          : undefined,
        cancel: actionId
          ? {
              label: "Rejeitar",
              onClick: () => {
                void observerEngine.rejectAction(actionId);
                toast.error("Ação rejeitada com segurança.");
              },
            }
          : undefined,
        duration: 12000,
      });
      break;

    case "deploy":
      toast.success(title || "Site Deployado com Sucesso! 🚀", {
        description: message,
        action: url
          ? {
              label: "Abrir Site",
              onClick: () => window.open(url, "_blank"),
            }
          : undefined,
        duration: 8000,
      });
      break;

    case "task":
      toast.info(title || "Tarefa Concluída", {
        description: message,
        duration: 6000,
      });
      break;

    case "message":
    default:
      toast(title || "GRIOT Core", {
        description: message,
        duration: 5000,
      });
      break;
  }

  return true;
}

/**
 * Solicita todas as permissões reais do dispositivo (Câmara, Microfone, Notificações, Localização, etc.)
 */
export async function requestAllNativePermissions(): Promise<{
  grantedCount: number;
  total: number;
  status: Record<string, boolean>;
}> {
  const results: Record<string, boolean> = {
    camera: false,
    microphone: false,
    notifications: false,
    location: false,
    contacts: false,
    calendar: false,
  };

  // Se estiver em APK nativo:
  if (typeof window !== "undefined" && (window as any).Capacitor?.isNativePlatform?.()) {
    try {
      const plugin = (window as any).Capacitor?.Plugins?.GriotObserverPlugin;
      if (plugin?.requestAllPermissions) {
        const res = await plugin.requestAllPermissions();
        if (res) {
          Object.assign(results, res);
        }
      }
    } catch (e) {
      console.warn("Erro ao pedir permissões nativas via plugin:", e);
    }
  }

  // Permissões Web / Fallbacks reais:
  // 1. Notificações
  if (typeof window !== "undefined" && "Notification" in window) {
    try {
      const perm = await Notification.requestPermission();
      results.notifications = perm === "granted";
    } catch {
      results.notifications = false;
    }
  }

  // 2. Microfone
  try {
    if (navigator.mediaDevices?.getUserMedia) {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      stream.getTracks().forEach((t) => t.stop());
      results.microphone = true;
    }
  } catch {
    results.microphone = false;
  }

  // 3. Câmara
  try {
    if (navigator.mediaDevices?.getUserMedia) {
      const stream = await navigator.mediaDevices.getUserMedia({ video: true });
      stream.getTracks().forEach((t) => t.stop());
      results.camera = true;
    }
  } catch {
    results.camera = false;
  }

  // 4. Localização
  try {
    await new Promise<void>((resolve) => {
      if (!navigator.geolocation) return resolve();
      navigator.geolocation.getCurrentPosition(
        () => {
          results.location = true;
          resolve();
        },
        () => {
          results.location = false;
          resolve();
        },
        { timeout: 5000 },
      );
    });
  } catch {
    results.location = false;
  }

  // Guardar preferências atualizadas
  const prefs = loadPrefs();
  savePrefs({
    ...prefs,
    permCamera: results.camera,
    permMic: results.microphone,
    permLocation: results.location,
    notificationsEnabled: results.notifications,
  });

  const grantedCount = Object.values(results).filter(Boolean).length;
  return {
    grantedCount,
    total: Object.keys(results).length,
    status: results,
  };
}

/**
 * Registra o escutador de eventos para quando o utilizador clica em "Aprovar" ou "Rejeitar"
 * numa notificação do sistema Android
 */
export function initNativeNotificationListeners() {
  if (typeof window === "undefined") return;

  // Escutar eventos do plugin nativo Capacitor
  if ((window as any).Capacitor?.isNativePlatform?.()) {
    try {
      (window as any).Capacitor?.Plugins?.GriotObserverPlugin?.addListener(
        "onApprovalAction",
        (data: { actionId: string; approved: boolean }) => {
          if (data.approved) {
            void observerEngine.approveAndExecute(data.actionId);
            toast.success(`Ação ${data.actionId} aprovada via notificação!`);
          } else {
            void observerEngine.rejectAction(data.actionId);
            toast.error(`Ação ${data.actionId} rejeitada via notificação.`);
          }
        },
      );
    } catch (e) {
      console.warn("Falha ao registrar addListener de aprovação:", e);
    }
  }

  // Escutar eventos CustomEvent locais (do BroadcastReceiver ou fallback)
  window.addEventListener("griot:approval-action", (e: any) => {
    const detail = e.detail;
    if (!detail?.actionId) return;
    if (detail.approved) {
      void observerEngine.approveAndExecute(detail.actionId);
      toast.success(`Ação aprovada com sucesso!`);
    } else {
      void observerEngine.rejectAction(detail.actionId);
      toast.error(`Ação rejeitada.`);
    }
  });
}

/**
 * Dispara a notificação apenas quando o utilizador NÃO está dentro do app
 * (separador escondido, app em segundo plano ou janela sem foco).
 */
export async function notifyIfBackgrounded(options: GriotNotificationOptions): Promise<boolean> {
  if (typeof document === "undefined") return false;
  const inForeground = document.visibilityState === "visible" && document.hasFocus();
  if (inForeground) return false;
  return sendGriotNotification(options);
}
