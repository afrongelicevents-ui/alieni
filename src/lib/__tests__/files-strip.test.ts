import { readFileSync } from "node:fs";
import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));
vi.mock("@opennextjs/cloudflare", () => ({ getCloudflareContext: async () => ({ env: {} }) }));
const { __test } = await import("../server/files");

const photo = new Uint8Array(readFileSync("e2e/cf/fixtures/photo-exif.jpg"));
const has = (b: Uint8Array, s: string) => Buffer.from(b).includes(Buffer.from(s));

describe("uploads lose their metadata on the server", () => {
  it("knows file types from their bytes, not their name", () => {
    expect(__test.sniff(photo)).toBe("jpg");
    expect(__test.sniff(new TextEncoder().encode("<svg onload=alert(1)>"))).toBeNull();
  });
  it("removes EXIF (camera, GPS) from a JPEG and keeps a valid image", () => {
    expect(has(photo, "SecretCamera")).toBe(true);
    const clean = __test.stripJpeg(photo);
    expect(has(clean, "SecretCamera")).toBe(false);
    expect(has(clean, "Exif")).toBe(false);
    expect([clean[0], clean[1], clean[clean.length - 2], clean[clean.length - 1]]).toEqual([0xff, 0xd8, 0xff, 0xd9]);
    expect(clean.length).toBeLessThan(photo.length);
  });
  it("removes EXIF and XMP chunks from a WebP and fixes the sizes", () => {
    const chunk = (id: string, data: Uint8Array) => {
      const h = new Uint8Array(8); h.set(new TextEncoder().encode(id)); new DataView(h.buffer).setUint32(4, data.length, true);
      const pad = data.length % 2 ? new Uint8Array(1) : new Uint8Array(0);
      return [h, data, pad];
    };
    const vp8x = new Uint8Array(10); vp8x[0] = 0x0c; // EXIF + XMP flags on
    const parts = [...chunk("VP8X", vp8x), ...chunk("VP8L", new Uint8Array([0x2f, 1, 2, 3, 4])), ...chunk("EXIF", new TextEncoder().encode("GPS SECRET")), ...chunk("XMP ", new TextEncoder().encode("<x>SECRET</x>"))];
    const body = parts.reduce((n, p) => n + p.length, 0);
    const file = new Uint8Array(12 + body);
    file.set(new TextEncoder().encode("RIFF")); new DataView(file.buffer).setUint32(4, 4 + body, true); file.set(new TextEncoder().encode("WEBP"), 8);
    let o = 12; for (const p of parts) { file.set(p, o); o += p.length; }
    const clean = __test.stripWebp(file);
    expect(has(clean, "SECRET")).toBe(false);
    expect(clean[12 + 8] & 0x0c).toBe(0);
    expect(new DataView(clean.buffer).getUint32(4, true)).toBe(clean.length - 8);
  });
  it("only accepts keys the app itself makes", () => {
    expect(__test.validKey("profile/abc-123/0b5f8f9e-1c2d-4e5f-8a9b-0c1d2e3f4a5b.webp")).toBe(true);
    expect(__test.validKey("../secrets.txt")).toBe(false);
    expect(__test.validKey("profile/abc/../../x.webp")).toBe(false);
  });
});
