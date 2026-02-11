import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import {
    Share2, MessageCircle, Github, ArrowRight, Calendar, Clock, CheckCircle2, Copy, Twitter, Bell
} from 'lucide-react';



export function Article() {
    const [activeSection, setActiveSection] = useState('intro');

    // Simple scroll spy setup (optional, but good for sticky TOC)
    useEffect(() => {
        const handleScroll = () => {
            // Logic to update activeSection based on scroll position could go here
        };
        window.addEventListener('scroll', handleScroll);
        return () => window.removeEventListener('scroll', handleScroll);
    }, []);

    return (
        <div className="min-h-screen bg-[var(--color-void)] text-[var(--color-text-primary)] font-body selection:bg-[var(--color-sentinel)]/30 selection:text-[var(--color-sentinel)]">
            {/* Progress Bar (Static for now or use scroll listener) */}
            <div className="fixed top-0 left-0 w-full h-1 z-50 bg-[var(--color-obsidian)]/50">
                <div className="h-full bg-[var(--color-sentinel)]" style={{ width: '35%' }}></div>
            </div>

            {/* Hero Section */}
            <header className="relative w-full h-[70vh] flex items-end overflow-hidden">
                <div className="absolute inset-0 z-0">
                    <img
                        src="https://lh3.googleusercontent.com/aida-public/AB6AXuChvkKv3DDh7GpaIBULo1fjbN598H_pW6aXIECBlmuvF_UQYFd9C715MRb2icoTtIc0ik0-cV4WUR3wwxpMyV47ZHUuwwOtrKohQj7kLZwXDwV-NJQCGuRK34X-RciUyO-0MbCw8hMn3kftn0p6zRbbKWpwh2Asm6Ie48vQh6DVMiIxZzAeRyRKpYdRhWV4wJQZ5NiOBh1NfA280WnzOB4ltgEnh3Zuzz4O08Uevt83TBpUG5QEwsdMzbMaXcBgXbV_mwSNrns0GIU"
                        alt="Server room"
                        className="w-full h-full object-cover"
                    />
                    <div className="absolute inset-0 bg-gradient-to-t from-[var(--color-void)] via-[var(--color-void)]/60 to-transparent"></div>
                    <div className="absolute inset-0 bg-[linear-gradient(to_bottom,transparent_50%,rgba(10,194,163,0.05)_50%)] bg-[size:100%_4px] opacity-40"></div>
                    <div className="absolute inset-0 bg-[var(--color-sentinel)]/10 mix-blend-overlay"></div>
                </div>

                <div className="relative z-10 max-w-7xl mx-auto px-6 pb-16 w-full">
                    <div className="max-w-4xl">
                        <div className="flex flex-wrap items-center gap-4 mb-6 text-sm font-mono uppercase tracking-[0.2em] text-[var(--color-sentinel)]">
                            <span className="px-2 py-0.5 border border-[var(--color-sentinel)]/30 bg-[var(--color-sentinel)]/5 rounded">Cyber-Security</span>
                            <span>March 15, 2024</span>
                            <span className="flex items-center gap-1"><Clock className="w-4 h-4" /> 5 MIN READ</span>
                        </div>
                        <h1 className="text-5xl md:text-7xl font-bold leading-tight tracking-tighter mb-8 text-[var(--color-text-primary)] font-['Syne']">
                            Automating Security <br />
                            <span className="text-transparent bg-clip-text bg-gradient-to-r from-[var(--color-sentinel)] to-emerald-400 italic">Fixes with AI</span>
                        </h1>
                        <div className="flex items-center gap-4">
                            <img
                                src="https://lh3.googleusercontent.com/aida-public/AB6AXuC7A8rGuNjoHE5fdHCVBz6akgwIXjyvP-as_h_4X4yyg_dZGdIGoH_zE1-0zasfU6BQKMTdW7waWn89nchE-5z5xPNCLhinlEX1KJ2exYUrLA41TWrT8oB2IAytwEcEZZBjvg_MvUDRbjCUwFb6yU6j-ojn-NrQ_xnN5hQH3_MA0_O6VDyTe0bpQWC3tsGbU6PiE5YKHcGh6XDPwDrOJvGByBeJIVhm7F9ToUNNuklhSPwspPgRPOREit5sNNGJZ0URmHAeDWqsOyo"
                                alt="Author"
                                className="w-12 h-12 rounded-full border border-[var(--color-sentinel)]/40 object-cover"
                            />
                            <div>
                                <p className="text-[var(--color-text-primary)] font-bold">Sarah Chen</p>
                                <p className="text-[var(--color-text-secondary)] text-sm">Lead Security Engineer @ Sentinel</p>
                            </div>
                        </div>
                    </div>
                </div>
            </header>

            <main className="bg-[radial-gradient(circle_at_1px_1px,var(--color-sentinel-muted)_1px,transparent_0)] bg-[size:40px_40px] min-h-screen">
                <div className="max-w-7xl mx-auto px-6 py-20 flex flex-col lg:flex-row gap-16">

                    {/* Sidebar Left (TOC) */}
                    <aside className="hidden lg:block w-64 shrink-0">
                        <div className="sticky top-24 space-y-8">
                            <div>
                                <h4 className="text-xs font-mono uppercase tracking-[0.3em] text-[var(--color-sentinel)]/60 mb-6">Table of Contents</h4>
                                <nav className="space-y-4 border-l border-[var(--color-sentinel)]/10">
                                    {['Overview', 'The Scaling Challenge', 'AI Remediation Logic', 'CLI Implementation', 'The Future'].map((item, i) => (
                                        <a
                                            key={i}
                                            href={`#${item.toLowerCase().replace(/ /g, '-')}`}
                                            className="block pl-4 py-1 text-[var(--color-text-tertiary)] hover:text-[var(--color-sentinel)] hover:border-l-2 hover:border-[var(--color-sentinel)]/50 -ml-[2px] transition-all cursor-pointer"
                                        >
                                            {item}
                                        </a>
                                    ))}
                                </nav>
                            </div>
                            <div className="pt-8 border-t border-[var(--color-sentinel)]/10">
                                <h4 className="text-xs font-mono uppercase tracking-[0.3em] text-[var(--color-sentinel)]/60 mb-6">Spread the word</h4>
                                <div className="flex flex-col gap-4">
                                    <button
                                        onClick={() => {
                                            navigator.clipboard.writeText(window.location.href);
                                            alert('Link copied to clipboard!');
                                        }}
                                        className="flex items-center gap-3 text-[var(--color-text-tertiary)] hover:text-[var(--color-sentinel)] transition-colors text-sm font-medium cursor-pointer"
                                    >
                                        <Copy className="w-5 h-5" /> Copy Link
                                    </button>
                                    <a
                                        href="https://twitter.com/intent/tweet?text=Check out this article on AI security!"
                                        target="_blank"
                                        rel="noopener noreferrer"
                                        className="flex items-center gap-3 text-[var(--color-text-tertiary)] hover:text-[var(--color-sentinel)] transition-colors text-sm font-medium cursor-pointer"
                                    >
                                        <Twitter className="w-5 h-5" /> Twitter (X)
                                    </a>
                                    <a
                                        href="https://github.com/KunjShah95/SENTINEL-CLI"
                                        target="_blank"
                                        rel="noopener noreferrer"
                                        className="flex items-center gap-3 text-[var(--color-text-tertiary)] hover:text-[var(--color-sentinel)] transition-colors text-sm font-medium cursor-pointer"
                                    >
                                        <Github className="w-5 h-5" /> GitHub Repo
                                    </a>
                                </div>
                            </div>
                        </div>
                    </aside>

                    {/* Content Area */}
                    <article className="flex-1 max-w-[65ch] mx-auto">
                        <section id="overview" className="mb-12">
                            <p className="text-xl text-[var(--color-text-secondary)] font-light leading-relaxed mb-12">
                                In the modern CI/CD landscape, security is no longer a luxury—it's a fundamental requirement. However, as codebases grow exponentially, manual security patching has become the primary bottleneck for engineering velocity.
                            </p>
                            <h2 className="text-3xl font-bold text-[var(--color-text-primary)] mb-6 font-['Syne']">The Industrial Shift in Security</h2>
                            <p className="text-[var(--color-text-secondary)] leading-relaxed mb-6">
                                Traditionally, security analysts would review a static analysis report, triage the findings, and manually open pull requests with fixes. For a repository with a million lines of code, this process is akin to trying to empty the ocean with a teaspoon. Enter the era of AI-powered remediation.
                            </p>
                        </section>

                        <blockquote className="my-12 py-8 px-10 border-l-4 border-[var(--color-sentinel)] bg-[var(--color-sentinel)]/5 rounded-r-xl">
                            <p className="text-2xl font-display italic font-light text-[var(--color-sentinel)] leading-snug font-['Syne']">
                                "The goal isn't just to find vulnerabilities faster, but to eliminate them before they even reach a developer's local staging environment."
                            </p>
                            <cite className="block mt-4 text-sm font-mono uppercase tracking-widest text-[var(--color-sentinel)]/60">— Sentinel Engineering Manifesto</cite>
                        </blockquote>

                        <section id="the-scaling-challenge" className="mb-12">
                            <h3 className="text-2xl font-bold text-[var(--color-text-primary)] mb-4 font-['Syne']">Core Security Checklist</h3>
                            <ul className="space-y-4 mb-10">
                                {[
                                    "Automated identification of OWASP Top 10 vulnerabilities.",
                                    "Context-aware patch generation based on local styling.",
                                    "Verification of fixes through isolated unit tests."
                                ].map((item, i) => (
                                    <li key={i} className="flex items-start gap-3 text-[var(--color-text-secondary)]">
                                        <CheckCircle2 className="text-[var(--color-sentinel)] w-5 h-5 mt-1 shrink-0" />
                                        <span>{item}</span>
                                    </li>
                                ))}
                            </ul>
                        </section>

                        <section id="cli-implementation" className="mb-12">
                            <h3 className="text-2xl font-bold text-[var(--color-text-primary)] mb-6 font-['Syne']">Implementation via CLI</h3>
                            <p className="text-[var(--color-text-secondary)] leading-relaxed mb-6">
                                The Sentinel CLI leverages a fine-tuned LLM that understands code semantics. Here's how you can trigger an automated fix scan using the latest stable release:
                            </p>

                            <div className="my-8 rounded-lg overflow-hidden border border-[var(--color-sentinel)]/20 bg-[var(--color-void)] shadow-2xl">
                                <div className="bg-[var(--color-sentinel)]/10 px-4 py-2 flex items-center justify-between border-b border-[var(--color-sentinel)]/20">
                                    <div className="flex gap-1.5">
                                        <div className="w-2.5 h-2.5 rounded-full bg-[var(--color-critical)]/50"></div>
                                        <div className="w-2.5 h-2.5 rounded-full bg-[var(--color-warning)]/50"></div>
                                        <div className="w-2.5 h-2.5 rounded-full bg-[var(--color-success)]/50"></div>
                                    </div>
                                    <span className="text-[10px] font-mono text-[var(--color-sentinel)]/60 uppercase tracking-widest">bash — sentinel fix --auto</span>
                                </div>
                                <div className="p-6 font-mono text-sm leading-relaxed overflow-x-auto text-[var(--color-text-secondary)]">
                                    <div className="flex gap-4 mb-2">
                                        <span className="text-[var(--color-sentinel)]/40 select-none">1</span>
                                        <code><span className="text-[var(--color-sentinel)]">$</span> sentinel scan --dir ./src --format sarif</code>
                                    </div>
                                    <div className="flex gap-4 mb-2">
                                        <span className="text-[var(--color-sentinel)]/40 select-none">2</span>
                                        <code><span className="text-[var(--color-sentinel)]">#</span> Analyzing dependencies and code paths...</code>
                                    </div>
                                    <div className="flex gap-4 mb-2">
                                        <span className="text-[var(--color-sentinel)]/40 select-none">3</span>
                                        <code><span className="text-[var(--color-sentinel)]">$</span> sentinel fix --id SQL-INJECTION-01 --verify</code>
                                    </div>
                                    <div className="flex gap-4 mb-2">
                                        <span className="text-[var(--color-sentinel)]/40 select-none">4</span>
                                        <code>...</code>
                                    </div>
                                    <div className="flex gap-4">
                                        <span className="text-[var(--color-sentinel)]/40 select-none">5</span>
                                        <code className="text-[var(--color-success)]">[SUCCESS] Patch applied and verified via 12 tests.</code>
                                    </div>
                                </div>
                            </div>

                            <p className="text-[var(--color-text-secondary)] leading-relaxed">
                                By integrating this directly into your GitHub Actions or GitLab CI, every pull request can be automatically scrutinized and fixed before it even hits a human reviewer's desk.
                            </p>
                        </section>

                        <div className="my-16 flex justify-center">
                            <div className="w-24 h-px bg-gradient-to-r from-transparent via-[var(--color-sentinel)]/30 to-transparent"></div>
                        </div>

                        {/* Tags */}
                        <div className="flex flex-wrap gap-3 mb-20">
                            {['Automation', 'AI/ML', 'Cybersecurity'].map(tag => (
                                <span key={tag} className="px-4 py-1.5 bg-[var(--color-obsidian)] border border-[var(--color-sentinel)]/20 rounded text-xs font-mono text-[var(--color-text-tertiary)] hover:text-[var(--color-sentinel)] hover:border-[var(--color-sentinel)] transition-all uppercase tracking-widest cursor-pointer">
                                    {tag}
                                </span>
                            ))}
                        </div>
                    </article>

                </div>
            </main>

            {/* Related Articles */}
            <section className="bg-[var(--color-obsidian)]/50 py-24 border-t border-[var(--color-sentinel)]/10">
                <div className="max-w-7xl mx-auto px-6">
                    <div className="flex justify-between items-end mb-12">
                        <div>
                            <h2 className="text-3xl font-bold text-[var(--color-text-primary)] mb-2 font-['Syne']">Continue Reading</h2>
                            <p className="text-[var(--color-text-secondary)]">Expand your security knowledge with our latest research.</p>
                        </div>
                        <Link to="/blog" className="text-[var(--color-sentinel)] font-bold flex items-center gap-2 hover:gap-3 transition-all cursor-pointer text-sm tracking-widest uppercase">
                            View All Articles <ArrowRight className="w-4 h-4" />
                        </Link>
                    </div>
                    <div className="grid md:grid-cols-2 gap-8">
                        {/* Card 1 */}
                        <div className="group bg-[var(--color-void)] border border-[var(--color-sentinel)]/10 rounded-xl overflow-hidden hover:border-[var(--color-sentinel)]/40 transition-all cursor-pointer">
                            <div className="h-48 overflow-hidden">
                                <img
                                    src="https://lh3.googleusercontent.com/aida-public/AB6AXuCJweD1LAj2Ihkk0g7EfnX6ipQ5iFqO5TzLxhXfalyDXa4yJoBESc-OTVz6SPdnVhMKXj4gbIV7fVEbjE8cWRxIdpcE5ZG3Z0dM81BZdfdze85tA5ElYHsLqsNjsXDIfV3-5XsuQUcP1KWXeIpyMlDadbHPPSUHsC9czKoxpu0u3l4SNkiZZSVGUdEXkFuOZRxrM6-bA8Qr8StVf3YTH1KtiI24-J2uGf9OuXtStV95W2_6lTyR78iWZuwsMkmiAT5zEIc9PowIccI"
                                    alt="Related 1"
                                    className="w-full h-full object-cover grayscale group-hover:grayscale-0 group-hover:scale-105 transition-all duration-500"
                                />
                            </div>
                            <div className="p-8">
                                <span className="text-xs font-mono text-[var(--color-sentinel)] uppercase tracking-[0.2em] mb-4 block">DevOps</span>
                                <h3 className="text-2xl font-bold text-[var(--color-text-primary)] mb-4 group-hover:text-[var(--color-sentinel)] transition-colors font-['Syne']">Securing CI/CD Pipelines with Zero-Trust Principles</h3>
                                <p className="text-[var(--color-text-secondary)] mb-6 line-clamp-2">How to architect a deployment pipeline that assumes breach at every stage and requires continuous verification.</p>
                                <div className="flex items-center gap-3 text-sm text-[var(--color-text-tertiary)]">
                                    <Calendar className="w-4 h-4" /> March 10, 2024
                                </div>
                            </div>
                        </div>
                        {/* Card 2 */}
                        <div className="group bg-[var(--color-void)] border border-[var(--color-sentinel)]/10 rounded-xl overflow-hidden hover:border-[var(--color-sentinel)]/40 transition-all cursor-pointer">
                            <div className="h-48 overflow-hidden">
                                <img
                                    src="https://lh3.googleusercontent.com/aida-public/AB6AXuCNBV3tE7fkrX68vyoZiy9ZkTPcFFVgqE3CZJx1fqpugCdPcdzEXOX8oPwDMMK33ogW0aFuxz8DLVFYvrKCBHxKBEeE-NXiVbn0g1VrijhEqx8-F-vw2kBgEVh-Lxo-5TbK2k4QjN_JiLR6I8_n8Sy3OC3I5O78P8iHN_p1oRAma2jgDIzrfYNoPm98adAIXRLLqhu4QrBbh_-tRLWTpF9EFrGInRCUjO4-VZfT-Fsdr2l5l52f8kZuBqa5B1Pdma8pHEkQ-NUlplk"
                                    alt="Related 2"
                                    className="w-full h-full object-cover grayscale group-hover:grayscale-0 group-hover:scale-105 transition-all duration-500"
                                />
                            </div>
                            <div className="p-8">
                                <span className="text-xs font-mono text-[var(--color-sentinel)] uppercase tracking-[0.2em] mb-4 block">Analysis</span>
                                <h3 className="text-2xl font-bold text-[var(--color-text-primary)] mb-4 group-hover:text-[var(--color-sentinel)] transition-colors font-['Syne']">The Future of Static Analysis: Beyond Pattern Matching</h3>
                                <p className="text-[var(--color-text-secondary)] mb-6 line-clamp-2">Moving from simple regex-based linting to deep semantic graph analysis for detecting complex logic flaws.</p>
                                <div className="flex items-center gap-3 text-sm text-[var(--color-text-tertiary)]">
                                    <Calendar className="w-4 h-4" /> March 05, 2024
                                </div>
                            </div>
                        </div>
                    </div>
                </div>
            </section>

            {/* Newsletter Banner */}
            <section className="py-20 bg-[var(--color-void)] relative overflow-hidden">
                <div className="absolute inset-0 bg-[radial-gradient(circle_at_1px_1px,var(--color-sentinel-muted)_1px,transparent_0)] bg-[size:40px_40px] opacity-10"></div>
                <div className="max-w-7xl mx-auto px-6 relative z-10">
                    <div className="bg-gradient-to-br from-[var(--color-sentinel)]/10 to-transparent border border-[var(--color-sentinel)]/20 rounded-2xl p-12 md:flex items-center justify-between">
                        <div className="max-w-xl mb-8 md:mb-0">
                            <h2 className="text-3xl font-bold text-[var(--color-text-primary)] mb-4 font-['Syne']">Stay Securely Informed</h2>
                            <p className="text-[var(--color-text-secondary)] text-lg">Weekly insights on automated security, AI trends, and DevSecOps best practices directly to your inbox.</p>
                        </div>
                        <div className="flex flex-col sm:flex-row gap-4">
                            <input
                                className="bg-[var(--color-void)] border border-[var(--color-sentinel)]/30 rounded px-6 py-4 w-full sm:w-80 focus:ring-1 focus:ring-[var(--color-sentinel)] outline-none text-[var(--color-text-primary)] font-mono placeholder:text-[var(--color-text-tertiary)]"
                                placeholder="Enter your email"
                                type="email"
                            />
                            <button className="bg-[var(--color-sentinel)] hover:bg-[var(--color-success)] text-[var(--color-void)] font-bold px-8 py-4 rounded transition-all uppercase tracking-widest whitespace-nowrap cursor-pointer">
                                Subscribe Now
                            </button>
                        </div>
                    </div>
                </div>
            </section>

        </div>
    );
}
