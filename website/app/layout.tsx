import type { Metadata, Viewport } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";
import { SiteHeader } from "@/components/SiteHeader";
import { SiteFooter } from "@/components/SiteFooter";
import { site } from "@/lib/site";
import { abs } from "@/lib/seo";

const geistSans = Geist({ subsets: ["latin"], variable: "--font-geist-sans", display: "swap" });
const geistMono = Geist_Mono({ subsets: ["latin"], variable: "--font-geist-mono", display: "swap" });

const title = "Sentinel: open source AI coding agent for the terminal";
const description =
  "Open source AI coding agent for the terminal. 12 LLM providers, sandboxed tools, JSON sessions, MCP. No servers, no telemetry.";

export const metadata: Metadata = {
  metadataBase: new URL(site.url),
  title: {
    default: title,
    template: "%s · Sentinel",
  },
  description,
  applicationName: site.name,
  authors: [{ name: site.author, url: site.repo }],
  creator: site.author,
  publisher: site.name,
  category: "technology",
  // Meta keywords are not a ranking signal. This is here for the few engines that
  // still surface them, and it doubles as the page's topic list for LLM crawlers.
  keywords: [
    "ai coding agent",
    "terminal ai assistant",
    "cli coding agent",
    "open source coding agent",
    "local llm coding assistant",
    "mcp server",
    "llm cost control",
    "ai agent sandbox",
  ],
  icons: {
    icon: [
      { url: "/favicon.svg", type: "image/svg+xml" },
      { url: "/icon.png", type: "image/png", sizes: "512x512" },
    ],
    apple: "/icon.png",
  },
  manifest: "/manifest.webmanifest",
  // The homepage self-canonicalises. Every other route sets its own canonical
  // through pageMeta(), which replaces this inherited value, that inheritance
  // is exactly why a blanket "/" here used to mark every docs and blog page as a
  // duplicate of the homepage.
  alternates: {
    canonical: "/",
    types: { "application/rss+xml": abs("/feed.xml") },
  },
  openGraph: {
    type: "website",
    url: site.url,
    siteName: site.name,
    title,
    description,
    locale: "en_US",
    images: [
      {
        url: abs(
          `/api/og?t=${encodeURIComponent(
            "The coding agent that shows its work."
          )}&s=${encodeURIComponent("Open source, multi-LLM, runs entirely in your terminal. No servers, no telemetry.")}&p=/`
        ),
        width: 1200,
        height: 630,
        alt: "Sentinel, the coding agent that shows its work",
      },
    ],
  },
  twitter: {
    card: "summary_large_image",
    title,
    description,
  },
  robots: {
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
  // Owner-verification slots. Both are env-gated so no placeholder ships to prod.
  ...(process.env.NEXT_PUBLIC_GOOGLE_SITE_VERIFICATION
    ? { verification: { google: process.env.NEXT_PUBLIC_GOOGLE_SITE_VERIFICATION } }
    : {}),
  ...(process.env.NEXT_PUBLIC_BING_SITE_VERIFICATION
    ? {
        verification: {
          ...(process.env.NEXT_PUBLIC_GOOGLE_SITE_VERIFICATION
            ? { google: process.env.NEXT_PUBLIC_GOOGLE_SITE_VERIFICATION }
            : {}),
          other: { "msvalidate.01": process.env.NEXT_PUBLIC_BING_SITE_VERIFICATION },
        },
      }
    : {}),
};

export const viewport: Viewport = {
  themeColor: "#0a0b0a",
  colorScheme: "dark",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en" className={`${geistSans.variable} ${geistMono.variable}`}>
      <body className="min-h-[100dvh] bg-ink-950 text-paper antialiased">
        <a href="#main" className="skip-link">
          Skip to content
        </a>
        <SiteHeader />
        <div id="main">{children}</div>
        <SiteFooter />
      </body>
    </html>
  );
}
