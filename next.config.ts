import type { NextConfig } from "next";
import createNextIntlPlugin from "next-intl/plugin";
import { initOpenNextCloudflareForDev } from "@opennextjs/cloudflare";

// `next dev` gets the same D1 / R2 bindings as the Worker (local Miniflare copies).
initOpenNextCloudflareForDev();

const withNextIntl = createNextIntlPlugin("./src/i18n/request.ts");

/*
 * Security headers (brief §7): strict CSP, HSTS, no sniffing, no framing.
 * Everything (pages, API, photos via signed /api/files links) is served from the site's own origin.
 */

const csp = [
  "default-src 'self'",
  // 'unsafe-inline' is required by Next.js hydration on statically generated
  // pages (nonce-based CSP would force every page dynamic — see SECURITY.md).
  // challenges.cloudflare.com serves the Turnstile bot-protection widget.
  "script-src 'self' 'unsafe-inline' https://challenges.cloudflare.com",
  "style-src 'self' 'unsafe-inline'",
  "font-src 'self'",
  "img-src 'self' blob: data:",
  "connect-src 'self' https://challenges.cloudflare.com",
  // Homepage video modal (Admin → Settings): YouTube (no-cookie) and Vimeo only.
  "frame-src https://challenges.cloudflare.com https://www.youtube-nocookie.com https://player.vimeo.com",
  "frame-ancestors 'none'",
  "base-uri 'self'",
  "form-action 'self'",
  "object-src 'none'",
].join("; ");

const securityHeaders = [
  { key: "Content-Security-Policy", value: csp },
  { key: "Strict-Transport-Security", value: "max-age=63072000; includeSubDomains; preload" },
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "X-Frame-Options", value: "DENY" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=()" },
];

const nextConfig: NextConfig = {
  images: {
    // No server-side image optimizer: on the free Workers plan it would need paid Cloudflare Images.
    // The bundled photos are already small WebP files, and uploads are resized in the browser.
    unoptimized: true,
  },
  experimental: {
    // Photo uploads arrive already resized to WebP in the browser (max ~1 MB).
    serverActions: { bodySizeLimit: "3mb" },
  },
  turbopack: {
    rules: {
      "*.css": {
        loaders: ["@tailwindcss/turbopack"],
        as: "*.css",
      },
    },
  },
  async headers() {
    return [{ source: "/(.*)", headers: securityHeaders }];
  },
  poweredByHeader: false,
  agentRules: false,
};

export default withNextIntl(nextConfig);
