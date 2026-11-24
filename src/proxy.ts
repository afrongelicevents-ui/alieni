import createMiddleware from "next-intl/middleware";
import { routing } from "./i18n/routing";

/** Language routing only. Sessions are cookies checked on the server per request (Better Auth on D1). */
export default createMiddleware(routing);

export const config = {
  // Skip API routes, Next internals and static files.
  matcher: "/((?!api|trpc|_next|_vercel|.*\\..*).*)",
};
