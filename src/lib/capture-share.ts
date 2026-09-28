import { supabase } from "@/integrations/supabase/client";
import { getCaptureMediaUrl, StoredCapture } from "@/lib/capture-service";
import { getCurrentWorkspaceId } from "@/lib/workspace";

export type CaptureRow = {
  id: string;
  kind: string;
  note: string | null;
  storage_path: string | null;
  mime_type: string | null;
  latitude: number | null;
  longitude: number | null;
  project_id: string | null;
  created_at: string;
  file_name?: string | null;
  file_size?: number | null;
  data_url?: string | null;
  project_name?: string | null;
  blob?: Blob | null;
};

/** Data e hora exatas, para a barra de detalhe do Capture. */
export function exactDateTime(iso: string) {
  const date = new Date(iso);
  return new Intl.DateTimeFormat("pt-PT", {
    day: "2-digit",
    month: "long",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  }).format(date);
}

export async function captureUrl(path: string | null, capture?: CaptureRow | null) {
  if (capture?.data_url) return capture.data_url;
  if (capture) {
    try {
      const mediaUrl = await getCaptureMediaUrl(capture as unknown as StoredCapture);
      if (mediaUrl) return mediaUrl;
    } catch {}
  }
  if (!path) return null;
  if (
    path.startsWith("http://") ||
    path.startsWith("https://") ||
    path.startsWith("data:") ||
    path.startsWith("blob:")
  ) {
    return path;
  }
  if (path.startsWith("local://")) {
    const id = path.replace("local://", "");
    try {
      const mediaUrl = await getCaptureMediaUrl({ id, storage_path: path } as StoredCapture);
      if (mediaUrl) return mediaUrl;
    } catch {}
  }
  try {
    const { data } = await supabase.storage.from("captures").createSignedUrl(path, 3600);
    if (data?.signedUrl) return data.signedUrl;
    const { data: publicUrlData } = supabase.storage.from("captures").getPublicUrl(path);
    return publicUrlData?.publicUrl ?? null;
  } catch {
    return null;
  }
}

export function captureTitle(capture: CaptureRow) {
  if (capture.note?.trim()) return capture.note.trim();
  if (capture.kind === "location" && capture.latitude != null && capture.longitude != null) {
    return `${capture.latitude.toFixed(5)}, ${capture.longitude.toFixed(5)}`;
  }
  if (capture.file_name) return capture.file_name;
  if (capture.storage_path && !capture.storage_path.startsWith("local://")) {
    return capture.storage_path.split("/").pop() ?? capture.kind;
  }
  return capture.kind;
}

/** Texto que representa a captura quando é enviada para uma conversa. */
export async function captureAsText(capture: CaptureRow) {
  const isImg = capture.mime_type?.startsWith("image/") || capture.kind === "photo";
  const isAud = capture.mime_type?.startsWith("audio/") || capture.kind === "audio";
  const isVid = capture.mime_type?.startsWith("video/") || capture.kind === "video";
  const isDoc = capture.kind === "document";

  let url = await captureUrl(capture.storage_path, capture);
  if (!url && isImg) {
    url = `local://${capture.id}`;
  }

  const title = captureTitle(capture);
  const note = capture.note?.trim();

  if (isImg && url) {
    const meta = {
      fileName: capture.file_name || `${title}.jpg`,
      fileSize: "Imagem",
      kind: "image" as const,
      userNote: note || undefined,
      summary: `Captura de imagem "${title}"`,
    };
    return `<!--GRIOT_ATTACHMENT_META:${JSON.stringify(meta)}-->\n\n![${meta.fileName}](${url})\n\n${note ? `**Mensagem do Utilizador:** ${note}\n\n` : ""}Por favor analisa esta imagem.`;
  }

  if (isAud) {
    const meta = {
      fileName: capture.file_name || `${title}.mp3`,
      fileSize: "Áudio",
      kind: "audio" as const,
      userNote: note || undefined,
      summary: `Captura de áudio "${title}"`,
    };
    return `<!--GRIOT_ATTACHMENT_META:${JSON.stringify(meta)}-->\n\n${note ? `**Mensagem do Utilizador:** ${note}\n\n` : ""}🎙️ **[Ficheiro de Áudio Anexado: ${meta.fileName}]**\n\nPor favor analisa este áudio.`;
  }

  if (isVid) {
    const meta = {
      fileName: capture.file_name || `${title}.mp4`,
      fileSize: "Vídeo",
      kind: "video" as const,
      userNote: note || undefined,
      summary: `Captura de vídeo "${title}"`,
    };
    return `<!--GRIOT_ATTACHMENT_META:${JSON.stringify(meta)}-->\n\n${note ? `**Mensagem do Utilizador:** ${note}\n\n` : ""}🎬 **[Ficheiro de Vídeo Anexado: ${meta.fileName}]**\n\nPor favor analisa este vídeo.`;
  }

  if (isDoc) {
    const meta = {
      fileName: capture.file_name || `${title}.pdf`,
      fileSize: "Documento",
      kind: "document" as const,
      userNote: note || undefined,
      summary: `Documento "${title}"`,
    };
    return `<!--GRIOT_ATTACHMENT_META:${JSON.stringify(meta)}-->\n\n${note ? `**Mensagem do Utilizador:** ${note}\n\n` : ""}📑 **[Documento Anexado: ${meta.fileName}]**\n\nPor favor analisa este documento.`;
  }

  const lines = [`Capture (${capture.kind}) — ${exactDateTime(capture.created_at)}`];
  if (note) lines.push(note);
  if (capture.latitude != null && capture.longitude != null) {
    lines.push(
      `Localização: https://www.google.com/maps?q=${capture.latitude},${capture.longitude}`,
    );
  }
  if (url) {
    lines.push(url);
  }
  return lines.join("\n");
}

