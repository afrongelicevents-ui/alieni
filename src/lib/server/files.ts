import "server-only";
import { env } from "./db";

/**
 * Photos and files in a PRIVATE R2 bucket. Nothing in the bucket is public: pages get short-lived signed links
 * (/api/files/<key>?e=<expiry>&s=<signature>, HMAC-SHA256, 1 hour). Whoever signs a link must have checked first
 * that the viewer may see the file (e.g. a published ad's photo, or your own draft).
 *
 * Uploads arrive already resized to WebP by the browser (canvas re-encoding drops EXIF/GPS). The server does not
 * trust that: it checks the real file type from its bytes, enforces the size limit, and removes any metadata
 * blocks (EXIF, XMP, ICC comments) from WebP and JPEG before storing.
 */
export const MAX_UPLOAD_BYTES = 2 * 1024 * 1024;
const LINK_TTL_SECONDS = 60 * 60;

async function signingKey(): Promise<CryptoKey> {
  const secret = (await env()).BETTER_AUTH_SECRET;
  if (!secret) throw new Error("not_configured");
  return crypto.subtle.importKey("raw", new TextEncoder().encode(`files:${secret}`), { name: "HMAC", hash: "SHA-256" }, false, ["sign", "verify"]);
}

const toHex = (buf: ArrayBuffer) => [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, "0")).join("");
const fromHex = (hex: string) => new Uint8Array((hex.match(/../g) ?? []).map((h) => parseInt(h, 16)));
const validKey = (key: string) => /^(profile|site)\/[a-z0-9-]{1,64}\/[a-z0-9-]{8,64}\.(webp|jpg|png)$/.test(key);

/** A link to `key` that works for one hour. Callers must have checked that the viewer may see it. */
export async function signedFileUrl(key: string | null | undefined, ttl = LINK_TTL_SECONDS): Promise<string | null> {
  if (!key || !validKey(key)) return null;
  // round the expiry to the hour so the same page can be cached by the browser for a while
  const exp = Math.ceil((Date.now() / 1000 + ttl) / 600) * 600;
  const sig = toHex(await crypto.subtle.sign("HMAC", await signingKey(), new TextEncoder().encode(`${key}|${exp}`)));
  return `/api/files/${key}?e=${exp}&s=${sig}`;
}

export async function verifyFileSignature(key: string, exp: string | null, sig: string | null): Promise<boolean> {
  if (!validKey(key) || !exp || !sig || !/^\d{1,12}$/.test(exp) || !/^[0-9a-f]{64}$/.test(sig)) return false;
  if (Number(exp) < Date.now() / 1000) return false;
  return crypto.subtle.verify("HMAC", await signingKey(), fromHex(sig), new TextEncoder().encode(`${key}|${exp}`));
}

type Kind = "webp" | "jpg" | "png";
function sniff(b: Uint8Array): Kind | null {
  if (b.length > 12 && b[0] === 0x52 && b[1] === 0x49 && b[2] === 0x46 && b[3] === 0x46 && b[8] === 0x57 && b[9] === 0x45 && b[10] === 0x42 && b[11] === 0x50) return "webp";
  if (b.length > 3 && b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff) return "jpg";
  if (b.length > 8 && b[0] === 0x89 && b[1] === 0x50 && b[2] === 0x4e && b[3] === 0x47) return "png";
  return null;
}

/** WebP: drop EXIF and XMP chunks and clear their flags in VP8X. */
function stripWebp(b: Uint8Array): Uint8Array {
  const out: Uint8Array[] = [b.slice(0, 12)];
  let p = 12;
  while (p + 8 <= b.length) {
    const id = String.fromCharCode(b[p], b[p + 1], b[p + 2], b[p + 3]);
    const size = b[p + 4] | (b[p + 5] << 8) | (b[p + 6] << 16) | (b[p + 7] << 24);
    const total = 8 + size + (size & 1);
    if (size < 0 || p + total > b.length + 1) throw new Error("bad_file");
    const chunk = b.slice(p, Math.min(p + total, b.length));
    if (id === "VP8X") chunk[8] &= ~(0x08 | 0x04); // EXIF and XMP flags off
    if (id !== "EXIF" && id !== "XMP ") out.push(chunk);
    p += total;
  }
  const len = out.reduce((n, c) => n + c.length, 0);
  const res = new Uint8Array(len);
  let o = 0;
  for (const c of out) { res.set(c, o); o += c.length; }
  const riff = len - 8;
  res[4] = riff & 0xff; res[5] = (riff >> 8) & 0xff; res[6] = (riff >> 16) & 0xff; res[7] = (riff >> 24) & 0xff;
  return res;
}

