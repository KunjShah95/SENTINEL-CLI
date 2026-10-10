import type { MetadataRoute } from "next";
import { site } from "@/lib/site";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: `${site.name}, AI coding agent for the terminal`,
    short_name: site.name,
    description:
      "Open source AI coding agent for the terminal. Multi-LLM, sandboxed local tools, sessions as JSON, MCP. No servers, no telemetry.",
    start_url: "/",
    display: "standalone",
    background_color: "#0A0B0A",
    theme_color: "#0A0B0A",
    categories: ["developer", "productivity", "utilities"],
    icons: [
      { src: "/icon.png", sizes: "512x512", type: "image/png", purpose: "any" },
      { src: "/icon.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
    ],
  };
}
