"use client";

/**
 * Resize and re-encode a photo to WebP in the browser before upload. Drawing on a canvas and exporting a new file
 * drops EXIF/GPS and other metadata; the server strips anything left and checks the real type (see
 * src/lib/server/files.ts). `square` crops the centre to a square (profile photos); otherwise the longest side is
 * limited to `max` pixels and the aspect ratio is kept.
 */
export async function resizeToWebp(file: File, opts: { max?: number; square?: boolean; quality?: number } = {}): Promise<File> {
  const max = opts.max ?? 1200;
  const quality = opts.quality ?? 0.82;
  if (!file.type.startsWith("image/")) throw new Error("bad_type");
  const bitmap = await createImageBitmap(file, { imageOrientation: "from-image" });
  try {
    let sx = 0, sy = 0, sw = bitmap.width, sh = bitmap.height;
    if (opts.square) {
      const side = Math.min(sw, sh);
      sx = Math.floor((sw - side) / 2); sy = Math.floor((sh - side) / 2); sw = side; sh = side;
    }
    const scale = Math.min(1, max / Math.max(sw, sh));
    const w = Math.max(1, Math.round(sw * scale)), h = Math.max(1, Math.round(sh * scale));
    const canvas = document.createElement("canvas");
    canvas.width = w; canvas.height = h;
    const ctx = canvas.getContext("2d");
    if (!ctx) throw new Error("upload_failed");
    ctx.drawImage(bitmap, sx, sy, sw, sh, 0, 0, w, h);
    const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, "image/webp", quality));
    if (!blob) throw new Error("upload_failed");
    // Safari without WebP encoding returns PNG: still metadata-free, the server accepts it.
    const ext = blob.type === "image/webp" ? "webp" : "png";
    return new File([blob], `photo.${ext}`, { type: blob.type });
  } finally {
    bitmap.close();
  }
}
