import { useState } from 'react';
import { Shield, Github, Twitter, Linkedin, Youtube, Mail, ArrowRight, Heart } from 'lucide-react';
import { Link } from 'react-router-dom';

const footerLinks = {
  Product: [
    { name: 'Features', path: '/features' },
    { name: 'How It Works', path: '/how-it-works' },
    { name: 'Playground', path: '/playground' },
    { name: 'Changelog', path: '/changelog' },
    { name: 'Roadmap', path: '/changelog' },
  ],
  Resources: [
    { name: 'Documentation', path: '/docs' },
    { name: 'API Reference', path: '/docs' },
    { name: 'Examples', path: '/playground' },
    { name: 'Security', path: '/docs' },
    { name: 'Status', path: '/contact' },
  ],
  Company: [
    { name: 'About', path: '/' },
    { name: 'Blog', path: '/blog' },
    { name: 'Contact', path: '/contact' },
  ],
  Legal: [
    { name: 'Privacy', path: '/docs' },
    { name: 'Terms', path: '/docs' },
    { name: 'Licenses', path: '/docs' },
  ],
};

const socialLinks = [
  { name: 'GitHub', icon: Github, href: 'https://github.com/KunjShah95/SENTINEL-CLI' },
  { name: 'Twitter', icon: Twitter, href: 'https://twitter.com' },
  { name: 'LinkedIn', icon: Linkedin, href: 'https://linkedin.com' },
  { name: 'YouTube', icon: Youtube, href: 'https://youtube.com' },
];

export function Footer() {
  const [subscribed, setSubscribed] = useState(false);

  const handleSubscribe = (e: React.FormEvent) => {
    e.preventDefault();
    setSubscribed(true);
    setTimeout(() => setSubscribed(false), 5000);
  };

  return (
    <footer className="relative bg-[var(--color-obsidian)] border-t border-[var(--color-carbon)] overflow-hidden font-body">
      <div className="absolute inset-0 pointer-events-none">
        <div className="absolute top-0 left-1/4 w-96 h-96 bg-[var(--color-sentinel)]/5 blur-[100px] rounded-full" />
        <div className="absolute bottom-0 right-1/4 w-96 h-96 bg-[var(--color-info)]/5 blur-[100px] rounded-full" />
      </div>

      <div className="relative z-10 max-w-7xl mx-auto px-6 py-16">
        <div className="mb-16 p-8 md:p-12 rounded-3xl bg-[var(--color-void)]/40 border border-[var(--color-carbon)] relative overflow-hidden">
          <div className="absolute inset-0 bg-gradient-to-r from-[var(--color-sentinel)]/5 via-transparent to-[var(--color-info)]/5" />
          <div className="relative flex flex-col md:flex-row items-start md:items-center justify-between gap-8">
            <div className="space-y-4">
              <h3 className="text-2xl md:text-3xl font-bold text-[var(--color-text-primary)] font-display">
                Stay updated with Sentinel
              </h3>
              <p className="text-[var(--color-text-secondary)] max-w-md">
                Get the latest features, security updates, and developer tips delivered to your inbox.
              </p>
            </div>
            <div className="flex flex-col sm:flex-row gap-3 w-full md:w-auto">
              {!subscribed ? (
                <form onSubmit={handleSubscribe} className="flex flex-col sm:flex-row gap-3 w-full md:w-auto">
                  <div className="relative flex-1 md:w-72">
                    <Mail className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-[var(--color-text-tertiary)]" />
                    <input
                      type="email"
                      required
                      placeholder="Enter your email"
                      className="w-full pl-12 pr-4 py-3.5 rounded-xl bg-[var(--color-obsidian)] border border-[var(--color-carbon)] text-[var(--color-text-primary)] placeholder-[var(--color-text-tertiary)] focus:outline-none focus:border-[var(--color-sentinel)]/50 focus:ring-1 focus:ring-[var(--color-sentinel)]/50 transition-all font-display"
                    />
                  </div>
                  <button type="submit" className="btn-primary whitespace-nowrap cursor-pointer">
                    <span>Subscribe</span>
                    <ArrowRight className="w-4 h-4" />
                  </button>
                </form>
              ) : (
                <div className="flex items-center gap-3 px-6 py-3.5 rounded-xl bg-[var(--color-sentinel)]/10 border border-[var(--color-sentinel)]/30 text-[var(--color-sentinel)] animate-in zoom-in duration-300">
                  <span className="font-bold flex items-center gap-2">
                    <Shield className="w-5 h-5" />
                    Subscribed successfully!
                  </span>
                </div>
              )}
            </div>
          </div>
        </div>

        <div className="grid grid-cols-2 md:grid-cols-6 gap-8 mb-12">
          <div className="col-span-2">
            <Link to="/" className="flex items-center gap-3 group mb-6">
              <div className="relative">
                <div className="absolute inset-0 bg-[var(--color-sentinel)] blur-lg opacity-20 group-hover:opacity-40 transition-opacity" />
                <div className="relative p-2.5 rounded-xl bg-gradient-to-br from-[var(--color-obsidian)] to-[var(--color-void)] border border-[var(--color-carbon)] group-hover:border-[var(--color-sentinel)]/30 transition-all">
                  <Shield className="w-5 h-5 text-[var(--color-sentinel)]" />
                </div>
              </div>
              <div className="flex flex-col">
                <span className="font-bold text-xl tracking-tight text-[var(--color-text-primary)] font-display leading-none">SENTINEL</span>
                <span className="text-[9px] text-[var(--color-sentinel)]/80 font-mono tracking-[0.2em] uppercase">AI Security</span>
              </div>
            </Link>
            <p className="text-[var(--color-text-secondary)] text-sm leading-relaxed mb-6 max-w-xs">
              AI-powered code security that catches vulnerabilities before they reach production.
            </p>
            <div className="flex gap-3">
              {socialLinks.map((social) => (
                <a
                  key={social.name}
                  href={social.href}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="p-2.5 rounded-lg bg-[var(--color-obsidian)] border border-[var(--color-carbon)] text-[var(--color-text-secondary)] hover:text-[var(--color-text-primary)] hover:border-[var(--color-sentinel)]/30 hover:bg-[var(--color-void)] transition-all"
                  aria-label={social.name}
                >
                  <social.icon className="w-4 h-4" />
                </a>
              ))}
            </div>
          </div>

          {Object.entries(footerLinks).map(([category, links]) => (
            <div key={category}>
              <h4 className="font-semibold text-[var(--color-text-primary)] mb-4">{category}</h4>
              <ul className="space-y-3">
                {links.map((link) => (
                  <li key={link.name}>
                    <Link
                      to={link.path}
                      className="text-sm text-[var(--color-text-secondary)] hover:text-[var(--color-text-primary)] transition-colors"
                    >
                      {link.name}
                    </Link>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>

        <div className="pt-8 border-t border-[var(--color-carbon)] flex flex-col md:flex-row items-center justify-between gap-4">
          <div className="flex items-center gap-6 text-sm text-[var(--color-text-tertiary)]">
            <span>© 2024 Sentinel CLI</span>
            <span className="hidden md:inline">•</span>
            <span className="hidden md:inline">Made with <Heart className="w-3 h-3 inline text-[var(--color-critical)] fill-[var(--color-critical)] mx-1" /> by developers, for developers</span>
          </div>
          <div className="flex items-center gap-4">
            <span className="badge badge-sentinel">
              <span className="w-1.5 h-1.5 rounded-full bg-[var(--color-sentinel)] animate-pulse" />
              <span>All systems operational</span>
            </span>
          </div>
        </div>
      </div>
    </footer>
  );
}
