import { useState } from 'react';
import { Terminal, Send, XCircle } from 'lucide-react';
import { useNavigate } from 'react-router-dom';

export function Contact() {
    const navigate = useNavigate();

    const handleSubmit = (e: React.FormEvent) => {
        e.preventDefault();
        // Simulate API call
        setTimeout(() => {
            navigate('/contact/success');
        }, 1000);
    };

    return (
        <div className="min-h-screen bg-[var(--color-void)] font-display text-[var(--color-text-primary)] selection:bg-[var(--color-sentinel)]/30 selection:text-[var(--color-sentinel)] relative overflow-hidden">
            {/* Scanline Effect */}
            <div className="absolute inset-0 pointer-events-none z-10 opacity-10"
                style={{
                    background: 'linear-gradient(to bottom, transparent 50%, rgba(13, 242, 204, 0.05) 51%)',
                    backgroundSize: '100% 4px'
                }}>
            </div>

            {/* Grid Background */}
            <div className="absolute inset-0 pointer-events-none"
                style={{
                    backgroundImage: 'linear-gradient(rgba(13, 242, 204, 0.05) 1px, transparent 1px), linear-gradient(90deg, rgba(13, 242, 204, 0.05) 1px, transparent 1px)',
                    backgroundSize: '40px 40px'
                }}>
            </div>

            <main className="min-h-screen flex flex-col items-center justify-center p-6 md:p-12 relative z-20 pt-32">
                {/* Navigation Metadata */}
                <div className="absolute top-24 left-8 right-8 flex justify-between items-start hidden md:flex">
                    <div className="flex flex-col gap-2">
                        <div className="flex items-center gap-2 group cursor-pointer">
                            <div className="w-2 h-2 rounded-full bg-[var(--color-sentinel)] animate-pulse"></div>
                            <span className="text-xs font-mono tracking-widest text-[var(--color-sentinel)]/80 uppercase">System Active: Sentinel_v2.04</span>
                        </div>
                        <div className="text-[10px] font-mono text-[var(--color-sentinel)]/40 uppercase tracking-tighter">Loc: 0x882 / Auth: encrypted</div>
                    </div>
                    <div className="flex gap-6">
                        <span className="text-xs font-mono text-[var(--color-sentinel)]/60 uppercase">[ Documentation ]</span>
                        <span className="text-xs font-mono text-[var(--color-sentinel)]/60 uppercase">[ Network_Log ]</span>
                    </div>
                </div>

                {/* Hero Section */}
                <div className="text-center mb-12 space-y-4">
                    <h1 className="text-4xl md:text-7xl font-['Syne'] uppercase tracking-tighter leading-none text-[var(--color-text-primary)]">
                        Establish Connection<span className="text-[var(--color-sentinel)] animate-pulse inline-block translate-y-1">_</span>
                    </h1>
                    <p className="text-[var(--color-sentinel)]/60 font-mono text-sm md:text-base max-w-xl mx-auto uppercase tracking-wide">
                        Direct uplink to Sentinel Command. Response latency: &lt; 24 hours.
                    </p>
                </div>

                {/* Terminal Container */}
                <div className="w-full max-w-3xl bg-[var(--color-void)]/80 backdrop-blur-xl border border-[var(--color-sentinel)]/20 rounded-lg overflow-hidden shadow-[0_0_40px_rgba(13,242,204,0.1)]">
                    {/* macOS Window Header */}
                    <div className="bg-[var(--color-sentinel)]/10 px-4 py-3 flex items-center justify-between border-b border-[var(--color-sentinel)]/20">
                        <div className="flex gap-2">
                            <div className="w-3 h-3 rounded-full bg-[var(--color-critical)]"></div>
                            <div className="w-3 h-3 rounded-full bg-[var(--color-warning)]"></div>
                            <div className="w-3 h-3 rounded-full bg-[var(--color-success)]"></div>
                        </div>
                        <div className="text-[10px] font-mono text-[var(--color-sentinel)]/40 uppercase tracking-widest">
                            bash — sentinel-cli-contact — 80x24
                        </div>
                        <div className="w-12"></div>
                    </div>

                    {/* Terminal Form Content */}
                    <form className="p-6 md:p-8 space-y-8 font-mono" onSubmit={handleSubmit}>
                        {/* Field 1 */}
                        <div className="space-y-2 group">
                            <label className="block text-[var(--color-sentinel)]/50 text-xs uppercase tracking-widest" htmlFor="name">
                                SENTINEL_USER_NAME &gt;
                            </label>
                            <input
                                className="w-full bg-transparent border-none focus:ring-0 text-[var(--color-sentinel)] text-xl p-0 placeholder:text-[var(--color-sentinel)]/10 outline-none"
                                id="name"
                                placeholder="IDENTIFY_SELF"
                                type="text"
                                autoComplete="off"
                            />
                        </div>

                        {/* Field 2 */}
                        <div className="space-y-2 group">
                            <label className="block text-[var(--color-sentinel)]/50 text-xs uppercase tracking-widest" htmlFor="email">
                                EMAIL_ADDRESS &gt;
                            </label>
                            <input
                                className="w-full bg-transparent border-none focus:ring-0 text-[var(--color-sentinel)] text-xl p-0 placeholder:text-[var(--color-sentinel)]/10 outline-none"
                                id="email"
                                placeholder="USER@NETWORK.LOCAL"
                                type="email"
                                autoComplete="off"
                            />
                        </div>

                        {/* Field 3 */}
                        <div className="space-y-2 group">
                            <label className="block text-[var(--color-sentinel)]/50 text-xs uppercase tracking-widest" htmlFor="subject">
                                SUBJECT_LINE &gt;
                            </label>
                            <div className="relative">
                                <select
                                    className="w-full bg-transparent border-none focus:ring-0 text-[var(--color-sentinel)] text-xl p-0 appearance-none cursor-pointer outline-none bg-[var(--color-void)]"
                                    id="subject"
                                    defaultValue=""
                                >
                                    <option value="" disabled className="text-[var(--color-sentinel)]/10">SELECT_TOPIC</option>
                                    <option value="report">SEC_VULNERABILITY_REPORT</option>
                                    <option value="api">API_INTEGRATION_QUERY</option>
                                    <option value="license">ENTERPRISE_LICENSE_REQ</option>
                                    <option value="feedback">GENERAL_SYSTEM_FEEDBACK</option>
                                </select>
                            </div>
                        </div>

                        {/* Field 4 */}
                        <div className="space-y-2 group">
                            <label className="block text-[var(--color-sentinel)]/50 text-xs uppercase tracking-widest" htmlFor="message">
                                MESSAGE_BODY &gt;
                            </label>
                            <textarea
                                className="w-full bg-transparent border-none focus:ring-0 text-[var(--color-sentinel)] text-xl p-0 placeholder:text-[var(--color-sentinel)]/10 resize-none outline-none h-32 custom-scrollbar"
                                id="message"
                                placeholder="INPUT_TRANSMISSION_DATA..."
                            ></textarea>
                        </div>

                        {/* Actions */}
                        <div className="pt-4 flex flex-col md:flex-row gap-4">
                            <button className="bg-[var(--color-sentinel)] text-[var(--color-void)] font-bold px-8 py-4 rounded-sm flex items-center justify-center gap-2 transition-all hover:scale-[1.02] shadow-[0_0_20px_rgba(13,242,204,0.4)] uppercase text-sm tracking-tighter cursor-pointer">
                                <Terminal className="w-4 h-4" />
                                EXECUTE_SEND
                            </button>
                            <button
                                onClick={() => navigate('/')}
                                className="border border-[var(--color-sentinel)]/30 text-[var(--color-sentinel)]/60 hover:text-[var(--color-sentinel)] hover:border-[var(--color-sentinel)] px-8 py-4 rounded-sm transition-all uppercase text-sm tracking-tighter cursor-pointer"
                            >
                                ABORT_SESSION
                            </button>
                        </div>
                    </form>

                    {/* Terminal Footer Information */}
                    <div className="bg-[var(--color-sentinel)]/5 px-6 py-4 flex flex-wrap gap-4 border-t border-[var(--color-sentinel)]/10">
                        <div className="flex items-center gap-2">
                            <span className="text-[10px] text-[var(--color-sentinel)]/40 font-mono">STATUS:</span>
                            <span className="bg-[var(--color-sentinel)]/20 text-[var(--color-sentinel)] text-[10px] px-2 py-0.5 rounded uppercase font-bold tracking-widest">OPERATIONAL</span>
                        </div>
                        <div className="flex items-center gap-2 group cursor-pointer">
                            <span className="text-[10px] text-[var(--color-sentinel)]/40 font-mono">SOURCE:</span>
                            <span className="text-[var(--color-sentinel)] group-hover:underline text-[10px] font-mono uppercase">GITHUB_ISSUES</span>
                        </div>
                        <div className="flex items-center gap-2 group cursor-pointer">
                            <span className="text-[10px] text-[var(--color-sentinel)]/40 font-mono">COMMS:</span>
                            <span className="text-[var(--color-sentinel)] group-hover:underline text-[10px] font-mono uppercase">DISCORD_SERVER</span>
                        </div>
                    </div>
                </div>

                {/* Background Decorations */}
                <div className="absolute top-1/2 -left-20 w-64 h-64 bg-[var(--color-sentinel)]/5 blur-[120px] rounded-full pointer-events-none"></div>
                <div className="absolute bottom-1/2 -right-20 w-64 h-64 bg-[var(--color-sentinel)]/5 blur-[120px] rounded-full pointer-events-none"></div>

            </main>

        </div>
    );
}
