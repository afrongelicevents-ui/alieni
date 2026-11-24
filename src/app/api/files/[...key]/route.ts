import { env } from "@/lib/server/db";
import { verifyFileSignature } from "@/lib/server/files";

/** Serves a private R2 object only with a valid, unexpired signature (see src/lib/server/files.ts). */
export async function GET(request: Request, { params }: { params: Promise<{ key: string[] }> }) {
  const { key: parts } = await params;
  const key = parts.join("/");
  const url = new URL(request.url);
  if (!(await verifyFileSignature(key, url.searchParams.get("e"), url.searchParams.get("s")))) {
    return new Response("Not found", { status: 404 });
  }
  const obj = await (await env()).FILES.get(key);
  if (!obj) return new Response("Not found", { status: 404 });
  const headers = new Headers();
  obj.writeHttpMetadata(headers);
  headers.set("Cache-Control", "private, max-age=3600");
  headers.set("X-Content-Type-Options", "nosniff");
  headers.set("Content-Security-Policy", "default-src 'none'; sandbox");
  return new Response(obj.body, { headers });
}
