import { getSessionUser } from "@/lib/auth";

/** The signed-in person's role, for drawing the right menu (nothing else is exposed). */
export async function GET() {
  const user = await getSessionUser();
  return Response.json({ role: user?.role ?? "guest" }, { headers: { "Cache-Control": "no-store" } });
}
