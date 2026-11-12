import { useId } from "react";

/*
 * Alieni logo: the blue gradient "A" mark IS the first letter of the wordmark, so it reads "[A]lieni".
 * The mark is drawn to the cap height of Plus Jakarta Sans ExtraBold (0.72 em) and sits on the text
 * baseline, with the same tight letter-spacing as the other letters. This is the ONE place to swap in
 * a final logo.
 */
type Props = {
  /** Visual height of the lockup in px (roughly the font size of the wordmark). */
  height?: number;
  /** Wordmark colour: navy on light backgrounds, white on dark ones. */
  tone?: "navy" | "white";
  /** Render only the "A" mark (square icon use). */
  markOnly?: boolean;
  className?: string;
};

/** The "A" glyph, trimmed to its own edges (viewBox 44 × 40: legs on the baseline, apex at cap height). */
export const A_MARK_VIEWBOX = "2.5 4 43.5 40";
export const A_MARK_PATHS = {
  left: "M19.5 4h9L13 44H2.5z",
  right: "M24.2 4h9.3L46 44H35.6z",
  bar: "M12 33c8-4.5 17-6 27-4.6l1.6 4.9C31 32 22.5 33 14.6 37.4z",
} as const;

export function AlieniMark({ size = 40, className = "", style }: { size?: number | string; className?: string; style?: React.CSSProperties }) {
  // Unique gradient ids per instance: a hidden copy (e.g. the mobile logo on
  // desktop) must not own the gradients another copy points at.
  const uid = useId().replace(/:/g, "");
  const a = `alieni-a-${uid}`;
  const b = `alieni-b-${uid}`;
  return (
    <svg height={size} viewBox={A_MARK_VIEWBOX} aria-hidden="true" className={className} style={{ width: "auto", ...style }}>
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
      <path d={A_MARK_PATHS.left} fill={`url(#${a})`} />
      <path d={A_MARK_PATHS.right} fill={`url(#${b})`} />
      <path d={A_MARK_PATHS.bar} fill="#2E8BFF" opacity=".9" />
    </svg>
  );
}

export function AlieniLogo({ height = 40, tone = "navy", markOnly = false, className = "" }: Props) {
  if (markOnly) return <AlieniMark size={height} className={className} />;
  return (
    <span
      role="img"
      aria-label="Alieni"
      className={`inline-flex items-baseline font-extrabold leading-none tracking-[-0.04em] ${tone === "white" ? "text-white" : "text-navy"} ${className}`}
      style={{ fontSize: height }}
    >
      {/* the mark replaces the capital A: cap height, on the baseline, tight spacing like the letters */}
      <AlieniMark size="0.72em" style={{ marginRight: "-0.01em" }} />
      <span aria-hidden="true">lieni</span>
    </span>
  );
}
