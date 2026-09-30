import { DocsSidebar } from "@/components/DocsSidebar";
import { DocsPager } from "@/components/DocsPager";

export default function DocsLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div className="mx-auto max-w-6xl px-4 sm:px-6">
      <div className="grid gap-10 py-10 lg:grid-cols-[220px_minmax(0,1fr)] lg:gap-16 lg:py-14">
        <aside className="hidden lg:block">
          <div className="sticky top-24">
            <DocsSidebar />
          </div>
        </aside>
        <div className="min-w-0">
          <details className="mb-8 rounded-md border border-ink-800 bg-ink-900 lg:hidden">
            <summary className="cursor-pointer px-4 py-3 font-mono text-sm text-muted">
              Sections
            </summary>
            <div className="border-t border-ink-800 px-4 py-4">
              <DocsSidebar />
            </div>
          </details>
          <article className="prose-docs max-w-3xl space-y-5 text-[15px] leading-7 [&_h1]:text-4xl [&_h1]:sm:text-[2.6rem] [&_h1]:leading-[1.1]">
            {children}
          </article>
          <div className="mt-16 max-w-3xl">
            <DocsPager />
          </div>
        </div>
      </div>
    </div>
  );
}
