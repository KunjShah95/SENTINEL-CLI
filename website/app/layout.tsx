import type { Metadata, Viewport } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";
import { SiteHeader } from "@/components/SiteHeader";
import { SiteFooter } from "@/components/SiteFooter";

const base = "https://sentinel-cli.dev";

const geistSans = Geist({ subsets: ["latin"], variable: "--font-geist-sans", display: "swap" });
const geistMono = Geist_Mono({ subsets: ["latin"], variable: "--font-geist-mono", display: "swap" });

export const metadata: Metadata = {
  metadataBase: new URL(base),
  title: {
    default: "Sentinel: minimalist AI coding assistant for the terminal",
    template: "%s · Sentinel",
  },
  description:
    "Sentinel is a fast, cheap, transparent coding chat in your terminal. Multi-LLM, sandboxed local tools, sessions as JSON, MCP. No servers, no telemetry.",
  icons: { icon: "/favicon.svg" },
  openGraph: {
    type: "website",
    siteName: "Sentinel",
    title: "Sentinel: minimalist AI coding assistant for the terminal",
    description:
      "Multi-LLM terminal coding agent. Sandboxed tools, sessions as JSON, MCP. No servers, no telemetry.",
  },
  twitter: {
    card: "summary",
    title: "Sentinel: minimalist AI coding assistant for the terminal",
    description:
      "Multi-LLM terminal coding agent. Sandboxed tools, sessions as JSON, MCP. No servers, no telemetry.",
  },
  alternates: { canonical: "/" },
};

export const viewport: Viewport = {
  themeColor: "#0a0b0a",
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
