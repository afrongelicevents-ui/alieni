import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { designPreviewEnabled, DESIGN_PREVIEW_METADATA } from "@/lib/design-preview";

export const metadata: Metadata = { title: "Design preview", ...DESIGN_PREVIEW_METADATA };

export default function DesignPreviewLayout({ children }: { children: React.ReactNode }) {
  if (!designPreviewEnabled()) notFound();
  return children;
}
