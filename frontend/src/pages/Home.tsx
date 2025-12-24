
import { useRef, useEffect } from 'react';
import { ArrowRight, Terminal, Github, CheckCircle2, Bot, ShieldAlert, Sparkles, Code2 } from 'lucide-react';
import { Link } from 'react-router-dom';
import { TerminalMock } from '../components/TerminalMock';
import { PRComment } from '../components/PRComment';


export function Home() {
  const revealRefs = useRef<(HTMLDivElement | null)[]>([]);

  // Intersection Observer for animations
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

  return (
    <div className="min-h-screen bg-gray-950 text-white selection:bg-emerald-500/30 font-sans overflow-x-hidden pt-20">

      {/* Background Ambience */}
      <div className="fixed inset-0 z-0 pointer-events-none">
        <div className="absolute inset-0 grid-background opacity-[0.1]" />
        <div className="absolute -top-[500px] left-1/2 -translate-x-1/2 w-[1000px] h-[1000px] bg-emerald-500/10 blur-[120px] rounded-full mix-blend-screen" />
      </div>

      {/* Hero Section */}
      <section className="relative z-10 pt-20 pb-32 px-6">
        <div className="max-w-7xl mx-auto grid lg:grid-cols-2 gap-16 items-center">

          {/* Hero Content (Left) */}
          <div className="space-y-8 reveal" ref={addToRefs}>
            <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 text-xs font-bold uppercase tracking-wider backdrop-blur-md animate-pulse-glow">
              <Sparkles className="w-3 h-3" />
              <span>AI Agent V2.4 Now Live</span>
            </div>

            <h1 className="text-5xl md:text-7xl font-bold tracking-tight leading-[1.1]">
              Your AI Security <br />
              <span className="text-gradient">Pair Programmer</span>.
            </h1>

            <p className="text-xl text-gray-400 leading-relaxed max-w-lg">
              Automated code reviews, vulnerability scanning, and 1-click fixes.
              Running locally in your CLI or automatically on every Pull Request.
            </p>

            <div className="flex flex-wrap gap-4">
              <Link to="/docs" className="flex items-center gap-2 px-8 py-4 rounded-xl bg-emerald-600 text-white font-bold hover:bg-emerald-500 transition-all shadow-lg shadow-emerald-500/20 group">
                <Github className="w-5 h-5" />
                <span>Add to GitHub</span>
              </Link>
              <Link to="/features" className="flex items-center gap-2 px-8 py-4 rounded-xl bg-gray-900 text-white font-bold border border-gray-800 hover:bg-gray-800 hover:border-gray-700 transition-all group">
                <Terminal className="w-5 h-5 text-gray-400 group-hover:text-emerald-400 transition-colors" />
                <span>Install CLI</span>
                <ArrowRight className="w-4 h-4 ml-auto opacity-0 group-hover:opacity-100 transition-all transform group-hover:translate-x-1" />
              </Link>
            </div>

            <div className="flex items-center gap-6 pt-4 text-sm text-gray-500">
              <div className="flex items-center gap-2">
                <CheckCircle2 className="w-4 h-4 text-emerald-500" />
                <span>Free for Open Source</span>
              </div>
              <div className="flex items-center gap-2">
                <CheckCircle2 className="w-4 h-4 text-emerald-500" />
                <span>No data retention</span>
              </div>
            </div>
          </div>

          {/* Hero Visuals (Right) */}
          <div className="relative reveal delay-200" ref={addToRefs}>
            {/* Abstract Glow behind */}
            <div className="absolute inset-0 bg-emerald-500/20 blur-[80px] rounded-full mix-blend-screen opacity-50 pointer-events-none" />

            {/* Composition */}
            <div className="relative">
              {/* Layer 1: Terminal (Back) */}
              <div className="transform translate-y-12 scale-95 opacity-80 blur-[1px] transition-all hover:translate-y-8 hover:opacity-100 hover:blur-0 duration-500">
                <TerminalMock />
              </div>

              {/* Layer 2: PR Comment (Front/Floating) */}
              <div className="absolute -bottom-12 -right-4 md:-right-24 w-[90%] md:w-[28rem] shadow-2xl animate-float z-50 pointer-events-auto">
                <PRComment />
              </div>
            </div>
          </div>

        </div>
      </section>


      {/* Feature Value Props */}
      <section className="py-32 px-6">
        <div className="max-w-7xl mx-auto">
          <div className="text-center mb-24 reveal" ref={addToRefs}>
            <h2 className="text-4xl md:text-5xl font-bold mb-6">Security that feels like <span className="text-emerald-400">magic</span></h2>
            <p className="text-xl text-gray-400 max-w-2xl mx-auto">
              We combined static analysis, dependency scanning, and LLMs to create
              the world's most comprehensive code review agent.
            </p>
          </div>

          <div className="grid md:grid-cols-3 gap-8">
            {[
              {
                icon: Bot,
                title: "AI Context Awareness",
                desc: "Unlike traditional linters, SENTINEL understands your business logic and data flow to find complex vulnerabilities.",
                color: "emerald"
              },
              {
                icon: ShieldAlert,
                title: "Zero False Positives",
                desc: "Our multi-pass validation engine ensures that you only get alerted on real issues that matter.",
                color: "rose"
              },
              {
                icon: Code2,
                title: "Instant Auto-Fixes",
                desc: "Don't just find bugs—fix them. SENTINEL opens PRs with complete, tested code solutions.",
                color: "blue"
              }
            ].map((feature, i) => (
              <div key={i} className="reveal group p-8 rounded-3xl bg-gray-900/40 border border-white/5 hover:border-emerald-500/20 transition-all hover:-translate-y-1 duration-300" ref={addToRefs}>
                <div className={`w-12 h-12 rounded-2xl bg-${feature.color}-500/10 flex items-center justify-center mb-6 group-hover:scale-110 transition-transform duration-500`}>
                  <feature.icon className={`w-6 h-6 text-${feature.color}-400`} />
                </div>
                <h3 className="text-xl font-bold text-white mb-3 font-display">{feature.title}</h3>
                <p className="text-gray-400 leading-relaxed text-sm">
                  {feature.desc}
                </p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Integration CTA */}
      <section className="py-24 px-6 relative overflow-hidden">
        <div className="absolute inset-0 bg-emerald-900/10" />
        <div className="absolute inset-0 bg-gradient-to-b from-gray-950 via-transparent to-gray-950" />

        <div className="max-w-5xl mx-auto text-center relative z-10 reveal" ref={addToRefs}>
          <div className="inline-block p-4 rounded-full bg-emerald-500/20 mb-8 animate-pulse">
            <ShieldAlert className="w-12 h-12 text-emerald-400" />
          </div>

          <h2 className="text-4xl md:text-6xl font-bold mb-8 tracking-tight">
            Stop vulnerabilities <br />
            <span className="text-emerald-400">before they merge.</span>
          </h2>

          <p className="text-xl text-gray-400 mb-12 max-w-2xl mx-auto">
            Join 10,000+ developers who sleep better at night knowing SENTINEL is guarding their codebase.
          </p>

          <div className="flex flex-col sm:flex-row items-center justify-center gap-4">
            <Link to="/docs" className="flex items-center justify-center gap-2 w-full sm:w-auto px-8 py-4 bg-white text-gray-950 font-bold rounded-xl hover:bg-emerald-400 transition-colors shadow-lg shadow-white/10 hover:shadow-emerald-400/20">
              <Terminal className="w-5 h-5" />
              <span>Get Started Now</span>
            </Link>
            <a href="https://github.com/KunjShah95/SENTINEL-CLI" target="_blank" rel="noopener noreferrer" className="flex items-center justify-center gap-2 w-full sm:w-auto px-8 py-4 bg-gray-950 text-white border border-gray-800 font-bold rounded-xl hover:bg-gray-900 transition-colors hover:border-gray-700">
              <Github className="w-5 h-5" />
              <span>View Source</span>
            </a>
          </div>
        </div>
      </section>

    </div>
  );
}
