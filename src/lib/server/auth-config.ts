import "server-only";
import { betterAuth } from "better-auth";
import { nextCookies } from "better-auth/next-js";
import { twoFactor } from "better-auth/plugins";
import { D1Dialect } from "kysely-d1";
import { env, first, run, rateLimit, type Env } from "./db";
import { hashPassword, verifyPassword } from "./password";
import { sendEmail, pick, type Lang } from "@/lib/email";

const SELF_SERVICE_ROLES = new Set(["household", "cleaner", "business"]);

function emailText(kind: "verify" | "reset", url: string, lang: Lang) {
  if (kind === "verify") {
    return {
      subject: pick(lang, "Bevestig je e-mailadres voor Alieni", "Confirm your e-mail address for Alieni"),
      text: pick(lang,
        `Welkom bij Alieni!\n\nBevestig je e-mailadres met deze link (24 uur geldig):\n${url}\n\nHeb je geen account aangemaakt? Dan kun je deze e-mail negeren.`,
        `Welcome to Alieni!\n\nConfirm your e-mail address with this link (valid for 24 hours):\n${url}\n\nDidn't create an account? You can ignore this e-mail.`),
    };
  }
  return {
    subject: pick(lang, "Nieuw wachtwoord voor Alieni", "Reset your Alieni password"),
    text: pick(lang,
      `Kies een nieuw wachtwoord met deze link (1 uur geldig):\n${url}\n\nHeb je dit niet aangevraagd? Dan kun je deze e-mail negeren.`,
      `Choose a new password with this link (valid for 1 hour):\n${url}\n\nDidn't ask for this? You can ignore this e-mail.`),
  };
}

/** The callback URLs carry the page language (/en/…); everything else gets Dutch. */
const langOfUrl = (url: string): Lang => (/%2Fen%2F|\/en\/|callbackURL=%2Fen/.test(url) ? "en" : "nl");

function build(e: Env) {
  const emailOn = Boolean(e.RESEND_API_KEY);
  return betterAuth({
    appName: "Alieni",
    secret: e.BETTER_AUTH_SECRET,
    baseURL: e.BETTER_AUTH_URL,
    database: { dialect: new D1Dialect({ database: e.DB }), type: "sqlite" },
    emailAndPassword: {
      enabled: true,
      minPasswordLength: 8,
      maxPasswordLength: 128,
      // E-mail confirmation is required as soon as e-mail can be sent (RESEND_API_KEY set). See docs/DECISIONS.md.
      requireEmailVerification: emailOn,
      autoSignIn: !emailOn,
      password: { hash: hashPassword, verify: verifyPassword },
      resetPasswordTokenExpiresIn: 60 * 60,
      revokeSessionsOnPasswordReset: true,
      sendResetPassword: async ({ user, url }) => {
        const m = emailText("reset", url, langOfUrl(url));
        await sendEmail(user.email, m.subject, m.text);
      },
    },
    emailVerification: {
      sendOnSignUp: emailOn,
      autoSignInAfterVerification: true,
      expiresIn: 60 * 60 * 24,
      sendVerificationEmail: async ({ user, url }) => {
        const m = emailText("verify", url, langOfUrl(url));
        await sendEmail(user.email, m.subject, m.text);
      },
    },
    user: {
      additionalFields: {
        // Asked at sign-up; checked and corrected in databaseHooks below (nobody can make themselves admin).
        role: { type: "string", required: false, input: true },
      },
    },
    session: {
      expiresIn: 60 * 60 * 24 * 30,
      updateAge: 60 * 60 * 24,
      // Every request checks the session row, so a deleted or suspended account is signed out at once.
      cookieCache: { enabled: false },
    },
    rateLimit: {
      enabled: true,
      window: 60,
      max: 30,
      storage: "database",
      customRules: {
        "/sign-in/email": { window: 60, max: 8 },
        "/sign-up/email": { window: 3600, max: 10 },
        "/two-factor/verify-totp": { window: 60, max: 6 },
        "/request-password-reset": { window: 3600, max: 5 },
      },
    },
    advanced: {
      cookiePrefix: "alieni",
      useSecureCookies: (e.BETTER_AUTH_URL ?? "").startsWith("https://"),
      ipAddress: { ipAddressHeaders: ["cf-connecting-ip"] },
    },
    databaseHooks: {
      user: {
        create: {
          before: async (user) => {
            const email = String(user.email ?? "").toLowerCase();
            if (!(await rateLimit("signup:global", 300, 3600))) return false;
            const admin = await first("SELECT 1 AS x FROM admin_allowlist WHERE email = ?", email);
            // Pre-launch mode (Admin → Settings → Sign-ups) closes sign-up on the server too; allow-listed admins excepted.
            const paused = await first<{ value: string }>("SELECT value FROM settings WHERE key = 'signups_paused'");
            if (!admin && paused?.value === "true") return false;
            const asked = String((user as { role?: unknown }).role ?? "household");
            const role = admin ? "admin" : SELF_SERVICE_ROLES.has(asked) ? asked : "household";
            const name = String(user.name ?? "").trim().slice(0, 80) || email.split("@")[0];
            return { data: { ...user, email, name, role } };
          },
          after: async (user) => {
            const role = String((user as { role?: unknown }).role ?? "household");
            await run("INSERT OR IGNORE INTO profiles (id, role, display_name) VALUES (?, ?, ?)", user.id, role, user.name);
          },
        },
      },
      session: {
        create: {
          // A suspended account cannot sign in.
          before: async (session) => {
            const p = await first<{ suspended_at: string | null }>("SELECT suspended_at FROM profiles WHERE id = ?", session.userId);
            if (p?.suspended_at) return false;
            return { data: session };
          },
        },
      },
    },
    plugins: [twoFactor({ issuer: "Alieni" }), nextCookies()],
  });
}

/** One Better Auth instance per Worker isolate and D1 binding. */
let cached: { db: D1Database; auth: ReturnType<typeof build> } | null = null;

export async function getAuth() {
  const e = await env();
  if (!cached || cached.db !== e.DB) cached = { db: e.DB, auth: build(e) };
  return cached.auth;
}
