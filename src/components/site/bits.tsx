import Image from "next/image";
import { DESIGN_IMAGES, type DesignImageKey } from "@/lib/design-images";
import { Icon } from "./Icon";

/** Round arrow button used on cards. */
export function RoundArrow({ className = "h-10 w-10" }: { className?: string }) {
  return (
    <span className={`flex shrink-0 items-center justify-center rounded-full bg-navy text-white transition-colors group-hover:bg-royal ${className}`}>
      <Icon name="arrow" className="h-[55%] w-[55%]" />
    </span>
  );
}

export function DesignImage({
  name,
  alt,
  className,
  sizes,
  priority,
  fill,
}: {
  name: DesignImageKey;
  alt: string;
  className?: string;
  sizes: string;
  priority?: boolean;
  fill?: boolean;
}) {
  const img = DESIGN_IMAGES[name];
  return fill ? (
    <Image src={img.src} alt={alt} fill sizes={sizes} priority={priority} className={className} />
  ) : (
    <Image src={img.src} alt={alt} width={img.width} height={img.height} sizes={sizes} priority={priority} className={className} />
  );
}

/**
 * The signature swoosh: curved blue bands behind the hero cut-out.
 * `variant="light"` sits on a bright interior (desktop); "dark" on navy (mobile).
 */
export function HeroSwoosh({ className = "", variant = "light" }: { className?: string; variant?: "light" | "dark" }) {
  const id = `swoosh-${variant}`;
  return (
    <svg viewBox="0 0 600 600" preserveAspectRatio="none" className={className} aria-hidden="true">
      <defs>
        <linearGradient id={`${id}-a`} x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="#5FA8FF" />
          <stop offset=".55" stopColor="#2E8BFF" />
          <stop offset="1" stopColor="#1667E0" />
        </linearGradient>
        <linearGradient id={`${id}-b`} x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="#1667E0" />
          <stop offset="1" stopColor={variant === "dark" ? "#071638" : "#0B2E7A"} />
        </linearGradient>
      </defs>
      <path d="M600 0H470C440 200 330 420 60 600H600Z" fill={`url(#${id}-a)`} opacity={variant === "dark" ? 0.95 : 1} />
      <path d="M600 0H540C515 190 440 400 230 600H600Z" fill="#ffffff" opacity=".16" />
      <path d="M600 40C570 250 490 440 330 600H600Z" fill={`url(#${id}-b)`} />
    </svg>
  );
}
