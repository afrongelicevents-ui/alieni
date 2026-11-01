"use client";

import { useEffect, useRef } from "react";

/**
 * Cloudflare Turnstile widget (brief §7: bot protection on sign-up).
 * Renders nothing until NEXT_PUBLIC_TURNSTILE_SITE_KEY is configured.
 * The secret key is configured in Supabase (Auth → Bot protection), which
 * verifies the token server-side on every sign-up/sign-in.
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
