import type { MetadataRoute } from "next";

/** PWA manifest (brief: mobile-first, installable as a PWA). */
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "Alieni — Connect · Clean · Thrive",
    short_name: "Alieni",
    description:
      "Vind betrouwbare schoonmakers of schoonmaakklussen bij jou in de buurt.",
    start_url: "/",
    display: "standalone",
    background_color: "#FFFFFF",
    theme_color: "#0B1F4B",
    lang: "nl",
    icons: [
      { src: "/icon-192.png", sizes: "192x192", type: "image/png" },
      { src: "/icon-512.png", sizes: "512x512", type: "image/png" },
      { src: "/icon-512.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
    ],
  };
}
