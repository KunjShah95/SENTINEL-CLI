import { useEffect, useRef } from 'react';
import { 
  Code, 
  FileSearch, 
  Shield, 
  Package, 
  Brain, 
  FileCheck, 
  BarChart3,
  ArrowDown,
  Lock,
  CheckCircle2
} from 'lucide-react';

export function HowItWorks() {
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
    <div className="pt-20 overflow-x-hidden">
      {/* Hero */}
      <section className="relative py-32 px-6">
        <div className="absolute inset-0 grid-background opacity-30" />
        <div className="max-w-7xl mx-auto text-center relative z-10 reveal" ref={addToRefs}>
          <h1 className="text-5xl md:text-7xl font-bold mb-8 tracking-tight">
            How <span className="text-gradient">SENTINEL</span> Works
          </h1>
          <p className="text-xl text-gray-400 max-w-3xl mx-auto leading-relaxed">
            Understanding the architecture behind AI-powered security analysis
          </p>
        </div>
      </section>

      {/* Architecture Diagram */}
      <section className="py-24 px-6">
        <div className="max-w-4xl mx-auto">
          <div className="space-y-12">
            {/* Step 1 */}
            <div className="reveal" ref={addToRefs}>
              <div className="group p-8 rounded-3xl bg-gray-900/50 border border-gray-800 hover:border-emerald-500/30 transition-all duration-500">
                <div className="flex flex-col md:flex-row items-start gap-8">
                  <div className="p-5 rounded-2xl bg-emerald-500/10 border border-emerald-500/20 group-hover:scale-110 transition-transform duration-500">
                    <Code className="w-10 h-10 text-emerald-500" />
                  </div>
                  <div className="flex-1">
                    <div className="flex items-center gap-3 mb-3">
                      <span className="text-xs font-bold uppercase tracking-widest text-emerald-500">Step 01</span>
                      <h3 className="text-2xl font-bold text-white">Developer / CI Trigger</h3>
                    </div>
                    <p className="text-gray-400 leading-relaxed mb-6">
                      SENTINEL can be triggered manually via CLI, through Git hooks, or automatically in your CI/CD pipeline. 
                      It accepts various configuration options to customize the scan.
                    </p>
                    <div className="p-5 rounded-2xl bg-gray-950 border border-gray-800 font-mono text-sm shadow-inner">
                      <span className="text-emerald-500">$</span> <span className="text-gray-300">sentinel run --all --config .sentinelrc</span>
                    </div>
                  </div>
                </div>
              </div>
            </div>

            <div className="flex justify-center reveal" ref={addToRefs}>
              <div className="w-px h-12 bg-linear-to-b from-emerald-500/50 to-transparent" />
            </div>

            {/* Step 2 */}
            <div className="reveal" ref={addToRefs}>
              <div className="group p-8 rounded-3xl bg-gray-900/50 border border-gray-800 hover:border-emerald-500/30 transition-all duration-500">
                <div className="flex flex-col md:flex-row items-start gap-8">
                  <div className="p-5 rounded-2xl bg-emerald-500/10 border border-emerald-500/20 group-hover:scale-110 transition-transform duration-500">
                    <FileSearch className="w-10 h-10 text-emerald-500" />
                  </div>
                  <div className="flex-1">
                    <div className="flex items-center gap-3 mb-3">
                      <span className="text-xs font-bold uppercase tracking-widest text-emerald-500">Step 02</span>
                      <h3 className="text-2xl font-bold text-white">File Collector</h3>
                    </div>
                    <p className="text-gray-400 leading-relaxed mb-6">
                      Intelligently scans your project directory, respecting .gitignore and .sentinelignore files. 
                      Collects source code, configuration files, and dependencies for analysis.
                    </p>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                      {[
                        'Source files (.js, .py, .go)',
                        'Config files (.env, .config)',
                        'Dependencies (package.json)',
                        'Infrastructure (Dockerfile)'
                      ].map((item, i) => (
                        <div key={i} className="flex items-center gap-3 p-4 rounded-xl bg-gray-950 border border-gray-800 text-sm text-gray-300">
                          <CheckCircle2 className="w-4 h-4 text-emerald-500" />
                          {item}
                        </div>
                      ))}
                    </div>
                  </div>
                </div>
              </div>
            </div>

            <div className="flex justify-center reveal" ref={addToRefs}>
              <div className="w-px h-12 bg-linear-to-b from-emerald-500/50 to-transparent" />
            </div>

            {/* Step 3 */}
            <div className="reveal" ref={addToRefs}>
              <div className="group p-8 rounded-3xl bg-gray-900/50 border border-gray-800 hover:border-amber-500/30 transition-all duration-500">
                <div className="flex flex-col md:flex-row items-start gap-8">
                  <div className="p-5 rounded-2xl bg-amber-500/10 border border-amber-500/20 group-hover:scale-110 transition-transform duration-500">
                    <Shield className="w-10 h-10 text-amber-500" />
                  </div>
                  <div className="flex-1">
                    <div className="flex items-center gap-3 mb-3">
                      <span className="text-xs font-bold uppercase tracking-widest text-amber-500">Step 03</span>
                      <h3 className="text-2xl font-bold text-white">Static Analyzers</h3>
                    </div>
                    <p className="text-gray-400 leading-relaxed mb-6">
                      Runs multiple static analysis tools in parallel. These include linters, security scanners, 
                      and code quality checkers optimized for different languages.
                    </p>
                    <div className="flex flex-wrap gap-3">
                      {['ESLint', 'Bandit', 'Semgrep', 'Snyk', 'Custom Rules'].map(tool => (
                        <span key={tool} className="px-4 py-2 rounded-xl bg-gray-950 border border-gray-800 text-sm font-medium text-gray-300 group-hover:border-amber-500/20 transition-colors">
                          {tool}
                        </span>
                      ))}
                    </div>
                  </div>
                </div>
              </div>
            </div>

            <div className="flex justify-center reveal" ref={addToRefs}>
              <div className="w-px h-12 bg-linear-to-b from-rose-500/50 to-transparent" />
            </div>

            {/* Step 4 */}
            <div className="reveal" ref={addToRefs}>
              <div className="group p-8 rounded-3xl bg-gray-900/50 border border-gray-800 hover:border-rose-500/30 transition-all duration-500">
                <div className="flex flex-col md:flex-row items-start gap-8">
                  <div className="p-5 rounded-2xl bg-rose-500/10 border border-rose-500/20 group-hover:scale-110 transition-transform duration-500">
                    <Package className="w-10 h-10 text-rose-500" />
                  </div>
                  <div className="flex-1">
                    <div className="flex items-center gap-3 mb-3">
                      <span className="text-xs font-bold uppercase tracking-widest text-rose-500">Step 04</span>
                      <h3 className="text-2xl font-bold text-white">Dependency Scanner</h3>
                    </div>
                    <p className="text-gray-400 leading-relaxed">
                      Analyzes your dependency tree for known vulnerabilities using CVE databases and security advisories. 
                      Checks for outdated packages and license compliance.
                    </p>
                  </div>
                </div>
              </div>
            </div>

            <div className="flex justify-center reveal" ref={addToRefs}>
              <div className="w-px h-12 bg-linear-to-b from-amber-500/50 to-transparent" />
            </div>

            {/* Step 5 */}
            <div className="reveal" ref={addToRefs}>
              <div className="group p-8 rounded-3xl bg-emerald-600/10 border border-emerald-500/30 hover:border-emerald-500/50 transition-all duration-500 shadow-2xl shadow-emerald-500/5">
                <div className="flex flex-col md:flex-row items-start gap-8">
                  <div className="p-5 rounded-2xl bg-emerald-500 group-hover:scale-110 transition-transform duration-500 shadow-lg shadow-emerald-500/20">
                    <Brain className="w-10 h-10 text-white" />
                  </div>
                  <div className="flex-1">
                    <div className="flex items-center gap-3 mb-3">
                      <span className="text-xs font-bold uppercase tracking-widest text-emerald-400">Step 05</span>
                      <h3 className="text-2xl font-bold text-white">LLM Review Engine (AI Core)</h3>
                    </div>
                    <p className="text-gray-300 leading-relaxed mb-8">
                      The heart of SENTINEL. Large language models analyze code context, business logic, 
                      and complex vulnerability patterns that traditional tools miss.
                    </p>
                    <div className="grid md:grid-cols-2 gap-6">
                      <div className="p-6 rounded-2xl bg-gray-950/50 border border-gray-800">
                        <h4 className="text-white font-bold mb-4 flex items-center gap-2">
                          <div className="w-1.5 h-1.5 rounded-full bg-emerald-500" />
                          What AI Analyzes
                        </h4>
                        <ul className="space-y-3 text-sm text-gray-400">
                          <li className="flex items-center gap-2">• Data flow patterns</li>
                          <li className="flex items-center gap-2">• Authentication logic</li>
                          <li className="flex items-center gap-2">• Business logic flaws</li>
                          <li className="flex items-center gap-2">• Context-specific risks</li>
                        </ul>
                      </div>
                      <div className="p-6 rounded-2xl bg-gray-950/50 border border-gray-800">
                        <h4 className="text-white font-bold mb-4 flex items-center gap-2">
                          <div className="w-1.5 h-1.5 rounded-full bg-emerald-500" />
                          Supported Models
                        </h4>
                        <ul className="space-y-3 text-sm text-gray-400">
                          <li className="flex items-center gap-2">• GPT-4 / GPT-4o</li>
                          <li className="flex items-center gap-2">• Claude 3.5 Sonnet</li>
                          <li className="flex items-center gap-2">• Gemini 1.5 Pro</li>
                          <li className="flex items-center gap-2">• Local Llama 3</li>
                        </ul>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            </div>

            <div className="flex justify-center reveal" ref={addToRefs}>
              <div className="w-px h-12 bg-linear-to-b from-emerald-500/50 to-transparent" />
            </div>

            {/* Step 6 */}
            <div className="reveal" ref={addToRefs}>
              <div className="group p-8 rounded-3xl bg-gray-900/50 border border-gray-800 hover:border-emerald-500/30 transition-all duration-500">
                <div className="flex flex-col md:flex-row items-start gap-8">
                  <div className="p-5 rounded-2xl bg-emerald-500/10 border border-emerald-500/20 group-hover:scale-110 transition-transform duration-500">
                    <FileCheck className="w-10 h-10 text-emerald-500" />
                  </div>
                  <div className="flex-1">
                    <div className="flex items-center gap-3 mb-3">
                      <span className="text-xs font-bold uppercase tracking-widest text-emerald-500">Step 06</span>
                      <h3 className="text-2xl font-bold text-white">Policy Engine</h3>
                    </div>
                    <p className="text-gray-400 leading-relaxed">
                      Applies your organization's security policies and severity thresholds. 
                      Filters false positives and prioritizes findings based on risk.
                    </p>
                  </div>
                </div>
              </div>
            </div>

            <div className="flex justify-center reveal" ref={addToRefs}>
              <div className="w-px h-12 bg-linear-to-b from-emerald-500/50 to-transparent" />
            </div>

            {/* Step 7 */}
            <div className="reveal" ref={addToRefs}>
              <div className="group p-8 rounded-3xl bg-gray-900/50 border border-gray-800 hover:border-amber-500/30 transition-all duration-500">
                <div className="flex flex-col md:flex-row items-start gap-8">
                  <div className="p-5 rounded-2xl bg-amber-500/10 border border-amber-500/20 group-hover:scale-110 transition-transform duration-500">
                    <BarChart3 className="w-10 h-10 text-amber-500" />
                  </div>
                  <div className="flex-1">
                    <div className="flex items-center gap-3 mb-3">
                      <span className="text-xs font-bold uppercase tracking-widest text-amber-500">Step 07</span>
                      <h3 className="text-2xl font-bold text-white">Report Generator</h3>
                    </div>
                    <p className="text-gray-400 leading-relaxed mb-6">
                      Generates comprehensive reports in multiple formats. Includes detailed remediation guidance, 
                      code snippets, and severity classifications.
                    </p>
                    <div className="flex gap-3 flex-wrap">
                      {['JSON', 'HTML', 'Markdown', 'SARIF'].map(format => (
                        <span key={format} className="px-5 py-2 rounded-xl bg-gray-950 border border-gray-800 text-sm font-bold text-gray-400 group-hover:text-amber-400 transition-colors">
                          {format}
                        </span>
                      ))}
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Privacy Note */}
      <section className="py-24 px-6">
        <div className="max-w-4xl mx-auto reveal" ref={addToRefs}>
          <div className="relative p-10 rounded-3xl border border-emerald-500/30 bg-emerald-500/5 overflow-hidden">
            <div className="absolute top-0 right-0 w-64 h-64 bg-emerald-500/10 rounded-full -translate-y-1/2 translate-x-1/2 blur-3xl" />
            <div className="relative z-10 flex flex-col md:flex-row items-start gap-8">
              <div className="p-4 rounded-2xl bg-emerald-500/20 border border-emerald-500/30">
                <Lock className="w-10 h-10 text-emerald-500" />
              </div>
              <div>
                <h3 className="text-2xl font-bold text-white mb-4">Privacy & Security First</h3>
                <p className="text-gray-400 leading-relaxed mb-8">
                  Your code never leaves your system unless you explicitly configure it to use cloud-based LLMs. 
                  All processing happens locally by default.
                </p>
                <div className="grid sm:grid-cols-2 gap-4">
                  {[
                    'Local-first architecture',
                    'Optional cloud LLM integration',
                    'No telemetry or data collection',
                    'Audit logs for compliance'
                  ].map((item, i) => (
                    <div key={i} className="flex items-center gap-3 text-sm text-gray-300">
                      <CheckCircle2 className="w-5 h-5 text-emerald-500" />
                      {item}
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* CTA */}
      <section className="py-32 px-6">
        <div className="max-w-4xl mx-auto text-center reveal" ref={addToRefs}>
          <h2 className="text-4xl md:text-5xl font-bold mb-8">Ready to Get Started?</h2>
          <p className="text-xl text-gray-400 mb-12 max-w-2xl mx-auto">
            See SENTINEL in action with our comprehensive documentation and quick-start guide.
          </p>
          <a 
            href="/docs" 
            className="inline-block px-10 py-4 rounded-xl bg-emerald-600 text-white font-bold hover:bg-emerald-500 transition-all shadow-xl shadow-emerald-600/20"
          >
            Read the Docs
          </a>
        </div>
      </section>
    </div>
  );
}
