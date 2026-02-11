import { useRef, useEffect } from 'react';
import { Link } from 'react-router-dom';
import {
  ShieldCheck, Scan, Box, Key, Package, Sparkles,
  Terminal, Share2, Activity,
  Brain, Lock, Zap, Gauge,
  Code2, Cloud, Server, Database, Globe, Command
} from 'lucide-react';

// Icons mapping
const icons = {
  sql: ShieldCheck,
  scan: Scan,
  docker: Box,
  secrets: Key,
  deps: Package,
  autofix: Sparkles,
};

const features = [
  {
    icon: icons.sql,
    title: 'SQL Injection',
    description: 'Detect complex injection vectors across 20+ languages with zero false positives using our patented flow-analysis.',
  },
  {
    icon: icons.scan,
    title: 'Vulnerability Scanning',
    description: 'Instant SAST/DAST scanning that integrates directly with your IDE, flagging issues as you write code.',
  },
  {
    icon: icons.docker,
    title: 'Docker & K8s',
    description: 'Deep container inspection. Identify misconfigurations in YAML manifests and insecure base images before deployment.',
  },
  {
    icon: icons.secrets,
    title: 'Secrets Detection',
    description: 'Scan for 800+ secret patterns including AWS keys, Stripe tokens, and SSH keys. Never leak a credential again.',
  },
  {
    icon: icons.deps,
    title: 'Dependency Audit',
    description: 'Supply chain security that maps your entire dependency graph and identifies malicious packages in real-time.',
  },
  {
    icon: icons.autofix,
    title: 'Auto-fix',
    description: "Don't just find bugs—fix them. Sentinel suggests AI-generated patches that you can apply with a single CLI command.",
  },
];

