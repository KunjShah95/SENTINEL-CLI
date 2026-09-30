import type { Metadata } from "next";
import Link from "next/link";
import { ArrowRight } from "lucide-react";

export const metadata: Metadata = {
  title: "Page not found",
  description: "That page does not exist. Try the documentation overview or the blog index.",
  robots: { index: false, follow: true },
};

export default function NotFound() {
  return (
    <main className="relative overflow-hidden">
      <div aria-hidden="true" className="bg-grid pointer-events-none absolute inset-0" />
      <div className="relative mx-auto max-w-2xl px-4 pb-32 pt-24 sm:px-6">
        <div className="surface rounded-lg p-6 font-mono text-[13px] leading-6 sm:p-8">
          <p className="text-paper">
            <span className="text-moss">$</span> sentinel open this-page
          </p>
          <p className="mt-1 text-amberish">✗ ENOENT: no such file or directory</p>
          <p className="mt-1 text-muted">▸ suggestion: try the docs overview or head home</p>
        </div>
        <p className="mt-10 font-mono text-sm text-moss">404</p>
        <h1 className="mt-2 text-4xl font-semibold tracking-[-0.04em]">Page not found.</h1>
        <p role="status" className="mt-3 text-[15px] leading-7 text-muted">
          That path doesn&apos;t exist. It may have moved when the docs were reorganised.
        </p>
        <div className="mt-8 flex flex-wrap items-center gap-2">
          <Link href="/docs" className="btn-primary">
            Docs overview <ArrowRight size={15} aria-hidden="true" />
          </Link>
          <Link href="/blog" className="btn-link">
            Blog
          </Link>
          <Link href="/" className="btn-link">
            Home
          </Link>
        </div>
      </div>
    </main>
  );
}
