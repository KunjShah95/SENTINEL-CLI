import React, { useState, useEffect, useRef } from 'react';
import { Terminal as TerminalIcon, Play, RotateCcw, Shield, Zap, Search, Bug, Lock } from 'lucide-react';

const COMMAND_RESPONSES: Record<string, string[]> = {
  'sentinel --version': ['sentinel-cli v2.4.0', 'Checking for updates... You are on the latest version.'],
  'sentinel analyze .': [
    '🔍 Scanning workspace...',
    '📦 Found 124 dependencies',
    '🛡️ Running 12 security analyzers...',
    '✅ No critical vulnerabilities found.',
    '⚠️ 2 medium severity issues in package.json',
    '💡 Run `sentinel fix` to automatically resolve these issues.'
  ],
  'sentinel fix': [
    '🔧 Initializing Auto-Fix engine...',
    '📝 Analyzing vulnerability in `lodash` (CVE-2020-8203)',
    '✅ Successfully updated `lodash` to v4.17.21',
    '📝 Analyzing vulnerability in `axios` (CVE-2021-3749)',
    '✅ Successfully updated `axios` to v0.21.2',
    '✨ All fixable issues resolved.'
  ],
  'sentinel review-pr': [
    '🤖 Fetching PR #42 from GitHub...',
    '📝 Analyzing 12 changed files...',
    '✅ Code quality: 94/100',
    '🛡️ Security: No new vulnerabilities introduced.',
    '💬 Posted 3 suggestions to the PR.'
  ],
  'help': [
    'Available commands:',
    '  sentinel analyze .    - Scan current directory',
    '  sentinel fix          - Auto-fix vulnerabilities',
    '  sentinel review-pr    - Review a pull request',
    '  sentinel --version    - Show version',
    '  clear                 - Clear terminal'
  ]
};

export function Playground() {
  const [input, setInput] = useState('');
  const [history, setHistory] = useState<{ type: 'cmd' | 'res', text: string }[]>([
    { type: 'res', text: 'Welcome to SENTINEL Interactive Playground.' },
    { type: 'res', text: 'Type `help` to see available commands.' }
  ]);
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [history]);

  const handleCommand = (e: React.FormEvent) => {
    e.preventDefault();
    if (!input.trim()) return;

    const cmd = input.trim().toLowerCase();
    const newHistory = [...history, { type: 'cmd' as const, text: input }];

    if (cmd === 'clear') {
      setHistory([]);
    } else if (COMMAND_RESPONSES[cmd]) {
      COMMAND_RESPONSES[cmd].forEach(line => {
        newHistory.push({ type: 'res', text: line });
      });
    } else {
      newHistory.push({ type: 'res', text: `Command not found: ${input}. Type \`help\` for assistance.` });
    }

    setHistory(newHistory);
    setInput('');
  };

  return (
    <div className="pt-20 min-h-screen bg-gray-950">
      <div className="max-w-7xl mx-auto px-6 py-16">
        <div className="grid lg:grid-cols-2 gap-16 items-center">
          <div>
            <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 text-xs font-bold uppercase tracking-wider mb-6">
              <Play className="w-3 h-3" />
              Interactive Demo
            </div>
            <h1 className="text-5xl md:text-6xl font-bold text-white mb-6 tracking-tight">
              Try <span className="text-emerald-500">SENTINEL</span> in your browser
            </h1>
            <p className="text-xl text-gray-400 leading-relaxed mb-10">
              Experience the power of AI-driven security analysis without installing a single package. Run real commands and see how SENTINEL protects your code.
            </p>

            <div className="grid sm:grid-cols-2 gap-6">
              {[
                { icon: Search, title: 'Analyze', desc: 'Scan for vulnerabilities' },
                { icon: Zap, title: 'Auto-Fix', desc: 'Resolve issues instantly' },
                { icon: Shield, title: 'PR Review', desc: 'Automated code reviews' },
                { icon: Lock, title: 'Secrets', desc: 'Detect leaked credentials' }
              ].map((feat, i) => (
                <div key={i} className="p-6 rounded-2xl bg-gray-900/50 border border-gray-800">
                  <feat.icon className="w-6 h-6 text-emerald-500 mb-4" />
                  <h3 className="text-white font-bold mb-2">{feat.title}</h3>
                  <p className="text-sm text-gray-500">{feat.desc}</p>
                </div>
              ))}
            </div>
          </div>

          <div className="relative">
            {/* Terminal Window */}
            <div className="rounded-2xl bg-[#0d1117] border border-gray-800 shadow-2xl overflow-hidden">
              <div className="flex items-center justify-between px-4 py-3 bg-gray-900/50 border-b border-gray-800">
                <div className="flex gap-2">
                  <div className="w-3 h-3 rounded-full bg-red-500/20 border border-red-500/40" />
                  <div className="w-3 h-3 rounded-full bg-yellow-500/20 border border-yellow-500/40" />
                  <div className="w-3 h-3 rounded-full bg-green-500/20 border border-green-500/40" />
                </div>
                <div className="flex items-center gap-2 text-xs font-mono text-gray-500">
                  <TerminalIcon className="w-3 h-3" />
                  sentinel-playground — 80x24
                </div>
                <button 
                  onClick={() => setHistory([{ type: 'res', text: 'Terminal reset.' }])}
                  className="p-1 hover:bg-gray-800 rounded transition-colors"
                  title="Reset Terminal"
                >
                  <RotateCcw className="w-3 h-3 text-gray-500" />
                </button>
              </div>

              <div 
                ref={scrollRef}
                className="h-112.5 overflow-y-auto p-6 font-mono text-sm leading-relaxed scrollbar-thin scrollbar-thumb-gray-800"
              >
                {history.map((line, i) => (
                  <div key={i} className={`mb-2 ${line.type === 'cmd' ? 'text-emerald-400' : 'text-gray-300'}`}>
                    {line.type === 'cmd' ? (
                      <span className="flex gap-2">
                        <span className="text-emerald-600">❯</span>
                        {line.text}
                      </span>
                    ) : (
                      <div className="pl-4 whitespace-pre-wrap">{line.text}</div>
                    )}
                  </div>
                ))}
                <form onSubmit={handleCommand} className="flex gap-2 mt-4">
                  <span className="text-emerald-600 font-bold">❯</span>
                  <input
                    type="text"
                    value={input}
                    onChange={(e) => setInput(e.target.value)}
                    className="flex-1 bg-transparent border-none outline-none text-emerald-400 placeholder-emerald-900"
                    placeholder="Type a command..."
                    autoFocus
                  />
                </form>
              </div>
            </div>

            {/* Decorative Elements */}
            <div className="absolute -top-4 -right-4 w-24 h-24 bg-emerald-500/10 rounded-full blur-2xl -z-10" />
            <div className="absolute -bottom-4 -left-4 w-32 h-32 bg-blue-500/10 rounded-full blur-2xl -z-10" />
          </div>
        </div>
      </div>
    </div>
  );
}
