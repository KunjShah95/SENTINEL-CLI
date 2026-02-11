import { useRef, useEffect } from 'react';
import { Link } from 'react-router-dom';
import {
  Shield, Zap, Bug, Settings, Globe, Download, FileText
} from 'lucide-react';



export function Changelog() {
  const revealRefs = useRef<(HTMLDivElement | null)[]>([]);

  useEffect(() => {
    const observer = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (entry.isIntersecting) {
            entry.target.classList.add('active');
          }
        });
      },
      { threshold: 0.1 }
    );

    revealRefs.current.forEach((ref) => {
      if (ref) observer.observe(ref);
    });

    return () => observer.disconnect();
  }, []);

  const addToRefs = (el: HTMLDivElement | null) => {
    if (el && !revealRefs.current.includes(el)) {
      revealRefs.current.push(el);
    }
  };

  return (
    <div className="min-h-screen bg-[var(--color-void)] text-[var(--color-text-primary)] font-body">



      {/* Hero Section */}
      <header className="pt-24 pb-16 text-center relative overflow-hidden">
        {/* Grid Background */}
        <div className="absolute inset-0 bg-[linear-gradient(to_right,rgba(10,194,163,0.05)_1px,transparent_1px),linear-gradient(to_bottom,rgba(10,194,163,0.05)_1px,transparent_1px)] bg-[size:40px_40px] pointer-events-none z-0"></div>

        <div className="relative z-10">
          <div className="inline-flex items-center gap-2 bg-[var(--color-sentinel)]/10 border border-[var(--color-sentinel)]/20 px-3 py-1 rounded-full mb-6">
            <span className="w-2 h-2 rounded-full bg-[var(--color-sentinel)] animate-pulse"></span>
            <span className="text-xs font-bold uppercase tracking-widest text-[var(--color-sentinel)] font-display">Changelog</span>
          </div>
          <h1 className="text-5xl md:text-7xl font-bold text-[var(--color-text-primary)] mb-6 font-display tracking-tight font-['Syne']">Version History</h1>
          <p className="text-[var(--color-text-secondary)] max-w-2xl mx-auto text-lg">
            Tracking the evolution of AI-powered code security. Stay updated with our latest releases, security enhancements, and performance optimizations.
          </p>
        </div>
      </header>

      {/* Changelog Content */}
      <main className="max-w-5xl mx-auto px-4 pb-32 relative z-10">
        <div className="relative">
          {/* Vertical Timeline Line */}
          <div className="absolute left-0 md:left-1/2 top-0 bottom-0 w-px bg-[linear-gradient(to_bottom,transparent,var(--color-carbon)_10%,var(--color-carbon)_90%,transparent)] -translate-x-1/2 hidden md:block"></div>

          {/* Version 2.4.0 */}
          <div className="relative mb-24 reveal" ref={addToRefs}>
            <div className="md:flex items-center justify-center mb-8">
              <div className="absolute left-0 md:left-1/2 w-4 h-4 bg-[var(--color-sentinel)] rounded-full -translate-x-1/2 hidden md:block shadow-[0_0_15px_rgba(10,194,163,0.5)]"></div>
              <div className="bg-[var(--color-sentinel)] text-[var(--color-void)] font-mono px-4 py-1 rounded font-bold text-sm z-20 md:absolute md:left-1/2 md:-translate-x-1/2">
                v2.4.0
              </div>
            </div>
            <div className="md:grid md:grid-cols-2 gap-16">
              <div className="md:text-right">
                <h2 className="text-3xl font-bold text-[var(--color-text-primary)] mb-2 font-['Syne']">The Intelligence Update</h2>
                <div className="flex md:justify-end gap-3 mb-4">
                  <span className="font-mono text-xs text-[var(--color-text-tertiary)] uppercase tracking-widest pt-1">October 24, 2023</span>
                  <span className="bg-[var(--color-sentinel)]/20 text-[var(--color-sentinel)] px-2 py-0.5 rounded text-[10px] font-bold uppercase border border-[var(--color-sentinel)]/30">Major</span>
                </div>
                <p className="text-[var(--color-text-secondary)] mb-6 leading-relaxed">
                  Introducing deep-context LLM integration for ultra-precise vulnerability detection and automated remediation suggestions.
                </p>
              </div>
              <div className="space-y-6">
                <div className="bg-[var(--color-obsidian)]/50 border border-[var(--color-carbon)] p-5 rounded-lg hover:border-[var(--color-sentinel)]/40 transition-colors group">
                  <div className="flex items-start gap-4">
                    <div className="bg-[var(--color-sentinel)]/10 p-2 rounded group-hover:bg-[var(--color-sentinel)]/20 transition-colors">
                      <Shield className="text-[var(--color-sentinel)] w-5 h-5" />
                    </div>
                    <div>
                      <h4 className="text-[var(--color-text-primary)] font-bold text-sm mb-1 font-display">Security Enhancements</h4>
                      <ul className="text-sm text-[var(--color-text-secondary)] space-y-2 font-mono list-disc pl-4">
                        <li>Integrated <code className="text-[var(--color-sentinel)]/80">Sentinel-AI-v4</code> engine for complex logic vulnerability detection.</li>
                        <li>Added zero-day pattern recognition for Go and Rust ecosystems.</li>
                      </ul>
                    </div>
                  </div>
                </div>
                <div className="bg-[var(--color-obsidian)]/50 border border-[var(--color-carbon)] p-5 rounded-lg hover:border-[var(--color-sentinel)]/40 transition-colors group">
                  <div className="flex items-start gap-4">
                    <div className="bg-[var(--color-info)]/10 p-2 rounded group-hover:bg-[var(--color-info)]/20 transition-colors">
                      <Zap className="text-[var(--color-info)] w-5 h-5" />
                    </div>
                    <div>
                      <h4 className="text-[var(--color-text-primary)] font-bold text-sm mb-1 font-display">Performance</h4>
                      <ul className="text-sm text-[var(--color-text-secondary)] space-y-2 font-mono list-disc pl-4">
                        <li>Reduced memory overhead for large monorepo scans by 35%.</li>
                        <li>Parallelized tokenization engine for multi-core environments.</li>
                      </ul>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>

          {/* Version 2.3.5 */}
          <div className="relative mb-24 reveal" ref={addToRefs}>
            <div className="md:flex items-center justify-center mb-8">
              <div className="absolute left-0 md:left-1/2 w-4 h-4 bg-[var(--color-carbon)] rounded-full -translate-x-1/2 hidden md:block"></div>
              <div className="bg-[var(--color-carbon)] text-[var(--color-text-secondary)] font-mono px-4 py-1 rounded font-bold text-sm z-20 md:absolute md:left-1/2 md:-translate-x-1/2">
                v2.3.5
              </div>
            </div>
            <div className="md:grid md:grid-cols-2 gap-16">
              {/* Empty left column */}
              <div className="hidden md:block"></div>
              <div className="md:relative">
                <div className="md:absolute md:right-[calc(100%+4rem)] md:text-right w-full">
                  <h2 className="text-3xl font-bold text-[var(--color-text-primary)] mb-2 font-['Syne']">Stability Patch</h2>
                  <div className="flex md:justify-end gap-3 mb-4">
                    <span className="font-mono text-xs text-[var(--color-text-tertiary)] uppercase tracking-widest pt-1">September 12, 2023</span>
                    <span className="bg-[var(--color-carbon)] text-[var(--color-text-secondary)] px-2 py-0.5 rounded text-[10px] font-bold uppercase border border-[var(--color-sentinel)]/20">Minor</span>
                  </div>
                  <p className="text-[var(--color-text-secondary)] mb-6 leading-relaxed">
                    Routine maintenance release focusing on CI/CD integration stability and bug fixes.
                  </p>
                </div>

                <div className="space-y-6">
                  <div className="bg-[var(--color-obsidian)]/50 border border-[var(--color-carbon)] p-5 rounded-lg hover:border-[var(--color-sentinel)]/40 transition-colors group">
                    <div className="flex items-start gap-4">
                      <div className="bg-[var(--color-warning)]/10 p-2 rounded group-hover:bg-[var(--color-warning)]/20 transition-colors">
                        <Bug className="text-[var(--color-warning)] w-5 h-5" />
                      </div>
                      <div>
                        <h4 className="text-[var(--color-text-primary)] font-bold text-sm mb-1 font-display">Bug Fixes</h4>
                        <ul className="text-sm text-[var(--color-text-secondary)] space-y-2 font-mono list-disc pl-4">
                          <li>Fixed false positives in JS dependency audit logs.</li>
                          <li>Resolved <code className="text-[var(--color-sentinel)]/80">SIGINT</code> handling issues in Docker containers.</li>
                        </ul>
                      </div>
                    </div>
                  </div>
                </div>

              </div>
            </div>
          </div>

          {/* Version 2.2.0 */}
          <div className="relative mb-24 reveal" ref={addToRefs}>
            <div className="md:flex items-center justify-center mb-8">
              <div className="absolute left-0 md:left-1/2 w-4 h-4 bg-[var(--color-carbon)] rounded-full -translate-x-1/2 hidden md:block"></div>
              <div className="bg-[var(--color-carbon)] text-[var(--color-text-secondary)] font-mono px-4 py-1 rounded font-bold text-sm z-20 md:absolute md:left-1/2 md:-translate-x-1/2">
                v2.2.0
              </div>
            </div>
            <div className="md:grid md:grid-cols-2 gap-16">
              <div className="md:text-right">
                <h2 className="text-3xl font-bold text-[var(--color-text-primary)] mb-2 font-['Syne']">The Core Guard</h2>
                <div className="flex md:justify-end gap-3 mb-4">
                  <span className="font-mono text-xs text-[var(--color-text-tertiary)] uppercase tracking-widest pt-1">August 05, 2023</span>
                  <span className="bg-[var(--color-sentinel)]/20 text-[var(--color-sentinel)] px-2 py-0.5 rounded text-[10px] font-bold uppercase border border-[var(--color-sentinel)]/30">Major</span>
                </div>
                <p className="text-[var(--color-text-secondary)] mb-6 leading-relaxed">
                  A fundamental rewrite of the scanning core for 10x speed gains and broader language support.
                </p>
              </div>
              <div className="space-y-6">
                <div className="bg-[var(--color-obsidian)]/50 border border-[var(--color-carbon)] p-5 rounded-lg hover:border-[var(--color-sentinel)]/40 transition-colors group">
                  <div className="flex items-start gap-4">
                    <div className="bg-[var(--color-sentinel)]/10 p-2 rounded group-hover:bg-[var(--color-sentinel)]/20 transition-colors">
                      <Globe className="text-[var(--color-sentinel)] w-5 h-5" />
                    </div>
                    <div>
                      <h4 className="text-[var(--color-text-primary)] font-bold text-sm mb-1 font-display">Language Support</h4>
                      <ul className="text-sm text-[var(--color-text-secondary)] space-y-2 font-mono list-disc pl-4">
                        <li>Official support for PHP and C# static analysis.</li>
                        <li>Improved JSX/TSX component hierarchy traversal.</li>
                      </ul>
                    </div>
                  </div>
                </div>
                <div className="bg-[var(--color-obsidian)]/50 border border-[var(--color-carbon)] p-5 rounded-lg hover:border-[var(--color-sentinel)]/40 transition-colors group">
                  <div className="flex items-start gap-4">
                    <div className="bg-[var(--color-info)]/10 p-2 rounded group-hover:bg-[var(--color-info)]/20 transition-colors">
                      <Settings className="text-[var(--color-info)] w-5 h-5" />
                    </div>
                    <div>
                      <h4 className="text-[var(--color-text-primary)] font-bold text-sm mb-1 font-display">Core Infrastructure</h4>
                      <ul className="text-sm text-[var(--color-text-secondary)] space-y-2 font-mono list-disc pl-4">
                        <li>Introduced <code className="text-[var(--color-sentinel)]/80">.sentinel-config</code> for team-wide rule enforcement.</li>
                        <li>New JSON/YAML export formats for integration with SIEM tools.</li>
                      </ul>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>

        </div>

        {/* Call to Action */}
        <section className="border-t border-[var(--color-carbon)] bg-[var(--color-obsidian)]/50 py-24">
          <div className="max-w-4xl mx-auto px-4 text-center reveal" ref={addToRefs}>
            <h3 className="text-3xl font-bold text-[var(--color-text-primary)] mb-6 font-['Syne']">Stay ahead of the threats.</h3>
            <p className="text-[var(--color-text-secondary)] mb-8 text-lg">Download the latest Sentinel CLI binaries or update your existing installation.</p>
            <div className="flex flex-col sm:flex-row gap-4 justify-center">
              <a
                href="https://github.com/KunjShah95/SENTINEL-CLI/releases"
                target="_blank"
                rel="noopener noreferrer"
                className="bg-[var(--color-sentinel)] text-[var(--color-void)] px-8 py-3 rounded-lg font-bold hover:bg-[var(--color-sentinel)]/90 transition-all flex items-center justify-center gap-2 cursor-pointer"
              >
                <Download className="w-5 h-5" />
                Download v2.4.0
              </a>
              <Link to="/docs" className="bg-[var(--color-obsidian)] text-[var(--color-text-primary)] px-8 py-3 rounded-lg font-bold hover:bg-[var(--color-carbon)] transition-all border border-[var(--color-carbon)] flex items-center justify-center gap-2 cursor-pointer">
                <FileText className="w-5 h-5" />
                Full Documentation
              </Link>
            </div>
            <div className="mt-8">
              <code className="bg-[var(--color-void)] border border-[var(--color-carbon)] px-4 py-3 rounded-lg text-[var(--color-sentinel)] text-sm font-mono block w-fit mx-auto">
                curl -sSL https://sentinel.sh/install | sh
              </code>
            </div>
          </div>
        </section>

      </main>

    </div>
  );
}
