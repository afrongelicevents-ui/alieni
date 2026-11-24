import { toNextJsHandler } from "better-auth/next-js";
import { getAuth } from "@/lib/server/auth-config";

/** Better Auth endpoints (sign-up, sign-in, verify e-mail, reset password, 2FA, sign-out). */
async function handle(request: Request) {
  const auth = await getAuth();
  const { GET, POST } = toNextJsHandler(auth);
  return request.method === "GET" ? GET(request) : POST(request);
}

export const GET = handle;
export const POST = handle;
