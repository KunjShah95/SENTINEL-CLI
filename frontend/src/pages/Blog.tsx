import { useState, useEffect, useRef } from 'react';
import { Link } from 'react-router-dom';
import { Search, ArrowRight, Shield, Globe, Code } from 'lucide-react';

const articles = [
  {
    id: 1,
    title: "The Future of AI-Driven Patching: Automating Remediation at Scale",
    summary: "Explore how large language models are being trained to not only identify vulnerabilities but to safely generate pull requests that fix them across legacy codebases.",
    author: "Alex Thorne",
    date: "Oct 24, 2023",
    readTime: "8 min read",
    category: "Research",
    image: "https://lh3.googleusercontent.com/aida-public/AB6AXuAuuoLgsBtYtYvporCwUZ6eTiN-gXkIraLDYRf__vJxJKQsKZwJI5LF1kkrP_Q8c19yzizjPJ_H3FrP7u6br7NqUHrbJNiiZexQiNSeoYwLPKRNAkKQD-YvE2mfq1XQhYkjyxikIMe9VtccVUYedzSvS-5WYfcXo59TWEbGiCEZlUs6k55Tv_vQxoTOM8sGAgj9wWxpGmHKZvqA4crx05C8ripZrrmKHqeDul0n8ZgabeSwF_3o3rhEYllUunIFo1Q5ztSX9xAFyLU"
  },
  {
    id: 2,
    title: "Hardening your CLI Workflows: Preventing Supply Chain Attacks",
    summary: "A deep dive into the latest attack vectors targeting CI/CD pipelines and how to implement zero-trust principles in your local development environment.",
    author: "Sarah Chen",
    date: "Oct 20, 2023",
    readTime: "12 min read",
    category: "Security",
    image: "https://lh3.googleusercontent.com/aida-public/AB6AXuBscjMnSzsveGH5YKXam_F7qho86t2wqs3yA91VFNzmHHUGa8YQtlLLhW-2-tOIvxrJk1vdyLJLz1qq5-086U8VedHGKC7Q3SfRx1zfFE13a51wP1WlRdIk-K0LbYJ3_EffzhmpjKlPDyWSlz7nVqIqhd5yDnW5sBtl0QW4g5ExXfvmhN5By8zFWI8L06HmpNh5nrSg6ji7shkgyOcObNY4uKDesAPX-ynLYftYQKNINm_yZ8kzKn9sg9ecOTTKhfXSoxQo6RKiU28"
  },
  {
    id: 3,
    title: "Setting Up Sentinel CLI with GitHub Actions",
    summary: "A step-by-step guide to integrating Sentinel's automated security scans into your GitHub workflow for instant feedback on every commit.",
    author: "Marcus Wright",
    date: "Oct 15, 2023",
    readTime: "5 min read",
    category: "Tutorial",
    image: "https://lh3.googleusercontent.com/aida-public/AB6AXuAH4KE1u9ygnQ2uKtsdDAsit16HSpt6pj3YiARU-NcumgjgRUmaQ1lNLISJWhj9U-tHo1fU3rhq4IjaB3Ay-8hBqWX_Z9QV3OQVB2474__l8yeZ6qmCauTQY2F8aKFsyYabYDkgkrfmBSmioPfCKcrmIumV-QlhBxz_Kqq9ujqy0wVIxG1f_XMdAyu8saW4T2tuCR-JES1vqkpLWk8udw_JqcxYB6TLSgoXTSfMmRJPSrEfbSvGt1CmwALvpdnlrqv7dBrQicTH4_A"
  },
  {
    id: 4,
    title: "The Performance Cost of Security: Optimization Strategies",
    summary: "Security scans don't have to slow down your builds. Learn how Sentinel CLI achieves near-instant analysis through intelligent caching and differential scanning.",
    author: "Jordan Lee",
    date: "Oct 12, 2023",
    readTime: "10 min read",
    category: "Engineering",
    image: "https://lh3.googleusercontent.com/aida-public/AB6AXuCrOZzZYBnAMtC7ucaHRZYQJncAkSikqym9Ymt8SihqTcAwZQ2kyj9ujxEv7VVeDqZynqRUbkxuc4xxBhd8R4t0LURSkEwQzLU-YWTL2KoETfbuHJWyeIfnkAz6x39X2rUTeFhT6j7e1A3nNePCtTzRsm9qPDDl3VMkPfLz7BJqDZEZHuTK15T430fYZ73iaxB3qRqPevvYxTc4rqKha8ug9-lgHDe_Pvz3qCxK-lcYygpjwgU3tKnyFd3QUIvKQcFREQseU3CcO_k"
  }
];

