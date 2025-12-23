
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
  Brain,
  Zap,
  BarChart3,
  HelpCircle,
  Search,
  Menu,
  X
} from 'lucide-react';

const sections = [
  { id: 'installation', label: 'Installation', icon: Download },
  { id: 'core', label: 'Core Commands', icon: Terminal },
  { id: 'presets', label: 'Presets', icon: Zap },
  { id: 'integrations', label: 'Integrations', icon: GitBranch },
  { id: 'agents', label: 'Agents', icon: Puzzle },
  { id: 'dashboard', label: 'Dashboard', icon: BarChart3 },
  { id: 'config', label: 'Configuration', icon: Settings },
  { id: 'cicd', label: 'CI/CD Integration', icon: GitBranch },
  { id: 'notifications', label: 'Notifications', icon: Bell },
  { id: 'reporting', label: 'Reporting & Trends', icon: BarChart3 },
  { id: 'faq', label: 'FAQ', icon: HelpCircle },
];

export function Docs() {
  const [activeSection, setActiveSection] = useState('installation');
  const [searchQuery, setSearchQuery] = useState('');
  const [copiedCode, setCopiedCode] = useState<string | null>(null);
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);
  const revealRefs = useRef<(HTMLDivElement | null)[]>([]);

  const filteredSections = sections.filter(s =>
    s.label.toLowerCase().includes(searchQuery.toLowerCase())
  );

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

  // Close mobile menu when section changes
  useEffect(() => {
    setIsMobileMenuOpen(false);
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
    <div className="relative rounded-2xl bg-gray-950 border border-gray-800 overflow-hidden my-6 shadow-xl group">
      <div className="flex items-center justify-between px-6 py-3 border-b border-gray-800 bg-gray-900/50">
        <span className="text-xs font-mono text-gray-500 uppercase tracking-widest">{language}</span>
        <button
          onClick={() => copyToClipboard(code, id)}
          className="flex items-center gap-2 px-4 py-1.5 rounded-xl bg-gray-900 border border-gray-800 hover:bg-gray-800 hover:border-gray-700 transition-all text-xs font-bold text-gray-400 hover:text-white"
        >
          {copiedCode === id ? (
            <>
              <CheckCircle2 className="w-3.5 h-3.5 text-emerald-500" />
              <span className="text-emerald-500">Copied</span>
            </>
          ) : (
            <>
              <Copy className="w-3.5 h-3.5" />
              <span>Copy</span>
            </>
          )}
        </button>
      </div>
      <div className="p-6 overflow-x-auto bg-[#0a0a0b] custom-scrollbar">
        <pre className="text-sm font-mono text-gray-300 leading-relaxed">
          <code>{code}</code>
        </pre>
      </div>
    </div>
  );

  return (
    <div className="min-h-screen bg-gray-950 pt-20">
      <div className="max-w-8xl mx-auto flex items-start">

        {/* Desktop Sidebar */}
        <aside className="hidden lg:block sticky top-20 w-80 h-[calc(100vh-5rem)] overflow-y-auto border-r border-gray-800 bg-gray-950/50 backdrop-blur-sm custom-scrollbar">
          <div className="p-6 space-y-6">
            <div className="relative">
              <Search className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-500" />
              <input
                type="text"
                placeholder="Search docs..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="w-full bg-gray-900/50 border border-gray-800 rounded-xl pl-10 pr-4 py-3 text-sm text-white focus:border-emerald-500/50 focus:outline-none transition-all placeholder:text-gray-600 focus:ring-1 focus:ring-emerald-500/50"
              />
            </div>

            <nav className="space-y-1">
              {filteredSections.map((section) => (
                <button
                  key={section.id}
                  onClick={() => setActiveSection(section.id)}
                  className={`w-full flex items-center justify-between px-4 py-3 rounded-xl text-sm font-medium transition-all group ${activeSection === section.id
                    ? 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 shadow-lg shadow-emerald-500/5'
                    : 'text-gray-400 hover:text-white hover:bg-white/5 border border-transparent'
                    }`}
                >
                  <div className="flex items-center gap-3">
                    <section.icon className={`w-4 h-4 transition-colors ${activeSection === section.id ? 'text-emerald-500' : 'text-gray-500 group-hover:text-gray-300'
                      }`} />
                    {section.label}
                  </div>
                  {activeSection === section.id && (
                    <ChevronRight className="w-4 h-4 text-emerald-500" />
                  )}
                </button>
              ))}
            </nav>
          </div>
        </aside>

        {/* Mobile Navigation Bar */}
        <div className="lg:hidden fixed top-20 left-0 right-0 z-40 bg-gray-950 border-b border-gray-800 p-4 flex items-center justify-between">
          <div className="flex items-center gap-2 text-white font-medium">
            <span className="text-gray-400">Docs /</span>
            <span className="text-emerald-400">{sections.find(s => s.id === activeSection)?.label}</span>
          </div>
          <button
            onClick={() => setIsMobileMenuOpen(!isMobileMenuOpen)}
            className="p-2 rounded-lg bg-gray-900 border border-gray-800 text-gray-400 hover:text-white"
          >
            {isMobileMenuOpen ? <X className="w-5 h-5" /> : <Menu className="w-5 h-5" />}
          </button>
        </div>

        {/* Mobile Menu Dropdown */}
        {isMobileMenuOpen && (
          <div className="fixed inset-0 top-[8.5rem] bg-gray-950/95 backdrop-blur-xl z-30 lg:hidden overflow-y-auto p-4 animate-in fade-in slide-in-from-top-4 duration-200">
            <div className="space-y-1 max-w-lg mx-auto">
              {filteredSections.map((section) => (
                <button
                  key={section.id}
                  onClick={() => setActiveSection(section.id)}
                  className={`w-full flex items-center gap-3 px-4 py-4 rounded-xl text-base font-medium transition-all ${activeSection === section.id
                    ? 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/20'
                    : 'text-gray-400 hover:text-white hover:bg-white/5 border border-transparent'
                    }`}
                >
                  <section.icon className={`w-5 h-5 ${activeSection === section.id ? 'text-emerald-500' : 'text-gray-500'}`} />
                  {section.label}
                </button>
              ))}
            </div>
          </div>
        )}

        {/* Main Content */}
        <main className="flex-1 min-w-0 bg-gray-950">
          <div className="max-w-4xl mx-auto px-6 py-12 md:py-20 lg:px-12 lg:py-16 mt-14 lg:mt-0">
            <div className="reveal" ref={addToRefs}>

              {/* Installation */}
              {activeSection === 'installation' && (
                <div className="space-y-12 animate-in fade-in duration-500">
                  <div className="border-b border-gray-800 pb-8">
                    <h1 className="text-4xl md:text-5xl font-bold mb-6 text-white tracking-tight">Installation</h1>
                    <p className="text-xl text-gray-400 leading-relaxed max-w-2xl">
                      Get up and running with Sentinel in seconds. Supported on macOS, Linux, and Windows subsystems.
                    </p>
                  </div>

                  <div className="space-y-12">
                    <section>
                      <h3 className="text-2xl font-bold text-white mb-4 flex items-center gap-2">
                        <Terminal className="w-6 h-6 text-emerald-500" />
                        Using npm (Recommended)
                      </h3>
                      <p className="text-gray-400 mb-4">
                        Install strictly as a global package to access the CLI from anywhere.
                      </p>
                      <CodeBlock
                        code="npm install -g sentinel-cli"
                        id="install-npm"
                      />
                    </section>

                    <section>
                      <h3 className="text-2xl font-bold text-white mb-4 flex items-center gap-2">
                        <Download className="w-6 h-6 text-blue-500" />
                        Using curl
                      </h3>
                      <p className="text-gray-400 mb-4">
                        For systems without Node.js managing the environment.
                      </p>
                      <CodeBlock
                        code="curl -fsSL https://sentinel.ai/install.sh | sh"
                        id="install-curl"
                      />
                    </section>

                    <section>
                      <h3 className="text-2xl font-bold text-white mb-4 flex items-center gap-2">
                        <div className="w-6 h-6 rounded-md bg-blue-600 flex items-center justify-center text-[10px] font-bold">D</div>
                        Docker
                      </h3>
                      <CodeBlock
                        code="docker pull sentinel/cli"
                        id="install-docker"
                      />
                    </section>
                  </div>
                </div>
              )}

              {/* Core Commands */}
              {activeSection === 'core' && (
                <div className="space-y-12 animate-in fade-in duration-500">
                  <div className="border-b border-gray-800 pb-8">
                    <h1 className="text-4xl md:text-5xl font-bold mb-6 text-white tracking-tight">Core Commands</h1>
                    <p className="text-xl text-gray-400 leading-relaxed">
                      Essential commands for using Sentinel in your daily workflow.
                    </p>
                  </div>

                  <div className="space-y-12">
                    <section>
                      <div className="flex items-start gap-4 mb-4">
                        <div className="p-2 rounded-lg bg-emerald-500/10 border border-emerald-500/20">
                          <Search className="w-6 h-6 text-emerald-500" />
                        </div>
                        <div>
                          <h3 className="text-2xl font-bold text-white mb-1">Analyze</h3>
                          <p className="text-gray-400">Scans the current directory for vulnerabilities and code quality issues.</p>
                        </div>
                      </div>
                      <CodeBlock
                        code="sentinel analyze"
                        id="cmd-analyze"
                      />
                    </section>

                    <section>
                      <div className="flex items-start gap-4 mb-4">
                        <div className="p-2 rounded-lg bg-blue-500/10 border border-blue-500/20">
                          <Zap className="w-6 h-6 text-blue-500" />
                        </div>
                        <div>
                          <h3 className="text-2xl font-bold text-white mb-1">Fix</h3>
                          <p className="text-gray-400">Automatically applies fixes for identified vulnerabilities where possible.</p>
                        </div>
                      </div>
                      <CodeBlock
                        code="sentinel fix"
                        id="cmd-fix"
                      />
                    </section>
                  </div>
                </div>
              )}

              {/* Agents */}
              {activeSection === 'agents' && (
                <div className="space-y-12 animate-in fade-in duration-500">
                  <div className="border-b border-gray-800 pb-8">
                    <h1 className="text-4xl md:text-5xl font-bold mb-6 text-white tracking-tight">Multi-Agent Runner</h1>
                    <p className="text-xl text-gray-400 leading-relaxed">
                      Run coordinated multi-agent analysis (Scanner → Fixer → Validator) for advanced workflows and CI integrations.
                    </p>
                  </div>

                  <div className="space-y-12">
                    <section>
                      <h3 className="text-2xl font-bold text-white mb-4">Local Execution</h3>
                      <p className="text-gray-400 mb-4">Run the multi-agent pipeline locally. Use <code className="text-emerald-400 bg-emerald-500/10 px-1.5 py-0.5 rounded border border-emerald-500/20 text-sm">--format</code> to change output types.</p>
                      <CodeBlock
                        code="# Run agents locally (console output)
sentinel agents ."
                        id="agents-run"
                      />
                    </section>

                    <section>
                      <h3 className="text-2xl font-bold text-white mb-4">CI/CD Pipeline</h3>
                      <p className="text-gray-400 mb-4">CI-focused agents runner that emits SARIF/JUnit and supports failing the job on severity thresholds.</p>
                      <CodeBlock
                        code="# CI run (SARIF + fail on high)
sentinel agents ci . --format sarif --fail-on high"
                        id="agents-ci"
                      />
                    </section>

                    <section>
                      <h3 className="text-2xl font-bold text-white mb-4">Pull Request Review</h3>
                      <p className="text-gray-400 mb-4">Run agents for a PR and post a markdown summary back to the Pull Request.</p>
                      <CodeBlock
                        code="# Run agents and post summary to PR
sentinel agents pr https://github.com/org/repo/pull/123"
                        id="agents-pr"
                      />
                    </section>
                  </div>
                </div>
              )}

              {/* Dashboard */}
              {activeSection === 'dashboard' && (
                <div className="space-y-12 animate-in fade-in duration-500">
                  <div className="border-b border-gray-800 pb-8">
                    <h1 className="text-4xl md:text-5xl font-bold mb-6 text-white tracking-tight">Sentinel Dashboard</h1>
                    <p className="text-xl text-gray-400 leading-relaxed">
                      Launch and view the local web dashboard to explore findings, trends, and author/issue breakdowns in a friendly UI.
                    </p>
                  </div>

                  <div className="space-y-10">
                    <section>
                      <h3 className="text-2xl font-bold text-white mb-4">Start Server</h3>
                      <p className="text-gray-400 mb-4">Start a local dashboard server that serves the built frontend bundle.</p>
                      <CodeBlock
                        code="# Start dashboard on default port (3000)
sentinel dashboard"
                        id="dashboard-cmd"
                      />
                      <div className="p-4 rounded-xl bg-orange-500/10 border border-orange-500/20 mt-4">
                        <p className="text-sm text-orange-200">
                          <strong>Note:</strong> If the frontend build is missing, the command will attempt to build the dashboard automatically before serving.
                        </p>
                      </div>
                    </section>
                  </div>
                </div>
              )}

              {/* Presets */}
              {activeSection === 'presets' && (
                <div className="space-y-12 animate-in fade-in duration-500">
                  <div className="border-b border-gray-800 pb-8">
                    <h1 className="text-4xl md:text-5xl font-bold mb-6 text-white tracking-tight">Security Presets</h1>
                    <p className="text-xl text-gray-400 leading-relaxed">
                      Pre-configured analysis suites tailored for specific environments and compliance standards.
                    </p>
                  </div>

                  <div className="space-y-12">
                    <section>
                      <h3 className="text-2xl font-bold text-white mb-4">Stack-Based Presets</h3>
                      <div className="grid gap-6 md:grid-cols-2 mb-8">
                        <div className="p-6 rounded-2xl bg-gray-900/50 border border-gray-800">
                          <h4 className="font-bold text-emerald-400 mb-2">Frontend Scan</h4>
                          <p className="text-sm text-gray-400 mb-4">Optimized for React, Vue, Accessibility (a11y), and secret leaks in client-side code.</p>
                          <code className="text-xs bg-black px-2 py-1 rounded text-gray-300">sentinel frontend</code>
                        </div>
                        <div className="p-6 rounded-2xl bg-gray-900/50 border border-gray-800">
                          <h4 className="font-bold text-blue-400 mb-2">Backend Scan</h4>
                          <p className="text-sm text-gray-400 mb-4">Focuses on API security, SQL injection, Dockerfile issues, and performance bottlenecks.</p>
                          <code className="text-xs bg-black px-2 py-1 rounded text-gray-300">sentinel backend</code>
                        </div>
                      </div>
                      <CodeBlock
                        code="# Run a full stack analysis (all analyzers)
sentinel full-scan"
                        id="preset-full"
                      />
                    </section>
                  </div>
                </div>
              )}

              {/* Configuration */}
              {activeSection === 'config' && (
                <div className="space-y-12 animate-in fade-in duration-500">
                  <div className="border-b border-gray-800 pb-8">
                    <h1 className="text-4xl md:text-5xl font-bold mb-6 text-white tracking-tight">Configuration</h1>
                    <p className="text-xl text-gray-400 leading-relaxed">
                      Manage AI models, custom rules, and environment settings.
                    </p>
                  </div>

                  <div className="space-y-12">
                    <section>
                      <h3 className="text-2xl font-bold text-white mb-4">AI Model Management</h3>
                      <p className="text-gray-400 mb-4">Configure which LLM providers Sentinel uses for analysis and fixing.</p>
                      <CodeBlock
                        code="# Switch standard provider
sentinel models --enable openai --model openai=gpt-4

# Use open source models via Groq
sentinel models --enable groq --model groq=llama3-70b-8192

# Configure API keys (stored safely in .env)
sentinel models --env openai=OPENAI_API_KEY"
                        id="config-models"
                      />
                    </section>

                    <section>
                      <h3 className="text-2xl font-bold text-white mb-4">Custom Rules (.sentinelrules.yaml)</h3>
                      <p className="text-gray-400 mb-4">Define custom regex-based rules to enforce team standards.</p>
                      <CodeBlock
                        code={`rules:
  - id: no-console-log\n    pattern: "console\\\\.log"\n    message: "No console.log in production code"\n    severity: warning\n    filePattern: "\\\\.(js|ts)$"\n    \n  - id: no-eval\n    pattern: "eval\\\\("\n    severity: error\n    message: "Eval is evil. Do not use."`}
                        language="yaml"
                        id="config-rules"
                      />
                    </section>
                  </div>
                </div>
              )}

              {/* CI/CD & Integrations */}
              {(activeSection === 'cicd' || activeSection === 'integrations') && (
                <div className="space-y-12 animate-in fade-in duration-500">
                  <div className="border-b border-gray-800 pb-8">
                    <h1 className="text-4xl md:text-5xl font-bold mb-6 text-white tracking-tight">CI/CD Integration</h1>
                    <p className="text-xl text-gray-400 leading-relaxed">
                      Automate security scanning in your GitHub Actions, GitLab CI, or Jenkins pipelines.
                    </p>
                  </div>

                  <div className="space-y-12">
                    <section>
                      <h3 className="text-2xl font-bold text-white mb-4">Standard CI Run</h3>
                      <p className="text-gray-400 mb-4">Use the `ci` command to output machine-parsable logs and fail builds based on severity.</p>
                      <CodeBlock
                        code="# Fail build if any High or Critical issues are found
sentinel ci --fail-on high --format json --output report.json"
                        id="cicd-run"
                      />
                    </section>

                    <section>
                      <h3 className="text-2xl font-bold text-white mb-4">GitHub Actions Workflow</h3>
                      <CodeBlock
                        code={`name: Sentinel Security Scan
on: [pull_request]

jobs:
  security:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v3
      - name: Install Sentinel
        run: npm install -g sentinel-cli
      
      - name: Run Analysis
        run: sentinel ci --fail-on high --format sarif --output results.sarif
        env:
          OPENAI_API_KEY: \${{ secrets.OPENAI_API_KEY }}
          
      - name: Upload SARIF
        uses: github/codeql-action/upload-sarif@v2
        with:
          sarif_file: results.sarif`}
                        language="yaml"
                        id="cicd-github"
                      />
                    </section>
                  </div>
                </div>
              )}

              {/* Notifications */}
              {activeSection === 'notifications' && (
                <div className="space-y-12 animate-in fade-in duration-500">
                  <div className="border-b border-gray-800 pb-8">
                    <h1 className="text-4xl md:text-5xl font-bold mb-6 text-white tracking-tight">Notifications</h1>
                    <p className="text-xl text-gray-400 leading-relaxed">
                      Get real-time alerts on Slack or Discord when high-severity issues are detected.
                    </p>
                  </div>

                  <div className="space-y-12">
                    <section>
                      <h3 className="text-2xl font-bold text-white mb-4">Slack Integration</h3>
                      <CodeBlock
                        code={`export SLACK_WEBHOOK_URL="https://hooks.slack.com/..."

# Notify specific channel about a project
sentinel notify --slack --channel "#security-alerts" --project "Payment-API"`}
                        id="notify-slack"
                      />
                    </section>

                    <section>
                      <h3 className="text-2xl font-bold text-white mb-4">Discord Integration</h3>
                      <CodeBlock
                        code={`export DISCORD_WEBHOOK_URL="https://discord.com/api/..."

# Send alerts with custom username
sentinel notify --discord --username "Sentinel Bot" --min-severity high`}
                        id="notify-discord"
                      />
                    </section>
                  </div>
                </div>
              )}

              {/* Reporting */}
              {activeSection === 'reporting' && (
                <div className="space-y-12 animate-in fade-in duration-500">
                  <div className="border-b border-gray-800 pb-8">
                    <h1 className="text-4xl md:text-5xl font-bold mb-6 text-white tracking-tight">Reporting & Trends</h1>
                    <p className="text-xl text-gray-400 leading-relaxed">
                      Generate comprehensive reports for audits and track security posture over time.
                    </p>
                  </div>

                  <div className="space-y-12">
                    <section>
                      <h3 className="text-2xl font-bold text-white mb-4">Export Formats</h3>
                      <p className="text-gray-400 mb-4">Sentinel supports multiple industry-standard formats.</p>
                      <CodeBlock
                        code={`# Standard SARIF (GitHub Code Scanning compatible)
sentinel sarif --output results.sarif

# JUnit XML (Jenkins/GitLab compatible)
sentinel analyze --format junit --output tests.xml

# HTML Executive Report
sentinel analyze --format html --output report.html`}
                        id="reporting-formats"
                      />
                    </section>

                    <section>
                      <h3 className="text-2xl font-bold text-white mb-4">Historical Trends</h3>
                      <CodeBlock
                        code={`# Save current analysis snapshot
sentinel trends --save

# View security posture over time
sentinel trends --from "30 days ago"`}
                        id="reporting-trends"
                      />
                    </section>
                  </div>
                </div>
              )}

              {/* FAQ */}
              {activeSection === 'faq' && (
                <div className="space-y-12 animate-in fade-in duration-500">
                  <div className="border-b border-gray-800 pb-8">
                    <h1 className="text-4xl md:text-5xl font-bold mb-6 text-white tracking-tight">Frequently Asked Questions</h1>
                    <p className="text-xl text-gray-400 leading-relaxed">
                      Common questions about configuration, performance, and security.
                    </p>
                  </div>

                  <div className="grid gap-8">
                    {[
                      {
                        q: "How do I ignore specific files or folders?",
                        a: "Sentinel respects your `.gitignore` by default. You can also create a `.sentinelignore` file with glob patterns, or pass individual patterns to the CLI: `sentinel analyze --ignore 'dist/**/*'`"
                      },
                      {
                        q: "Is my code sent to the cloud?",
                        a: "Only the relevant snippets (diffs) specifically flagged for AI review are sent to the configured LLM provider (e.g., OpenAI). If you run `sentinel analyze --local-only`, no data leaves your machine."
                      },
                      {
                        q: "Can I run this in an air-gapped environment?",
                        a: "Yes. You can disable AI features using `--no-ai` or `--offline`. Sentinel will still perform static analysis, regex scanning, and dependency checks locally."
                      },
                      {
                        q: "How do I add custom rules?",
                        a: "Create a `.sentinelrules.yaml` file in your project root. You can define regex patterns, severity levels, and custom messages. See the Configuration section for examples."
                      }
                    ].map((faq, i) => (
                      <div key={i} className="p-8 rounded-3xl bg-gray-900/30 border border-gray-800 hover:border-emerald-500/30 transition-all">
                        <h3 className="text-xl font-bold text-white mb-3">{faq.q}</h3>
                        <p className="text-gray-400 leading-relaxed">{faq.a}</p>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Fallback for other sections */}
              {!['installation', 'core', 'agents', 'dashboard', 'presets', 'config', 'cicd', 'integrations', 'notifications', 'reporting', 'faq'].includes(activeSection) && (
                <div className="flex flex-col items-center justify-center py-20 text-center animate-in zoom-in-95 duration-500">
                  <div className="relative mb-8">
                    <div className="absolute inset-0 bg-emerald-500/20 blur-xl rounded-full" />
                    <div className="relative p-6 rounded-2xl bg-gray-900 border border-gray-800">
                      <Settings className="w-12 h-12 text-gray-400" />
                    </div>
                  </div>
                  <h2 className="text-3xl font-bold text-white mb-4">Coming Soon</h2>
                  <p className="text-gray-400 max-w-md mx-auto leading-relaxed">
                    Documentation for <strong className="text-emerald-400">{sections.find(s => s.id === activeSection)?.label}</strong> is currently being written. Check back later or view the source on GitHub.
                  </p>
                </div>
              )}

            </div>
          </div>
        </main>
      </div>
    </div>
  );
}

// Helper icons
import { Shield, Lock } from 'lucide-react';