export function Features() {
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
      { threshold: 0.1, rootMargin: '0px 0px -50px 0px' }
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
      <header className="relative pt-24 pb-16 overflow-hidden">
        {/* Scanline effect */}
        <div className="absolute inset-0 pointer-events-none bg-[linear-gradient(to_bottom,transparent_0%,rgba(10,194,163,0.05)_50%,transparent_100%)] bg-[length:100%_4px] opacity-20"></div>

        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 relative z-10 text-center reveal" ref={addToRefs}>
          <span className="inline-flex items-center px-3 py-1 rounded-full text-xs font-bold tracking-widest uppercase bg-[var(--color-sentinel)]/10 text-[var(--color-sentinel)] border border-[var(--color-sentinel)]/20 mb-6">
            Capabilities
          </span>
          <h1 className="font-['Syne'] text-5xl md:text-7xl font-bold mb-6 tracking-tight">
            Every tool your <span className="text-[var(--color-sentinel)]">code</span> needs
          </h1>
          <p className="max-w-2xl mx-auto text-lg text-[var(--color-text-secondary)] mb-10">
            Sentinel CLI integrates deep-static analysis with AI-driven remediation to secure your pipeline in seconds, not hours. Built for developers who move fast.
          </p>
          <div className="flex flex-col sm:flex-row items-center justify-center gap-4">
            <div className="flex items-center bg-[var(--color-obsidian)] border border-[var(--color-sentinel)]/30 rounded-lg px-4 py-3 font-mono text-sm text-[var(--color-sentinel)] w-full sm:w-auto min-w-[300px]">
              <span className="mr-2 text-[var(--color-text-tertiary)]">$</span>
              <span>npm install -g @sentinel/cli</span>
              <button
                onClick={() => {
                  navigator.clipboard.writeText('npm install -g @sentinel/cli');
                  alert('Copied to clipboard!');
                }}
                className="ml-auto hover:text-[var(--color-text-primary)] transition-colors cursor-pointer"
                title="Copy to clipboard"
              >
                <Share2 className="w-4 h-4" />
              </button>
            </div>
            <Link to="/docs" className="w-full sm:w-auto px-8 py-3 bg-[var(--color-sentinel)] text-[var(--color-void)] font-bold rounded-lg hover:scale-105 transition-transform cursor-pointer inline-flex items-center justify-center">
              View Documentation
            </Link>
          </div>
        </div>
      </header>

      {/* Security Features Grid */}
      <section className="py-24 bg-[var(--color-obsidian)]">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {features.map((feature, i) => (
              <div key={i} className="reveal p-8 rounded-xl border border-[var(--color-sentinel)]/10 bg-[var(--color-void)] hover:shadow-[0_0_15px_rgba(10,194,163,0.3)] hover:border-[var(--color-sentinel)] transition-all group" ref={addToRefs}>
                <div className="w-12 h-12 rounded-lg bg-[var(--color-sentinel)]/10 flex items-center justify-center mb-6 text-[var(--color-sentinel)] group-hover:bg-[var(--color-sentinel)] group-hover:text-[var(--color-void)] transition-colors">
                  <feature.icon className="w-6 h-6" />
                </div>
                <h3 className="text-xl font-bold mb-3 font-['Syne'] text-[var(--color-text-primary)]">{feature.title}</h3>
                <p className="text-[var(--color-text-secondary)] leading-relaxed">{feature.description}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Workflow Features */}
      <section className="py-24">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
            {/* Native Integrations */}
            <div className="reveal relative overflow-hidden bg-[var(--color-obsidian)] rounded-xl p-8 border border-[var(--color-carbon)]" ref={addToRefs}>
              <div className="flex items-center justify-between mb-8">
                <div>
                  <h3 className="text-2xl font-bold font-['Syne'] text-[var(--color-text-primary)] mb-2">Native Integrations</h3>
                  <p className="text-[var(--color-text-secondary)]">Plug and play with your favorite Git providers.</p>
                </div>
                <div className="flex gap-2">
                  <span className="w-10 h-10 rounded-full bg-[var(--color-void)] flex items-center justify-center border border-[var(--color-carbon)]">
                    <Activity className="w-5 h-5 text-[var(--color-text-primary)]" />
                  </span>
                  <span className="w-10 h-10 rounded-full bg-[var(--color-void)] flex items-center justify-center border border-[var(--color-carbon)]">
                    <Command className="w-5 h-5 text-[var(--color-text-primary)]" />
                  </span>
                </div>
              </div>
              <div className="rounded-lg bg-[var(--color-void)] border border-[var(--color-carbon)] p-4 font-mono text-sm">
                <div className="flex gap-2 mb-4 border-b border-[var(--color-carbon)] pb-2">
                  <div className="w-3 h-3 rounded-full bg-[var(--color-critical)]/50"></div>
                  <div className="w-3 h-3 rounded-full bg-[var(--color-warning)]/50"></div>
                  <div className="w-3 h-3 rounded-full bg-[var(--color-success)]/50"></div>
                </div>
                <p className="text-[var(--color-text-tertiary)]"># .github/workflows/sentinel.yml</p>
                <p className="text-[var(--color-sentinel)]">name: <span className="text-[var(--color-text-primary)]">Security Scan</span></p>
                <p className="text-[var(--color-sentinel)]">on: <span className="text-[var(--color-text-primary)]">[push, pull_request]</span></p>
                <p className="text-[var(--color-sentinel)]">jobs:</p>
                <p className="text-[var(--color-sentinel)] pl-4">scan:</p>
                <p className="text-[var(--color-sentinel)] pl-8">runs-on: <span className="text-[var(--color-text-primary)]">ubuntu-latest</span></p>
                <p className="text-[var(--color-sentinel)] pl-8">steps:</p>
                <p className="text-[var(--color-sentinel)] pl-12">- uses: <span className="text-[var(--color-text-primary)]">sentinel-security/scan-action@v1</span></p>
              </div>
            </div>

            {/* CLI-First Design */}
            <div className="reveal relative overflow-hidden bg-[var(--color-obsidian)] rounded-xl p-8 border border-[var(--color-carbon)]" ref={addToRefs}>
              <div className="flex items-center justify-between mb-8">
                <div>
                  <h3 className="text-2xl font-bold font-['Syne'] text-[var(--color-text-primary)] mb-2">CLI-First Design</h3>
                  <p className="text-[var(--color-text-secondary)]">Blazing fast execution without leaving the terminal.</p>
                </div>
                <Terminal className="text-[var(--color-sentinel)] w-10 h-10" />
              </div>
              <div className="rounded-lg bg-[var(--color-void)] border border-[var(--color-carbon)] p-4 font-mono text-sm h-full">
                <div className="flex items-center gap-2 mb-2">
                  <span className="text-[var(--color-sentinel)]">➜</span>
                  <span className="text-[var(--color-text-primary)]">sentinel scan --project api-v2</span>
                </div>
                <div className="space-y-1">
                  <p className="text-[var(--color-text-tertiary)]">Initializing engine...</p>
                  <p className="text-[var(--color-text-tertiary)]">Analyzing 1,245 files...</p>
                  <div className="flex items-center gap-2 text-[var(--color-sentinel)]">
                    <CheckCircle2 className="w-3 h-3" />
                    <span>SAST Analysis complete (0.8s)</span>
                  </div>
                  <div className="flex items-center gap-2 text-[var(--color-warning)]">
                    <AlertTriangle className="w-3 h-3" />
                    <span>Found 2 Critical vulnerabilities</span>
                  </div>
                  <div className="mt-4 p-2 bg-[var(--color-sentinel)]/5 border border-[var(--color-sentinel)]/20 rounded">
                    <p className="text-[var(--color-sentinel)]">Run `sentinel fix` to apply auto-remediation</p>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Bento Grid Section */}
      <section className="py-24 bg-[var(--color-obsidian)]">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <h2 className="text-3xl font-bold font-['Syne'] mb-12 text-center text-[var(--color-text-primary)]">Built for the <span className="text-[var(--color-sentinel)]">modern</span> stack</h2>
          <div className="grid grid-cols-1 md:grid-cols-4 md:grid-rows-2 gap-4 h-auto md:h-[600px]">
            {/* AI Analysis */}
            <div className="md:col-span-2 md:row-span-2 relative group overflow-hidden rounded-xl border border-[var(--color-sentinel)]/10 bg-[var(--color-void)] p-8 flex flex-col justify-end reveal" ref={addToRefs}>
              <div className="absolute top-0 right-0 p-8">
                <Brain className="text-[var(--color-sentinel)] w-24 h-24 opacity-20 group-hover:opacity-100 transition-opacity" />
              </div>
              <div className="relative z-10">
                <h3 className="text-3xl font-bold mb-4 font-['Syne'] text-[var(--color-text-primary)]">AI-Powered Analysis</h3>
                <p className="text-[var(--color-text-secondary)] max-w-sm mb-6">Our proprietary LLM understands code context, reducing false positives by 98.4% compared to legacy tools.</p>
                <div className="flex gap-2">
                  <span className="px-3 py-1 rounded bg-[var(--color-sentinel)]/10 text-[var(--color-sentinel)] text-xs font-bold">GPT-4 Integration</span>
                  <span className="px-3 py-1 rounded bg-[var(--color-sentinel)]/10 text-[var(--color-sentinel)] text-xs font-bold">Context-Aware</span>
                </div>
              </div>
              <div className="absolute inset-0 bg-gradient-to-br from-[var(--color-sentinel)]/5 to-transparent pointer-events-none" />
            </div>

            {/* Privacy */}
            <div className="md:col-span-2 md:row-span-1 relative group overflow-hidden rounded-xl border border-[var(--color-sentinel)]/10 bg-[var(--color-void)] p-8 reveal" ref={addToRefs}>
              <div className="flex items-start justify-between">
                <div>
                  <h3 className="text-2xl font-bold mb-2 font-['Syne'] text-[var(--color-text-primary)]">Privacy-First</h3>
                  <p className="text-[var(--color-text-secondary)] max-w-xs">Code stays on your machine. Analysis happens locally or in your private VPC. We never store your source.</p>
                </div>
                <Lock className="text-[var(--color-sentinel)] w-10 h-10" />
              </div>
            </div>

            {/* Polyglot */}
            <div className="md:col-span-1 md:row-span-1 relative group overflow-hidden rounded-xl border border-[var(--color-sentinel)]/10 bg-[var(--color-void)] p-6 text-center reveal" ref={addToRefs}>
              <h3 className="font-bold mb-4 font-['Syne'] text-[var(--color-text-primary)]">Polyglot</h3>
              <div className="flex flex-wrap justify-center gap-3">
                {['JS', 'PY', 'GO', 'RS'].map(lang => (
                  <div key={lang} className="w-10 h-10 rounded-lg bg-[var(--color-obsidian)] flex items-center justify-center font-bold text-xs text-[var(--color-text-secondary)] border border-[var(--color-carbon)]">{lang}</div>
                ))}
              </div>
              <p className="mt-4 text-xs text-[var(--color-text-tertiary)]">25+ Languages Supported</p>
            </div>

            {/* Speed */}
            <div className="md:col-span-1 md:row-span-1 relative group overflow-hidden rounded-xl border border-[var(--color-sentinel)]/10 bg-[var(--color-void)] p-6 flex flex-col items-center justify-center reveal" ref={addToRefs}>
              <span className="text-3xl font-bold text-[var(--color-sentinel)] mb-1 font-['Syne']">200ms</span>
              <p className="text-xs text-[var(--color-text-tertiary)] uppercase tracking-widest font-bold">Latency per scan</p>
              <div className="w-full mt-4 h-1 bg-[var(--color-obsidian)] rounded-full overflow-hidden">
                <div className="w-3/4 h-full bg-[var(--color-sentinel)]"></div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Integrations Marquee */}
      <section className="py-16 overflow-hidden">
        <div className="max-w-7xl mx-auto px-4 mb-8">
          <p className="text-center text-sm font-bold uppercase tracking-[0.2em] text-[var(--color-text-tertiary)]">Seamlessly integrates with</p>
        </div>
        <div className="flex whitespace-nowrap gap-12 items-center opacity-40 hover:opacity-100 transition-opacity text-[var(--color-text-secondary)]">
          <div className="flex items-center gap-12 animate-[marquee_30s_linear_infinite]">
            <div className="flex items-center gap-2 font-bold text-xl"><Code2 className="w-6 h-6" /> ESLint</div>
            <div className="flex items-center gap-2 font-bold text-xl"><ShieldCheck className="w-6 h-6" /> Snyk</div>
            <div className="flex items-center gap-2 font-bold text-xl"><Terminal className="w-6 h-6" /> Semgrep</div>
            <div className="flex items-center gap-2 font-bold text-xl"><Cloud className="w-6 h-6" /> SonarQube</div>
            <div className="flex items-center gap-2 font-bold text-xl"><Database className="w-6 h-6" /> Redis</div>
            <div className="flex items-center gap-2 font-bold text-xl"><Globe className="w-6 h-6" /> GitHub</div>
            <div className="flex items-center gap-2 font-bold text-xl"><Activity className="w-6 h-6" /> GitLab</div>
            {/* Duplicate for loop effect */}
            <div className="flex items-center gap-2 font-bold text-xl"><Code2 className="w-6 h-6" /> ESLint</div>
            <div className="flex items-center gap-2 font-bold text-xl"><ShieldCheck className="w-6 h-6" /> Snyk</div>
            <div className="flex items-center gap-2 font-bold text-xl"><Terminal className="w-6 h-6" /> Semgrep</div>
          </div>
        </div>
      </section>

      {/* Footer CTA */}
      <section className="py-24 bg-[var(--color-obsidian)] border-t border-[var(--color-sentinel)]/10 text-center">
        <div className="max-w-7xl mx-auto px-4">
          <h2 className="text-4xl font-bold text-[var(--color-text-primary)] mb-8 font-['Syne']">Ready to secure your codebase?</h2>
          <p className="text-[var(--color-text-secondary)] mb-12 max-w-xl mx-auto">Start scanning for free today. Join 50,000+ developers building secure applications with Sentinel CLI.</p>
          <div className="flex flex-col sm:flex-row gap-4 justify-center">
            <Link to="/docs" className="px-8 py-4 bg-[var(--color-sentinel)] text-[var(--color-void)] font-bold rounded-lg hover:shadow-[0_0_20px_rgba(10,194,163,0.4)] transition-all cursor-pointer inline-flex items-center justify-center">
              Start Scanning Free
            </Link>
            <Link to="/contact" className="px-8 py-4 bg-[var(--color-void)] border border-[var(--color-carbon)] text-[var(--color-text-primary)] font-bold rounded-lg hover:bg-[var(--color-obsidian)] transition-all cursor-pointer inline-flex items-center justify-center">
              Talk to Sales
            </Link>
          </div>
        </div>
      </section>

    </div>
  );
}

function CheckCircle2(props: any) {
  return <ShieldCheck {...props} />;
}
function AlertTriangle(props: any) {
  return <Zap {...props} />;
}
