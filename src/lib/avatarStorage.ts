import { supabase } from "@/integrations/supabase/client";

export const AVATAR_BUCKET = "avatars";

/** data:image/...;base64,... -> Blob (pure). */
export function dataUrlToBlob(dataUrl: string): Blob {
  const match = dataUrl.match(/^data:([^;,]+)(;base64)?,(.*)$/s);
  if (!match) throw new Error("Not a data URL");
  const mime = match[1];
  const payload = match[3];
  if (!match[2]) return new Blob([decodeURIComponent(payload)], { type: mime });
  const bin = atob(payload);
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  return new Blob([bytes], { type: mime });
}

export function isInlineAvatar(url: unknown): url is string {
  return typeof url === "string" && url.startsWith("data:image/");
}

/** Object path inside the avatars bucket for one of our public URLs, or null. */
export function avatarPathFromUrl(url: string | null | undefined): string | null {
  if (!url) return null;
  const marker = `/storage/v1/object/public/${AVATAR_BUCKET}/`;
  const i = url.indexOf(marker);
  return i === -1 ? null : decodeURIComponent(url.slice(i + marker.length).split("?")[0]);
}

/**
 * Uploads a cropped avatar to `avatars/<uid>/avatar-<ts>.jpg` and returns its
 * public URL (only this short URL is stored in user_metadata). The previous
 * file is removed best-effort.
 */
export async function uploadAvatar(userId: string, dataUrl: string, previousUrl?: string | null): Promise<string> {
  const blob = dataUrlToBlob(dataUrl);
  const ext = blob.type === "image/png" ? "png" : blob.type === "image/webp" ? "webp" : "jpg";
  const path = `${userId}/avatar-${Date.now()}.${ext}`;
  const { error } = await supabase.storage.from(AVATAR_BUCKET).upload(path, blob, {
    contentType: blob.type,
    cacheControl: "31536000",
    upsert: false,
  });
  if (error) throw error;
  const { data } = supabase.storage.from(AVATAR_BUCKET).getPublicUrl(path);

  const oldPath = avatarPathFromUrl(previousUrl);
  if (oldPath && oldPath.startsWith(`${userId}/`)) {
    supabase.storage
      .from(AVATAR_BUCKET)
      .remove([oldPath])
      .catch(() => undefined);
  }
  return data.publicUrl;
}
