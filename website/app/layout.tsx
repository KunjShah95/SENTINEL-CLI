import type { Metadata } from "next";
import "./globals.css";
import { SiteHeader } from "@/components/SiteHeader";
import { SiteFooter } from "@/components/SiteFooter";

const base = "https://sentinel-cli.dev";

export const metadata: Metadata = {
  metadataBase: new URL(base),
  title: {
    default: "Sentinel — minimalist AI coding assistant for the terminal",
    template: "%s · Sentinel",
  },
  description:
    "Sentinel is a fast, cheap, transparent coding chat in your terminal. Multi-LLM, sandboxed local tools, sessions as JSON, MCP. No servers, no telemetry.",
  openGraph: {
    type: "website",
    siteName: "Sentinel",
    title: "Sentinel — minimalist AI coding assistant for the terminal",
    description:
      "Multi-LLM terminal coding agent. Sandboxed tools, sessions as JSON, MCP. No servers, no telemetry.",
  },
  twitter: {
    card: "summary",
    title: "Sentinel — minimalist AI coding assistant for the terminal",
    description:
      "Multi-LLM terminal coding agent. Sandboxed tools, sessions as JSON, MCP. No servers, no telemetry.",
  },
  alternates: { canonical: "/" },
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body className="min-h-screen bg-ink-950 text-paper antialiased">
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
