
import { useRef, useEffect } from 'react';
import { GitBranch, Webhook, Brain, MessageSquare, CheckCircle2, GitMerge, FileCode, Search, Terminal } from 'lucide-react';

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
      icon: GitBranch,
      color: 'blue',
      title: 'You Push Code',
      desc: 'You commit changes and push to a new branch, opening a Pull Request just like normal. No specialized workflow required.'
    },
    {
      icon: Webhook,
      color: 'purple',
      title: 'Webhook Triggers',
      desc: 'Sentinel listens for the PR event via GitHub Actions or GitLab Runner. It checks out the code and prepares the analysis environment.'
    },
    {
      icon: Search,
      color: 'orange',
      title: 'Diff Analysis',
      desc: 'Unlike standard linters, Sentinel only scans the changed files and their related dependency graph to save time and resources.'
    },
    {
      icon: Brain,
      color: 'emerald',
      title: 'AI Cognitive Passing',
      desc: 'The code is sent to the LLM engine. It looks for logical bugs, security flaws, and anti-patterns using "Chain of Thought" reasoning.'
    },
    {
      icon: MessageSquare,
      color: 'pink',
      title: 'Review Posted',
      desc: 'Sentinel posts comments directly on the specific lines of code in the PR. It explains the "Why" and suggests the "How".'
    },
    {
      icon: GitMerge,
      color: 'cyan',
      title: 'You Merge with Confidence',
      desc: 'You accept the auto-fixes with one click, resolve the comments, and merge a cleaner, safer codebase.'
    }
  ];

  return (
    <div className="pt-20 min-h-screen bg-gray-950 font-sans">

      {/* Hero */}
      <section className="py-24 px-6 text-center">
        <div className="max-w-4xl mx-auto reveal" ref={addToRefs}>
          <h1 className="text-5xl md:text-7xl font-bold mb-8 tracking-tight">
            From <span className="text-gradient">Push</span> to <span className="text-emerald-400">Perfect</span>
          </h1>
          <p className="text-xl text-gray-400 max-w-2xl mx-auto leading-relaxed">
            See exactly what happens in the few seconds between your commit and Sentinel's review.
          </p>
        </div>
      </section>

      {/* The Pipeline Visual */}
      <section className="py-12 px-6 pb-48">
        <div className="max-w-5xl mx-auto">
          <div className="relative">
            {/* Central Line */}
            <div className="absolute left-8 md:left-1/2 top-0 bottom-0 w-1 bg-gray-800 -translate-x-1/2 rounded-full" />

            {/* Steps */}
            <div className="space-y-24">
              {steps.map((step, i) => {
                const isEven = i % 2 === 0;
                return (
                  <div key={i} className={`relative flex flex-col md:flex-row gap-12 items-center reveal ${isEven ? 'md:flex-row-reverse' : ''}`} ref={addToRefs}>

                    {/* Icon Node */}
                    <div className="absolute left-8 md:left-1/2 -translate-x-1/2 w-16 h-16 rounded-2xl bg-[#0d1117] border-4 border-gray-950 flex items-center justify-center z-10 shadow-xl">
                      <step.icon className={`w-8 h-8 text-${step.color}-500`} />
                    </div>

                    {/* Content Card */}
                    <div className={`md:w-1/2 flex ${isEven ? 'md:justify-start' : 'md:justify-end'} pl-24 md:pl-0`}>
                      <div className={`relative p-8 rounded-3xl bg-[#0d1117] border border-gray-800 w-full max-w-lg hover:border-${step.color}-500/30 transition-all duration-300 group`}>
                        <div className={`absolute top-8 ${isEven ? 'md:-right-3 right-auto -left-3' : 'md:-left-3 -left-3'} w-6 h-6 bg-[#0d1117] border-l border-t border-gray-800 rotate-45 group-hover:border-${step.color}-500/30 transition-colors`} />

                        <div className={`text-xs font-bold uppercase tracking-widest mb-4 text-${step.color}-500`}>Step 0{i + 1}</div>
                        <h3 className="text-2xl font-bold text-white mb-4">{step.title}</h3>
                        <p className="text-gray-400 leading-relaxed">
                          {step.desc}
                        </p>
                      </div>
                    </div>

                    {/* Empty side for balance */}
                    <div className="md:w-1/2" />
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      </section>

      {/* Integration Logos */}
      <section className="py-24 bg-gray-900/30 border-t border-white/5">
        <div className="max-w-7xl mx-auto px-6 text-center reveal" ref={addToRefs}>
          <h2 className="text-3xl font-bold mb-16">Integrates seamlessly with</h2>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-12 text-gray-400">
            <div className="flex flex-col items-center gap-4">
              <div className="w-16 h-16 rounded-full bg-white/5 flex items-center justify-center">
                <GitBranch className="w-8 h-8" />
              </div>
              <span className="font-bold">GitHub Actions</span>
            </div>
            <div className="flex flex-col items-center gap-4">
              <div className="w-16 h-16 rounded-full bg-white/5 flex items-center justify-center">
                <GitMerge className="w-8 h-8" />
              </div>
              <span className="font-bold">GitLab CI</span>
            </div>
            <div className="flex flex-col items-center gap-4">
              <div className="w-16 h-16 rounded-full bg-white/5 flex items-center justify-center">
                <Terminal className="w-8 h-8" />
              </div>
              <span className="font-bold">CLI / Local</span>
            </div>
            <div className="flex flex-col items-center gap-4">
              <div className="w-16 h-16 rounded-full bg-white/5 flex items-center justify-center">
                <FileCode className="w-8 h-8" />
              </div>
              <span className="font-bold">VS Code</span>
            </div>
          </div>
        </div>
      </section>

    </div>
  );
}
