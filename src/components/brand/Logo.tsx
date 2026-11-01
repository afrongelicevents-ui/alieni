import Image from "next/image";

/*
 * Official Alieni logo supplied by the owner — never alter (brief §9).
 * Source file: /public/logo.png (2172×724, exact ratio 3:1). Rendered
 * dimensions keep that ratio so the image is never distorted.
 */
const SIZES = {
  sm: { width: 132, height: 44 },
  lg: { width: 168, height: 56 },
} as const;

export function LogoLockup({ size = "sm" }: { size?: keyof typeof SIZES }) {
  const { width, height } = SIZES[size];
  return (
    <Image
      src="/logo.png"
      alt="Alieni — Connect · Clean · Thrive"
      width={width}
      height={height}
      priority
    />
  );
}