/** JPEG: drop APP1–APP15 (EXIF, XMP, …) and COM segments; keep APP0 (JFIF) and the image data. */
function stripJpeg(b: Uint8Array): Uint8Array {
  const out: Uint8Array[] = [b.slice(0, 2)];
  let p = 2;
  while (p + 4 <= b.length && b[p] === 0xff) {
    const marker = b[p + 1];
    if (marker === 0xda) { out.push(b.slice(p)); p = b.length; break; } // start of scan: rest is image data
    const len = (b[p + 2] << 8) | b[p + 3];
    const seg = b.slice(p, p + 2 + len);
    const drop = (marker >= 0xe1 && marker <= 0xef) || marker === 0xfe;
    if (!drop) out.push(seg);
    p += 2 + len;
  }
  if (p < b.length) throw new Error("bad_file");
  const res = new Uint8Array(out.reduce((n, c) => n + c.length, 0));
  let o = 0;
  for (const c of out) { res.set(c, o); o += c.length; }
  return res;
}

/** PNG: keep only the chunks needed to draw the image (drops eXIf, tEXt, iTXt, zTXt, tIME …). */
function stripPng(b: Uint8Array): Uint8Array {
  const keep = new Set(["IHDR", "PLTE", "IDAT", "IEND", "tRNS", "gAMA", "sRGB"]);
  const out: Uint8Array[] = [b.slice(0, 8)];
  let p = 8;
  while (p + 12 <= b.length) {
    const len = ((b[p] << 24) | (b[p + 1] << 16) | (b[p + 2] << 8) | b[p + 3]) >>> 0;
    const id = String.fromCharCode(b[p + 4], b[p + 5], b[p + 6], b[p + 7]);
    const end = p + 12 + len;
    if (end > b.length) throw new Error("bad_file");
    if (keep.has(id)) out.push(b.slice(p, end));
    p = end;
    if (id === "IEND") break;
  }
  const res = new Uint8Array(out.reduce((n, c) => n + c.length, 0));
  let o = 0;
  for (const c of out) { res.set(c, o); o += c.length; }
  return res;
}

/**
 * Validate, strip metadata and store an image. Returns the R2 key.
 * `folder` is "profile" or "site"; `owner` is a user id or slot name (part of the key, never trusted for access).
 */
export async function storeImage(file: File, folder: "profile" | "site", owner: string): Promise<string> {
  if (!(file instanceof File) || file.size === 0) throw new Error("no_file");
  if (file.size > MAX_UPLOAD_BYTES) throw new Error("file_too_large");
  const bytes = new Uint8Array(await file.arrayBuffer());
  const kind = sniff(bytes);
  if (!kind) throw new Error("bad_file_type");
  const clean = kind === "webp" ? stripWebp(bytes) : kind === "jpg" ? stripJpeg(bytes) : stripPng(bytes);
  const safeOwner = owner.toLowerCase().replace(/[^a-z0-9-]/g, "").slice(0, 64) || "x";
  const key = `${folder}/${safeOwner}/${crypto.randomUUID()}.${kind}`;
  await (await env()).FILES.put(key, clean, {
    httpMetadata: { contentType: kind === "webp" ? "image/webp" : kind === "jpg" ? "image/jpeg" : "image/png", cacheControl: "private, max-age=3600" },
  });
  return key;
}

export async function deleteFile(key: string | null | undefined): Promise<void> {
  if (key && validKey(key)) await (await env()).FILES.delete(key);
}

// exported for unit tests
export const __test = { sniff, stripWebp, stripJpeg, stripPng, validKey };
