/**
 * Homepage video (Admin → Settings). Only YouTube and Vimeo links are
 * accepted, turned into privacy-friendly embed URLs (the CSP allows exactly
 * these two frame hosts).
 */
export function videoEmbedUrl(raw: string): string | null {
  let u: URL;
  try {
    u = new URL(raw.trim());
  } catch {
    return null;
  }
  if (u.protocol !== "https:") return null;
  const host = u.hostname.replace(/^www\./, "");
  const id = (s: string | null | undefined) => (s && /^[A-Za-z0-9_-]{6,20}$/.test(s) ? s : null);

  if (host === "youtube.com" || host === "m.youtube.com") {
    const v = id(u.searchParams.get("v")) ?? id(u.pathname.match(/^\/(?:embed|shorts)\/([^/]+)/)?.[1]);
    return v ? `https://www.youtube-nocookie.com/embed/${v}?autoplay=1&rel=0` : null;
  }
  if (host === "youtu.be") {
    const v = id(u.pathname.slice(1));
    return v ? `https://www.youtube-nocookie.com/embed/${v}?autoplay=1&rel=0` : null;
  }
  if (host === "vimeo.com" || host === "player.vimeo.com") {
    const v = u.pathname.match(/(\d{6,12})/)?.[1];
    return v ? `https://player.vimeo.com/video/${v}?autoplay=1&dnt=1` : null;
  }
  return null;
}
