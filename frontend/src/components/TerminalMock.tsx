import { useState, useEffect } from 'react';

interface TerminalLine {
  type: 'command' | 'output' | 'success' | 'warning' | 'error';
  content: string;
}

const sampleOutput: TerminalLine[] = [
  { type: 'command', content: 'sentinel review-pr https://github.com/org/repo/pull/123' },
  { type: 'output', content: '🔍 Fetching PR #123 context...' },
  { type: 'success', content: '✓ Analyzed 12 changed files' },
  { type: 'output', content: '🤖 Thinking...' },
  { type: 'warning', content: '⚠ Found IDOR vulnerability in users.ts' },
  { type: 'warning', content: '⚠ Exposed API key in config.env' },
  { type: 'success', content: '✓ Generated 3 automated fixes' },
  { type: 'success', content: '🚀 Commented on PR #123' },
  { type: 'output', content: '   View Report: https://sentinel.ai/report/xyz' },
];

export function TerminalMock() {
  const [visibleLines, setVisibleLines] = useState<TerminalLine[]>([]);
  const [currentIndex, setCurrentIndex] = useState(0);

  useEffect(() => {
    if (currentIndex < sampleOutput.length) {
      const timer = setTimeout(() => {
        setVisibleLines(prev => [...prev, sampleOutput[currentIndex]]);
        setCurrentIndex(prev => prev + 1);
      }, 400);
      return () => clearTimeout(timer);
    } else {
      const resetTimer = setTimeout(() => {
        setVisibleLines([]);
        setCurrentIndex(0);
      }, 5000);
      return () => clearTimeout(resetTimer);
    }
  }, [currentIndex]);

  const getLineColor = (type: string) => {
    switch (type) {
      case 'command': return 'text-emerald-400 font-bold';
      case 'success': return 'text-emerald-400';
      case 'warning': return 'text-amber-400';
      case 'error': return 'text-rose-400';
      default: return 'text-gray-400';
    }
  };

  return (
    <div className="terminal-glow rounded-2xl bg-gray-950 border border-gray-800 overflow-hidden shadow-2xl">
      <div className="flex items-center justify-between px-5 py-4 border-b border-gray-800 bg-gray-900/50">
        <div className="flex gap-2">
          <div className="w-3 h-3 rounded-full bg-rose-500/20 border border-rose-500/50" />
          <div className="w-3 h-3 rounded-full bg-amber-500/20 border border-amber-500/50" />
          <div className="w-3 h-3 rounded-full bg-emerald-500/20 border border-emerald-500/50" />
        </div>
        <div className="text-[10px] font-mono text-gray-500 uppercase tracking-widest">sentinel-cli — bash</div>
        <div className="w-12" /> {/* Spacer */}
      </div>
      <div className="p-8 font-mono text-sm min-h-95 leading-relaxed">
        {visibleLines.map((line, index) => (
          <div key={index} className={`flex gap-3 mb-2 ${getLineColor(line.type)}`}>
            {line.type === 'command' && <span className="text-emerald-600">$</span>}
            <span className={line.type === 'command' ? 'text-gray-200' : ''}>{line.content}</span>
          </div>
        ))}
        <div className="flex gap-3 items-center">
          <span className="text-emerald-600">$</span>
          <span className="w-2 h-5 bg-emerald-500 animate-pulse" />
        </div>
      </div>
    </div>
  );
}
