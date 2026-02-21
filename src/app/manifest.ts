import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "Prompt Keeper",
    short_name: "Prompt Keeper",
    description: "Search and analyze historical LLM conversations",
    start_url: "/",
    display: "standalone",
    background_color: "#ffffff",
    theme_color: "#1a1c23",
    icons: [
      {
        src: "/icon-192x192.png",
        sizes: "192x192",
        type: "image/png",
      },
      {
        src: "/icon-512x512.png",
        sizes: "512x512",
        type: "image/png",
      },
    ],
  };
}
