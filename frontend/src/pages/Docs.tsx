import { useState, useEffect, useRef } from 'react';
import {
  Download,
  Terminal,
  Settings,
  GitBranch,
  Puzzle,
  ChevronRight,
  Copy,
  CheckCircle2,
  Bell,
  BarChart3,
  HelpCircle,
  Search,
  Menu,
  X,
  Shield,
  Lock,
  Zap,
  LayoutDashboard,
  FileJson,
  AlertTriangle
} from 'lucide-react';


const sections = [
  {
    title: 'Core Documentation',
    items: [
      { id: 'installation', label: 'Installation', icon: Download },
      { id: 'quick-start', label: 'Quick Start', icon: Zap },
      { id: 'configuration', label: 'Configuration', icon: Settings },
      { id: 'auth', label: 'Authentication', icon: Lock },
      { id: 'core', label: 'Core Commands', icon: Terminal },
    ]
  },
  {
    title: 'Integrations',
    items: [
      { id: 'cicd', label: 'CI/CD Pipeline', icon: GitBranch },
      { id: 'notifications', label: 'Notifications', icon: Bell },
    ]
  },
  {
    title: 'Analytics',
    items: [
      { id: 'reporting', label: 'Reporting', icon: BarChart3 },
      { id: 'dashboard', label: 'Dashboard', icon: LayoutDashboard },
      { id: 'faq', label: 'FAQ', icon: HelpCircle },
    ]
  }
];

