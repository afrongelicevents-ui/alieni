/*
 * PLACEHOLDER logo mark. The real Alieni logo (house + commercial buildings +
 * yellow sponge + soap bubbles) will be supplied as a file in /public and must
 * replace this component's SVG without alteration.
 */
export function LogoMark({ className = "h-10 w-10" }: { className?: string }) {
  return (
    <svg viewBox="0 0 48 48" className={className} aria-hidden="true" fill="none">
      {/* buildings */}
      <rect x="26" y="10" width="7" height="24" rx="1" fill="#0E4A2C" />
      <rect x="35" y="16" width="7" height="18" rx="1" fill="#0E4A2C" opacity="0.85" />
      <rect x="28" y="13" width="3" height="3" fill="#EEF6F0" />
      <rect x="28" y="19" width="3" height="3" fill="#EEF6F0" />
      <rect x="37" y="19" width="3" height="3" fill="#EEF6F0" />
      {/* house */}
      <path d="M6 22 L15 13 L24 22 V34 H6 Z" fill="#0E4A2C" />
      <rect x="12" y="25" width="6" height="6" rx="1" fill="#F7C21B" />
      {/* sponge */}
      <rect x="10" y="34" width="22" height="9" rx="3" fill="#F7C21B" />
      <rect x="10" y="34" width="22" height="3.5" rx="1.75" fill="#E0AE0D" />
      {/* bubbles */}
      <circle cx="8" cy="9" r="2.5" fill="#9ED0B5" />
      <circle cx="14" cy="5" r="1.8" fill="#C9E6D5" />
      <circle cx="20" cy="8" r="1.3" fill="#9ED0B5" />
    </svg>
  );
}

export function LogoLockup({ tagline }: { tagline?: string }) {
  return (
    <span className="flex items-center gap-2">
      <LogoMark />
      <span className="flex flex-col leading-none">
        <span className="headline text-2xl text-forest">Alieni</span>
        {tagline ? (
          <span className="mt-0.5 text-[10px] font-semibold tracking-wide text-forest/80">
            {tagline}
          </span>
        ) : null}
      </span>
    </span>
  );
}
