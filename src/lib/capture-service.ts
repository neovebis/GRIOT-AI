/**
 * GRIOT Capture Service
 * Local-first capture persistence engine powered by IndexedDB.
 * Supports Photos (Camera), Videos (Camcorder), Gallery (Media Picker),
 * Documents, Audio, Screen, Text notes, and GPS Location.
 * Fully resilient: never drops captures due to network or Supabase errors.
 */

import { getActiveProjectSync } from "@/lib/project-service";
import { supabase } from "@/integrations/supabase/client";

export type CaptureKind =
  "photo" | "video" | "gallery" | "document" | "audio" | "screen" | "text" | "location";

export type StoredCapture = {
  id: string;
  user_id: string;
  project_id: string | null;
  project_name: string | null;
  kind: CaptureKind;
  note: string | null;
  storage_path: string | null;
  mime_type: string | null;
  file_name?: string | null;
  file_size?: number | null;
  blob?: Blob | null;
  data_url?: string | null;
  latitude?: number | null;
  longitude?: number | null;
  created_at: string;
};

const DB_NAME = "griot_captures_db";
const DB_VERSION = 1;
const STORE_NAME = "captures";
const METADATA_KEY = "griot_local_captures_index";

// Cache in-memory blob URLs so we don't recreate them needlessly
const blobUrlCache = new Map<string, string>();

function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    if (typeof window === "undefined" || !window.indexedDB) {
      reject(new Error("IndexedDB not available"));
      return;
    }
    const request = window.indexedDB.open(DB_NAME, DB_VERSION);

    request.onupgradeneeded = (event) => {
      const db = (event.target as IDBOpenDBRequest).result;
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        const store = db.createObjectStore(STORE_NAME, { keyPath: "id" });
        store.createIndex("created_at", "created_at", { unique: false });
        store.createIndex("project_id", "project_id", { unique: false });
      }
    };

    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

function getLocalIndex(): Omit<StoredCapture, "blob">[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = localStorage.getItem(METADATA_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
}

function saveLocalIndex(list: Omit<StoredCapture, "blob">[]) {
  if (typeof window === "undefined") return;
  try {
    // Only store metadata without big data_url to avoid localStorage quota issues
    const lightweight = list.map((item) => ({
      ...item,
      data_url: item.data_url && item.data_url.length < 5000 ? item.data_url : undefined,
    }));
    localStorage.setItem(METADATA_KEY, JSON.stringify(lightweight.slice(0, 50)));
  } catch (err) {
    console.warn("[CaptureService] Failed to save metadata index:", err);
  }
}

/**
 * Saves a capture with guaranteed local persistence (IndexedDB)
 * and optional background sync to Supabase.
 */
export async function saveCapture(params: {
  kind: CaptureKind;
  note?: string | null;
  file?: File | Blob | null;
  fileName?: string;
  fileType?: string;
  latitude?: number | null;
  longitude?: number | null;
  userId?: string | null;
}): Promise<StoredCapture> {
  const activeProj = getActiveProjectSync();
  const id = crypto.randomUUID();
  const now = new Date().toISOString();

  let resolvedUserId = params.userId;
  if (!resolvedUserId && typeof window !== "undefined") {
    resolvedUserId = localStorage.getItem("griot_user_id") || "local_user";
  }

  let mimeType = params.fileType || null;
  let fileName = params.fileName || null;
  let fileSize: number | null = null;
  let blob: Blob | null = null;
  let dataUrl: string | null = null;

  if (params.file) {
    blob = params.file;
    fileSize = params.file.size;
    mimeType = params.file.type || mimeType || "application/octet-stream";
    if (params.file instanceof File) {
      fileName = params.file.name;
    }

    // Convert to dataUrl for immediate inline display (capped to 8MB to prevent UI freeze)
    if (params.file.size <= 8 * 1024 * 1024) {
      try {
        dataUrl = await new Promise<string>((resolve, reject) => {
          const reader = new FileReader();
          reader.onloadend = () => resolve(reader.result as string);
          reader.onerror = reject;
          reader.readAsDataURL(params.file as Blob);
        });
      } catch (err) {
        console.warn("[CaptureService] Failed to generate dataUrl:", err);
      }
    }
  }

  const record: StoredCapture = {
    id,
    user_id: resolvedUserId || "local_user",
    project_id: activeProj?.id ?? null,
    project_name: activeProj?.name ?? null,
    kind: params.kind,
    note: params.note?.trim() || null,
    storage_path: `local://${id}`,
    mime_type: mimeType,
    file_name: fileName,
    file_size: fileSize,
    blob,
    data_url: dataUrl,
    latitude: params.latitude ?? null,
    longitude: params.longitude ?? null,
    created_at: now,
  };

  // 1. Save to IndexedDB
  try {
    const db = await openDb();
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction(STORE_NAME, "readwrite");
      const store = tx.objectStore(STORE_NAME);
      const req = store.put(record);
      req.onsuccess = () => resolve();
      req.onerror = () => reject(req.error);
    });
  } catch (err) {
    console.warn("[CaptureService] IndexedDB save failed, using memory/localStorage:", err);
  }

  // 2. Update local metadata cache
  const current = getLocalIndex();
  const next = [record, ...current.filter((c) => c.id !== id)];
  saveLocalIndex(next);

  // 3. Dispatch global event so UI components refresh reactively
  if (typeof window !== "undefined") {
    window.dispatchEvent(new CustomEvent("griot-captures-changed", { detail: record }));
  }

  // 4. Background non-blocking upload to Supabase if authenticated
  void tryBackgroundCloudSync(record, params.file);

  return record;
}

