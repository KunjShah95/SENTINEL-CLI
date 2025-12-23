import { Shield, Github, Twitter, Linkedin, Heart } from 'lucide-react';
import { Link } from 'react-router-dom';

export function Footer() {
  return (
    <footer className="border-t border-white/5 bg-[#050505] pt-24 pb-12 relative overflow-hidden">
      {/* Background decoration */}
      <div className="absolute top-0 inset-x-0 h-px bg-gradient-to-r from-transparent via-emerald-900/50 to-transparent" />
      <div className="absolute -top-24 left-1/2 -translate-x-1/2 w-[600px] h-[300px] bg-emerald-500/5 blur-[100px] rounded-full pointer-events-none" />

      <div className="max-w-7xl mx-auto px-6 relative z-10">
        <div className="grid grid-cols-1 md:grid-cols-12 gap-12 lg:gap-24 mb-20">

          {/* Brand Column */}
          <div className="md:col-span-12 lg:col-span-4 space-y-6">
            <Link to="/" className="flex items-center gap-3">
              <Shield className="w-8 h-8 text-emerald-500" />
              <span className="font-bold text-2xl tracking-tighter text-white font-display">SENTINEL</span>
            </Link>
            <p className="text-gray-400 text-sm leading-relaxed max-w-sm">
              Your AI-powered pair programmer and security guardian.
              Catch vulnerabilities, review pull requests, and fix bugs before they merge.
            </p>
            <div className="flex gap-4">
              {[Github, Twitter, Linkedin].map((Icon, i) => (
                <a key={i} href="#" className="p-2 rounded-lg bg-white/5 hover:bg-emerald-500/10 hover:text-emerald-400 text-gray-400 transition-all border border-white/5 hover:border-emerald-500/20">
                  <Icon className="w-4 h-4" />
                </a>
              ))}
            </div>
          </div>

          {/* Links Columns */}
          <div className="md:col-span-4 lg:col-span-2">
            <h4 className="font-bold text-white mb-6">Product</h4>
            <ul className="space-y-4 text-sm text-gray-400">
              <li><Link to="/features" className="hover:text-emerald-400 transition-colors">Features</Link></li>
              <li><Link to="/pricing" className="hover:text-emerald-400 transition-colors">Pricing</Link></li>
              <li><Link to="/integrations" className="hover:text-emerald-400 transition-colors">Integrations</Link></li>
              <li><Link to="/changelog" className="hover:text-emerald-400 transition-colors">Changelog</Link></li>
            </ul>
          </div>

          <div className="md:col-span-4 lg:col-span-2">
            <h4 className="font-bold text-white mb-6">Resources</h4>
            <ul className="space-y-4 text-sm text-gray-400">
              <li><Link to="/docs" className="hover:text-emerald-400 transition-colors">Documentation</Link></li>
              <li><Link to="/api" className="hover:text-emerald-400 transition-colors">API Reference</Link></li>
              <li><Link to="/blog" className="hover:text-emerald-400 transition-colors">Blog</Link></li>
              <li><Link to="/community" className="hover:text-emerald-400 transition-colors">Community</Link></li>
            </ul>
          </div>

          <div className="md:col-span-4 lg:col-span-4">
            <h4 className="font-bold text-white mb-6">Stay Updated</h4>
            <div className="space-y-4">
              <p className="text-sm text-gray-400">Join our newsletter for the latest security insights.</p>
              <div className="flex gap-2">
                <input
                  type="email"
                  placeholder="Enter email"
                  className="flex-1 bg-white/5 border border-white/10 rounded-lg px-4 py-2 text-sm text-white focus:border-emerald-500/50 focus:outline-none transition-colors"
                />
                <button className="px-4 py-2 bg-emerald-600 rounded-lg text-white font-bold text-sm hover:bg-emerald-500 transition-colors">
                  Subscribe
                </button>
              </div>
            </div>
          </div>
        </div>

        <div className="pt-8 border-t border-white/5 flex flex-col md:flex-row justify-between items-center gap-6 text-xs text-gray-500">
          <p>© 2025 Sentinel AI. All rights reserved.</p>
          <div className="flex gap-2 items-center">
            <span>Made with</span>
            <Heart className="w-3 h-3 text-red-500 fill-red-500" />
            <span>for secure code.</span>
          </div>
        </div>
      </div>
    </footer>
  );
}
