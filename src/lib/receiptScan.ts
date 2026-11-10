import { supabase } from "@/integrations/supabase/client";
import type { ReceiptScan } from "../../supabase/functions/_shared/receipt";

export type { ReceiptScan };

/** Downscales a photo to <= maxSide px JPEG and returns base64 (no data: prefix). */
export async function imageFileToBase64Jpeg(file: File, maxSide = 1280, quality = 0.8): Promise<string> {
  const url = URL.createObjectURL(file);
  try {
    const img = await new Promise<HTMLImageElement>((resolve, reject) => {
      const el = new Image();
      el.onload = () => resolve(el);
      el.onerror = () => reject(new Error("Could not open this image"));
      el.src = url;
    });
    const scale = Math.min(1, maxSide / Math.max(img.width, img.height));
    const canvas = document.createElement("canvas");
    canvas.width = Math.round(img.width * scale);
    canvas.height = Math.round(img.height * scale);
    const ctx = canvas.getContext("2d");
    if (!ctx) throw new Error("Canvas not available");
    ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
    return canvas.toDataURL("image/jpeg", quality).split(",")[1];
  } finally {
    URL.revokeObjectURL(url);
  }
}

/** Sends a receipt photo to the authenticated scan-receipt Edge Function (Gemini Vision, key stays server-side). */
export async function scanReceipt(file: File): Promise<ReceiptScan> {
  if (typeof navigator !== "undefined" && !navigator.onLine) throw new Error("Receipt scanning needs an internet connection.");
  const image = await imageFileToBase64Jpeg(file);
  const { data, error } = await supabase.functions.invoke("scan-receipt", { body: { image, mimeType: "image/jpeg" } });
  if (error) throw error;
  if (data?.error) throw new Error(data.error);
  return data as ReceiptScan;
}
