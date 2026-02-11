import { useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import {
    Shield, Terminal, Github, ArrowRight, Zap, Lock, Bot,
    FileCode, CheckCircle2, AlertTriangle, XCircle, GitBranch,
    Cpu, Globe, Layers, Eye, ShieldCheck, Sparkles, ChevronRight,
    Play, ExternalLink, Code2, Fingerprint, Cpu as Chip,
    Key, Package, Cloud, Scale, RefreshCw, MessageSquare, ThumbsUp, Check
} from 'lucide-react';
import { FeatureCard } from '../components/FeatureCard';
import { TerminalMock } from '../components/TerminalMock';

// Mapped from stitch/sentinel_cli_home_page/code.html
const features = [
    {
        icon: Zap,
        title: 'Automated Fixes',
        description: "Don't just find bugs, fix them. Sentinel generates one-click remediation pull requests automatically.",
        color: 'sentinel',
    },
    {
        icon: RefreshCw,
        title: 'CI/CD Integration',
        description: 'Native plugins for GitHub Actions, GitLab CI, and Jenkins. Block insecure merges before they happen.',
        color: 'scan',
    },
    {
        icon: Scale,
        title: 'Custom Rule Engine',
        description: 'Write your own security policies using a simple YAML-based syntax tailored to your architecture.',
        color: 'sentinel',
    },
    {
        icon: Key,
        title: 'Secret Scanning',
        description: 'High-entropy scan for over 400 types of credentials, API keys, and certificates in your codebase.',
        color: 'critical',
    },
    {
        icon: Package,
        title: 'Dependency Audit',
        description: 'Continuously monitor third-party packages for known CVEs and license compliance issues.',
        color: 'warning',
    },
    {
        icon: Cloud,
        title: 'IaC Protection',
        description: 'Scan Terraform, CloudFormation, and Kubernetes manifests for infrastructure misconfigurations.',
        color: 'info',
    },
];

const stats = [
    { value: '13+', label: 'Analyzers Integrated' },
    { value: '50ms', label: 'Average Scan Time' },
    { value: '0', label: 'False Positives' },
    { value: '10k+', label: 'GitHub Stars' },
];

const tagCloud = [
    "Semgrep", "TruffleHog", "Snyk", "Bandit", "Gitleaks",
    "SonarQube", "Checkmarx", "OWASP ZAP", "Brakeman",
    "MobSF", "Terrascan", "Hadolint", "Horusec"
];

function RadarSweep() {
    return (
        <div className="relative w-full max-w-[500px] aspect-square rounded-full border border-[var(--color-sentinel)]/10 flex items-center justify-center">
            {/* Concentric Circles */}
            <div className="absolute w-[80%] h-[80%] rounded-full border border-[var(--color-sentinel)]/10"></div>
            <div className="absolute w-[60%] h-[60%] rounded-full border border-[var(--color-sentinel)]/10"></div>
            <div className="absolute w-[40%] h-[40%] rounded-full border border-[var(--color-sentinel)]/10"></div>

            {/* The Sweep */}
            <div className="absolute inset-0 rounded-full animate-[radar-sweep_4s_linear_infinite]"
                style={{ background: 'conic-gradient(from 0deg, rgba(10, 194, 163, 0.4) 0%, transparent 25%)' }}></div>

            {/* Pulsing Dots */}
            <div className="absolute top-[25%] left-[35%] w-3 h-3 bg-[var(--color-critical)] rounded-full animate-pulse shadow-[0_0_15px_var(--color-critical)]"></div>
            <div className="absolute bottom-[30%] right-[25%] w-2 h-2 bg-[var(--color-sentinel)] rounded-full animate-pulse shadow-[0_0_15px_rgba(10,194,163,0.8)]" style={{ animationDelay: '0.5s' }}></div>
            <div className="absolute top-[60%] left-[20%] w-2 h-2 bg-[var(--color-sentinel)] rounded-full animate-pulse" style={{ animationDelay: '1.2s' }}></div>
            <div className="absolute top-[40%] right-[40%] w-4 h-4 bg-[var(--color-critical)] rounded-full animate-pulse shadow-[0_0_20px_var(--color-critical)]" style={{ animationDelay: '0.8s' }}></div>

            {/* Center Piece */}
            <div className="z-20 w-16 h-16 bg-[var(--color-void)] border-2 border-[var(--color-sentinel)] rounded-lg flex items-center justify-center rotate-45">
                <Shield className="w-8 h-8 text-[var(--color-sentinel)] -rotate-45" />
            </div>
        </div>
    );
}

function PRCommentPreview() {
    return (
        <div className="bg-[var(--color-obsidian)] border border-[var(--color-carbon)] rounded-xl overflow-hidden shadow-2xl">
            <div className="bg-[var(--color-carbon)] px-6 py-4 flex items-center justify-between border-b border-[var(--color-sentinel)]/10">
                <div className="flex items-center gap-3">
                    <div className="w-8 h-8 rounded bg-[var(--color-sentinel)] flex items-center justify-center text-[var(--color-void)]">
                        <Shield className="w-4 h-4" />
                    </div>
                    <span className="font-bold text-sm text-[var(--color-text-primary)]">sentinel-bot <span className="text-[var(--color-text-tertiary)] font-normal">commented 2 minutes ago</span></span>
                </div>
                <span className="bg-[var(--color-sentinel)]/20 text-[var(--color-sentinel)] text-[10px] uppercase font-black px-2 py-0.5 rounded">Security Check</span>
            </div>
            <div className="p-6">
                <p className="mb-4 text-sm font-semibold text-[var(--color-critical)] flex items-center gap-2">
                    <AlertTriangle className="w-4 h-4" />
                    High Vulnerability Detected: SQL Injection
                </p>
                <p className="text-[var(--color-text-secondary)] text-sm mb-6">
                    The user input in <code className="bg-[var(--color-carbon)] px-1 rounded text-[var(--color-text-primary)]">query_params</code> is being concatenated directly into a SQL statement. This allows attackers to bypass authentication.
                </p>
                {/* Diff View */}
                <div className="rounded-lg border border-[var(--color-sentinel)]/10 overflow-hidden font-mono text-xs">
                    <div className="bg-[var(--color-carbon)] px-4 py-2 text-[var(--color-text-secondary)] border-b border-[var(--color-sentinel)]/10">
                        src/services/auth.py
                    </div>
                    <div className="p-0">
                        <div className="bg-[var(--color-critical)]/10 text-[var(--color-critical)] px-4 py-1 flex">
                            <span className="w-6 opacity-50">-</span>
                            <span>cursor.execute(f"SELECT * FROM users WHERE id = {'{user_id}'}")</span>
                        </div>
                        <div className="bg-[var(--color-secure)]/10 text-[var(--color-secure)] px-4 py-1 flex">
                            <span className="w-6 opacity-50">+</span>
                            <span>cursor.execute("SELECT * FROM users WHERE id = %s", (user_id,))</span>
                        </div>
                    </div>
                </div>
                <div className="mt-8 flex gap-3">
                    <button className="bg-[var(--color-sentinel)] text-[var(--color-void)] text-xs font-bold px-4 py-2 rounded shadow-lg hover:brightness-110 transition-all cursor-pointer">Apply Fix</button>
                    <button className="text-[var(--color-text-tertiary)] text-xs font-bold px-4 py-2 hover:text-[var(--color-text-secondary)] transition-all cursor-pointer">Dismiss</button>
                </div>
            </div>
        </div>
    );
}

export function Home() {
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
            { threshold: 0.1, rootMargin: '0px 0px -50px 0px' }
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
        <main className="relative overflow-hidden bg-[var(--color-void)] min-h-screen font-body">
            <div className="noise-overlay" />

            {/* Hero Section */}
            <section className="relative pt-20 pb-32 overflow-hidden">
                <div className="max-w-7xl mx-auto px-6 grid lg:grid-cols-2 gap-16 items-center">
                    {/* Hero Content */}
                    <div className="z-10 reveal" ref={addToRefs}>
                        <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full border border-[var(--color-sentinel)]/30 bg-[var(--color-sentinel)]/5 text-[var(--color-sentinel)] text-xs font-bold tracking-widest uppercase mb-6">
                            <span className="relative flex h-2 w-2">
                                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-[var(--color-sentinel)] opacity-75"></span>
                                <span className="relative inline-flex rounded-full h-2 w-2 bg-[var(--color-sentinel)]"></span>
                            </span>
                            AI-Powered Code Guardian
                        </div>
                        <h1 className="font-['Syne'] text-6xl md:text-7xl leading-tight mb-6 text-[var(--color-text-primary)]">
                            Your AI Security <br />
                            <span className="text-[var(--color-sentinel)]">Pair Programmer</span>
                        </h1>
                        <p className="text-xl text-[var(--color-text-secondary)] max-w-xl mb-10 leading-relaxed">
                            Sentinel CLI scans your code in real-time, detecting vulnerabilities before they reach production. Automated fixes meet enterprise-grade security.
                        </p>
                        <div className="flex flex-wrap gap-4 mb-12">
                            <Link to="/docs" className="bg-[var(--color-sentinel)] text-[var(--color-void)] font-bold px-8 py-4 rounded-lg hover:shadow-[0_0_30px_rgba(10,194,163,0.4)] transition-all inline-flex items-center justify-center">
                                Get Started Free
                            </Link>
                            <a href="https://github.com/KunjShah95/SENTINEL-CLI" target="_blank" rel="noopener noreferrer" className="border border-[var(--color-carbon)] text-[var(--color-text-secondary)] hover:border-[var(--color-sentinel)] hover:text-[var(--color-text-primary)] px-8 py-4 rounded-lg font-bold transition-all flex items-center gap-2">
                                <Github className="w-5 h-5" />
                                View on GitHub
                            </a>
                        </div>
                        {/* Tag Cloud */}
                        <div className="flex flex-wrap gap-2 max-w-xl">
                            {tagCloud.map((tag, i) => (
                                <span key={i} className="px-3 py-1 border border-[var(--color-sentinel)]/20 rounded bg-[var(--color-sentinel)]/5 text-xs text-[var(--color-text-tertiary)]">
                                    {tag}
                                </span>
                            ))}
                        </div>
                    </div>
                    {/* Radar Visualization */}
                    <div className="relative flex justify-center items-center reveal" ref={addToRefs}>
                        <RadarSweep />
                    </div>
                </div>
            </section>

            {/* Stats Bar */}
            <section className="max-w-7xl mx-auto px-6 mb-32 reveal" ref={addToRefs}>
                <div className="grid grid-cols-2 lg:grid-cols-4 gap-6">
                    {stats.map((stat, i) => (
                        <div key={i} className="p-8 rounded-xl bg-[var(--color-sentinel)]/5 border border-[var(--color-sentinel)]/10 backdrop-blur-sm group hover:bg-[var(--color-sentinel)]/10 transition-colors">
                            <div className="text-4xl font-['Syne'] bg-gradient-to-br from-[var(--color-sentinel)] to-emerald-400 bg-clip-text text-transparent mb-2">
                                {stat.value}
                            </div>
                            <div className="text-[var(--color-text-tertiary)] uppercase tracking-widest text-xs font-bold">
                                {stat.label}
                            </div>
                        </div>
                    ))}
                </div>
            </section>

            {/* Terminal Demo */}
            {/* Added a relative container with z-10 ensures it sits above any absolute bg elements if any */}
            <section className="max-w-4xl mx-auto px-6 mb-32 reveal z-10 relative" ref={addToRefs}>
                <TerminalMock />
            </section>

            {/* Feature Grid */}
            <section className="max-w-7xl mx-auto px-6 mb-32">
                <div className="text-center mb-16 reveal" ref={addToRefs}>
                    <h2 className="font-['Syne'] text-4xl mb-4 text-[var(--color-text-primary)]">Engineered for DevSecOps</h2>
                    <div className="w-24 h-1 bg-[var(--color-sentinel)] mx-auto"></div>
                </div>
                <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-8">
                    {features.map((feature, index) => (
                        <div key={index} className="reveal relative z-10" ref={addToRefs}>
                            <FeatureCard
                                icon={feature.icon}
                                title={feature.title}
                                description={feature.description}
                                color={feature.color}
                            />
                        </div>
                    ))}
                </div>
            </section>

            {/* PR Comment Preview */}
            <section className="max-w-5xl mx-auto px-6 mb-32 reveal" ref={addToRefs}>
                <PRCommentPreview />
                <div className="mt-6 text-center text-[var(--color-text-tertiary)] text-sm italic">
                    Integrating directly into your GitHub workflow for zero-friction security.
                </div>
            </section>

            {/* CTA Section */}
            <section className="max-w-7xl mx-auto px-6 mb-32 reveal" ref={addToRefs}>
                <div className="bg-gradient-to-r from-[var(--color-sentinel)] to-emerald-600 rounded-3xl p-12 md:p-20 relative overflow-hidden text-center">
                    <div className="absolute inset-0 opacity-10" style={{ backgroundImage: 'radial-gradient(circle at 2px 2px, white 1px, transparent 0)', backgroundSize: '30px 30px' }}></div>
                    <div className="relative z-10">
                        <h2 className="font-['Syne'] text-4xl md:text-6xl text-[var(--color-void)] mb-8">
                            Ready to secure <br className="hidden md:block" /> your pipeline?
                        </h2>
                        <div className="flex flex-col sm:flex-row justify-center gap-4">
                            <Link to="/docs" className="bg-[var(--color-void)] text-[var(--color-text-primary)] font-bold px-10 py-5 rounded-xl hover:scale-105 transition-transform cursor-pointer inline-flex items-center justify-center">
                                Get Started for Free
                            </Link>
                            <Link to="/contact" className="bg-transparent border-2 border-[var(--color-void)]/20 text-[var(--color-void)] font-bold px-10 py-5 rounded-xl hover:bg-[var(--color-void)]/5 transition-colors cursor-pointer inline-flex items-center justify-center">
                                Book a Demo
                            </Link>
                        </div>
                        <p className="mt-8 text-[var(--color-void)]/60 text-sm font-medium uppercase tracking-tighter">
                            No credit card required • Unlimited scans for Open Source
                        </p>
                    </div>
                </div>
            </section>
        </main>
    );
}
