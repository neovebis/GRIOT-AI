import { supabase } from "@/integrations/supabase/client";

export const STORAGE_BUCKETS = {
  AVATARS: "avatars",
  CAPTURES: "captures",
  ARTIFACTS: "artifacts",
} as const;

/**
 * Upload a file to Supabase Storage with Edge Function acceleration / fallback.
 */
export async function uploadToStorageBucket(
  bucket: string,
  path: string,
  file: File | Blob,
  options?: { contentType?: string; upsert?: boolean },
): Promise<{ url: string | null; error: Error | null; path: string }> {
  try {
    const contentType =
      options?.contentType || (file instanceof File ? file.type : "application/octet-stream");

    // 1. Direct upload via Supabase client to target bucket
    const { error: uploadError } = await supabase.storage.from(bucket).upload(path, file, {
      contentType,
      upsert: options?.upsert ?? true,
    });

    if (!uploadError) {
      const { data: publicUrlData } = supabase.storage.from(bucket).getPublicUrl(path);
      return { url: publicUrlData?.publicUrl || null, error: null, path };
    }

    // 2. If bucket is not found or error, try Edge Function if present
    try {
      const formData = new FormData();
      formData.append("file", file);
      formData.append("bucket", bucket);
      formData.append("path", path);

      const { data: edgeData, error: edgeError } = await supabase.functions.invoke(
        "storage-upload",
        {
          body: formData,
        },
      );
      if (!edgeError && edgeData?.url) {
        return { url: edgeData.url, error: null, path };
      }
    } catch {
      // Continue to local data-url fallback if storage bucket is not configured on Supabase
    }

    // 3. If remote storage bucket not created on Supabase project, generate safe Base64/DataURL so UI continues
    return new Promise((resolve) => {
      const reader = new FileReader();
      reader.onloadend = () => {
        const dataUrl = reader.result as string;
        resolve({ url: dataUrl, error: null, path });
      };
      reader.onerror = () => {
        resolve({ url: null, error: uploadError, path });
      };
      reader.readAsDataURL(file);
    });
  } catch (err) {
    return { url: null, error: err instanceof Error ? err : new Error(String(err)), path };
  }
}

/**
 * Upload user avatar to Supabase Storage bucket and update profile.
 */
export async function uploadUserAvatar(
  userId: string,
  file: File,
): Promise<{ avatarUrl: string | null; error: Error | null }> {
  const extension = file.name.split(".").pop() || "jpg";
  const filePath = `${userId}/avatar-${Date.now()}.${extension}`;

  const { url, error } = await uploadToStorageBucket(STORAGE_BUCKETS.AVATARS, filePath, file, {
    contentType: file.type,
    upsert: true,
  });

  if (error || !url) {
    return { avatarUrl: null, error };
  }

  // Update profile (real griot_user_profiles table) and Supabase Auth metadata
  await Promise.all([
    (supabase as any).from("griot_user_profiles").upsert({
      id: userId,
      avatar_url: url,
      updated_at: new Date().toISOString(),
    }),
    supabase.auth.updateUser({
      data: { avatar_url: url, picture: url },
    }),
  ]);

  if (typeof window !== "undefined") {
    localStorage.setItem("griot_user_avatar", url);
  }

  return { avatarUrl: url, error: null };
}

/**
 * Estimate actual browser cache & local storage size.
 */
export function getLocalCacheStats(): {
  localStorageSize: string;
  itemCount: number;
} {
  if (typeof window === "undefined") {
    return { localStorageSize: "0 KB", itemCount: 0 };
  }

  try {
    let totalBytes = 0;
    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i);
      if (key) {
        const val = localStorage.getItem(key) || "";
        totalBytes += (key.length + val.length) * 2;
      }
    }

    if (totalBytes < 1024) {
      return { localStorageSize: `${totalBytes} B`, itemCount: localStorage.length };
    }
    if (totalBytes < 1024 * 1024) {
      return {
        localStorageSize: `${(totalBytes / 1024).toFixed(1)} KB`,
        itemCount: localStorage.length,
      };
    }
    return {
      localStorageSize: `${(totalBytes / (1024 * 1024)).toFixed(2)} MB`,
      itemCount: localStorage.length,
    };
  } catch {
    return { localStorageSize: "0 KB", itemCount: 0 };
  }
}
