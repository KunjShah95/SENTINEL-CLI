import { useState, useEffect } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { Shield, Menu, X, Github, ArrowRight, Terminal, Sparkles } from 'lucide-react';

const navLinks = [
    { name: 'Features', path: '/features' },
    { name: 'How It Works', path: '/how-it-works' },
    { name: 'Docs', path: '/docs' },
    { name: 'Changelog', path: '/changelog' },
    { name: 'Playground', path: '/playground' },
    { name: 'Blog', path: '/blog' },
];

export function Navbar() {
    const [isScrolled, setIsScrolled] = useState(false);
    const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);
    const location = useLocation();

    useEffect(() => {
        const handleScroll = () => {
            setIsScrolled(window.scrollY > 20);
        };

        window.addEventListener('scroll', handleScroll, { passive: true });
        return () => window.removeEventListener('scroll', handleScroll);
    }, []);

    useEffect(() => {
        setIsMobileMenuOpen(false);
    }, [location.pathname]);

    // Lock body scroll when mobile menu is open
    useEffect(() => {
        if (isMobileMenuOpen) {
            document.body.style.overflow = 'hidden';
        } else {
            document.body.style.overflow = '';
        }
        return () => {
            document.body.style.overflow = '';
        };
    }, [isMobileMenuOpen]);

    return (
        <>
            <nav
                className={`nav-sentinel ${isScrolled ? 'scrolled' : ''}`}
                role="navigation"
                aria-label="Main navigation"
            >
                <div className="container-sentinel">
                    <div className="flex items-center justify-between h-16 md:h-20">
                        {/* Logo */}
                        <Link
                            to="/"
                            className="flex items-center gap-3 group relative z-50"
                            aria-label="Sentinel CLI Home"
                        >
                            <div className="relative">
                                <div
                                    className="absolute inset-0 bg-[var(--color-sentinel)] blur-lg opacity-30 
                             group-hover:opacity-50 transition-opacity duration-300"
                                    aria-hidden="true"
                                />
                                <div
                                    className="relative w-10 h-10 rounded-lg bg-gradient-to-br from-[var(--color-sentinel)] 
                             to-[var(--color-sentinel-light)] flex items-center justify-center
                             group-hover:scale-105 transition-transform duration-200"
                                >
                                    <Shield className="w-5 h-5 text-[var(--color-void)]" strokeWidth={2.5} />
                                </div>
                            </div>
                            <div className="flex flex-col">
                                <span
                                    className="font-['Syne'] font-bold text-lg tracking-tight text-[var(--color-text-primary)]
                             group-hover:text-[var(--color-sentinel)] transition-colors"
                                >
                                    SENTINEL
                                </span>
                                <span
                                    className="text-[9px] font-['JetBrains_Mono'] tracking-[0.2em] uppercase 
                             text-[var(--color-sentinel-muted)]"
                                >
                                    AI Security
                                </span>
                            </div>
                        </Link>

                        {/* Desktop Navigation */}
                        <div className="hidden lg:flex items-center gap-1">
                            {navLinks.map((link) => (
                                <Link
                                    key={link.name}
                                    to={link.path}
                                    className={`nav-link ${location.pathname === link.path ? 'active' : ''}`}
                                >
                                    {link.name}
                                </Link>
                            ))}
                        </div>

                        {/* Desktop CTA */}
                        <div className="hidden lg:flex items-center gap-3">
                            <a
                                href="https://github.com/KunjShah95/SENTINEL-CLI"
                                target="_blank"
                                rel="noopener noreferrer"
                                className="btn-ghost"
                                aria-label="View on GitHub"
                            >
                                <Github className="w-4 h-4" />
                                <span>GitHub</span>
                            </a>
                            <Link to="/docs" className="btn-primary">
                                <Terminal className="w-4 h-4" />
                                <span>Get Started</span>
                                <ArrowRight className="w-3.5 h-3.5" />
                            </Link>
                        </div>

                        {/* Mobile Menu Button */}
                        <button
                            className="lg:hidden relative z-50 p-2 -mr-2 text-[var(--color-text-secondary)] 
                         hover:text-[var(--color-text-primary)] transition-colors"
                            onClick={() => setIsMobileMenuOpen(!isMobileMenuOpen)}
                            aria-expanded={isMobileMenuOpen}
                            aria-controls="mobile-menu"
                            aria-label={isMobileMenuOpen ? 'Close menu' : 'Open menu'}
                        >
                            {isMobileMenuOpen ? (
                                <X className="w-6 h-6" />
                            ) : (
                                <Menu className="w-6 h-6" />
                            )}
                        </button>
                    </div>
                </div>
            </nav>

            {/* Mobile Menu Overlay */}
            <div
                id="mobile-menu"
                className={`fixed inset-0 z-40 lg:hidden transition-all duration-300 ${isMobileMenuOpen ? 'visible' : 'invisible'
                    }`}
                aria-hidden={!isMobileMenuOpen}
            >
                {/* Backdrop */}
                <div
                    className={`absolute inset-0 bg-[var(--color-void)]/95 backdrop-blur-xl
                      transition-opacity duration-300 ${isMobileMenuOpen ? 'opacity-100' : 'opacity-0'
                        }`}
                    onClick={() => setIsMobileMenuOpen(false)}
                    aria-hidden="true"
                />

                {/* Menu Content */}
                <div
                    className={`relative h-full flex flex-col pt-24 pb-8 px-6 
                      transform transition-transform duration-300 ease-out ${isMobileMenuOpen ? 'translate-x-0' : 'translate-x-full'
                        }`}
                >
                    {/* Mobile Nav Links */}
                    <nav className="flex-1 flex flex-col gap-2">
                        {navLinks.map((link, index) => (
                            <Link
                                key={link.name}
                                to={link.path}
                                className={`flex items-center gap-4 p-4 rounded-lg text-lg font-medium
                           transition-all duration-200 ${location.pathname === link.path
                                        ? 'bg-[var(--color-sentinel)]/10 text-[var(--color-sentinel)] border border-[var(--color-sentinel)]/20'
                                        : 'text-[var(--color-text-secondary)] hover:text-[var(--color-text-primary)] hover:bg-[var(--color-obsidian)]'
                                    }`}
                                style={{
                                    animationDelay: `${index * 50}ms`,
                                    animation: isMobileMenuOpen ? 'slide-up-fade 0.4s ease forwards' : 'none',
                                    opacity: isMobileMenuOpen ? undefined : 0
                                }}
                            >
                                <span className="font-['JetBrains_Mono'] text-xs text-[var(--color-text-secondary)]">
                                    0{index + 1}
                                </span>
                                {link.name}
                            </Link>
                        ))}
                    </nav>

                    {/* Mobile CTAs */}
                    <div className="flex flex-col gap-3 pt-6 border-t border-[var(--color-carbon)]">
                        <a
                            href="https://github.com/KunjShah95/SENTINEL-CLI"
                            target="_blank"
                            rel="noopener noreferrer"
                            className="btn-secondary w-full justify-center"
                        >
                            <Github className="w-4 h-4" />
                            <span>View on GitHub</span>
                        </a>
                        <Link to="/docs" className="btn-primary w-full justify-center">
                            <Sparkles className="w-4 h-4" />
                            <span>Get Started Free</span>
                            <ArrowRight className="w-3.5 h-3.5" />
                        </Link>
                    </div>

                    {/* Version Badge */}
                    <div className="mt-6 flex justify-center">
                        <span className="badge-sentinel badge-version">
                            v1.8.0 — MIT License
                        </span>
                    </div>
                </div>
            </div>
        </>
    );
}