export function Docs() {
  const [activeSection, setActiveSection] = useState('installation');
  const [searchQuery, setSearchQuery] = useState('');
  const [copiedCode, setCopiedCode] = useState<string | null>(null);
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);
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
  }, [activeSection]);

  const addToRefs = (el: HTMLDivElement | null) => {
    if (el && !revealRefs.current.includes(el)) {
      revealRefs.current.push(el);
    }
  };

  const copyToClipboard = (code: string, id: string) => {
    navigator.clipboard.writeText(code);
    setCopiedCode(id);
    setTimeout(() => setCopiedCode(null), 2000);
  };

  const CodeBlock = ({ code, language = 'bash', id }: { code: string; language?: string; id: string }) => (
    <div className="relative rounded-xl border border-[var(--color-sentinel)]/20 bg-[var(--color-obsidian)] overflow-hidden my-6 group">
      <div className="flex items-center justify-between px-5 py-3 border-b border-[var(--color-sentinel)]/10 bg-[var(--color-void)]">
        <div className="flex gap-1.5">
          <div className="w-2.5 h-2.5 rounded-full bg-[var(--color-critical)]/50"></div>
          <div className="w-2.5 h-2.5 rounded-full bg-[var(--color-warning)]/50"></div>
          <div className="w-2.5 h-2.5 rounded-full bg-[var(--color-success)]/50"></div>
        </div>
        <button
          onClick={() => copyToClipboard(code, id)}
          className="text-[var(--color-text-tertiary)] hover:text-[var(--color-sentinel)] transition-colors"
        >
          {copiedCode === id ? (
            <CheckCircle2 className="w-4 h-4 text-[var(--color-sentinel)]" />
          ) : (
            <Copy className="w-4 h-4" />
          )}
        </button>
      </div>
      <div className="p-5 overflow-x-auto bg-[var(--color-obsidian)] custom-scrollbar">
        <pre className="text-sm font-mono text-[var(--color-text-secondary)] leading-relaxed">
          <code>{code}</code>
        </pre>
      </div>
    </div>
  );

  const flattenSections = sections.flatMap(s => s.items);

  return (
    <div className="min-h-screen bg-[var(--color-void)] pt-16 font-body text-[var(--color-text-primary)]">

      <div className="max-w-[1440px] mx-auto flex items-start">

        {/* Desktop Sidebar */}
        <aside className="hidden lg:block sticky top-16 w-72 h-[calc(100vh-4rem)] overflow-y-auto border-r border-[var(--color-sentinel)]/10 px-6 py-10 bg-[var(--color-void)] custom-scrollbar">
          <div className="space-y-8">
            {/* Search */}
            <div className="relative group mb-8">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-[var(--color-text-tertiary)] group-focus-within:text-[var(--color-sentinel)]" />
              <input
                type="text"
                placeholder="Search..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="w-full bg-[var(--color-obsidian)] border border-[var(--color-carbon)] rounded-lg pl-10 pr-4 py-2 text-sm text-[var(--color-text-primary)] focus:outline-none focus:ring-1 focus:ring-[var(--color-sentinel)] focus:bg-[var(--color-sentinel)]/10 transition-all placeholder:text-[var(--color-text-tertiary)] font-display"
              />
            </div>

            {sections.map((section, idx) => (
              <div key={idx}>
                <p className="text-[10px] uppercase tracking-[0.2em] text-[var(--color-text-tertiary)] mb-4 font-display font-bold">{section.title}</p>
                <ul className="space-y-1">
                  {section.items.map((item) => (
                    <li key={item.id}>
                      <button
                        onClick={() => setActiveSection(item.id)}
                        className={`w-full flex items-center gap-3 px-3 py-2 rounded transition-all group ${activeSection === item.id
                          ? 'border-l-2 border-[var(--color-sentinel)] bg-gradient-to-r from-[var(--color-sentinel)]/10 to-transparent text-[var(--color-sentinel)] font-medium shadow-[-4px_0_15px_-5px_rgba(10,194,163,0.4)]'
                          : 'text-[var(--color-text-secondary)] hover:text-[var(--color-sentinel)]'
                          }`}
                      >
                        <item.icon className="w-4 h-4" />
                        <span className="text-sm">{item.label}</span>
                      </button>
                    </li>
                  ))}
                </ul>
              </div>
            ))}

            <div className="pt-6">
              <div className="p-4 rounded-xl bg-[var(--color-obsidian)] border border-[var(--color-sentinel)]/20">
                <p className="text-xs font-display font-bold text-[var(--color-sentinel)] mb-2">Need Help?</p>
                <p className="text-[11px] text-[var(--color-text-secondary)] mb-3">Our engineers are available 24/7 for enterprise support.</p>
                <a className="text-[11px] font-bold text-[var(--color-text-primary)] flex items-center gap-1 hover:underline cursor-pointer">
                  Contact Support <ChevronRight className="w-3 h-3" />
                </a>
              </div>
            </div>
          </div>
        </aside>

        {/* Mobile Navigation Bar */}
        <div className="lg:hidden fixed top-16 left-0 right-0 z-40 bg-[var(--color-void)] border-b border-[var(--color-carbon)] p-4 flex items-center justify-between">
          <div className="flex items-center gap-2 text-[var(--color-text-primary)] font-medium">
            <span className="text-[var(--color-text-tertiary)]">Docs /</span>
            <span className="text-[var(--color-sentinel)]">{flattenSections.find(s => s.id === activeSection)?.label}</span>
          </div>
          <button
            onClick={() => setIsMobileMenuOpen(!isMobileMenuOpen)}
            className="p-2 rounded-lg bg-[var(--color-void)] border border-[var(--color-carbon)] text-[var(--color-text-secondary)] hover:text-white"
          >
            {isMobileMenuOpen ? <X className="w-5 h-5" /> : <Menu className="w-5 h-5" />}
          </button>
        </div>

        {/* Mobile Menu Content... omitted for brevity, assuming desktop logic covers style intent */}

        {/* Main Content */}
        <main className="flex-1 lg:ml-0 min-h-[calc(100vh-4rem)]">
          <div className="max-w-4xl mx-auto px-6 md:px-12 py-16">
            <div className="reveal" ref={addToRefs}>

              {/* Hero Header for every section */}
              <header className="mb-20">
                <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-[var(--color-sentinel)]/10 border border-[var(--color-sentinel)]/30 mb-6">
                  <span className="w-2 h-2 rounded-full bg-[var(--color-sentinel)] animate-pulse"></span>
                  <span className="text-[10px] font-display font-bold tracking-widest text-[var(--color-sentinel)] uppercase">Documentation v2.4.0</span>
                </div>
                <h1 className="font-['Syne'] text-5xl lg:text-7xl font-extrabold text-[var(--color-text-primary)] mb-6 leading-none">
                  {activeSection === 'installation' && <>Master the <span className="text-[var(--color-sentinel)] drop-shadow-[0_0_10px_rgba(10,194,163,0.5)]">Sentinel</span> CLI</>}
                  {activeSection !== 'installation' && flattenSections.find(s => s.id === activeSection)?.label}
                </h1>
                <p className="text-xl text-[var(--color-text-secondary)] max-w-2xl font-display">
                  {activeSection === 'installation' ? "The definitive guide to securing your codebase with AI-driven vulnerability analysis directly from your terminal interface." : "Detailed documentation and guides."}
                </p>
              </header>

              {/* Install Content */}
              {activeSection === 'installation' && (
                <div className="space-y-12 animate-in fade-in duration-500">
                  <section id="installation">
                    <div className="flex items-center gap-4 mb-8">
                      <div className="w-10 h-10 rounded-lg bg-[var(--color-sentinel)]/10 border border-[var(--color-sentinel)]/20 flex items-center justify-center">
                        <Download className="text-[var(--color-sentinel)] w-5 h-5" />
                      </div>
                      <h2 className="font-['Syne'] text-3xl font-bold text-[var(--color-text-primary)]">Installation</h2>
                    </div>
                    <p className="mb-6 text-lg leading-relaxed text-[var(--color-text-secondary)]">
                      Sentinel CLI is a cross-platform binary that can be installed via popular package managers or directly from source. Ensure you have <span className="text-[var(--color-sentinel)]">Node.js 16.x</span> or higher.
                    </p>

                    <div className="space-y-8">
                      <div>
                        <p className="font-display font-bold text-sm text-[var(--color-text-tertiary)] uppercase tracking-wider mb-2">macOS / Linux via Homebrew</p>
                        <CodeBlock
                          code="brew install sentinel-cli/tap/sentinel"
                          id="install-brew"
                        />
                      </div>
                      <div>
                        <p className="font-display font-bold text-sm text-[var(--color-text-tertiary)] uppercase tracking-wider mb-2">Global NPM Install</p>
                        <CodeBlock
                          code="npm install -g @sentinel/cli"
                          id="install-npm"
                        />
                      </div>
                    </div>
                  </section>
                </div>
              )}

              {/* Quick Start */}
              {activeSection === 'quick-start' && (
                <div className="space-y-12 animate-in fade-in duration-500">
                  <section id="quick-start">
                    <div className="flex items-center gap-4 mb-8">
                      <div className="w-10 h-10 rounded-lg bg-[var(--color-sentinel)]/10 border border-[var(--color-sentinel)]/20 flex items-center justify-center">
                        <Zap className="text-[var(--color-sentinel)] w-5 h-5" />
                      </div>
                      <h2 className="font-['Syne'] text-3xl font-bold text-[var(--color-text-primary)]">Quick Start</h2>
                    </div>
                    <div className="relative pl-8 border-l-2 border-[var(--color-sentinel)]/10 space-y-12">
                      {/* Step 1 */}
                      <div className="relative">
                        <div className="absolute -left-[41px] top-0 w-4 h-4 rounded-full bg-[var(--color-void)] border-2 border-[var(--color-sentinel)] shadow-[0_0_8px_rgba(10,194,163,0.6)]"></div>
                        <h3 className="font-display font-bold text-xl mb-2 text-[var(--color-text-primary)]">1. Authenticate</h3>
                        <p className="text-[var(--color-text-secondary)] mb-4">Initialize your environment and connect to the Sentinel cloud engine.</p>
                        <CodeBlock code="sentinel auth login" id="qs-1" />
                      </div>
                      {/* Step 2 */}
                      <div className="relative">
                        <div className="absolute -left-[41px] top-0 w-4 h-4 rounded-full bg-[var(--color-void)] border-2 border-[var(--color-sentinel)] shadow-[0_0_8px_rgba(10,194,163,0.6)]"></div>
                        <h3 className="font-display font-bold text-xl mb-2 text-[var(--color-text-primary)]">2. Initialize Project</h3>
                        <p className="text-[var(--color-text-secondary)] mb-4">Generate a base configuration file in your project root.</p>
                        <CodeBlock code='sentinel init --project-name "my-app"' id="qs-2" />
                      </div>
                      {/* Step 3 */}
                      <div className="relative">
                        <div className="absolute -left-[41px] top-0 w-4 h-4 rounded-full bg-[var(--color-void)] border-2 border-[var(--color-sentinel)] shadow-[0_0_8px_rgba(10,194,163,0.6)]"></div>
                        <h3 className="font-display font-bold text-xl mb-2 text-[var(--color-text-primary)]">3. Run First Scan</h3>
                        <p className="text-[var(--color-text-secondary)] mb-4">Analyze your local directory for security vulnerabilities.</p>
                        <CodeBlock code="sentinel scan . --severity high" id="qs-3" />
                      </div>
                    </div>
                  </section>
                </div>
              )}

              {/* Configuration */}
              {activeSection === 'configuration' && (
                <div className="space-y-12 animate-in fade-in duration-500">
                  <section id="configuration">
                    <div className="flex items-center gap-4 mb-8">
                      <div className="w-10 h-10 rounded-lg bg-[var(--color-sentinel)]/10 border border-[var(--color-sentinel)]/20 flex items-center justify-center">
                        <Settings className="text-[var(--color-sentinel)] w-5 h-5" />
                      </div>
                      <h2 className="font-['Syne'] text-3xl font-bold text-[var(--color-text-primary)]">Configuration</h2>
                    </div>
                    <p className="mb-8 text-lg leading-relaxed text-[var(--color-text-secondary)]">
                      Customize Sentinel's behavior using a <code className="text-[var(--color-sentinel)] font-mono text-sm">sentinel.yaml</code> file. This allows for fine-grained control over scan depths, file exclusions, and AI model parameters.
                    </p>

                    <div className="rounded-xl border border-[var(--color-sentinel)]/10 bg-[var(--color-sentinel)]/5 p-1 mb-6 flex w-fit">
                      <button className="py-2 px-4 rounded-lg bg-[var(--color-sentinel)] text-[var(--color-void)] font-bold text-xs uppercase tracking-widest font-display">YAML</button>
                      <button className="py-2 px-4 rounded-lg text-[var(--color-text-tertiary)] font-bold text-xs uppercase tracking-widest font-display hover:text-[var(--color-text-primary)] transition-colors">JSON</button>
                    </div>

                    <CodeBlock
                      code={`version: "1.2"
project:
  id: "prod-001"
  engine: "gpt-4-security"
analysis:
  depth: "deep"
  ignore:
    - "**/tests/*"
    - "**/vendor/*"
output:
  format: "sarif"`}
                      id="config-yaml"
                      language="yaml"
                    />

                    <div className="mt-12 grid grid-cols-1 md:grid-cols-2 gap-6">
                      <div className="p-6 rounded-xl border border-[var(--color-sentinel)]/10 bg-[var(--color-obsidian)] hover:border-[var(--color-sentinel)]/30 transition-all group">
                        <div className="flex items-center gap-2 mb-3">
                          <AlertTriangle className="text-[var(--color-sentinel)] w-4 h-4" />
                          <span className="font-display font-bold text-[var(--color-text-primary)] uppercase text-xs tracking-widest">Required</span>
                        </div>
                        <h4 className="font-mono text-[var(--color-sentinel)] font-bold mb-2">version</h4>
                        <p className="text-sm text-[var(--color-text-secondary)]">Specifies the CLI schema version being used. Current version is 1.2.</p>
                      </div>
                      <div className="p-6 rounded-xl border border-[var(--color-sentinel)]/10 bg-[var(--color-obsidian)] hover:border-[var(--color-sentinel)]/30 transition-all group">
                        <div className="flex items-center gap-2 mb-3">
                          <AlertTriangle className="text-[var(--color-text-tertiary)] w-4 h-4" />
                          <span className="font-display font-bold text-[var(--color-text-tertiary)] uppercase text-xs tracking-widest">Optional</span>
                        </div>
                        <h4 className="font-mono text-[var(--color-sentinel)] font-bold mb-2">engine</h4>
                        <p className="text-sm text-[var(--color-text-secondary)]">The AI model to use for analysis. Defaults to "sentinel-core".</p>
                      </div>
                    </div>
                  </section>
                </div>
              )}

              {/* Fallback for others */}
              {!['installation', 'quick-start', 'configuration'].includes(activeSection) && (
                <div className="space-y-12 animate-in fade-in duration-500">
                  <div className="my-16 p-8 rounded-2xl bg-gradient-to-br from-[var(--color-sentinel)]/10 to-transparent border border-[var(--color-sentinel)]/20 flex gap-6 items-start">
                    <div className="w-12 h-12 shrink-0 rounded-full bg-[var(--color-sentinel)] flex items-center justify-center">
                      <LayoutDashboard className="text-[var(--color-void)] font-bold w-6 h-6" />
                    </div>
                    <div>
                      <h4 className="font-['Syne'] text-xl font-bold text-[var(--color-text-primary)] mb-2">Pro-Tip: CI/CD Integration</h4>
                      <p className="text-[var(--color-text-secondary)] mb-4 leading-relaxed">
                        Integrate Sentinel CLI into your GitHub Actions or GitLab pipelines to block PRs that introduce critical vulnerabilities.
                      </p>
                      <a className="inline-flex items-center gap-2 text-[var(--color-sentinel)] font-bold text-sm hover:underline cursor-pointer" onClick={() => setActiveSection('cicd')}>
                        View CI/CD Guide <Settings className="w-4 h-4" />
                      </a>
                    </div>
                  </div>
                </div>
              )}

              {/* Pagination */}
              <div className="flex justify-between items-center py-12 border-t border-[var(--color-sentinel)]/10 mt-12">
                <button className="group text-left">
                  <span className="block text-[10px] font-display font-bold text-[var(--color-text-tertiary)] uppercase mb-1">Previous</span>
                  <span className="flex items-center gap-2 text-lg font-bold group-hover:text-[var(--color-sentinel)] transition-colors text-[var(--color-text-secondary)]">
                    <ChevronRight className="w-4 h-4 rotate-180" />
                    Introduction
                  </span>
                </button>
                <button className="group text-right" onClick={() => setActiveSection('quick-start')}>
                  <span className="block text-[10px] font-display font-bold text-[var(--color-text-tertiary)] uppercase mb-1">Next</span>
                  <span className="flex items-center gap-2 text-lg font-bold group-hover:text-[var(--color-sentinel)] transition-colors text-[var(--color-text-secondary)] justify-end">
                    Quick Start
                    <ChevronRight className="w-4 h-4" />
                  </span>
                </button>
              </div>

            </div>
          </div>

          {/* Right Side TOC */}
          <aside className="fixed right-0 top-16 w-64 h-[calc(100vh-4rem)] p-10 hidden xl:block border-l border-[var(--color-sentinel)]/10 bg-[var(--color-void)]">
            <h4 className="text-[10px] font-display font-bold text-[var(--color-text-tertiary)] uppercase tracking-widest mb-6">On this page</h4>
            <ul className="space-y-4 border-l border-[var(--color-sentinel)]/10 pl-4">
              <li><a className="text-sm text-[var(--color-sentinel)] font-medium block hover:text-[var(--color-sentinel)]/80 cursor-pointer">Overview</a></li>
              <li><a className="text-sm text-[var(--color-text-tertiary)] block hover:text-[var(--color-sentinel)] transition-colors cursor-pointer">Examples</a></li>
              <li><a className="text-sm text-[var(--color-text-tertiary)] block hover:text-[var(--color-sentinel)] transition-colors cursor-pointer">API Reference</a></li>
              <li><a className="text-sm text-[var(--color-text-tertiary)] block hover:text-[var(--color-sentinel)] transition-colors cursor-pointer">Troubleshooting</a></li>
            </ul>
          </aside>

        </main>
      </div>
    </div>
  );
}
