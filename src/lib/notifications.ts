// Real Browser Notifications and push alerts manager for GRIOT & ModelOS
import { toast } from "sonner";
import { loadPrefs, savePrefs } from "./settings";

export interface NotificationPayload {
  title: string;
  body: string;
  tag?: string;
  icon?: string;
  badge?: string;
  data?: Record<string, unknown>;
  category?: string;
}

/** Check if Notification API is supported */
export function isNotificationSupported(): boolean {
  return typeof window !== "undefined" && "Notification" in window;
}

/** Get current browser permission state */
export function getNotificationPermissionState(): NotificationPermission {
  if (!isNotificationSupported()) return "denied";
  return Notification.permission;
}

/** Request real browser notification permission */
export async function requestRealNotificationPermission(): Promise<{
  granted: boolean;
  permission: NotificationPermission;
}> {
  if (!isNotificationSupported()) {
    return { granted: false, permission: "denied" };
  }

  try {
    const perm = await Notification.requestPermission();
    const granted = perm === "granted";
    const prefs = loadPrefs();
    savePrefs({ ...prefs, "notify:system_enabled": granted });
    return { granted, permission: perm };
  } catch (err) {
    return { granted: false, permission: "denied" };
  }
}

/** Send real browser notification if permitted, or fallback to UI toast */
export function sendRealNotification(payload: NotificationPayload): boolean {
  if (!isNotificationSupported()) {
    toast(payload.title, { description: payload.body });
    return false;
  }

  const prefs = loadPrefs();
  // Check if quiet hours is active
  if (prefs["notify:quietHours"] === true) {
    return false;
  }

  // If specific category is disabled in prefs
  if (payload.category && prefs[`notify:${payload.category}`] === false) {
    return false;
  }

  if (Notification.permission === "granted") {
    try {
      const notif = new Notification(payload.title, {
        body: payload.body,
        icon: payload.icon || "/favicon.ico",
        tag: payload.tag || "griot-general",
        badge: payload.badge,
      });

      notif.onclick = () => {
        window.focus();
        notif.close();
      };

      // Sound feedback if available
      try {
        if ("vibrate" in navigator) {
          navigator.vibrate([100, 50, 100]);
        }
      } catch {
        // ignore
      }

      return true;
    } catch {
      toast(payload.title, { description: payload.body });
      return false;
    }
  } else {
    // If not permitted in system, show interactive in-app toast
    toast(payload.title, { description: payload.body });
    return false;
  }
}

/** Test notification dispatcher */
export async function testSystemNotification(): Promise<void> {
  const perm = await requestRealNotificationPermission();
  if (perm.granted) {
    sendRealNotification({
      title: "GRIOT ModelOS — Notificação Ativa",
      body: "O sistema de notificações do GRIOT está agora ligado e a receber eventos de raciocínio.",
      category: "taskDone",
      tag: "test-notification",
    });
    toast.success("Notificação de teste enviada com sucesso!");
  } else {
    toast.info("Permissão de notificações não concedida no browser.", {
      description: "Pode ativar as permissões nas definições do seu navegador.",
    });
  }
}
