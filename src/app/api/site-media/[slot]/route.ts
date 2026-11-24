import { env, first } from "@/lib/server/db";
import { isSiteMediaSlot } from "@/lib/site-media";

/**
 * Public site photo for one slot (homepage hero, business pages), streamed from the private R2 bucket.
 * Only objects registered in `site_media` can be reached; nothing else in the bucket is exposed.
 * The URL carries ?v=<upload time>, so the response can be cached for a long time.
 */
export async function GET(_request: Request, { params }: { params: Promise<{ slot: string }> }) {
  const { slot } = await params;
  if (!isSiteMediaSlot(slot)) return new Response("Not found", { status: 404 });
  const row = await first<{ object_key: string }>("SELECT object_key FROM site_media WHERE slot = ?", slot);
  if (!row || !row.object_key.startsWith(`site/${slot}/`)) return new Response("Not found", { status: 404 });
  const obj = await (await env()).FILES.get(row.object_key);
  if (!obj) return new Response("Not found", { status: 404 });
  const headers = new Headers();
  obj.writeHttpMetadata(headers);
  headers.set("Cache-Control", "public, max-age=31536000, immutable");
  headers.set("X-Content-Type-Options", "nosniff");
  headers.set("Content-Security-Policy", "default-src 'none'; sandbox");
  return new Response(obj.body, { headers });
}