/** Envia para uma conversa: usa a mais recente ou cria uma nova. */
export async function sendCaptureToConversation(capture: CaptureRow, userId: string) {
  let conversationId: string | null = null;
  try {
    const { data: existing } = await (supabase as any)
      .from("griot_conversations")
      .select("id")
      .order("updated_at", { ascending: false })
      .limit(1);

    conversationId = existing?.[0]?.id ?? null;
  } catch {}

  // Fallback para conversas locais do chat-surface
  if (!conversationId && typeof window !== "undefined") {
    try {
      const localConvsRaw = localStorage.getItem("griot_local_conversations");
      if (localConvsRaw) {
        const parsed = JSON.parse(localConvsRaw);
        if (Array.isArray(parsed) && parsed.length > 0) {
          conversationId = parsed[0].id;
        }
      }
    } catch {}
  }

  if (!conversationId) {
    try {
      const { data: created } = await (supabase as any)
        .from("griot_conversations")
        .insert({
          owner_id: userId,
          created_by: userId,
          title: "Captura",
        })
        .select("id")
        .single();
      conversationId = created?.id ?? null;
    } catch {}
  }

  if (!conversationId) {
    conversationId = crypto.randomUUID();
  }

  const content = await captureAsText(capture);

  try {
    await (supabase as any).from("griot_messages").insert({
      conversation_id: conversationId,
      actor_kind: "human",
      content,
      status: "succeeded",
    });
  } catch {}

  // Também grava nas mensagens locais para exibição imediata no chat
  if (typeof window !== "undefined") {
    try {
      const key = `griot_local_messages_${conversationId}`;
      const existing = localStorage.getItem(key);
      const msgs = existing ? JSON.parse(existing) : [];
      const newMsg = {
        id: crypto.randomUUID(),
        conversation_id: conversationId,
        actor_kind: "human",
        content,
        status: "succeeded",
        created_at: new Date().toISOString(),
      };
      localStorage.setItem(key, JSON.stringify([...msgs, newMsg]));
      window.dispatchEvent(new CustomEvent("griot-chat-message-added", { detail: newMsg }));
    } catch {}
  }

  return conversationId;
}

/** Envia para o Control Center como registo. */
export async function sendCaptureToControl(capture: CaptureRow, userId: string) {
  try {
    const workspaceId = await getCurrentWorkspaceId(userId);
    if (!workspaceId) throw new Error("sem workspace");
    const { error } = await supabase.from("griot_opb_events").insert({
      id: crypto.randomUUID(),
      created_at: new Date().toISOString(),
      workspace_id: workspaceId,
      project_id: capture.project_id,
      actor_id: userId,
      source_id: "capture",
      event_type: "capture.control",
      payload: {
        level: "info",
        message: `${captureTitle(capture)} · ${exactDateTime(capture.created_at)}`,
      },
    });
    if (error) throw error;
  } catch {
    console.info("[Control] Log registado localmente:", captureTitle(capture));
  }
}

const QUICK_KEY = "griot-quick-captures";

export function listQuickCaptures(): string[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = window.localStorage.getItem(QUICK_KEY);
    const parsed = raw ? (JSON.parse(raw) as unknown) : [];
    return Array.isArray(parsed) ? parsed.filter((id): id is string => typeof id === "string") : [];
  } catch {
    return [];
  }
}

/** Marca a captura como rápida (aparece no “+” do chat). */
export function pushQuickCapture(id: string) {
  if (typeof window === "undefined") return;
  const next = [id, ...listQuickCaptures().filter((item) => item !== id)].slice(0, 12);
  window.localStorage.setItem(QUICK_KEY, JSON.stringify(next));
}
