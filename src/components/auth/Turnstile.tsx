"use client";

import { useEffect, useRef } from "react";

/**
 * Cloudflare Turnstile widget (brief §7: bot protection on sign-up).
 * Renders nothing until NEXT_PUBLIC_TURNSTILE_SITE_KEY is configured.
 * The token is sent to /api/auth in the `x-captcha-response` header; it is only checked when the
 * server has a Turnstile secret configured (Better Auth captcha plugin).
 */

declare global {
  interface Window {
    turnstile?: {
      render: (el: HTMLElement, options: { sitekey: string; callback: (token: string) => void }) => void;
    };
  }
}

export function Turnstile({ onToken }: { onToken: (token: string) => void }) {
  const siteKey = process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY;
  const ref = useRef<HTMLDivElement>(null);
  const rendered = useRef(false);

  useEffect(() => {
    if (!siteKey || !ref.current || rendered.current) return;
    const render = () => {
      if (ref.current && window.turnstile && !rendered.current) {
        rendered.current = true;
        window.turnstile.render(ref.current, { sitekey: siteKey, callback: onToken });
      }
    };
    if (window.turnstile) {
      render();
      return;
    }
    const script = document.createElement("script");
    script.src = "https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit";
    script.async = true;
    script.onload = render;
    document.head.appendChild(script);
  }, [siteKey, onToken]);

  if (!siteKey) return null;
  return <div ref={ref} className="min-h-[65px]" />;
}
