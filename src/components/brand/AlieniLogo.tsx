import { useId } from "react";

/*
 * Placeholder Alieni logo for the 2026 redesign: blue gradient "A" mark +
 * "Alieni" wordmark. This is the ONE place to swap in the final logo.
 */
type Props = {
  /** Height of the whole lockup in px. */
  height?: number;
  /** Wordmark colour: navy on light backgrounds, white on dark ones. */
  tone?: "navy" | "white";
  /** Render only the "A" mark. */
  markOnly?: boolean;
  className?: string;
};

export function AlieniMark({ size = 40 }: { size?: number }) {
  // Unique gradient ids per instance: a hidden copy (e.g. the mobile logo on
  // desktop) must not own the gradients another copy points at.
  const uid = useId().replace(/:/g, "");
  const a = `alieni-a-${uid}`;
  const b = `alieni-b-${uid}`;
  return (
    <svg width={size} height={size} viewBox="0 0 48 48" aria-hidden="true">
      <defs>
        <linearGradient id={a} x1="0" y1="1" x2="0.6" y2="0">
          <stop offset="0" stopColor="#2E8BFF" />
          <stop offset="1" stopColor="#5FB0FF" />
        </linearGradient>
        <linearGradient id={b} x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="#1667E0" />
          <stop offset="1" stopColor="#0B3FA8" />
        </linearGradient>
      </defs>
      {/* left leg */}
      <path d="M19.5 4h9L13 44H2.5z" fill={`url(#${a})`} />
      {/* right leg */}
      <path d="M24.2 4h9.3L46 44H35.6z" fill={`url(#${b})`} />
      {/* swoosh crossbar */}
      <path d="M12 33c8-4.5 17-6 27-4.6l1.6 4.9C31 32 22.5 33 14.6 37.4z" fill="#2E8BFF" opacity=".9" />
    </svg>
  );
}

export function AlieniLogo({ height = 40, tone = "navy", markOnly = false, className = "" }: Props) {
  return (
    <span className={`inline-flex items-center gap-2 ${className}`} aria-label="Alieni" role="img">
      <AlieniMark size={height} />
      {markOnly ? null : (
        <span
          className={`font-extrabold tracking-[-0.04em] ${tone === "white" ? "text-white" : "text-navy"}`}
          style={{ fontSize: height * 0.95, lineHeight: 1 }}
          aria-hidden="true"
        >
          Alieni
        </span>
      )}
    </span>
  );
}