const filters = ["All", "Engineering", "Research", "Tutorial", "Security"];

export function Blog() {
  const [activeFilter, setActiveFilter] = useState("All");
  const [searchQuery, setSearchQuery] = useState("");
  const [subscribed, setSubscribed] = useState(false);

  const filteredArticles = articles.filter(article => {
    const matchesFilter = activeFilter === "All" || article.category === activeFilter;
    const matchesSearch = article.title.toLowerCase().includes(searchQuery.toLowerCase()) ||
      article.summary.toLowerCase().includes(searchQuery.toLowerCase());
    return matchesFilter && matchesSearch;
  });

  const handleSubscribe = (e: React.FormEvent) => {
    e.preventDefault();
    setSubscribed(true);
    setTimeout(() => setSubscribed(false), 5000);
  };

  return (
    <div className="min-h-screen bg-[var(--color-void)] text-[var(--color-text-primary)] font-body">

      {/* Hero Section */}
      <header className="relative pt-24 pb-16 overflow-hidden">
        <div className="absolute inset-0 -z-10 opacity-20 pointer-events-none">
          <div className="absolute top-0 left-1/2 -translate-x-1/2 w-full h-full bg-[radial-gradient(circle_at_center,rgba(10,194,163,0.15)_0%,transparent_70%)]"></div>
        </div>
        <div className="max-w-7xl mx-auto px-6 text-center">
          <span className="inline-block px-3 py-1 bg-[var(--color-sentinel)]/10 border border-[var(--color-sentinel)]/20 text-[var(--color-sentinel)] rounded-full text-xs font-bold tracking-widest uppercase mb-6">
            Sentinel Blog
          </span>
          <h1 className="font-['Syne'] text-5xl md:text-7xl font-bold tracking-tight mb-6 text-[var(--color-text-primary)]">
            Security Insights <br /> <span className="text-[var(--color-text-secondary)]">& Guides</span>
          </h1>
          <p className="max-w-2xl mx-auto text-[var(--color-text-secondary)] text-lg">
            Expert analysis on AI-driven code security, automated vulnerability detection, and DevSecOps best practices for the modern engineering stack.
          </p>
        </div>
      </header>

      {/* Sticky Filter Bar */}
      <div className="sticky top-16 md:top-20 z-30 bg-[var(--color-void)]/95 backdrop-blur-md border-y border-[var(--color-sentinel)]/10">
        <div className="max-w-7xl mx-auto px-6">
          <div className="flex flex-col md:flex-row md:items-center justify-between py-4 gap-4">
            <div className="flex flex-wrap gap-2">
              {filters.map((filter) => (
                <button
                  key={filter}
                  onClick={() => setActiveFilter(filter)}
                  className={`px-4 py-1.5 rounded-full text-sm font-medium transition-all cursor-pointer ${activeFilter === filter
                    ? 'bg-[var(--color-sentinel)] text-[var(--color-void)]'
                    : 'border border-[var(--color-sentinel)]/20 hover:border-[var(--color-sentinel)] text-[var(--color-text-secondary)]'
                    }`}
                >
                  {filter}
                </button>
              ))}
            </div>
            <div className="relative group">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-[var(--color-text-tertiary)] group-focus-within:text-[var(--color-sentinel)] transition-colors" />
              <input
                className="bg-[var(--color-sentinel)]/5 border border-[var(--color-sentinel)]/20 rounded-lg pl-10 pr-4 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[var(--color-sentinel)]/50 w-full md:w-64 transition-all text-[var(--color-text-primary)] placeholder:text-[var(--color-text-tertiary)] font-display"
                placeholder="Search articles..."
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
              />
            </div>
          </div>
        </div>
      </div>

      {/* Blog Grid */}
      <main className="max-w-7xl mx-auto px-6 py-16">
        {filteredArticles.length > 0 ? (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-12">
            {filteredArticles.map((article) => (
              <article key={article.id} className="group cursor-pointer">
                <Link to="/blog/article" className="relative overflow-hidden rounded-xl aspect-[16/9] mb-6 border border-[var(--color-sentinel)]/10 block">
                  <img
                    src={article.image}
                    alt={article.title}
                    className="w-full h-full object-cover transition-transform duration-500 group-hover:scale-105"
                  />
                  <div className="absolute top-4 left-4">
                    <span className="bg-[var(--color-void)]/80 backdrop-blur-md text-[var(--color-sentinel)] px-3 py-1 rounded text-xs font-bold uppercase border border-[var(--color-sentinel)]/30">
                      {article.category}
                    </span>
                  </div>
                </Link>
                <div className="space-y-3">
                  <div className="flex items-center gap-4 text-xs font-medium text-[var(--color-text-tertiary)] uppercase tracking-wider">
                    <span>{article.readTime}</span>
                    <span className="w-1 h-1 bg-[var(--color-sentinel)] rounded-full"></span>
                    <span>{article.author}</span>
                    <span className="w-1 h-1 bg-[var(--color-sentinel)] rounded-full"></span>
                    <span>{article.date}</span>
                  </div>
                  <h3 className="text-2xl font-bold transition-colors text-[var(--color-text-primary)] group-hover:text-[var(--color-sentinel)] font-['Syne']">
                    {article.title}
                  </h3>
                  <p className="text-[var(--color-text-secondary)] line-clamp-2 leading-relaxed">
                    {article.summary}
                  </p>
                  <Link to="/blog/article" className="inline-flex items-center gap-2 text-[var(--color-sentinel)] font-bold text-sm group-hover:underline">
                    Read Article
                    <ArrowRight className="w-4 h-4 group-hover:translate-x-1 transition-transform" />
                  </Link>
                </div>
              </article>
            ))}
          </div>
        ) : (
          <div className="text-center py-20 bg-[var(--color-sentinel)]/5 rounded-2xl border border-[var(--color-sentinel)]/10">
            <h3 className="text-2xl font-bold text-[var(--color-text-secondary)] font-['Syne'] mb-2">No articles found</h3>
            <p className="text-[var(--color-text-tertiary)]">Try adjusting your search or filter settings.</p>
            <button
              onClick={() => { setActiveFilter("All"); setSearchQuery(""); }}
              className="mt-6 text-[var(--color-sentinel)] font-bold hover:underline cursor-pointer"
            >
              Reset All Filters
            </button>
          </div>
        )}

        {filteredArticles.length > 0 && (
          <div className="mt-20 flex justify-center">
            <button className="border border-[var(--color-sentinel)]/30 hover:bg-[var(--color-sentinel)]/5 px-8 py-3 rounded-lg font-bold transition-colors text-[var(--color-text-primary)] cursor-pointer">
              Load More Articles
            </button>
          </div>
        )}
      </main>

      {/* Newsletter Section */}
      <section className="bg-[var(--color-sentinel)] py-16">
        <div className="max-w-7xl mx-auto px-6">
          <div className="flex flex-col md:flex-row items-center justify-between gap-10">
            <div className="max-w-xl">
              <h2 className="text-[var(--color-void)] text-3xl md:text-4xl font-bold mb-4 font-['Syne']">Stay ahead of the threats.</h2>
              <p className="text-[var(--color-void)]/80 text-lg">
                Get the latest security research, tutorials, and Sentinel CLI updates delivered directly to your inbox every week.
              </p>
            </div>
            <div className="w-full md:w-auto">
              {!subscribed ? (
                <form className="flex flex-col sm:flex-row gap-3" onSubmit={handleSubscribe}>
                  <input
                    className="px-6 py-4 rounded-lg bg-[var(--color-void)] text-[var(--color-text-primary)] border-none focus:ring-2 focus:ring-[var(--color-text-primary)]/20 min-w-[300px] placeholder:text-[var(--color-text-tertiary)]"
                    placeholder="Enter your email"
                    type="email"
                    required
                  />
                  <button className="bg-[var(--color-text-primary)] text-[var(--color-void)] font-bold px-8 py-4 rounded-lg hover:bg-slate-100 transition-colors cursor-pointer" type="submit">
                    Join
                  </button>
                </form>
              ) : (
                <div className="bg-[var(--color-void)] px-8 py-6 rounded-lg text-center animate-in zoom-in duration-300">
                  <span className="text-[var(--color-sentinel)] text-xl font-bold font-['Syne'] block mb-1">WELCOME TO THE SQUAD_</span>
                  <p className="text-[var(--color-text-secondary)] text-sm uppercase tracking-widest font-mono">ENCRYPTED CONNECTION ESTABLISHED.</p>
                </div>
              )}
              <p className="mt-3 text-sm text-[var(--color-void)]/60 text-center sm:text-left">
                No spam. Unsubscribe at any time.
              </p>
            </div>
          </div>
        </div>
      </section>


    </div>
  );
}
