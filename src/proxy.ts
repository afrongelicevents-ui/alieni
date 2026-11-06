import createMiddleware from "next-intl/middleware";
import { createServerClient } from "@supabase/ssr";
import type { NextRequest } from "next/server";
import { routing } from "./i18n/routing";

const intl = createMiddleware(routing);

/**
 * Language routing plus session refresh. Server components cannot write cookies, so a session whose access token
 * has expired must be refreshed here, where the new cookies can be sent back; otherwise the refresh token is used up
 * without being saved and the person is signed out at random. Requests without a login cookie skip the refresh.
 */
export default async function proxy(request: NextRequest) {
  const response = intl(request);
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !key || !request.cookies.getAll().some((c) => c.name.startsWith("sb-"))) return response;
  try {
    const supabase = createServerClient(url, key, {
      cookies: {
        getAll: () => request.cookies.getAll(),
        setAll: (list) => {
          list.forEach(({ name, value }) => request.cookies.set(name, value));
          list.forEach(({ name, value, options }) => response.cookies.set(name, value, options));
        },
      },
    });
    await supabase.auth.getUser();
  } catch {
    // never block a page because the refresh failed
  }
  return response;
}

export const config = {
  // Skip API routes, Next internals and static files.
  matcher: "/((?!api|trpc|_next|_vercel|.*\\..*).*)",
};
