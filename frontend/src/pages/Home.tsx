import { useEffect, useRef, type ComponentType } from 'react';
import { Link } from 'react-router-dom';
import { TerminalMock } from '../components/TerminalMock';
import { FeatureCard } from '../components/FeatureCard';
import { 
  Brain, 
  Shield, 
  Zap, 
  Lock, 
  Code, 
  FileCheck, 
  GitBranch, 
  Package, 
  Terminal,
  ArrowRight,
  CheckCircle2,
  MessageSquare,
  Wrench,
  Container,
  Globe
} from 'lucide-react';

export function Home() {
  interface BadgeItem { icon: ComponentType<any>; label: string }
  interface FeatureItem { icon: ComponentType<any>; title: string; description: string }
  interface StepItem { icon: ComponentType<any>; label: string; desc: string }
  interface ListItem { title: string; desc: string }

  const revealRefs = useRef<(HTMLDivElement | null)[]>([]);

  useEffect(() => {
    const observer = new IntersectionObserver(
      (entries: IntersectionObserverEntry[]) => {
        entries.forEach((entry: IntersectionObserverEntry) => {
          if (entry.isIntersecting) {
            (entry.target as Element).classList.add('active');
          }
        });
      },
      { threshold: 0.1 }
    );

    revealRefs.current.forEach((ref: HTMLDivElement | null) => {
      if (ref) observer.observe(ref);
    });

    return () => observer.disconnect();
  }, []);

  const addToRefs = (el: HTMLDivElement | null): void => {
    if (el && !revealRefs.current.includes(el)) {
      revealRefs.current.push(el);
    }
  };

  return (
    <div className="pt-20 overflow-x-hidden">
      {/* Hero Section */}
      <section className="relative min-h-[90vh] flex items-center px-6">
        <div className="absolute inset-0 grid-background opacity-50" />
        <div className="max-w-7xl mx-auto relative z-10">
          <div className="grid lg:grid-cols-2 gap-16 items-center">
            <div className="reveal" ref={addToRefs}>
              <div className="inline-flex items-center gap-2 mb-6 px-4 py-1.5 rounded-full bg-emerald-500/10 border border-emerald-500/20 text-sm font-medium text-emerald-400">
                <span className="relative flex h-2 w-2">
                  <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
                  <span className="relative inline-flex rounded-full h-2 w-2 bg-emerald-500"></span>
                </span>
                v2.0 is now live
              </div>
              <h1 className="text-5xl md:text-7xl font-bold mb-8 leading-[1.1] tracking-tight">
                Secure your code with <span className="text-gradient">AI Intelligence</span>
              </h1>
              <p className="text-xl text-gray-400 mb-10 max-w-xl leading-relaxed">
                SENTINEL is the next-generation security CLI that uses advanced LLMs to find vulnerabilities before they reach production.
              </p>
              <div className="flex flex-wrap gap-5">
                <Link 
                  to="/docs" 
                  className="group px-8 py-4 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white font-semibold transition-all flex items-center gap-2 shadow-lg shadow-emerald-600/20"
                >
                  Get Started 
                  <ArrowRight className="w-5 h-5 group-hover:translate-x-1 transition-transform" />
                </Link>
                <a 
                  href="https://github.com/sentinel-cli" 
                  target="_blank"
                  rel="noopener noreferrer"
                  className="px-8 py-4 rounded-xl border border-gray-800 hover:border-gray-600 hover:bg-gray-900/50 transition-all font-semibold"
                >
                  View on GitHub
                </a>
              </div>
            </div>
            
            <div className="reveal delay-200" ref={addToRefs}>
              <div className="relative">
                <div className="absolute -inset-4 bg-emerald-500/10 blur-3xl rounded-full" />
                <TerminalMock />
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Trust Badges */}
      <section className="py-16 px-6 border-y border-gray-900 bg-gray-950/50">
        <div className="max-w-7xl mx-auto">
          <div className="grid grid-cols-2 md:grid-cols-4 gap-12">
            {[
              { icon: Code, label: 'Open Source' },
              { icon: Brain, label: 'Multi-LLM Support' },
              { icon: GitBranch, label: 'CI/CD Ready' },
              { icon: Lock, label: 'Secure by Default' }
            ].map((item, i) => (
              <div key={i} className="flex items-center gap-4 justify-center grayscale opacity-50 hover:grayscale-0 hover:opacity-100 transition-all">
                <item.icon className="w-6 h-6 text-emerald-500" />
                <span className="text-sm font-medium tracking-wide uppercase">{item.label}</span>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Community Showcase */}
      <section className="py-24 px-6 bg-gray-950">
        <div className="max-w-7xl mx-auto">
          <div className="text-center mb-16 reveal" ref={addToRefs}>
            <h2 className="text-2xl font-bold text-gray-400 uppercase tracking-widest mb-12">Trusted by Innovative Teams</h2>
            <div className="flex flex-wrap justify-center items-center gap-12 md:gap-24 opacity-40 grayscale hover:grayscale-0 transition-all duration-500">
              {/* Mock Logos using Lucide Icons for demonstration */}
              <div className="flex items-center gap-3 group cursor-default">
                <Globe className="w-8 h-8 text-white group-hover:text-blue-400 transition-colors" />
                <span className="text-2xl font-bold text-white">GlobalTech</span>
              </div>
              <div className="flex items-center gap-3 group cursor-default">
                <Shield className="w-8 h-8 text-white group-hover:text-emerald-400 transition-colors" />
                <span className="text-2xl font-bold text-white">SecureFlow</span>
              </div>
              <div className="flex items-center gap-3 group cursor-default">
                <Zap className="w-8 h-8 text-white group-hover:text-yellow-400 transition-colors" />
                <span className="text-2xl font-bold text-white">FastStack</span>
              </div>
              <div className="flex items-center gap-3 group cursor-default">
                <Container className="w-8 h-8 text-white group-hover:text-blue-500 transition-colors" />
                <span className="text-2xl font-bold text-white">CloudNative</span>
              </div>
              <div className="flex items-center gap-3 group cursor-default">
                <Lock className="w-8 h-8 text-white group-hover:text-red-400 transition-colors" />
                <span className="text-2xl font-bold text-white">SafeGuard</span>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Features Grid */}
      <section className="py-32 px-6">
        <div className="max-w-7xl mx-auto">
          <div className="text-center mb-20 reveal" ref={addToRefs}>
            <h2 className="text-4xl md:text-5xl font-bold mb-6">Powerful Security Features</h2>
            <p className="text-xl text-gray-400 max-w-2xl mx-auto">
              Everything you need to secure your codebase with the power of modern AI.
            </p>
          </div>
          
          <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-8 reveal" ref={addToRefs}>
            <FeatureCard 
              icon={Brain}
              title="AI-Powered Analysis"
              description="Advanced language models detect complex vulnerabilities that traditional tools miss"
            />
            <FeatureCard 
              icon={Shield}
              title="Security Scanning"
              description="Comprehensive security checks for common vulnerabilities and coding mistakes"
            />
            <FeatureCard 
              icon={Zap}
              title="Lightning Fast"
              description="Optimized scanning engine processes thousands of files in seconds"
            />
            <FeatureCard 
              icon={Package}
              title="Dependency Analysis"
              description="Scan dependencies for known vulnerabilities and outdated packages"
            />
            <FeatureCard 
              icon={FileCheck}
              title="Detailed Reports"
              description="Generate comprehensive reports in JSON, HTML, or Markdown formats"
            />
            <FeatureCard 
              icon={Terminal}
              title="CLI First"
              description="Powerful command-line interface designed for developer workflows"
            />
            <FeatureCard 
              icon={MessageSquare}
              title="Interactive AI Chat"
              description="Chat with your codebase to understand complex security logic"
            />
            <FeatureCard 
              icon={Wrench}
              title="AI Auto-Fix"
              description="Automatically generate and apply fixes for security vulnerabilities"
            />
            <FeatureCard 
              icon={Container}
              title="Docker Security"
              description="Scan containers and Dockerfiles for insecure configurations"
            />
          </div>
        </div>
      </section>

      {/* How It Works Flow */}
      <section className="py-32 px-6 bg-gray-950/50 relative overflow-hidden">
        <div className="absolute top-0 left-1/2 -translate-x-1/2 w-full h-px bg-linear-to-r from-transparent via-gray-800 to-transparent" />
        <div className="max-w-7xl mx-auto relative z-10">
          <div className="text-center mb-20 reveal" ref={addToRefs}>
            <h2 className="text-4xl md:text-5xl font-bold mb-6">How It Works</h2>
            <p className="text-xl text-gray-400">Five simple steps to a more secure codebase</p>
          </div>
          
          <div className="flex flex-col md:flex-row items-start md:items-center justify-between gap-12 reveal" ref={addToRefs}>
            {[
              { icon: Code, label: 'Code', desc: 'Write your code' },
              { icon: Shield, label: 'Scan', desc: 'Run sentinel scan' },
              { icon: Brain, label: 'Analyze', desc: 'AI analysis' },
              { icon: FileCheck, label: 'Report', desc: 'Get insights' },
              { icon: CheckCircle2, label: 'Fix', desc: 'Apply fixes' }
            ].map((step, index) => (
              <div key={index} className="flex items-center gap-6 flex-1 group">
                <div className="flex flex-col items-center text-center flex-1">
                  <div className="relative">
                    <div className="absolute -inset-2 bg-emerald-500/20 blur-lg rounded-full opacity-0 group-hover:opacity-100 transition-opacity" />
                    <div className="relative p-6 rounded-2xl bg-gray-900 border border-gray-800 mb-4 group-hover:border-emerald-500/50 transition-colors">
                      <step.icon className="w-10 h-10 text-emerald-500" />
                      <div className="absolute -top-2 -right-2 w-6 h-6 rounded-full bg-emerald-600 text-[10px] font-bold flex items-center justify-center border-2 border-gray-950">
                        0{index + 1}
                      </div>
                    </div>
                  </div>
                  <span className="font-bold mb-1">{step.label}</span>
                  <span className="text-xs text-gray-500 uppercase tracking-wider">{step.desc}</span>
                </div>
                {index < 4 && (
                  <div className="hidden md:block text-gray-800">
                    <ArrowRight className="w-6 h-6" />
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Code Example */}
      <section className="py-32 px-6">
        <div className="max-w-7xl mx-auto">
          <div className="grid lg:grid-cols-2 gap-20 items-center">
            <div className="reveal" ref={addToRefs}>
              <h2 className="text-4xl md:text-5xl font-bold mb-8">Simple, Powerful CLI</h2>
              <p className="text-xl text-gray-400 mb-10 leading-relaxed">
                Get started with a single command. SENTINEL integrates seamlessly into your existing development workflow.
              </p>
              <ul className="space-y-6">
                {[
                  { title: 'Zero configuration required', desc: 'Works out of the box with sensible defaults' },
                  { title: 'Customizable rules', desc: 'Configure checks to match your security policies' },
                  { title: 'CI/CD integration', desc: 'Built-in support for GitHub Actions, GitLab CI, and more' }
                ].map((item, i) => (
                  <li key={i} className="flex items-start gap-4 group">
                    <div className="mt-1 p-1 rounded-full bg-emerald-500/10 text-emerald-500 group-hover:bg-emerald-500 group-hover:text-white transition-colors">
                      <CheckCircle2 className="w-5 h-5" />
                    </div>
                    <div>
                      <div className="font-bold text-lg mb-1">{item.title}</div>
                      <div className="text-gray-400">{item.desc}</div>
                    </div>
                  </li>
                ))}
              </ul>
            </div>
            
            <div className="reveal delay-200" ref={addToRefs}>
              <div className="rounded-2xl bg-gray-900 border border-gray-800 overflow-hidden shadow-2xl">
                <div className="flex items-center justify-between px-6 py-4 border-b border-gray-800 bg-gray-900/50">
                  <div className="flex gap-2">
                    <div className="w-3 h-3 rounded-full bg-red-500/20 border border-red-500/50" />
                    <div className="w-3 h-3 rounded-full bg-amber-500/20 border border-amber-500/50" />
                    <div className="w-3 h-3 rounded-full bg-emerald-500/20 border border-emerald-500/50" />
                  </div>
                  <span className="text-xs font-mono text-gray-500">terminal — sentinel</span>
                </div>
                <div className="p-8 font-mono text-sm leading-relaxed">
                  <div className="flex gap-3 mb-4">
                    <span className="text-emerald-500">$</span>
                    <span className="text-gray-300">npm install -g @sentinel/cli</span>
                  </div>
                  <div className="flex gap-3 mb-4">
                    <span className="text-emerald-500">$</span>
                    <span className="text-gray-300">sentinel run --all</span>
                  </div>
                  <div className="pl-6 border-l-2 border-emerald-500/30 my-6 space-y-2">
                    <div className="text-emerald-400">✓ Analyzing 124 files...</div>
                    <div className="text-emerald-400">✓ AI Analysis complete</div>
                    <div className="text-amber-400">! Found 2 potential vulnerabilities</div>
                  </div>
                  <div className="flex gap-3">
                    <span className="text-emerald-500">$</span>
                    <span className="text-gray-300">sentinel report --format html</span>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* CTA Section */}
      <section className="py-32 px-6">
        <div className="max-w-5xl mx-auto relative">
          <div className="absolute inset-0 bg-emerald-600 rounded-3xl blur-3xl opacity-10" />
          <div className="relative bg-linear-to-br from-emerald-600 to-blue-700 rounded-3xl p-12 md:p-20 text-center overflow-hidden">
            <div className="absolute top-0 right-0 w-64 h-64 bg-white/10 rounded-full -translate-y-1/2 translate-x-1/2 blur-3xl" />
            <div className="absolute bottom-0 left-0 w-64 h-64 bg-emerald-400/10 rounded-full translate-y-1/2 -translate-x-1/2 blur-3xl" />
            
            <div className="relative z-10 reveal" ref={addToRefs}>
              <h2 className="text-4xl md:text-6xl font-bold mb-8 text-white">Ready to Secure Your Code?</h2>
              <p className="text-xl mb-12 text-emerald-100 max-w-2xl mx-auto leading-relaxed">
                Join thousands of developers using SENTINEL to build more secure applications with AI-powered insights.
              </p>
              <div className="flex flex-wrap gap-6 justify-center">
                <Link 
                  to="/docs" 
                  className="px-10 py-4 rounded-xl bg-white text-emerald-600 font-bold hover:bg-emerald-50 transition-all shadow-xl"
                >
                  Get Started Now
                </Link>
                <Link 
                  to="/features" 
                  className="px-10 py-4 rounded-xl border-2 border-white/30 text-white font-bold hover:bg-white/10 transition-all"
                >
                  Explore Features
                </Link>
              </div>
            </div>
          </div>
        </div>
      </section>
    </div>
  );
}
