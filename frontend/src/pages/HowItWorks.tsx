import { useRef, useEffect } from 'react';
import { Link } from 'react-router-dom';
import {
  GitBranch, Webhook, Brain, MessageSquare, CheckCircle2,
  GitMerge, FileCode, Search, Terminal, UploadCloud,
  FileDiff, PlayCircle, Bolt, Laptop
} from 'lucide-react';

export function HowItWorks() {
  const revealRefs = useRef<(HTMLDivElement | null)[]>([]);

  useEffect(() => {
    const observer = new IntersectionObserver((entries) => {
      entries.forEach((entry) => {
        if (entry.isIntersecting) {
          entry.target.classList.add('active');
        }
      });
    }, { threshold: 0.1 });

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

  const steps = [
    {
      step: '01',
      title: 'Push Code',
      desc: 'Developers push their feature branch to GitHub, GitLab, or Bitbucket. Sentinel monitors the stream in real-time.',
      icon: UploadCloud,
      colorVar: 'var(--color-info)',
      glow: 'shadow-[0_0_15px_var(--color-info)]',
      borderColor: 'var(--color-info)'
    },
    {
      step: '02',
      title: 'Webhook Triggers',
      desc: 'Instant notification sent to the Sentinel orchestration engine. No manual queuing or human intervention required.',
      icon: Webhook,
      colorVar: 'var(--color-scan)',
      glow: 'shadow-[0_0_15px_var(--color-scan)]',
      borderColor: 'var(--color-scan)'
    },
    {
      step: '03',
      title: 'Diff Analysis',
      desc: 'Our engine isolates changed files and extracts semantic context, mapping how new code interacts with the existing architecture.',
      icon: FileDiff,
      colorVar: 'var(--color-warning)',
      glow: 'shadow-[0_0_15px_var(--color-warning)]',
      borderColor: 'var(--color-warning)'
    },
    {
      step: '04',
      title: 'AI Cognitive Passing',
      desc: 'The core LLM engine performs multi-layered reasoning to identify logical flaws, OWASP vulnerabilities, and design anti-patterns.',
      icon: Brain,
      colorVar: 'var(--color-sentinel)',
      glow: 'shadow-[0_0_15px_var(--color-sentinel)]',
      borderColor: 'var(--color-sentinel)'
    },
    {
      step: '05',
      title: 'Review Posted',
      desc: 'Context-aware comments are injected directly into your Pull Request, providing line-by-line feedback and remediation steps.',
      icon: MessageSquare,
      colorVar: 'var(--color-critical)',
      glow: 'shadow-[0_0_15px_var(--color-critical)]',
      borderColor: 'var(--color-critical)'
    },
    {
      step: '06',
      title: 'Merge with Confidence',
      desc: 'With security verified at the neural level, your team can merge faster knowing the pipeline has their back.',
      icon: CheckCircle2,
      colorVar: 'var(--color-secure)',
      glow: 'shadow-[0_0_15px_var(--color-sentinel)]',
      borderColor: 'var(--color-sentinel)'
    }
  ];

  return (
    <div className="min-h-screen bg-[var(--color-void)] text-[var(--color-text-primary)] font-body">

      {/* Hero Section */}
      <header className="relative pt-24 pb-16 overflow-hidden">
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_1px_1px,rgba(10,194,163,0.05)_1px,transparent_0)] bg-[size:40px_40px] pointer-events-none"></div>
        <div className="absolute inset-0 bg-gradient-to-b from-transparent via-[var(--color-void)]/50 to-[var(--color-void)] pointer-events-none"></div>

        <div className="max-w-4xl mx-auto text-center px-6 relative z-10 reveal" ref={addToRefs}>
          <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-[var(--color-sentinel)]/10 border border-[var(--color-sentinel)]/20 text-[var(--color-sentinel)] text-xs font-bold uppercase tracking-widest mb-6">
            <span className="relative flex h-2 w-2">
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-[var(--color-sentinel)] opacity-75"></span>
              <span className="relative inline-flex rounded-full h-2 w-2 bg-[var(--color-sentinel)]"></span>
            </span>
            Automated Review Pipeline
          </div>
          <h1 className="text-5xl md:text-7xl font-bold font-['Syne'] text-[var(--color-text-primary)] mb-6 leading-tight">
            From <span className="text-[var(--color-sentinel)]">Push</span> to <span className="bg-clip-text text-transparent bg-gradient-to-r from-[var(--color-sentinel)] to-[var(--color-sentinel-light)]">Perfect</span>
          </h1>
          <p className="text-xl text-[var(--color-text-secondary)] max-w-2xl mx-auto leading-relaxed">
            Sentinel CLI integrates directly into your existing workflow, analyzing every commit with cognitive AI to ensure security before the first review.
          </p>
        </div>
      </header>

      {/* Timeline Section */}
      <section className="py-24 relative overflow-hidden">
        <div className="max-w-7xl mx-auto px-6 relative">
          {/* Central Spine */}
          <div className="absolute left-1/2 top-0 bottom-0 w-px bg-gradient-to-b from-[var(--color-sentinel)]/0 via-[var(--color-carbon)] to-[var(--color-sentinel)]/0 -translate-x-1/2 hidden md:block"></div>

          <div className="space-y-24 md:space-y-32">
            {steps.map((step, i) => {
              const isEven = i % 2 === 0;

              return (
                <div key={i} className="relative flex flex-col md:flex-row items-center justify-center gap-8 md:gap-0 reveal" ref={addToRefs}>
                  {/* Left Side (Content for Even, Empty for Odd) */}
                  <div className="flex-1 w-full md:pr-24 text-center md:text-right">
                    {isEven ? (
                      <div className="inline-block px-4 py-8 rounded-xl bg-[var(--color-obsidian)]/50 border border-[var(--color-carbon)] transition-all group w-full hover:border-[var(--step-color)]"
                        style={{ '--step-color': step.borderColor } as any}>
                        <span className="font-mono text-sm font-bold tracking-tighter mb-2 block uppercase" style={{ color: step.colorVar }}>STEP_{step.step}</span>
                        <h3 className="text-2xl font-bold font-['Syne'] text-[var(--color-text-primary)] mb-3">{step.title}</h3>
                        <p className="text-[var(--color-text-secondary)] max-w-sm ml-auto">{step.desc}</p>
                      </div>
                    ) : (
                      <div className="hidden md:block" />
                    )}
                  </div>

                  {/* Icon Center */}
                  <div className={`relative z-10 w-12 h-12 bg-[var(--color-void)] border-4 rounded-full flex items-center justify-center shrink-0 ${step.glow}`}
                    style={{ borderColor: step.borderColor }}>
                    <step.icon className="w-6 h-6" style={{ color: step.colorVar }} />
                  </div>

                  {/* Right Side (Content for Odd, Empty for Even) */}
                  <div className="flex-1 w-full md:pl-24 text-center md:text-left">
                    {!isEven ? (
                      <div className="inline-block px-4 py-8 rounded-xl bg-[var(--color-obsidian)]/50 border border-[var(--color-carbon)] transition-all group w-full hover:border-[var(--step-color)]"
                        style={{ '--step-color': step.borderColor } as any}>
                        <span className="font-mono text-sm font-bold tracking-tighter mb-2 block uppercase" style={{ color: step.colorVar }}>STEP_{step.step}</span>
                        <h3 className="text-2xl font-bold font-['Syne'] text-[var(--color-text-primary)] mb-3">{step.title}</h3>
                        <p className="text-[var(--color-text-secondary)] max-w-sm">{step.desc}</p>
                      </div>
                    ) : (
                      <div className="hidden md:block" />
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </section>

      {/* Integrations Footer */}
      <section className="py-24 border-t border-[var(--color-carbon)]/50">
        <div className="max-w-7xl mx-auto px-6 reveal" ref={addToRefs}>
          <h2 className="text-center text-[var(--color-text-tertiary)] text-sm font-bold uppercase tracking-[0.2em] mb-12">Universal Integration Ecosystem</h2>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-8 opacity-60 hover:opacity-100 transition-opacity">
            {[
              { icon: Terminal, name: 'CLI / LOCAL' },
              { icon: FileCode, name: 'GITHUB ACTIONS' },
              { icon: GitMerge, name: 'GITLAB CI' },
              { icon: Laptop, name: 'VS CODE' },
            ].map((item, i) => (
              <div key={i} className="flex flex-col items-center gap-4 group cursor-default">
                <div className="w-16 h-16 rounded-lg bg-[var(--color-obsidian)] border border-[var(--color-carbon)] flex items-center justify-center group-hover:border-[var(--color-sentinel)]/50 group-hover:bg-[var(--color-sentinel)]/5 transition-all">
                  <item.icon className="w-8 h-8 text-[var(--color-text-tertiary)] group-hover:text-[var(--color-sentinel)] transition-colors" />
                </div>
                <span className="text-[var(--color-text-tertiary)] text-xs font-mono group-hover:text-[var(--color-text-secondary)]">{item.name}</span>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Final CTA */}
      <section className="py-24 bg-gradient-to-t from-[var(--color-sentinel)]/10 to-transparent">
        <div className="max-w-4xl mx-auto px-6 text-center reveal" ref={addToRefs}>
          <h2 className="text-4xl font-bold font-['Syne'] text-[var(--color-text-primary)] mb-8">Ready to secure your pipeline?</h2>
          <div className="flex flex-col sm:flex-row items-center justify-center gap-4">
            <Link to="/docs" className="w-full sm:w-auto px-10 py-4 bg-[var(--color-sentinel)] text-[var(--color-void)] font-bold rounded-lg hover:shadow-lg hover:shadow-[var(--color-sentinel)]/20 transition-all flex items-center justify-center gap-2 cursor-pointer">
              <Bolt className="w-5 h-5" /> Start Free Trial
            </Link>
            <Link to="/playground" className="w-full sm:w-auto px-10 py-4 bg-[var(--color-obsidian)] text-[var(--color-text-primary)] font-bold rounded-lg border border-[var(--color-carbon)] hover:bg-[var(--color-carbon)] transition-all flex items-center justify-center gap-2 cursor-pointer">
              <PlayCircle className="w-5 h-5" /> Watch Demo
            </Link>
          </div>
          <p className="mt-8 text-[var(--color-text-tertiary)] text-sm">No credit card required. SOC2 Compliant.</p>
        </div>
      </section>

    </div>
  );
}
