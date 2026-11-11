import { AlieniLogo } from "./AlieniLogo";

/** Site logo lockup — renders the (swappable) Alieni logo from AlieniLogo.tsx. */
const SIZES = { sm: 34, lg: 40 } as const;

export function LogoLockup({ size = "sm", tone = "navy" }: { size?: keyof typeof SIZES; tone?: "navy" | "white" }) {
  return <AlieniLogo height={SIZES[size]} tone={tone} />;
}
