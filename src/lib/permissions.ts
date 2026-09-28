// Real browser permissions & hardware capabilities manager for GRIOT / ModelOS
import { toast } from "sonner";
import { loadPrefs, savePrefs } from "./settings";

export type PermissionType =
  | "camera"
  | "microphone"
  | "geolocation"
  | "bluetooth"
  | "notifications"
  | "clipboard"
  | "biometrics";

export interface AiPermissionRequest {
  id: string;
  type: PermissionType;
  title: string;
  reason: string;
  requester: string; // e.g. "ModelOS", "GRIOT Assistant", "Observer Core 2"
  icon?: string;
  onApprove?: () => void;
  onDeny?: () => void;
}

type PermissionListener = (req: AiPermissionRequest | null) => void;
const permissionListeners: Set<PermissionListener> = new Set();
let currentPermissionRequest: AiPermissionRequest | null = null;

export function subscribeToAiPermissions(listener: PermissionListener) {
  permissionListeners.add(listener);
  listener(currentPermissionRequest);
  return () => {
    permissionListeners.delete(listener);
  };
}

export function requestAiPermission(req: Omit<AiPermissionRequest, "id">): Promise<boolean> {
  return new Promise((resolve) => {
    const id = `perm_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`;
    const fullRequest: AiPermissionRequest = {
      ...req,
      id,
      onApprove: () => {
        currentPermissionRequest = null;
        notifyListeners();
        req.onApprove?.();
        resolve(true);
      },
      onDeny: () => {
        currentPermissionRequest = null;
        notifyListeners();
        req.onDeny?.();
        resolve(false);
      },
    };

    currentPermissionRequest = fullRequest;
    notifyListeners();
  });
}

function notifyListeners() {
  permissionListeners.forEach((l) => l(currentPermissionRequest));
}

/** Request Camera permission with real MediaDevices API */
export async function requestRealCameraPermission(): Promise<{ granted: boolean; error?: string }> {
  try {
    if (!navigator.mediaDevices?.getUserMedia) {
      return { granted: false, error: "API de MediaDevices indisponível neste navegador." };
    }
    const stream = await navigator.mediaDevices.getUserMedia({ video: true });
    // Stop tracks immediately after verifying permission
    stream.getTracks().forEach((track) => track.stop());
    const prefs = loadPrefs();
    savePrefs({ ...prefs, permCamera: true });
    return { granted: true };
  } catch (err: unknown) {
    const message =
      err instanceof Error ? err.message : "Permissão de câmara recusada pelo utilizador.";
    const prefs = loadPrefs();
    savePrefs({ ...prefs, permCamera: false });
    return { granted: false, error: message };
  }
}

/** Request Microphone permission with real MediaDevices API */
export async function requestRealMicrophonePermission(): Promise<{
  granted: boolean;
  error?: string;
}> {
  try {
    if (!navigator.mediaDevices?.getUserMedia) {
      return { granted: false, error: "API de Microfone indisponível neste navegador." };
    }
    const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    stream.getTracks().forEach((track) => track.stop());
    const prefs = loadPrefs();
    savePrefs({ ...prefs, permMic: true });
    return { granted: true };
  } catch (err: unknown) {
    const message =
      err instanceof Error ? err.message : "Permissão de microfone recusada pelo utilizador.";
    const prefs = loadPrefs();
    savePrefs({ ...prefs, permMic: false });
    return { granted: false, error: message };
  }
}

/** Request Geolocation permission with real Geolocation API */
export async function requestRealLocationPermission(): Promise<{
  granted: boolean;
  coords?: GeolocationCoordinates;
  error?: string;
}> {
  return new Promise((resolve) => {
    if (!navigator.geolocation) {
      resolve({ granted: false, error: "Geolocalização não suportada no dispositivo." });
      return;
    }
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        const prefs = loadPrefs();
        savePrefs({ ...prefs, permLocation: true });
        resolve({ granted: true, coords: pos.coords });
      },
      (err) => {
        const prefs = loadPrefs();
        savePrefs({ ...prefs, permLocation: false });
        resolve({ granted: false, error: err.message || "Permissão de localização negada." });
      },
      { timeout: 8000, enableHighAccuracy: false },
    );
  });
}

/** Request Bluetooth Device or check Bluetooth API */
export async function requestRealBluetoothPermission(): Promise<{
  granted: boolean;
  error?: string;
}> {
  try {
    const nav = navigator as any;
    if (!nav.bluetooth) {
      return { granted: false, error: "Web Bluetooth API não suportada neste browser/plataforma." };
    }
    const prefs = loadPrefs();
    savePrefs({ ...prefs, permBluetooth: true });
    return { granted: true };
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Acesso Bluetooth indisponível.";
    return { granted: false, error: message };
  }
}

/** Biometric / WebAuthn verification */
export async function verifyRealBiometrics(
  promptTitle = "Autenticação Biométrica GRIOT",
): Promise<{ success: boolean; error?: string }> {
  try {
    if (typeof window === "undefined" || !window.PublicKeyCredential) {
      return { success: false, error: "WebAuthn / Biometria não suportada neste dispositivo." };
    }

    const available = await PublicKeyCredential.isUserVerifyingPlatformAuthenticatorAvailable();
    if (!available) {
      return {
        success: false,
        error: "Nenhum autenticador biométrico (FaceID/Impressão digital) encontrado.",
      };
    }

    // Try a simple WebAuthn assertion challenge
    const challenge = new Uint8Array(32);
    window.crypto.getRandomValues(challenge);

    const credential = await navigator.credentials.get({
      publicKey: {
        challenge,
        timeout: 60000,
        userVerification: "preferred",
        rpId: window.location.hostname,
      },
    });

    if (credential) {
      return { success: true };
    }
    return { success: false, error: "Autenticação biométrica cancelada ou não confirmada." };
  } catch (err: unknown) {
    // User might cancel or no credentials registered yet — simulate platform fallback confirmation
    const message = err instanceof Error ? err.message : "Falha na verificação biométrica.";
    return { success: false, error: message };
  }
}

/** Real local data purge */
export async function clearAllLocalData(): Promise<{ itemsCleared: number }> {
  let count = 0;
  try {
    if (typeof window !== "undefined") {
      count = localStorage.length;
      const keepEmail = localStorage.getItem("griot_user_email");
      const keepName = localStorage.getItem("griot_user_name");
      const keepAvatar = localStorage.getItem("griot_user_avatar");

      localStorage.clear();
      sessionStorage.clear();

      if (keepEmail) localStorage.setItem("griot_user_email", keepEmail);
      if (keepName) localStorage.setItem("griot_user_name", keepName);
      if (keepAvatar) localStorage.setItem("griot_user_avatar", keepAvatar);

      // Clear caches API
      if ("caches" in window) {
        const keys = await caches.keys();
        await Promise.all(keys.map((k) => caches.delete(k)));
      }

      // Clear IndexedDB if possible
      if ("indexedDB" in window) {
        try {
          const dbs = await window.indexedDB.databases?.();
          if (dbs) {
            dbs.forEach((db) => {
              if (db.name) window.indexedDB.deleteDatabase(db.name);
            });
          }
        } catch {
          // ignore
        }
      }
    }
    return { itemsCleared: count };
  } catch {
    return { itemsCleared: count };
  }
}