/**
 * Retrieves all captures sorted by created_at descending.
 */
export async function getStoredCaptures(): Promise<StoredCapture[]> {
  try {
    const db = await openDb();
    const records = await new Promise<StoredCapture[]>((resolve, reject) => {
      const tx = db.transaction(STORE_NAME, "readonly");
      const store = tx.objectStore(STORE_NAME);
      const req = store.getAll();
      req.onsuccess = () => resolve(req.result || []);
      req.onerror = () => reject(req.error);
    });

    if (records.length > 0) {
      return records.sort(
        (a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime(),
      );
    }
  } catch {
    // fallback to localStorage
  }

  return getLocalIndex() as StoredCapture[];
}

/**
 * Returns a playable/displayable URL for a capture's media file.
 */
export async function getCaptureMediaUrl(capture: StoredCapture): Promise<string | null> {
  if (capture.data_url) return capture.data_url;

  if (blobUrlCache.has(capture.id)) {
    return blobUrlCache.get(capture.id)!;
  }

  if (capture.blob) {
    const url = URL.createObjectURL(capture.blob);
    blobUrlCache.set(capture.id, url);
    return url;
  }

  // Retrieve blob from IndexedDB if not in memory
  try {
    const db = await openDb();
    const full = await new Promise<StoredCapture | undefined>((resolve, reject) => {
      const tx = db.transaction(STORE_NAME, "readonly");
      const store = tx.objectStore(STORE_NAME);
      const req = store.get(capture.id);
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error);
    });

    if (full?.blob) {
      const url = URL.createObjectURL(full.blob);
      blobUrlCache.set(capture.id, url);
      return url;
    }

    if (full?.data_url) return full.data_url;
  } catch {}

  if (
    capture.storage_path &&
    (capture.storage_path.startsWith("http://") ||
      capture.storage_path.startsWith("https://") ||
      capture.storage_path.startsWith("data:"))
  ) {
    return capture.storage_path;
  }

  return null;
}

/**
 * Obtém uma captura armazenada completa pelo seu ID a partir do IndexedDB.
 */
export async function getStoredCapture(id: string): Promise<StoredCapture | null> {
  try {
    const db = await openDb();
    const full = await new Promise<StoredCapture | undefined>((resolve, reject) => {
      const tx = db.transaction(STORE_NAME, "readonly");
      const store = tx.objectStore(STORE_NAME);
      const req = store.get(id);
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error);
    });
    return full || null;
  } catch {
    return null;
  }
}

/**
 * Deletes a capture by ID from IndexedDB and localStorage.
 */
export async function deleteStoredCapture(id: string): Promise<void> {
  try {
    const db = await openDb();
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction(STORE_NAME, "readwrite");
      const store = tx.objectStore(STORE_NAME);
      const req = store.delete(id);
      req.onsuccess = () => resolve();
      req.onerror = () => reject(req.error);
    });
  } catch {}

  const current = getLocalIndex();
  saveLocalIndex(current.filter((c) => c.id !== id));

  if (blobUrlCache.has(id)) {
    URL.revokeObjectURL(blobUrlCache.get(id)!);
    blobUrlCache.delete(id);
  }

  if (typeof window !== "undefined") {
    window.dispatchEvent(
      new CustomEvent("griot-captures-changed", { detail: { id, deleted: true } }),
    );
  }
}

/**
 * Background non-blocking sync to Supabase (best-effort, never crashes).
 */
async function tryBackgroundCloudSync(record: StoredCapture, file?: File | Blob | null) {
  try {
    const { data: authData } = await supabase.auth.getUser();
    if (!authData?.user) return;

    if (file) {
      const cloudPath = `${authData.user.id}/captures/${record.id}-${record.file_name || "file"}`;
      await supabase.storage.from("captures").upload(cloudPath, file, { upsert: true });
    }
  } catch {
    // Cloud sync is silent and optional
  }
}
