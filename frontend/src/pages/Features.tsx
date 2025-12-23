
import { useRef, useEffect } from 'react';
import { Bot, Shield, Zap, GitBranch, ArrowRight, Check, Code2, Terminal, MessageSquare } from 'lucide-react';

export function Features() {
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

  return (
    <div className="pt-20 min-h-screen bg-gray-950 font-sans overflow-x-hidden">

      {/* Hero */}
      <section className="py-24 px-6 text-center">
        <div className="max-w-4xl mx-auto reveal" ref={addToRefs}>
          <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-blue-500/10 border border-blue-500/20 text-blue-400 text-xs font-bold uppercase tracking-wider mb-8">
            <Bot className="w-3 h-3" />
            <span>AI V2 Engine</span>
          </div>
          <h1 className="text-5xl md:text-7xl font-bold mb-8 tracking-tight">
            Review code like a <br /><span className="text-gradient">Superhuman</span>
          </h1>
          <p className="text-xl text-gray-400 max-w-2xl mx-auto leading-relaxed">
            SENTINEL replaces hours of manual code review with seconds of AI analysis.
            It's not just a linter—it's an intelligent teammate.
          </p>
        </div>
      </section>

      {/* Feature 1: The Review Workflow (Zig) */}
      <section className="py-24 px-6">
        <div className="max-w-7xl mx-auto grid lg:grid-cols-2 gap-16 items-center">
          <div className="order-2 lg:order-1 reveal" ref={addToRefs}>
            <div className="relative rounded-2xl bg-[#0d1117] border border-gray-800 p-8 shadow-2xl">
              {/* Abstract Timeline Visualization */}
              <div className="space-y-8 relative">
                <div className="absolute left-6 top-4 bottom-4 w-0.5 bg-gray-800" />
                {[
                  { icon: GitBranch, color: "text-gray-400", title: "Pull Request Created", time: "1m ago" },
                  { icon: Bot, color: "text-emerald-400", title: "SENTINEL Analysis", time: "Just now", active: true },
                  { icon: MessageSquare, color: "text-blue-400", title: "3 Issues Found", time: "Pending" },
                ].map((step, i) => (
                  <div key={i} className="relative flex items-center gap-4">
                    <div className={`relative z-10 w-12 h-12 rounded-full border bg-gray-900 flex items-center justify-center ${step.active ? 'border-emerald-500 shadow-lg shadow-emerald-500/20' : 'border-gray-800'}`}>
                      <step.icon className={`w-5 h-5 ${step.color}`} />
                    </div>
                    <div>
                      <div className={`font-bold ${step.active ? 'text-white' : 'text-gray-500'}`}>{step.title}</div>
                      <div className="text-xs text-gray-600 font-mono">{step.time}</div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
          <div className="order-1 lg:order-2 reveal" ref={addToRefs}>
            <h3 className="text-sm font-bold text-emerald-500 uppercase tracking-widest mb-4">Seamless Integration</h3>
            <h2 className="text-4xl font-bold mb-6">Works where you work.</h2>
            <p className="text-lg text-gray-400 leading-relaxed mb-8">
              Connect Sentinel to your GitHub or GitLab repositories. It automatically scans every new PR,
              leaving comments just like a human reviewer would—but faster and more thorough.
            </p>
            <ul className="space-y-4">
              {['Zero configuration required', 'Comments directly on the diff', 'Smart filtering of noise'].map(item => (
                <li key={item} className="flex items-center gap-3 text-gray-300">
                  <Check className="w-5 h-5 text-emerald-500" />
                  {item}
                </li>
              ))}
            </ul>
          </div>
        </div>
      </section>

      {/* Feature 2: Context Awareness (Zag) */}
      <section className="py-24 px-6 bg-gray-900/20 border-y border-white/5">
        <div className="max-w-7xl mx-auto grid lg:grid-cols-2 gap-16 items-center">
          <div className="reveal" ref={addToRefs}>
            <h3 className="text-sm font-bold text-blue-500 uppercase tracking-widest mb-4">Context Aware</h3>
            <h2 className="text-4xl font-bold mb-6">It understands your logic.</h2>
            <p className="text-lg text-gray-400 leading-relaxed mb-8">
              Traditional tools look for regex matches. Sentinel understands data flow and business logic.
              It knows that `isUserAdmin` needs to be checked before `deleteDatabase`.
            </p>
            <div className="flex gap-4">
              <div className="px-6 py-3 rounded-xl bg-blue-500/10 border border-blue-500/20 text-blue-400 font-bold">
                Detects Logic Bugs
              </div>
              <div className="px-6 py-3 rounded-xl bg-purple-500/10 border border-purple-500/20 text-purple-400 font-bold">
                API Misuse
              </div>
            </div>
          </div>
          <div className="reveal" ref={addToRefs}>
            <div className="relative rounded-2xl bg-[#0d1117] border border-gray-800 p-6 shadow-2xl font-mono text-sm">
              <div className="flex gap-2 mb-4 text-xs text-gray-500 border-b border-gray-800 pb-2">
                <span>user.ts</span>
              </div>
              <div className="space-y-1">
                <div className="text-gray-500">24 | function deleteUser(id) {"{"}</div>
                <div className="text-gray-500">25 |   // AI Warning: Missing authorization check</div>
                <div className="bg-rose-500/10 text-gray-200 border-l-2 border-rose-500 pl-2">26 |   db.users.delete(id);</div>
                <div className="text-gray-500">27 | {"}"}</div>
              </div>
              <div className="mt-4 p-3 rounded bg-blue-500/10 border border-blue-500/20 text-blue-300 text-xs">
                <span className="font-bold block mb-1">🤖 Sentinel Analysis:</span>
                Function `deleteUser` is exported but lacks an authorization check. Ensure user has `admin` role.
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Feature 3: Auto-Fix (Zig) */}
      <section className="py-24 px-6">
        <div className="max-w-7xl mx-auto grid lg:grid-cols-2 gap-16 items-center">
          <div className="order-2 lg:order-1 reveal" ref={addToRefs}>
            <div className="relative rounded-2xl bg-[#0d1117] border border-gray-800 p-8 shadow-2xl overflow-hidden group">
              <div className="absolute top-0 right-0 p-4 bg-emerald-600 text-white font-bold text-xs rounded-bl-2xl">
                Fixed automatically
              </div>
              <div className="font-mono text-sm text-gray-400 mb-2">Before</div>
              <div className="bg-red-500/10 p-3 rounded border border-red-500/20 mb-4 text-red-200 line-through">
                const token = "sk_live_12345";
              </div>
              <div className="font-mono text-sm text-gray-400 mb-2">After</div>
              <div className="bg-emerald-500/10 p-3 rounded border border-emerald-500/20 text-emerald-300">
                const token = process.env.STRIPE_KEY;
              </div>
              <div className="mt-6 flex justify-center">
                <button className="px-6 py-2 bg-emerald-600 rounded-lg text-white font-bold text-sm shadow-lg shadow-emerald-600/20 group-hover:scale-105 transition-transform">
                  Accept Changes
                </button>
              </div>
            </div>
          </div>
          <div className="order-1 lg:order-2 reveal" ref={addToRefs}>
            <h3 className="text-sm font-bold text-purple-500 uppercase tracking-widest mb-4">Automated Remediation</h3>
            <h2 className="text-4xl font-bold mb-6">Don't just find bugs. Fix them.</h2>
            <p className="text-lg text-gray-400 leading-relaxed mb-8">
              Sentinel doesn't just complain. It knows how to fix common security issues and bad practices.
              With one click, you can commit the suggested fix directly to your branch.
            </p>
            <div className="grid grid-cols-2 gap-4">
              {['XSS Prevention', 'Dependency Updates', 'Secret Removal', 'Type Fixes'].map((tag) => (
                <div key={tag} className="flex items-center gap-2 text-sm text-gray-400 bg-gray-900 border border-gray-800 px-3 py-2 rounded-lg">
                  <Zap className="w-4 h-4 text-yellow-500" />
                  {tag}
                </div>
              ))}
            </div>
          </div>
        </div>
      </section>

      {/* Additional Features Grid */}
      <section className="py-24 px-6 bg-gray-900/30">
        <div className="max-w-7xl mx-auto">
          <div className="text-center mb-16 reveal" ref={addToRefs}>
            <h2 className="text-3xl font-bold mb-4">And so much more...</h2>
          </div>
          <div className="grid md:grid-cols-3 gap-8 reveal" ref={addToRefs}>
            {[
              { icon: Shield, title: "Dependency Scanning", desc: "Checks package.json for known CVEs using the OSV database." },
              { icon: Terminal, title: "Universal CLI", desc: "Runs on Linux, macOS, and Windows. Single binary, no dependencies." },
              { icon: Code2, title: "Multi-Language", desc: "Native support for JS, TS, Python, Go, Rust, and Java." },
              { icon: MessageSquare, title: "Chat Interface", desc: "Ask questions about your codebase in natural language." },
              { icon: GitBranch, title: "Git Hooks", desc: "Pre-commit and pre-push hooks ensure no bad code leaves your machine." },
              { icon: Zap, title: "Performance", desc: "Scanning is 10x faster than traditional SAST tools thanks to Rust core." }
            ].map((item, i) => (
              <div key={i} className="p-6 rounded-2xl bg-gray-950 border border-gray-800 hover:border-gray-700 transition-all">
                <item.icon className="w-8 h-8 text-gray-400 mb-4" />
                <h3 className="text-xl font-bold text-white mb-2">{item.title}</h3>
                <p className="text-sm text-gray-400 leading-relaxed">{item.desc}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

    </div>
  );
}
