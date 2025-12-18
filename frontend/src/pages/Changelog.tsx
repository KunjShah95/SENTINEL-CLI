import React, { useEffect, useRef } from 'react';
import { Calendar, Tag, GitCommit, ArrowRight, ExternalLink, ShieldCheck, Zap, Bug } from 'lucide-react';

const updates = [
  {
    version: 'v2.4.0',
    date: 'May 15, 2024',
    type: 'Major',
    title: 'The Intelligence Update',
    description: 'Introducing deep AI integration for automated security fixes and architectural analysis.',
    changes: [
      { icon: Zap, text: 'New `sentinel fix` command for automated vulnerability remediation.' },
      { icon: ShieldCheck, text: 'Enhanced API Security Analyzer with support for GraphQL and gRPC.' },
      { icon: GitCommit, text: 'Improved PR Review bot with multi-file context awareness.' }
    ],
    link: '#'
  },
  {
    version: 'v2.3.5',
    date: 'April 28, 2024',
    type: 'Patch',
    title: 'Performance & Stability',
    description: 'Significant improvements to scanning speed and memory usage for large monorepos.',
    changes: [
      { icon: Zap, text: '40% faster dependency analysis using parallel worker threads.' },
      { icon: Bug, text: 'Fixed a memory leak in the Kubernetes manifest analyzer.' },
      { icon: ShieldCheck, text: 'Updated CVE database with 500+ new vulnerability signatures.' }
    ],
    link: '#'
  },
  {
    version: 'v2.3.0',
    date: 'April 10, 2024',
    type: 'Minor',
    title: 'Cloud Native Expansion',
    description: 'Expanded support for container security and infrastructure-as-code.',
    changes: [
      { icon: ShieldCheck, text: 'New Docker Image Scanner for base image vulnerabilities.' },
      { icon: Zap, text: 'Added support for Terraform and CloudFormation security linting.' },
      { icon: Tag, text: 'Customizable severity scoring for enterprise compliance.' }
    ],
    link: '#'
  }
];

export function Changelog() {
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
    <div className="pt-20 min-h-screen bg-gray-950">
      {/* Hero Section */}
      <section className="relative py-24 overflow-hidden">
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_50%_-20%,rgba(16,185,129,0.1),transparent_70%)]" />
        <div className="max-w-7xl mx-auto px-6 relative">
          <div className="max-w-3xl">
            <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 text-xs font-bold uppercase tracking-wider mb-6">
              <Calendar className="w-3 h-3" />
              Release History
            </div>
            <h1 className="text-5xl md:text-6xl font-bold text-white mb-6 tracking-tight">
              What's New in <span className="text-emerald-500">SENTINEL</span>
            </h1>
            <p className="text-xl text-gray-400 leading-relaxed">
              Stay up to date with the latest features, security updates, and performance improvements.
            </p>
          </div>
        </div>
      </section>

      {/* Timeline Section */}
      <section className="pb-32">
        <div className="max-w-7xl mx-auto px-6">
          <div className="relative">
            {/* Vertical Line */}
            <div className="absolute left-0 md:left-1/2 top-0 bottom-0 w-px bg-gray-800 -translate-x-1/2 hidden md:block" />

            <div className="space-y-24">
              {updates.map((update, index) => (
                <div 
                  key={update.version}
                  className={`relative flex flex-col md:flex-row gap-12 reveal ${index % 2 === 0 ? 'md:flex-row-reverse' : ''}`}
                  ref={addToRefs}
                >
                  {/* Timeline Dot */}
                  <div className="absolute left-0 md:left-1/2 top-0 w-4 h-4 bg-emerald-500 rounded-full -translate-x-1/2 shadow-[0_0_15px_rgba(16,185,129,0.5)] hidden md:block" />

                  {/* Date/Version Side */}
                  <div className="md:w-1/2 flex flex-col justify-center">
                    <div className={`flex flex-col ${index % 2 === 0 ? 'md:items-start' : 'md:items-end'}`}>
                      <div className="flex items-center gap-3 mb-2">
                        <span className="text-emerald-500 font-mono font-bold text-lg">{update.version}</span>
                        <span className={`px-2 py-0.5 rounded text-[10px] font-bold uppercase ${
                          update.type === 'Major' ? 'bg-emerald-500/20 text-emerald-400' :
                          update.type === 'Minor' ? 'bg-blue-500/20 text-blue-400' :
                          'bg-gray-800 text-gray-400'
                        }`}>
                          {update.type}
                        </span>
                      </div>
                      <div className="text-gray-500 font-medium">{update.date}</div>
                    </div>
                  </div>

                  {/* Content Side */}
                  <div className="md:w-1/2">
                    <div className="p-8 rounded-3xl bg-gray-900/50 border border-gray-800 hover:border-emerald-500/30 transition-all duration-500 group">
                      <h3 className="text-2xl font-bold text-white mb-4 group-hover:text-emerald-400 transition-colors">
                        {update.title}
                      </h3>
                      <p className="text-gray-400 mb-8 leading-relaxed">
                        {update.description}
                      </p>
                      
                      <div className="space-y-4 mb-8">
                        {update.changes.map((change, i) => (
                          <div key={i} className="flex items-start gap-3">
                            <div className="mt-1 p-1 rounded bg-gray-800 text-emerald-500">
                              <change.icon className="w-3 h-3" />
                            </div>
                            <span className="text-sm text-gray-400">{change.text}</span>
                          </div>
                        ))}
                      </div>

                      <a 
                        href={update.link}
                        className="inline-flex items-center gap-2 text-sm font-bold text-white hover:text-emerald-400 transition-colors"
                      >
                        Read Full Release Notes
                        <ArrowRight className="w-4 h-4" />
                      </a>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </section>

      {/* CTA Section */}
      <section className="py-24 border-t border-gray-900">
        <div className="max-w-7xl mx-auto px-6 text-center">
          <div className="reveal" ref={addToRefs}>
            <h2 className="text-3xl font-bold text-white mb-6">Never miss an update</h2>
            <p className="text-gray-400 mb-10 max-w-2xl mx-auto">
              Subscribe to our newsletter or follow us on GitHub to get notified about new releases and security advisories.
            </p>
            <div className="flex flex-wrap justify-center gap-4">
              <button className="px-8 py-4 rounded-2xl bg-emerald-600 text-white font-bold hover:bg-emerald-500 transition-all shadow-lg shadow-emerald-600/20">
                Subscribe to Newsletter
              </button>
              <button className="px-8 py-4 rounded-2xl bg-gray-900 text-white font-bold border border-gray-800 hover:bg-gray-800 transition-all flex items-center gap-2">
                <ExternalLink className="w-4 h-4" />
                Follow on GitHub
              </button>
            </div>
          </div>
        </div>
      </section>
    </div>
  );
}
