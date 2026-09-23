import Link from "next/link";

export default function NotFound() {
  return (
    <main className="mx-auto max-w-2xl px-4 py-20 text-center sm:px-6">
      <p className="font-mono text-sm text-moss">404</p>
      <h1 className="mt-2 text-3xl font-semibold tracking-tight">Page not found</h1>
      <p role="status" className="mt-3 text-sm leading-6 text-muted">
        That path doesn&apos;t exist. Try the docs overview or head home.
      </p>
      <div className="mt-6 flex justify-center gap-3">
        <Link href="/docs" className="rounded bg-moss px-4 py-2 text-sm font-semibold text-ink-950">
          Docs overview
        </Link>
        <Link href="/" className="rounded border border-ink-700 bg-ink-900 px-4 py-2 text-sm">
          Home
        </Link>
      </div>
    </main>
  );
}
