import type { MetadataRoute } from "next";

/** Installed app («Aggiungi a schermata Home»): Baptista as the icon (scripts/app-icons.mjs). */
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "Baptista",
    short_name: "Baptista",
    description: "Il sistema operativo privato della tua casa.",
    lang: "it",
    start_url: "/",
    scope: "/",
    display: "standalone",
    background_color: "#f7f5f0",
    theme_color: "#f7f5f0",
    icons: [
      { src: "/icons/app/icon-192.png", sizes: "192x192", type: "image/png", purpose: "any" },
      { src: "/icons/app/icon-512.png", sizes: "512x512", type: "image/png", purpose: "any" },
      { src: "/icons/app/icon-maskable-512.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
    ],
  };
}
