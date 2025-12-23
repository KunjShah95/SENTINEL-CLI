
import React, { useState, useEffect, useRef } from 'react';
import { Terminal as TerminalIcon, Play, RotateCcw, Shield, Zap, Search, Bug, Lock, Code2, MessageSquare, Bot, ShieldAlert } from 'lucide-react';

const VULNERABLE_CODE_SNIPPET = `import express from 'express';
const app = express();
import { db } from './db';

// Get user profile
app.get('/user', async (req, res) => {
  const userId = req.query.id;
  
  // 🔴 VULNERABILITY: SQL Injection
  const query = "SELECT * FROM users WHERE id = " + userId;
  const user = await db.query(query);
  
  res.json(user);
});`;

export function Playground() {
  const [activeMode, setActiveMode] = useState<'cli' | 'review'>('review');
  const [code, setCode] = useState(VULNERABLE_CODE_SNIPPET);
  const [analyzing, setAnalyzing] = useState(false);
  const [analysisResult, setAnalysisResult] = useState<any>(null);

  // --- CLI Logic ---
  const [input, setInput] = useState('');
  const [history, setHistory] = useState<{ type: 'cmd' | 'res', text: string }[]>([
    { type: 'res', text: 'Welcome to SENTINEL CLI v2.4.0' },
    { type: 'res', text: 'Type `help` to see available commands.' }
  ]);
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (scrollRef.current) scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
  }, [history]);

  const handleCommand = (e: React.FormEvent) => {
    e.preventDefault();
    if (!input.trim()) return;
    const cmd = input.trim().toLowerCase();
    const newHistory = [...history, { type: 'cmd' as const, text: input }];

    // Simple command parser mock
    if (cmd === 'clear') setHistory([]);
    else if (cmd === 'help') newHistory.push({ type: 'res', text: 'Commands: analyze, fix, version, clear' });
    else if (cmd.includes('analyze')) newHistory.push({ type: 'res', text: '🔍 Scanning... Found 2 issues in 1 file.' });
    else newHistory.push({ type: 'res', text: `Command not found: ${cmd}` });

    setHistory(newHistory);
    setInput('');
  };

  // --- Review Logic ---
  const runAnalysis = () => {
    setAnalyzing(true);
    setAnalysisResult(null);
    setTimeout(() => {
      setAnalyzing(false);
      setAnalysisResult({
        issues: [
          {
            type: 'Critical',
            title: 'SQL Injection Detected',
            line: 10,
            desc: 'User input is concatenated directly into the query string.',
            fix: 'Use parameterized queries: `db.query("SELECT * FROM users WHERE id = $1", [userId])`'
          }
        ]
      });
    }, 1500);
  };

  return (
    <div className="pt-20 min-h-screen bg-gray-950 font-sans">
      <div className="max-w-7xl mx-auto px-6 py-12">

        {/* Header */}
        <div className="text-center mb-12">
          <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 text-xs font-bold uppercase tracking-wider mb-6">
            <Play className="w-3 h-3" />
            Interactive Demo
          </div>
          <h1 className="text-4xl md:text-6xl font-bold mb-6">Try Sentinel Live</h1>
          <p className="text-xl text-gray-400 max-w-2xl mx-auto">
            Experience both the CLI power and the AI Review capabilities right here.
          </p>
        </div>

        {/* Mode Switcher */}
        <div className="flex justify-center mb-12">
          <div className="p-1 rounded-xl bg-gray-900 border border-gray-800 flex">
            <button
              onClick={() => setActiveMode('review')}
              className={`px-6 py-3 rounded-lg text-sm font-bold flex items-center gap-2 transition-all ${activeMode === 'review' ? 'bg-emerald-600 text-white shadow-lg' : 'text-gray-400 hover:text-white'}`}
            >
              <MessageSquare className="w-4 h-4" />
              AI Code Review
            </button>
            <button
              onClick={() => setActiveMode('cli')}
              className={`px-6 py-3 rounded-lg text-sm font-bold flex items-center gap-2 transition-all ${activeMode === 'cli' ? 'bg-emerald-600 text-white shadow-lg' : 'text-gray-400 hover:text-white'}`}
            >
              <TerminalIcon className="w-4 h-4" />
              CLI Terminal
            </button>
          </div>
        </div>

        {/* Workspace */}
        <div className="grid lg:grid-cols-12 gap-8 h-[600px]">

          {/* Left Panel (Always Code/Visual) */}
          <div className="lg:col-span-8 rounded-2xl bg-[#0d1117] border border-gray-800 flex flex-col overflow-hidden shadow-2xl relative">
            {activeMode === 'cli' ? (
              <div className="flex-1 flex flex-col p-6 font-mono text-sm relative">
                <div className="absolute inset-0 grid-background opacity-20 pointer-events-none" />
                <div className="flex-1 overflow-y-auto" ref={scrollRef}>
                  {history.map((line, i) => (
                    <div key={i} className={`mb-2 ${line.type === 'cmd' ? 'text-emerald-400' : 'text-gray-300'}`}>
                      {line.type === 'cmd' ? <span><span className="text-emerald-600 mr-2">➜</span>{line.text}</span> : <div className="pl-4 opacity-80">{line.text}</div>}
                    </div>
                  ))}
                </div>
                <form onSubmit={handleCommand} className="flex gap-2 mt-4 relative z-10">
                  <span className="text-emerald-600 font-bold">➜</span>
                  <input type="text" value={input} onChange={e => setInput(e.target.value)} className="flex-1 bg-transparent border-none outline-none text-emerald-400 focus:ring-0" autoFocus placeholder="Type a command..." />
                </form>
              </div>
            ) : (
              <div className="flex-1 flex flex-col relative">
                {/* Editor Chrome */}
                <div className="flex items-center justify-between px-4 py-3 bg-gray-900 border-b border-gray-800">
                  <div className="flex gap-2 text-xs text-gray-500">
                    <span className="text-emerald-400">api/routes/user.js</span>
                  </div>
                  <div className="flex gap-2">
                    <button
                      onClick={runAnalysis}
                      disabled={analyzing}
                      className="px-3 py-1 rounded bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-bold flex items-center gap-2 disabled:opacity-50"
                    >
                      {analyzing ? <Bot className="w-3 h-3 animate-pulse" /> : <Play className="w-3 h-3" />}
                      {analyzing ? 'Analyzing...' : 'Run Analysis'}
                    </button>
                  </div>
                </div>
                {/* Editor Area */}
                <div className="flex-1 p-6 font-mono text-sm leading-6 overflow-auto relative">
                  <textarea
                    value={code}
                    onChange={(e) => setCode(e.target.value)}
                    className="absolute inset-0 w-full h-full bg-transparent text-transparent caret-emerald-500 p-6 z-10 focus:outline-none resize-none leading-6"
                    spellCheck={false}
                  />
                  {/* Syntax Highlighting Mock */}
                  <div className="relative pointer-events-none" aria-hidden="true">
                    {code.split('\n').map((line, i) => (
                      <div key={i} className="flex">
                        <div className="w-8 text-gray-700 select-none text-right pr-4">{i + 1}</div>
                        <div className="pl-2">
                          {/* Simple naive colorization for visual effect */}
                          {line.includes('//') ? <span className="text-gray-500">{line}</span> :
                            line.includes('const') ? <span className="text-purple-400">{line}</span> :
                              line.includes('import') ? <span className="text-blue-400">{line}</span> :
                                <span className="text-gray-300">{line}</span>
                          }
                        </div>
                      </div>
                    ))}
                  </div>

                  {/* Floating Issues Markers */}
                  {analysisResult?.issues.map((issue: any, i: number) => (
                    <div
                      key={i}
                      className="absolute left-10 right-0 bg-rose-500/10 border-l-2 border-rose-500 pointer-events-none"
                      style={{ top: `${(issue.line) * 1.5 + 1.5}rem`, height: '1.5rem' }}
                    />
                  ))}
                </div>
              </div>
            )}
          </div>

          {/* Right Panel (Analysis Output) */}
          <div className={`lg:col-span-4 rounded-2xl border flex flex-col overflow-hidden transition-all duration-500 ${activeMode === 'cli' ? 'border-emerald-500/20 bg-emerald-950/20' : 'border-purple-500/20 bg-purple-950/10'}`}>
            <div className="px-5 py-4 border-b border-gray-800 bg-gray-900/50">
              <h3 className="font-bold text-white flex items-center gap-2">
                {activeMode === 'cli' ? <TerminalIcon className="w-4 h-4 text-emerald-400" /> : <Bot className="w-4 h-4 text-purple-400" />}
                {activeMode === 'cli' ? 'Terminal Output' : 'AI Reviewer'}
              </h3>
            </div>

            <div className="flex-1 p-6 overflow-y-auto">
              {activeMode === 'cli' ? (
                <div className="text-sm text-gray-400 leading-relaxed">
                  <p className="mb-4">Use this terminal to practice running CLI commands.</p>
                  <div className="text-xs font-mono bg-black/40 p-3 rounded border border-gray-800">
                    $ sentinel analyze<br />
                    <span className="text-gray-500">Scanning filesystem...</span>
                  </div>
                </div>
              ) : (
                <div className="space-y-6">
                  {!analysisResult && !analyzing && (
                    <div className="text-center py-10 opacity-50">
                      <Bot className="w-12 h-12 mx-auto mb-4 text-gray-600" />
                      <p className="text-sm">Click "Run Analysis" to let Sentinel review your code.</p>
                    </div>
                  )}

                  {analyzing && (
                    <div className="space-y-4 animate-pulse">
                      <div className="h-4 bg-gray-800 rounded w-3/4" />
                      <div className="h-20 bg-gray-800 rounded" />
                      <div className="h-4 bg-gray-800 rounded w-1/2" />
                    </div>
                  )}

                  {analysisResult && (
                    <div className="animate-fade-in-up">
                      <div className="flex items-center gap-2 mb-4 text-rose-400 font-bold">
                        <ShieldAlert className="w-4 h-4" />
                        <span>Critical Issue Found</span>
                      </div>
                      <div className="p-4 rounded-xl bg-gray-900 border border-white/5 space-y-3">
                        <p className="text-sm text-white font-medium">{analysisResult.issues[0].title}</p>
                        <p className="text-xs text-gray-400">{analysisResult.issues[0].desc}</p>

                        <div className="mt-4 pt-4 border-t border-gray-800">
                          <div className="flex items-center gap-2 mb-2 text-xs font-bold text-emerald-400">
                            <Zap className="w-3.5 h-3.5" />
                            Suggested Fix
                          </div>
                          <code className="block p-2 rounded bg-black text-[10px] font-mono text-emerald-300">
                            {analysisResult.issues[0].fix}
                          </code>
                        </div>
                      </div>
                    </div>
                  )}
                </div>
              )}
            </div>
          </div>

        </div>

      </div>
    </div>
  );
}
