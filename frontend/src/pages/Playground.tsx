import { useState } from 'react';
import {
  Play, Shield, Zap, Search, Bug, Terminal, Activity, FileCode, CheckCircle2, AlertTriangle, ArrowRight
} from 'lucide-react';

const VULNERABLE_CODE_SNIPPET = `const express = require('express');
const db = require('../db');
const router = express.Router();

// Get user by ID
router.get('/profile/:id', async (req, res) => {
  try {
    const { id } = req.params;

    // VULNERABLE: Direct string interpolation in SQL
    const query = \`SELECT * FROM users WHERE id = '\${id}'\`;
    const user = await db.execute(query);

    res.json(user);
  } catch (err) {
    res.status(500).send('Server Error');
  }
});`;

export function Playground() {
  const [activeTab, setActiveTab] = useState('security');
  const [code, setCode] = useState(VULNERABLE_CODE_SNIPPET);
  const [isRunning, setIsRunning] = useState(false);

  return (
    <div className="min-h-screen bg-[var(--color-void)] text-[var(--color-text-primary)] font-body">

      <main className="max-w-7xl mx-auto px-6 py-24">
        {/* Header Section */}
        <div className="text-center mb-12">
          <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-[var(--color-sentinel)]/10 border border-[var(--color-sentinel)]/20 text-[var(--color-sentinel)] text-xs font-bold uppercase tracking-widest mb-4">
            <span className="relative flex h-2 w-2">
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-[var(--color-sentinel)] opacity-75"></span>
              <span className="relative inline-flex rounded-full h-2 w-2 bg-[var(--color-sentinel)]"></span>
            </span>
            Interactive Simulation
          </div>
          <h1 className="text-4xl md:text-6xl font-bold text-[var(--color-text-primary)] mb-4 tracking-tight font-['Syne']">
            Try <span className="text-[var(--color-sentinel)]">Sentinel</span> Live
          </h1>
          <p className="text-[var(--color-text-secondary)] max-w-2xl mx-auto text-lg">
            Experience the world's fastest security analysis engine directly in your browser. Select a profile to start the scan.
          </p>
        </div>

        {/* Analyzer Toolbar */}
        <div className="flex items-center justify-between mb-6 bg-[var(--color-sentinel)]/5 p-2 rounded-lg border border-[var(--color-sentinel)]/10">
          <div className="flex items-center gap-2 overflow-x-auto no-scrollbar">
            {['Security', 'TypeScript', 'Performance', 'React Audit', 'Compliance'].map((tab) => (
              <button
                key={tab}
                onClick={() => setActiveTab(tab.toLowerCase())}
                className={`flex items-center gap-2 px-4 py-2 rounded font-semibold whitespace-nowrap transition-all ${activeTab === tab.toLowerCase()
                  ? 'bg-[var(--color-sentinel)] text-[var(--color-void)]'
                  : 'text-[var(--color-text-secondary)] hover:text-[var(--color-sentinel)] hover:bg-[var(--color-sentinel)]/10'
                  }`}
              >
                {tab === 'Security' && <Shield className="w-4 h-4" />}
                {tab === 'TypeScript' && <FileCode className="w-4 h-4" />}
                {tab === 'Performance' && <Zap className="w-4 h-4" />}
                {tab === 'React Audit' && <Activity className="w-4 h-4" />}
                {tab === 'Compliance' && <CheckCircle2 className="w-4 h-4" />}
                {tab}
              </button>
            ))}
          </div>
          <div className="hidden lg:flex items-center gap-4 px-4 text-xs font-mono text-[var(--color-text-tertiary)]">
            <div className="flex items-center gap-2">
              <span className="w-2 h-2 rounded-full bg-[var(--color-success)] animate-pulse"></span>
              ENGINE: ONLINE
            </div>
            <div className="flex items-center gap-2 border-l border-[var(--color-sentinel)]/20 pl-4">
              DB: V2.4.0-STABLE
            </div>
          </div>
        </div>

        {/* Playground Container */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-px bg-[var(--color-sentinel)]/20 rounded-xl overflow-hidden shadow-2xl shadow-[var(--color-sentinel)]/5 border border-[var(--color-sentinel)]/20 min-h-[600px]">
          {/* Code Editor Side */}
          <div className="bg-[var(--color-obsidian)] flex flex-col">
            <div className="flex items-center justify-between px-4 py-3 border-b border-[var(--color-sentinel)]/10 bg-[var(--color-void)]/50">
              <div className="flex items-center gap-4">
                <div className="flex gap-1.5">
                  <div className="w-3 h-3 rounded-full bg-[var(--color-critical)]/50"></div>
                  <div className="w-3 h-3 rounded-full bg-[var(--color-warning)]/50"></div>
                  <div className="w-3 h-3 rounded-full bg-[var(--color-success)]/50"></div>
                </div>
                <div className="text-xs font-mono text-[var(--color-text-tertiary)] flex items-center gap-2">
                  <FileCode className="w-4 h-4" />
                  server/routes/users.js
                </div>
              </div>
              <div className="text-[10px] font-bold text-[var(--color-sentinel)] px-2 py-0.5 border border-[var(--color-sentinel)]/30 rounded font-mono">
                JS/EXPRESS
              </div>
            </div>
            <div className="flex-1 overflow-auto p-4 font-mono text-sm leading-relaxed relative">
              <textarea
                value={code}
                onChange={(e) => setCode(e.target.value)}
                className="w-full h-full bg-transparent text-[var(--color-text-secondary)] resize-none outline-none font-mono"
                spellCheck={false}
              />
              {/* Decorative highlights matching the vulnerable lines in snippet */}
              <div className="absolute top-[188px] left-0 w-full h-[64px] bg-[var(--color-critical)]/10 border-l-2 border-[var(--color-critical)] pointer-events-none"></div>
            </div>
          </div>

          {/* Terminal Side */}
          <div className="bg-[var(--color-void)] flex flex-col">
            <div className="flex items-center justify-between px-4 py-3 border-b border-[var(--color-sentinel)]/10 bg-[var(--color-void)]/80">
              <div className="text-xs font-mono text-[var(--color-text-tertiary)] flex items-center gap-2">
                <Terminal className="w-4 h-4" />
                sentinel --interactive
              </div>
              <div className="flex gap-2">
                <div className="w-4 h-4 rounded-full border border-[var(--color-carbon)]"></div>
                <div className="w-4 h-4 rounded-full border border-[var(--color-carbon)]"></div>
              </div>
            </div>
            <div className="flex-1 overflow-auto p-6 font-mono text-sm">
              <div className="mb-4">
                <span className="text-[var(--color-sentinel)] font-bold">sentinel@playground:~$</span> <span className="text-[var(--color-text-primary)]">sentinel scan --profile security</span>
              </div>
              <div className="space-y-2">
                <div className="text-[var(--color-text-tertiary)] flex items-center gap-2">
                  <Activity className="w-3 h-3" /> Initializing Sentinel Engine v4.2.1...
                </div>
                <div className="text-[var(--color-text-tertiary)] flex items-center gap-2">
                  <Search className="w-3 h-3 text-[var(--color-info)]" /> Indexing 42 source files...
                </div>
                <div className="text-[var(--color-text-tertiary)] flex items-center gap-2">
                  <Zap className="w-3 h-3 text-[var(--color-info)]" /> Performing Semantic Analysis...
                </div>

                <div className="mt-6 pt-4 border-t border-[var(--color-sentinel)]/10">
                  <div className="text-[var(--color-critical)] font-bold flex items-center gap-2">
                    <AlertTriangle className="w-4 h-4" /> CRITICAL VULNERABILITY FOUND
                  </div>
                  <div className="pl-6 mt-2 space-y-1">
                    <div className="text-[var(--color-text-secondary)]"><span className="text-[var(--color-text-tertiary)]">ID:</span> SNT-042-SQLI</div>
                    <div className="text-[var(--color-text-secondary)]"><span className="text-[var(--color-text-tertiary)]">Type:</span> SQL Injection</div>
                    <div className="text-[var(--color-text-secondary)]"><span className="text-[var(--color-text-tertiary)]">Location:</span> server/routes/users.js:14</div>
                    <div className="text-[var(--color-text-tertiary)] mt-2 bg-[var(--color-critical)]/5 border-l-2 border-[var(--color-critical)] p-2 italic text-xs">
                      "User input from 'req.params.id' is directly concatenated into a SQL string. An attacker can manipulate the query logic."
                    </div>
                  </div>
                </div>

                <div className="mt-6">
                  <div className="text-[var(--color-sentinel)] font-bold flex items-center gap-2">
                    <Zap className="w-4 h-4" /> SUGGESTED FIX (Auto-Apply Available)
                  </div>
                  <div className="pl-6 mt-2">
                    <div className="text-[var(--color-text-tertiary)] mb-1 text-xs">Replace line 14 with:</div>
                    <div className="bg-[var(--color-sentinel)]/5 p-2 rounded text-[var(--color-sentinel)] border border-[var(--color-sentinel)]/10 text-xs">
                      const user = await db.execute('SELECT * FROM users WHERE id = ?', [id]);
                    </div>
                  </div>
                </div>

                <div className="mt-4 flex items-center gap-2 text-[var(--color-text-secondary)]">
                  <span>sentinel@playground:~$</span>
                  <span className="w-2 h-4 bg-[var(--color-sentinel)] animate-pulse"></span>
                </div>
              </div>
            </div>

            {/* Terminal Input */}
            <div className="p-4 bg-[var(--color-void)]/50 border-t border-[var(--color-sentinel)]/10 flex items-center gap-3">
              <ArrowRight className="w-4 h-4 text-[var(--color-sentinel)]" />
              <input
                className="bg-transparent border-none focus:ring-0 text-[var(--color-text-secondary)] font-mono text-sm w-full outline-none placeholder:text-[var(--color-text-tertiary)]"
                placeholder="Type a command (e.g., 'sentinel fix')"
                readOnly
                type="text"
              />
              <button className="bg-[var(--color-sentinel)]/20 text-[var(--color-sentinel)] border border-[var(--color-sentinel)]/40 px-3 py-1 rounded-md text-xs font-bold hover:bg-[var(--color-sentinel)]/30 transition-all cursor-pointer">
                RUN COMMAND
              </button>
            </div>
          </div>
        </div>

        {/* Features Grid */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-8 mt-24">
          <div className="p-6 rounded-xl bg-[var(--color-sentinel)]/5 border border-[var(--color-sentinel)]/10">
            <div className="w-12 h-12 bg-[var(--color-sentinel)]/10 rounded-lg flex items-center justify-center mb-4">
              <Zap className="text-[var(--color-sentinel)] w-6 h-6" />
            </div>
            <h3 className="text-xl font-bold mb-2 text-[var(--color-text-primary)] font-['Syne']">Zero-Wait Analysis</h3>
            <p className="text-[var(--color-text-secondary)]">Sentinel scans your codebase in milliseconds, providing instant feedback as you type or commit.</p>
          </div>
          <div className="p-6 rounded-xl bg-[var(--color-sentinel)]/5 border border-[var(--color-sentinel)]/10">
            <div className="w-12 h-12 bg-[var(--color-sentinel)]/10 rounded-lg flex items-center justify-center mb-4">
              <Activity className="text-[var(--color-sentinel)] w-6 h-6" />
            </div>
            <h3 className="text-xl font-bold mb-2 text-[var(--color-text-primary)] font-['Syne']">Context-Aware AI</h3>
            <p className="text-[var(--color-text-secondary)]">Our engine understands the semantics of your code, reducing false positives by over 85%.</p>
          </div>
          <div className="p-6 rounded-xl bg-[var(--color-sentinel)]/5 border border-[var(--color-sentinel)]/10">
            <div className="w-12 h-12 bg-[var(--color-sentinel)]/10 rounded-lg flex items-center justify-center mb-4">
              <Bug className="text-[var(--color-sentinel)] w-6 h-6" />
            </div>
            <h3 className="text-xl font-bold mb-2 text-[var(--color-text-primary)] font-['Syne']">Auto-Remediation</h3>
            <p className="text-[var(--color-text-secondary)]">Don't just find bugs—fix them. Sentinel generates and can auto-apply secure code patches.</p>
          </div>
        </div>

        {/* CTA Section */}
        <section className="mt-32 mb-20 text-center relative overflow-hidden rounded-3xl bg-[var(--color-sentinel)]/5 p-12 border border-[var(--color-sentinel)]/20">
          <div className="absolute inset-0 opacity-10 pointer-events-none">
            <div className="absolute -top-24 -left-24 w-96 h-96 bg-[var(--color-sentinel)] rounded-full blur-[120px]"></div>
            <div className="absolute -bottom-24 -right-24 w-96 h-96 bg-[var(--color-sentinel)] rounded-full blur-[120px]"></div>
          </div>
          <h2 className="text-3xl md:text-5xl font-bold mb-6 text-[var(--color-text-primary)] font-['Syne']">Secure your code today.</h2>
          <p className="text-[var(--color-text-secondary)] max-w-xl mx-auto mb-10 text-lg">
            Join 50,000+ developers who use Sentinel to ship secure code faster. Free for open source and individuals.
          </p>
          <div className="flex flex-col sm:flex-row items-center justify-center gap-4">
            <button className="bg-[var(--color-sentinel)] text-[var(--color-void)] font-bold px-8 py-4 rounded-lg text-lg hover:scale-105 transition-transform flex items-center gap-2 cursor-pointer">
              Start Free Trial
              <ArrowRight className="w-5 h-5" />
            </button>
            <button className="bg-[var(--color-void)] text-[var(--color-text-primary)] border border-[var(--color-sentinel)]/20 font-bold px-8 py-4 rounded-lg text-lg hover:bg-[var(--color-sentinel)]/10 transition-colors cursor-pointer">
              View Demo on GitHub
            </button>
          </div>
        </section>

      </main>
    </div>
  );
}
