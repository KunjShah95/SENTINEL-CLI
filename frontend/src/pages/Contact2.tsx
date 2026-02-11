export function Contact2() {
    return (
        <div className="min-h-screen bg-[var(--color-void)] font-display text-[var(--color-text-primary)] selection:bg-[var(--color-sentinel)]/30 selection:text-[var(--color-sentinel)] overflow-hidden relative">

            {/* Scanline */}
            <div className="fixed inset-x-0 h-[150px] z-10 bg-gradient-to-t from-[rgba(13,242,204,0)] via-[rgba(13,242,204,0.08)] to-[rgba(13,242,204,0)] opacity-30 pointer-events-none animate-[scanline_2.5s_linear_infinite]" style={{ bottom: '100%' }}></div>
            <style>{`
        @keyframes scanline {
          0% { bottom: 100%; }
          100% { bottom: -150px; }
        }
        @keyframes pulse-glow {
            0%, 100% { box-shadow: 0 0 15px rgba(13, 242, 204, 0.3); opacity: 0.8; }
            50% { box-shadow: 0 0 30px rgba(13, 242, 204, 0.6); opacity: 1; }
        }
      `}</style>

            {/* Background Grid */}
            <div className="absolute inset-0 pointer-events-none"
                style={{
                    backgroundImage: 'linear-gradient(rgba(13, 242, 204, 0.08) 1px, transparent 1px), linear-gradient(90deg, rgba(13, 242, 204, 0.08) 1px, transparent 1px)',
                    backgroundSize: '30px 30px'
                }}>
            </div>

            <main className="min-h-screen flex flex-col items-center justify-center p-6 md:p-12 relative z-20 pt-32">
                {/* Nav Metadata */}
                <nav className="absolute top-24 left-8 right-8 flex justify-between items-start hidden md:flex">
                    <div className="flex flex-col gap-2">
                        <div className="flex items-center gap-2 group cursor-pointer">
                            <div className="w-2 h-2 rounded-full bg-[var(--color-sentinel)] animate-pulse"></div>
                            <span className="text-xs font-mono tracking-widest text-[var(--color-sentinel)]/80 uppercase">Status: Transmitting_Data</span>
                        </div>
                        <div className="text-[10px] font-mono text-[var(--color-sentinel)]/40 uppercase tracking-tighter">Loc: 0x882 / Uplink: Active</div>
                    </div>
                    <div className="flex gap-6">
                        <span className="text-xs font-mono text-[var(--color-sentinel)]/60 uppercase">[ Documentation ]</span>
                        <span className="text-xs font-mono text-[var(--color-sentinel)]/60 uppercase">[ Network_Log ]</span>
                    </div>
                </nav>

                {/* Hero */}
                <div className="text-center mb-12 space-y-4">
                    <h1 className="text-4xl md:text-7xl font-['Syne'] uppercase tracking-tighter leading-none text-[var(--color-text-primary)]">
                        Transmitting<span className="text-[var(--color-sentinel)] animate-pulse inline-block translate-y-1">...</span>
                    </h1>
                    <p className="text-[var(--color-sentinel)]/60 font-mono text-sm md:text-base max-w-xl mx-auto uppercase tracking-wide">
                        Secure handshake established. Forwarding encrypted packet to Sentinel Core.
                    </p>
                </div>

                {/* Terminal Window */}
                <div className="w-full max-w-3xl bg-[var(--color-void)]/95 backdrop-blur-xl border border-[var(--color-sentinel)]/30 rounded-lg overflow-hidden shadow-[0_0_50px_rgba(13,242,204,0.15)]">
                    <div className="bg-[var(--color-sentinel)]/10 px-4 py-3 flex items-center justify-between border-b border-[var(--color-sentinel)]/20">
                        <div className="flex gap-2">
                            <div className="w-3 h-3 rounded-full bg-[var(--color-critical)]"></div>
                            <div className="w-3 h-3 rounded-full bg-[var(--color-warning)]"></div>
                            <div className="w-3 h-3 rounded-full bg-[var(--color-success)]"></div>
                        </div>
                        <div className="text-[10px] font-mono text-[var(--color-sentinel)]/60 uppercase tracking-widest">
                            bash — sentinel-cli — transmission-progress
                        </div>
                        <div className="w-12"></div>
                    </div>

                    <div className="p-8 md:p-12 space-y-10 font-mono text-center">
                        <div className="space-y-3 text-left max-w-md mx-auto">
                            <div className="text-[var(--color-sentinel)]/40 text-[10px] uppercase mb-4 border-b border-[var(--color-sentinel)]/10 pb-1">Uplink Activity Log</div>
                            <div className="text-[var(--color-sentinel)] text-sm tracking-wide opacity-80">ESTABLISHING SECURE TUNNEL...</div>
                            <div className="text-[var(--color-sentinel)] text-sm tracking-wide opacity-85">ENCRYPTING PAYLOAD...</div>
                            <div className="text-[var(--color-sentinel)] text-sm tracking-wide flex items-center gap-2">
                                <span className="animate-spin">⟳</span>
                                TRANSMITTING TO SENTINEL CORE...
                            </div>
                        </div>

                        <div className="space-y-4 py-4">
                            <div className="text-[var(--color-sentinel)] font-mono text-3xl tracking-widest" style={{ textShadow: '0 0 8px rgba(13, 242, 204, 0.6)' }}>
                                [████████░░░░]
                            </div>
                            <div className="flex justify-center items-center gap-4 text-[var(--color-sentinel)]/60 text-sm">
                                <span className="font-bold text-[var(--color-sentinel)]">65% COMPLETE</span>
                                <span className="text-[var(--color-sentinel)]/20">|</span>
                                <span className="animate-pulse">BITRATE: 48.2 MB/S</span>
                            </div>
                        </div>

                        <div className="flex flex-col md:flex-row items-center justify-center gap-8 pt-6">
                            <div className="flex items-center gap-3 px-6 py-3 border border-[var(--color-sentinel)]/20 rounded-sm bg-[var(--color-sentinel)]/5" style={{ animation: 'pulse-glow 2s ease-in-out infinite' }}>
                                <div className="w-2 h-2 rounded-full bg-[var(--color-sentinel)] animate-ping"></div>
                                <span className="text-[var(--color-sentinel)] font-bold uppercase text-xs tracking-[0.2em]">TRANSMITTING</span>
                            </div>
                            <button className="border border-[var(--color-critical)]/30 text-[var(--color-critical)]/60 hover:text-[var(--color-critical)] hover:border-[var(--color-critical)] hover:bg-[var(--color-critical)]/5 px-10 py-3 rounded-sm transition-all uppercase text-xs tracking-tighter font-bold cursor-pointer">
                                CANCEL_TASK
                            </button>
                        </div>
                    </div>

                    <div className="bg-[var(--color-sentinel)]/5 px-6 py-4 flex flex-wrap justify-between border-t border-[var(--color-sentinel)]/10">
                        <div className="flex items-center gap-4">
                            <div className="flex items-center gap-2">
                                <span className="text-[10px] text-[var(--color-sentinel)]/40 font-mono">ENCRYPTION:</span>
                                <span className="text-[var(--color-sentinel)] text-[10px] font-mono">AES-256-GCM</span>
                            </div>
                            <div className="flex items-center gap-2">
                                <span className="text-[10px] text-[var(--color-sentinel)]/40 font-mono">PID:</span>
                                <span className="text-[var(--color-sentinel)] text-[10px] font-mono">4802</span>
                            </div>
                        </div>
                        <div className="flex items-center gap-2">
                            <span className="text-[10px] text-[var(--color-sentinel)]/40 font-mono">DESTINATION:</span>
                            <span className="text-[var(--color-sentinel)] text-[10px] font-mono uppercase">CORE_CLUSTER_ALPHA</span>
                        </div>
                    </div>
                </div>

                {/* Ambient Glow */}
                <div className="fixed bottom-0 left-0 w-full h-1/3 bg-gradient-to-t from-[var(--color-sentinel)]/10 to-transparent pointer-events-none -z-10"></div>
                <div className="absolute top-1/2 -left-20 w-80 h-80 bg-[var(--color-sentinel)]/10 blur-[150px] rounded-full pointer-events-none"></div>
                <div className="absolute bottom-1/2 -right-20 w-80 h-80 bg-[var(--color-sentinel)]/10 blur-[150px] rounded-full pointer-events-none"></div>

                <div className="absolute bottom-1/2 -right-20 w-80 h-80 bg-[var(--color-sentinel)]/10 blur-[150px] rounded-full pointer-events-none"></div>
            </main>
        </div>
    );
}
