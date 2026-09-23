import { DocsSidebar } from "@/components/DocsSidebar";
import { DocsPager } from "@/components/DocsPager";

export default function DocsLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div className="mx-auto max-w-6xl px-4 sm:px-6">
      <div className="grid gap-8 py-8 lg:grid-cols-[240px_minmax(0,1fr)]">
        <aside className="hidden lg:block">
          <div className="sticky top-20">
            <DocsSidebar />
          </div>
        </aside>
        <div className="min-w-0">
          <details className="mb-6 rounded border border-ink-800 bg-ink-900 lg:hidden">
            <summary className="cursor-pointer px-4 py-3 text-sm font-medium">
              Sections
            </summary>
            <div className="border-t border-ink-800 px-4 py-4">
              <DocsSidebar />
            </div>
          </details>
          <article className="prose-docs max-w-3xl space-y-5 text-[15px] leading-7">
            {children}
          </article>
          <div className="mt-10 max-w-3xl">
            <DocsPager />
          </div>
        </div>
      </div>
    </div>
  );
}
