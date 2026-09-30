import type { Metadata } from "next";
import { site } from "./site";

/** Absolute URL for a path. One helper so canonical/OG/JSON-LD never disagree. */
export function abs(path: string): string {
  return new URL(path, site.url).toString();
}

/**
 * Social handles are environment-driven on purpose. An unverified handle shipped
 * as `twitter:site` is a broken link in a social card; a missing one is not.
 */
const xHandle = process.env.NEXT_PUBLIC_X_HANDLE?.replace(/^@/, "").trim();
const sameAs = [
  site.repo,
  process.env.NEXT_PUBLIC_LINKEDIN_URL,
  "https://www.npmjs.com/package/sentinel-cli",
].filter((v): v is string => Boolean(v));

export const organization = {
  name: site.name,
  legalName: "Sentinel CLI",
  url: site.url,
  logo: abs("/icon.png"),
  image: abs("/api/og"),
  description:
    "Open source AI coding agent for the terminal. Multi-LLM, sandboxed local tools, sessions as JSON, MCP. Runs locally with no servers and no telemetry.",
  sameAs,
  founder: { "@type": "Person", name: site.author, url: site.repo },
} as const;

type PageMeta = {
  /** Page title without the " · Sentinel" suffix. */
  title: string;
  description: string;
  /** Absolute path, e.g. "/docs/tools". Drives canonical + OG url. */
  path: string;
  type?: "website" | "article";
  publishedTime?: string;
  modifiedTime?: string;
  keywords?: string[];
  noIndex?: boolean;
};

export function pageMeta({
  title,
  description,
  path,
  type = "website",
  publishedTime,
  modifiedTime,
  keywords,
  noIndex,
}: PageMeta): Metadata {
  const url = abs(path);
  // One generated card per URL. The subtitle is cut to a card-sized budget
  // instead of shipping the whole meta description in the query string: a
  // multi-hundred-character image URL is ugly, and some crawlers truncate it.
  const image = `${abs("/api/og")}?t=${encodeURIComponent(title)}&s=${encodeURIComponent(
    description.slice(0, 96)
  )}&p=${encodeURIComponent(path)}`;

  return {
    title,
    description,
    keywords,
    alternates: { canonical: path },
    robots: noIndex
      ? { index: false, follow: false }
      : {
          index: true,
          follow: true,
          googleBot: {
            index: true,
            follow: true,
            "max-image-preview": "large",
            "max-snippet": -1,
            "max-video-preview": -1,
          },
        },
    openGraph: {
      type,
      url,
      siteName: site.name,
      title: `${title} · ${site.name}`,
      description,
      locale: "en_US",
      ...(type === "article" ? { publishedTime, modifiedTime: modifiedTime ?? publishedTime } : {}),
      images: [{ url: image, width: 1200, height: 630, alt: `${title} — ${site.name}` }],
    },
    twitter: {
      card: "summary_large_image",
      title: `${title} · ${site.name}`,
      description,
      images: [image],
      ...(xHandle ? { site: `@${xHandle}`, creator: `@${xHandle}` } : {}),
    },
  };
}
