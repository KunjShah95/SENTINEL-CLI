import type { MetadataRoute } from "next";
import { allDocHrefs } from "@/lib/site";

export default function sitemap(): MetadataRoute.Sitemap {
  const routes = ["", ...allDocHrefs];
  return routes.map((route) => ({
    url: `https://sentinel-cli.dev${route || "/"}`,
    lastModified: new Date(),
    changeFrequency: route === "" ? "weekly" : "monthly",
    priority: route === "" ? 1 : route === "/docs" ? 0.9 : 0.7,
  }));
}
