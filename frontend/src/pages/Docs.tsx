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
  Search
} from 'lucide-react';

const sections = [
  { id: 'installation', label: 'Installation', icon: Download },
  { id: 'core', label: 'Core Commands', icon: Terminal },
  { id: 'presets', label: 'Presets', icon: Zap },
  { id: 'integrations', label: 'Integrations', icon: GitBranch },
  { id: 'ai', label: 'AI & Interactive', icon: Brain },
  { id: 'reporting', label: 'Reporting & Trends', icon: BarChart3 },
  { id: 'config', label: 'Configuration', icon: Settings },
  { id: 'cicd', label: 'CI/CD Integration', icon: GitBranch },
  { id: 'notifications', label: 'Notifications', icon: Bell },
  { id: 'plugins', label: 'Plugins & Extensions', icon: Puzzle },
  { id: 'faq', label: 'FAQ', icon: HelpCircle },
];

export function Docs() {
  const [activeSection, setActiveSection] = useState('installation');
  const [searchQuery, setSearchQuery] = useState('');
  const [copiedCode, setCopiedCode] = useState<string | null>(null);
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
    <div className="relative rounded-2xl bg-gray-950 border border-gray-800 overflow-hidden my-6 shadow-xl">
      <div className="flex items-center justify-between px-6 py-3 border-b border-gray-800 bg-gray-900/50">
        <span className="text-xs font-mono text-gray-500 uppercase tracking-widest">{language}</span>
        <button
          onClick={() => copyToClipboard(code, id)}
          className="flex items-center gap-2 px-4 py-1.5 rounded-xl bg-gray-900 border border-gray-800 hover:bg-gray-800 hover:border-gray-700 transition-all text-xs font-bold text-gray-400 hover:text-white"
        >
          {copiedCode === id ? (
            <>
              <CheckCircle2 className="w-3.5 h-3.5 text-emerald-500" />
              <span className="text-emerald-500">Copied!</span>
            </>
          ) : (
            <>
              <Copy className="w-3.5 h-3.5" />
              <span>Copy</span>
            </>
          )}
        </button>
      </div>
      <pre className="p-6 overflow-x-auto font-mono text-sm leading-relaxed text-gray-300">
        <code>{code}</code>
      </pre>
    </div>
  );

  return (
    <div className="pt-20 min-h-screen bg-gray-950">
      <div className="max-w-7xl mx-auto px-6 py-16">
        <div className="grid lg:grid-cols-4 gap-12">
          {/* Sidebar */}
          <aside className="lg:sticky lg:top-32 h-fit">
            <div className="mb-8 px-4">
              <h2 className="text-xs font-bold uppercase tracking-widest text-gray-500 mb-4">Documentation</h2>
              <div className="h-1 w-12 bg-emerald-600 rounded-full mb-6" />
              
              {/* Search Bar */}
              <div className="relative group">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-500 group-focus-within:text-emerald-400 transition-colors" />
                <input
                  type="text"
                  placeholder="Search docs..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="w-full bg-gray-900/50 border border-gray-800 rounded-xl py-2.5 pl-10 pr-4 text-sm text-gray-200 focus:outline-none focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500/50 transition-all"
                />
              </div>
            </div>

            <nav className="space-y-2">
              {filteredSections.map((section) => {
                const Icon = section.icon;
                return (
                  <button
                    key={section.id}
                    onClick={() => setActiveSection(section.id)}
                    className={`w-full flex items-center gap-4 px-5 py-4 rounded-2xl transition-all duration-300 group ${
                      activeSection === section.id
                        ? 'bg-emerald-600 text-white shadow-lg shadow-emerald-600/20'
                        : 'text-gray-400 hover:bg-gray-900 hover:text-white'
                    }`}
                  >
                    <Icon className={`w-5 h-5 ${activeSection === section.id ? 'text-white' : 'text-gray-500 group-hover:text-emerald-400'}`} />
                    <span className="font-bold text-sm">{section.label}</span>
                    {activeSection === section.id && (
                      <ChevronRight className="w-4 h-4 ml-auto" />
                    )}
                  </button>
                );
              })}
              {filteredSections.length === 0 && (
                <div className="px-4 py-8 text-center">
                  <p className="text-xs text-gray-500 italic">No results found for "{searchQuery}"</p>
                </div>
              )}
            </nav>
          </aside>

          {/* Content */}
          <main className="lg:col-span-3">
            <div className="reveal" ref={addToRefs}>
              {/* Installation */}
              {activeSection === 'installation' && (
                <div className="space-y-12">
                  <div>
                    <h1 className="text-4xl md:text-5xl font-bold mb-6 text-white tracking-tight">Installation</h1>
                    <p className="text-xl text-gray-400 leading-relaxed">
                      Get SENTINEL up and running on your machine in seconds.
                    </p>
                  </div>
                  
                  <div className="space-y-10">
                    <section>
                      <h3 className="text-2xl font-bold text-white mb-4">Install via npm</h3>
                      <p className="text-gray-400 mb-4">
                        Install SENTINEL globally using npm or your preferred package manager.
                      </p>
                      <CodeBlock 
                        code="npm install -g @sentinel/cli" 
                        id="install-npm"
                      />
                    </section>

                    <section>
                      <h3 className="text-2xl font-bold text-white mb-4">Install via Homebrew</h3>
                      <CodeBlock 
                        code={`brew tap sentinel-cli/tap\nbrew install sentinel`}
                        id="install-brew"
                      />
                    </section>

                    <section>
                      <h3 className="text-2xl font-bold text-white mb-4">Verify Installation</h3>
                      <p className="text-gray-400 mb-4">
                        Confirm SENTINEL is installed correctly by checking the version.
                      </p>
                      <CodeBlock 
                        code="sentinel --version"
                        id="verify"
                      />
                    </section>

                    <section className="p-8 rounded-3xl bg-gray-900/50 border border-gray-800">
                      <h3 className="text-xl font-bold text-white mb-6">System Requirements</h3>
                      <ul className="space-y-4">
                        {[
                          'Node.js 18.x or higher',
                          '2GB RAM minimum (4GB recommended)',
                          'macOS, Linux, or Windows (WSL2)'
                        ].map((req, i) => (
                          <li key={i} className="flex items-center gap-3 text-gray-400">
                            <CheckCircle2 className="w-5 h-5 text-emerald-500" />
                            {req}
                          </li>
                        ))}
                      </ul>
                    </section>
                  </div>
                </div>
              )}

              {/* Core Commands */}
              {activeSection === 'core' && (
                <div className="space-y-12">
                  <div>
                    <h1 className="text-4xl md:text-5xl font-bold mb-6 text-white tracking-tight">Core Commands</h1>
                    <p className="text-xl text-gray-400 leading-relaxed">
                      The fundamental commands for analyzing your codebase and managing the SENTINEL environment.
                    </p>
                  </div>
                  
                  <div className="space-y-10">
                    <section>
                      <h3 className="text-2xl font-bold text-white mb-4">sentinel analyze [path]</h3>
                      <p className="text-gray-400 mb-4">Run a comprehensive analysis on a specific file or directory.</p>
                      <CodeBlock 
                        code={`# Basic analysis\nsentinel analyze ./src\n\n# With custom format and output\nsentinel analyze ./src --format json --output report.json\n\n# Filter by severity\nsentinel analyze ./src --severity high`}
                        id="core-analyze"
                      />
                      
                      <div className="mt-6 rounded-2xl border border-gray-800 overflow-hidden">
                        <table className="w-full text-left">
                          <thead className="bg-gray-900/50 border-b border-gray-800">
                            <tr>
                              <th className="px-6 py-4 text-xs font-bold uppercase tracking-widest text-gray-500">Option</th>
                              <th className="px-6 py-4 text-xs font-bold uppercase tracking-widest text-gray-500">Description</th>
                            </tr>
                          </thead>
                          <tbody className="divide-y divide-gray-800">
                            {[
                              { opt: '--commit, -c', desc: 'Analyze specific commit hash' },
                              { opt: '--branch, -b', desc: 'Analyze branch changes' },
                              { opt: '--staged, -s', desc: 'Analyze staged changes only' },
                              { opt: '--format, -f', desc: 'Output format (console|json|html|markdown|sarif|junit)' },
                              { opt: '--output, -o', desc: 'Output file path' },
                              { opt: '--analyzers, -a', desc: 'Comma-separated list of analyzers' },
                              { opt: '--all-analyzers', desc: 'Enable all available analyzers' },
                              { opt: '--save-history', desc: 'Save analysis to trend history' },
                              { opt: '--silent', desc: 'Suppress output' }
                            ].map((row, i) => (
                              <tr key={i} className="hover:bg-gray-900/30 transition-colors">
                                <td className="px-6 py-4 font-mono text-sm text-emerald-400">{row.opt}</td>
                                <td className="px-6 py-4 text-sm text-gray-400">{row.desc}</td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    </section>

                    <section>
                      <h3 className="text-2xl font-bold text-white mb-4">sentinel fix [path]</h3>
                      <p className="text-gray-400 mb-4">Automatically apply AI-generated fixes for identified issues.</p>
                      <CodeBlock 
                        code={`# Preview fixes (dry run)\nsentinel fix ./src/utils/auth.js --dry-run\n\n# Apply specific fix types\nsentinel fix src/utils.js --type security,quality\n\n# Fix only staged files\nsentinel fix --staged`}
                        id="core-fix"
                      />
                    </section>

                    <section>
                      <h3 className="text-2xl font-bold text-white mb-4">sentinel analyze-workspace</h3>
                      <p className="text-gray-400 mb-4">Perform a deep-scan of the entire workspace, including cross-file dependencies in monorepos.</p>
                      <CodeBlock 
                        code={`# Deep workspace scan\nsentinel analyze-workspace --deep\n\n# Output results to file\nsentinel analyze-workspace --format html --output workspace-report.html`}
                        id="core-workspace"
                      />
                    </section>

                    <section>
                      <h3 className="text-2xl font-bold text-white mb-4">sentinel stats</h3>
                      <p className="text-gray-400 mb-4">View repository statistics, including commit counts, file modifications, and issue density.</p>
                      <CodeBlock 
                        code={`# Show basic stats\nsentinel stats\n\n# Detailed breakdown\nsentinel stats --detailed`}
                        id="core-stats"
                      />
                    </section>

                    <section>
                      <h3 className="text-2xl font-bold text-white mb-4">sentinel list-analyzers</h3>
                      <p className="text-gray-400 mb-4">List all available analyzers, their descriptions, and whether they are enabled by default. Alias: <code className="text-emerald-400">sentinel analyzers</code></p>
                      <CodeBlock 
                        code="sentinel list-analyzers"
                        id="core-list"
                      />
                    </section>
                  </div>
                </div>
              )}

              {/* Reporting */}
              {activeSection === 'reporting' && (
                <div className="space-y-12">
                  <div>
                    <h1 className="text-4xl md:text-5xl font-bold mb-6 text-white tracking-tight">Reporting & Trends</h1>
                    <p className="text-xl text-gray-400 leading-relaxed">
                      Generate detailed reports and track your project's health over time.
                    </p>
                  </div>
                  
                  <div className="space-y-10">
                    <section>
                      <h3 className="text-2xl font-bold text-white mb-4">sentinel sarif</h3>
                      <p className="text-gray-400 mb-4">Export analysis results in SARIF format for integration with security tools like GitHub Security.</p>
                      <CodeBlock 
                        code={`# Generate SARIF report\nsentinel sarif --output results.sarif\n\n# Upload to GitHub (using gh CLI)\ngh code-scanning upload-sarif --sarif results.sarif`}
                        id="rep-sarif"
                      />
                    </section>

                    <section>
                      <h3 className="text-2xl font-bold text-white mb-4">sentinel trends</h3>
                      <p className="text-gray-400 mb-4">Visualize code quality and security trends over time.</p>
                      <CodeBlock 
                        code={`# Show trends for the last 90 days\nsentinel trends --days 90\n\n# Save current analysis to history\nsentinel trends --save\n\n# Limit history entries\nsentinel trends --limit 5`}
                        id="rep-trends"
                      />
                    </section>
                  </div>
                </div>
              )}

              {/* Presets */}
              {activeSection === 'presets' && (
                <div className="space-y-12">
                  <div>
                    <h1 className="text-4xl md:text-5xl font-bold mb-6 text-white tracking-tight">Analysis Presets</h1>
                    <p className="text-xl text-gray-400 leading-relaxed">
                      Optimized command aliases for specific environments and tech stacks.
                    </p>
                  </div>
                  
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                    {[
                      { cmd: 'security-audit', desc: 'Deep security scan for vulnerabilities and secrets.', icon: '🛡️' },
                      { cmd: 'full-scan', desc: 'Run all available analyzers across the entire project.', icon: '🔍' },
                      { cmd: 'frontend', desc: 'Optimized for React, Vue, and Next.js applications.', icon: '🎨' },
                      { cmd: 'backend', desc: 'Optimized for Node.js, Go, and Python services.', icon: '⚙️' },
                      { cmd: 'container', desc: 'Scan Dockerfiles and Kubernetes manifests.', icon: '📦' },
                      { cmd: 'diff', desc: 'Analyze only changed files in the current git branch.', icon: '🌿' },
                      { cmd: 'full', desc: 'Alias for full-scan. Run all analyzers across the project.', icon: '🚀' },
                    ].map((preset) => (
                      <div key={preset.cmd} className="p-6 rounded-2xl bg-gray-900/50 border border-gray-800 hover:border-emerald-500/30 transition-all group">
                        <div className="text-3xl mb-4">{preset.icon}</div>
                        <code className="text-emerald-400 font-bold block mb-2 group-hover:text-emerald-300 transition-colors">sentinel {preset.cmd}</code>
                        <p className="text-gray-400 text-sm leading-relaxed">{preset.desc}</p>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Integrations */}
              {activeSection === 'integrations' && (
                <div className="space-y-12">
                  <div>
                    <h1 className="text-4xl md:text-5xl font-bold mb-6 text-white tracking-tight">Git & PR Integrations</h1>
                    <p className="text-xl text-gray-400 leading-relaxed">
                      Seamlessly integrate SENTINEL into your development workflow.
                    </p>
                  </div>
                  
                  <div className="space-y-10">
                    <section>
                      <h3 className="text-2xl font-bold text-white mb-4">sentinel pre-commit</h3>
                      <p className="text-gray-400 mb-4">Quick security check on staged files, ideal for local development.</p>
                      <CodeBlock 
                        code={`# Run pre-commit check\nsentinel pre-commit\n\n# Block commit if critical issues found\nsentinel pre-commit --block`}
                        id="int-precommit"
                      />
                    </section>

                    <section>
                      <h3 className="text-2xl font-bold text-white mb-4">sentinel diff</h3>
                      <p className="text-gray-400 mb-4">Review only the changes you've made in the current branch.</p>
                      <CodeBlock 
                        code="sentinel diff"
                        id="int-diff"
                      />
                    </section>

                    <section>
                      <h3 className="text-2xl font-bold text-white mb-4">sentinel review-pr [url]</h3>
                      <p className="text-gray-400 mb-4">Analyze a GitHub Pull Request and post comments directly on the diff.</p>
                      <CodeBlock 
                        code="sentinel review-pr https://github.com/org/repo/pull/123"
                        id="int-pr"
                      />
                    </section>

                    <section>
                      <h3 className="text-2xl font-bold text-white mb-4">sentinel install-hooks</h3>
                      <p className="text-gray-400 mb-4">Install Git hooks to prevent insecure code from being committed.</p>
                      <CodeBlock 
                        code={`# Install pre-commit hook\nsentinel install-hooks --pre-commit\n\n# Install pre-push hook\nsentinel install-hooks --pre-push`}
                        id="int-hooks"
                      />
                    </section>

                    <section>
                      <h3 className="text-2xl font-bold text-white mb-4">sentinel blame [file]</h3>
                      <p className="text-gray-400 mb-4">Identify which commits and authors introduced specific quality issues using Git blame data.</p>
                      <CodeBlock 
                        code={`# Analyze with blame attribution\nsentinel blame src/index.js\n\n# Output author report in JSON\nsentinel blame --format json --output blame-report.json`}
                        id="int-blame"
                      />
                    </section>

                    <section>
                      <h3 className="text-2xl font-bold text-white mb-4">sentinel setup</h3>
                      <p className="text-gray-400 mb-4">Interactive configuration wizard to set up your environment, AI providers, and integrations.</p>
                      <CodeBlock 
                        code="sentinel setup"
                        id="int-setup"
                      />
                      <p className="mt-4 text-sm text-gray-500">
                        The setup wizard will guide you through:
                      </p>
                      <ul className="mt-2 space-y-2 text-sm text-gray-400">
                        <li className="flex items-center gap-2"><CheckCircle2 className="w-4 h-4 text-emerald-500" /> AI Provider configuration (OpenAI, Anthropic, etc.)</li>
                        <li className="flex items-center gap-2"><CheckCircle2 className="w-4 h-4 text-emerald-500" /> Git integration and hook installation</li>
                        <li className="flex items-center gap-2"><CheckCircle2 className="w-4 h-4 text-emerald-500" /> Notification settings (Slack/Discord)</li>
                      </ul>
                    </section>
                  </div>
                </div>
              )}

              {/* AI & Interactive */}
              {activeSection === 'ai' && (
                <div className="space-y-12">
                  <div>
                    <h1 className="text-4xl md:text-5xl font-bold mb-6 text-white tracking-tight">AI & Interactive</h1>
                    <p className="text-xl text-gray-400 leading-relaxed">
                      Leverage advanced AI for deeper insights and interactive debugging.
                    </p>
                  </div>
                  
                  <div className="space-y-10">
                    <section>
                      <h3 className="text-2xl font-bold text-white mb-4">Interactive Chat</h3>
                      <p className="text-gray-400 mb-4">Start a conversation with the AI about your code.</p>
                      <CodeBlock 
                        code="sentinel chat"
                        id="ai-chat"
                      />
                      <div className="mt-6 p-6 rounded-2xl bg-slate-900/50 border border-slate-800">
                        <h4 className="text-sm font-bold text-emerald-400 uppercase tracking-widest mb-4">In-Chat Commands</h4>
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                          {[
                            { cmd: ':load', desc: 'Load the last analysis report for context' },
                            { cmd: ':explain', desc: 'Explain issues and suggest fixes' },
                            { cmd: ':history', desc: 'Show recent chat history' },
                            { cmd: ':exit', desc: 'Exit the interactive session' },
                          ].map((c) => (
                            <div key={c.cmd} className="flex items-start gap-3">
                              <code className="text-emerald-400 font-mono text-xs bg-emerald-400/10 px-2 py-1 rounded">{c.cmd}</code>
                              <span className="text-slate-400 text-xs">{c.desc}</span>
                            </div>
                          ))}
                        </div>
                      </div>
                    </section>

                    <section>
                      <h3 className="text-2xl font-bold text-white mb-4">Explain Issue</h3>
                      <p className="text-gray-400 mb-4">Get a detailed explanation of a specific finding.</p>
                      <CodeBlock 
                        code="sentinel explain <issue-id>"
                        id="ai-explain"
                      />
                    </section>

                    <section>
                      <h3 className="text-2xl font-bold text-white mb-4">Model Management</h3>
                      <p className="text-gray-400 mb-4">Configure and switch between different AI providers and models.</p>
                      <CodeBlock 
                        code={`# List available models\nsentinel models\n\n# Enable a provider\nsentinel models --enable openai\n\n# Set a specific model for a provider\nsentinel models --model openai=gpt-4-turbo\n\n# Set inference weight (0.0 to 1.0)\nsentinel models --weight openai=0.8`}
                        id="ai-models"
                      />

                      <div className="mt-6 rounded-2xl border border-gray-800 overflow-hidden">
                        <table className="w-full text-left">
                          <thead className="bg-gray-900/50 border-b border-gray-800">
                            <tr>
                              <th className="px-6 py-4 text-xs font-bold uppercase tracking-widest text-gray-500">Option</th>
                              <th className="px-6 py-4 text-xs font-bold uppercase tracking-widest text-gray-500">Description</th>
                            </tr>
                          </thead>
                          <tbody className="divide-y divide-gray-800">
                            {[
                              { opt: '--enable <ids>', desc: 'Enable provider IDs (comma-separated)' },
                              { opt: '--disable <ids>', desc: 'Disable provider IDs (comma-separated)' },
                              { opt: '--model <id=model>', desc: 'Set provider model (repeatable)' },
                              { opt: '--weight <id=weight>', desc: 'Set provider inference weight (repeatable)' },
                              { opt: '--env <id=ENV>', desc: 'Set API key environment variable (repeatable)' },
                              { opt: '--strip-secrets <ids>', desc: 'Remove inline API keys for provider IDs' }
                            ].map((row, i) => (
                              <tr key={i} className="hover:bg-gray-900/30 transition-colors">
                                <td className="px-6 py-4 font-mono text-sm text-emerald-400">{row.opt}</td>
                                <td className="px-6 py-4 text-sm text-gray-400">{row.desc}</td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    </section>
                  </div>
                </div>
              )}

              {/* Configuration */}
              {activeSection === 'config' && (
                <div className="space-y-12">
                  <h1 className="text-4xl md:text-5xl font-bold mb-6 text-white tracking-tight">Configuration</h1>
                  <section>
                    <h3 className="text-2xl font-bold text-white mb-4">.sentinelrc</h3>
                    <CodeBlock 
                      code={`{
  "llm": {
    "provider": "openai",
    "model": "gpt-4o",
    "temperature": 0.3
  },
  "scan": {
    "include": ["src/**/*.js"],
    "exclude": ["node_modules/**"],
    "minSeverity": "medium"
  }
}`}
                      language="json"
                      id="config-json"
                    />
                  </section>

                  <section>
                    <h3 className="text-2xl font-bold text-white mb-4">Banner Customization</h3>
                    <p className="text-gray-400 mb-4">Customize the CLI banner appearance using global options.</p>
                    <CodeBlock 
                      code={`# Change banner message\nsentinel analyze --banner-message "MY-PROJECT"\n\n# Change banner font\nsentinel analyze --banner-font "Slant"\n\n# Change banner gradient\nsentinel analyze --banner-gradient fire`}
                      id="config-banner"
                    />
                    <div className="mt-6 rounded-2xl border border-gray-800 overflow-hidden">
                      <table className="w-full text-left">
                        <thead className="bg-gray-900/50 border-b border-gray-800">
                          <tr>
                            <th className="px-6 py-4 text-xs font-bold uppercase tracking-widest text-gray-500">Option</th>
                            <th className="px-6 py-4 text-xs font-bold uppercase tracking-widest text-gray-500">Description</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-gray-800">
                          {[
                            { opt: '--banner-message', desc: 'Banner text (default: SENTINEL)' },
                            { opt: '--banner-font', desc: 'Figlet font name (default: Standard)' },
                            { opt: '--banner-gradient', desc: 'aqua|fire|rainbow|aurora|mono' },
                            { opt: '--no-banner-color', desc: 'Disable banner gradients' }
                          ].map((row, i) => (
                            <tr key={i} className="hover:bg-gray-900/30 transition-colors">
                              <td className="px-6 py-4 font-mono text-sm text-emerald-400">{row.opt}</td>
                              <td className="px-6 py-4 text-sm text-gray-400">{row.desc}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </section>
                </div>
              )}

              {/* CI/CD Integration */}
              {activeSection === 'cicd' && (
                <div className="space-y-12">
                  <h1 className="text-4xl md:text-5xl font-bold mb-6 text-white tracking-tight">CI/CD Integration</h1>
                  
                  <div className="space-y-10">
                    <section>
                      <h3 className="text-2xl font-bold text-white mb-4">sentinel ci</h3>
                      <p className="text-gray-400 mb-4">CI-friendly analysis that fails based on severity thresholds.</p>
                      <CodeBlock 
                        code={`# Fail on high severity or above\nsentinel ci --fail-on high\n\n# Output JSON for automation\nsentinel ci --format json --output results.json`}
                        id="cicd-ci"
                      />
                    </section>

                    <section>
                      <h3 className="text-2xl font-bold text-white mb-4">GitHub Actions</h3>
                      <CodeBlock 
                        code={`name: Security Scan\non: [pull_request]\njobs:\n  scan:\n    runs-on: ubuntu-latest\n    steps:\n      - uses: actions/checkout@v3\n      - run: npm install -g @sentinel/cli\n      - run: sentinel ci --fail-on high\n        env:\n          OPENAI_API_KEY: \${{ secrets.OPENAI_API_KEY }}`}
                        language="yaml"
                        id="gh-actions"
                      />
                    </section>
                  </div>
                </div>
              )}

              {/* Notifications */}
              {activeSection === 'notifications' && (
                <div className="space-y-12">
                  <div>
                    <h1 className="text-4xl md:text-5xl font-bold mb-6 text-white tracking-tight">Notifications</h1>
                    <p className="text-xl text-gray-400 leading-relaxed">
                      Stay informed about security issues across your favorite platforms.
                    </p>
                  </div>
                  
                  <div className="space-y-10">
                    <section>
                      <h3 className="text-2xl font-bold text-white mb-4">sentinel notify</h3>
                      <p className="text-gray-400 mb-4">Send analysis results to Slack or Discord manually or via CI.</p>
                      <CodeBlock 
                        code={`# Notify Slack\nsentinel notify --slack --project "My App"\n\n# Notify Discord\nsentinel notify --discord --branch "feature-x"`}
                        id="notify-cmd"
                      />
                    </section>

                    <section>
                      <h3 className="text-2xl font-bold text-white mb-4">Slack Integration</h3>
                      <p className="text-gray-400 mb-4">Send analysis summaries to a Slack channel.</p>
                      <CodeBlock 
                        code={`export SLACK_WEBHOOK_URL=https://hooks.slack.com/services/...\nsentinel notify --slack --channel "#security-alerts"`}
                        id="notify-slack"
                      />
                    </section>

                    <section>
                      <h3 className="text-2xl font-bold text-white mb-4">Discord Integration</h3>
                      <p className="text-gray-400 mb-4">Get instant alerts in your Discord server.</p>
                      <CodeBlock 
                        code={`export DISCORD_WEBHOOK_URL=https://discord.com/api/webhooks/...\nsentinel notify --discord`}
                        id="notify-discord"
                      />
                    </section>
                  </div>
                </div>
              )}

              {/* Plugins */}
              {activeSection === 'plugins' && (
                <div className="space-y-12">
                  <h1 className="text-4xl md:text-5xl font-bold mb-6 text-white tracking-tight">Plugins</h1>
                  <section>
                    <h3 className="text-2xl font-bold text-white mb-4">Official Plugins</h3>
                    <div className="grid gap-6">
                      {[
                        { name: '@sentinel/plugin-react', desc: 'React-specific security checks and best practices.' },
                        { name: '@sentinel/plugin-docker', desc: 'Dockerfile scanning and container security.' }
                      ].map((plugin, i) => (
                        <div key={i} className="p-6 rounded-2xl bg-gray-900/50 border border-gray-800 hover:border-emerald-500/30 transition-all">
                          <h4 className="text-emerald-400 font-bold mb-2">{plugin.name}</h4>
                          <p className="text-sm text-gray-400">{plugin.desc}</p>
                        </div>
                      ))}
                    </div>
                  </section>
                </div>
              )}

              {/* FAQ */}
              {activeSection === 'faq' && (
                <div className="space-y-12">
                  <div>
                    <h1 className="text-4xl md:text-5xl font-bold mb-6 text-white tracking-tight">Frequently Asked Questions</h1>
                    <p className="text-xl text-gray-400 leading-relaxed">
                      Common questions about SENTINEL's security, privacy, and usage.
                    </p>
                  </div>
                  
                  <div className="space-y-6">
                    {[
                      {
                        q: "Is my code sent to the cloud?",
                        a: "By default, SENTINEL uses local analyzers. If you enable AI features, only relevant code snippets are sent to your chosen AI provider (OpenAI, Anthropic, etc.) via their secure APIs. We never store your code on our servers."
                      },
                      {
                        q: "Can I use SENTINEL with local LLMs?",
                        a: "Yes! SENTINEL supports local providers like Ollama and LocalAI. You can configure these in the `sentinel models` command or via your `.sentinelrc` file."
                      },
                      {
                        q: "How does SENTINEL compare to SonarQube or Snyk?",
                        a: "While those tools are excellent, SENTINEL leverages Large Language Models to understand code context and logic, allowing it to find complex vulnerabilities (like business logic flaws) that traditional static analysis often misses."
                      },
                      {
                        q: "Is SENTINEL free for commercial use?",
                        a: "Yes, SENTINEL is licensed under the MIT License and is completely free for both personal and commercial projects."
                      },
                      {
                        q: "Does it support monorepos?",
                        a: "Absolutely. Use the `sentinel analyze-workspace` command to scan multiple packages in a monorepo while respecting cross-package dependencies."
                      }
                    ].map((item, i) => (
                      <div key={i} className="p-8 rounded-3xl bg-gray-900/50 border border-gray-800">
                        <h3 className="text-xl font-bold text-white mb-4 flex items-center gap-3">
                          <span className="shrink-0 w-8 h-8 rounded-full bg-emerald-500/10 text-emerald-500 flex items-center justify-center text-sm">Q</span>
                          {item.q}
                        </h3>
                        <div className="pl-11 text-gray-400 leading-relaxed">
                          {item.a}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          </main>
        </div>
      </div>
    </div>
  );
}
