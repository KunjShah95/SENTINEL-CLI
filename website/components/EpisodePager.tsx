import Link from "next/link";
import { ArrowLeft, ArrowRight } from "lucide-react";

type Episode = { slug: string; title: string; order?: number };

/**
 * Curriculum pager for a post that belongs to a series. Distinct from DocsPager:
 * a course is a sequence you can only read forwards, so the pager never pretends
 * part 1 has a predecessor.
 */
export function EpisodePager({
  seriesTitle,
  seriesSlug,
  part,
  total,
  prev,
  next,
}: {
  seriesTitle: string;
  seriesSlug: string;
  part: number;
  total: number;
  prev: Episode | null;
  next: Episode | null;
}) {
  if (!prev && !next) return null;
  return (
    <nav
      aria-label={`${seriesTitle} curriculum`}
      className="mt-16 border-t border-ink-800 pt-6"
    >
      <p className="font-mono text-xs text-muted">
        Part {part} of {total} ·{" "}
        <Link href={`/series/${seriesSlug}`} className="text-moss underline-offset-4 hover:underline">
          {seriesTitle}
        </Link>
      </p>
      <div className="mt-4 grid gap-3 sm:grid-cols-2">
        <div>
          {prev && (
            <Link
              href={`/blog/${prev.slug}`}
              className="group flex items-center gap-2 rounded-md border border-ink-800 p-4 transition-colors duration-200 hover:border-ink-700 hover:bg-ink-900"
            >
              <ArrowLeft size={16} aria-hidden="true" className="shrink-0 text-muted transition-transform duration-200 group-hover:text-moss" />
              <span className="min-w-0">
                <span className="block font-mono text-xs text-muted">
                  Part {prev.order}
                </span>
                <span className="block text-sm font-medium group-hover:text-moss">
                  {prev.title}
                </span>
              </span>
            </Link>
          )}
        </div>
        <div>
          {next && (
            <Link
              href={`/blog/${next.slug}`}
              className="group flex items-center justify-end gap-2 rounded border border-ink-800 bg-ink-900 p-4 text-right transition-colors duration-200 hover:border-ink-700"
            >
              <span className="min-w-0">
                <span className="block font-mono text-xs text-muted">
                  Part {next.order}
                </span>
                <span className="block text-sm font-medium group-hover:text-moss">
                  {next.title}
                </span>
              </span>
              <ArrowRight size={16} aria-hidden="true" className="shrink-0 text-muted transition-transform duration-200 group-hover:text-moss" />
            </Link>
          )}
        </div>
      </div>
    </nav>
  );
}
