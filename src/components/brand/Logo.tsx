import Image from "next/image";

/*
 * Official Alieni logo supplied by the owner — never alter (brief §9).
 * Source file: /public/logo.png (2172×724, ratio 3:1).
 */
export function LogoLockup({ className = "h-11 w-auto" }: { className?: string }) {
  return (
    <Image
      src="/logo.png"
      alt="Alieni — Connect · Clean · Thrive"
      width={2172}
      height={724}
      priority
      className={className}
    />
  );
}
