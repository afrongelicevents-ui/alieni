import "server-only";

/**
 * The /design-preview pages are a design review tool only: available in
 * development, or on a deployment that explicitly sets DESIGN_PREVIEW=1.
 * Never indexed by search engines.
 */
export function designPreviewEnabled(): boolean {
  return process.env.NODE_ENV !== "production" || process.env.DESIGN_PREVIEW === "1";
}

export const DESIGN_PREVIEW_METADATA = {
  robots: { index: false, follow: false, nocache: true },
} as const;
