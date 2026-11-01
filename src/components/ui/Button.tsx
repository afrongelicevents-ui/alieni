import type { ComponentProps, ReactNode } from "react";
import { Link } from "@/i18n/navigation";

type Variant = "primary" | "secondary" | "dark";

const base =
  "inline-flex min-h-11 items-center justify-center gap-2 rounded-full px-6 py-3 text-sm font-bold transition-colors";

const variants: Record<Variant, string> = {
  // Yellow CTAs always carry dark text (brief §9).
  primary: "bg-sun text-ink hover:bg-sun-dark",
  secondary: "border-2 border-forest text-forest hover:bg-mint",
  dark: "bg-forest text-white hover:bg-forest-dark",
};

export function Arrow() {
  return (
    <svg viewBox="0 0 16 16" className="h-4 w-4" fill="none" aria-hidden="true">
      <path
        d="M2 8h11m0 0L9 4m4 4-4 4"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

type ButtonLinkProps = {
  variant?: Variant;
  withArrow?: boolean;
  children: ReactNode;
  className?: string;
} & ComponentProps<typeof Link>;

export function ButtonLink({
  variant = "primary",
  withArrow = false,
  children,
  className = "",
  ...props
}: ButtonLinkProps) {
  return (
    <Link {...props} className={`${base} ${variants[variant]} ${className}`}>
      {children}
      {withArrow ? <Arrow /> : null}
    </Link>
  );
}

type ButtonProps = {
  variant?: Variant;
  withArrow?: boolean;
  children: ReactNode;
  className?: string;
} & ComponentProps<"button">;

export function Button({
  variant = "primary",
  withArrow = false,
  children,
  className = "",
  ...props
}: ButtonProps) {
  return (
    <button {...props} className={`${base} ${variants[variant]} ${className}`}>
      {children}
      {withArrow ? <Arrow /> : null}
    </button>
  );
}
