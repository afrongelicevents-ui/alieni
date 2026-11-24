"use client";

import { createAuthClient } from "better-auth/react";
import { twoFactorClient } from "better-auth/client/plugins";

/** Browser side of Better Auth: calls /api/auth/* on the same site. */
export const authClient = createAuthClient({
  plugins: [twoFactorClient()],
});
