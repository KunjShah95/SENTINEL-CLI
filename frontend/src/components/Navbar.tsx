import { Shield, Github, Sparkles } from 'lucide-react';
import { Link, useLocation } from 'react-router-dom';

export function Navbar() {
  const location = useLocation();
  const isActive = (path: string) => location.pathname === path;

  return (
    <nav className="fixed top-0 left-0 right-0 z-50 glass-nav">
      <div className="max-w-7xl mx-auto px-6 h-20">
        <div className="flex items-center justify-between h-full">
          {/* Logo */}
          <Link to="/" className="flex items-center gap-3 group">
            <div className="relative">
              <div className="absolute inset-0 bg-emerald-500 blur-lg opacity-20 group-hover:opacity-40 transition-opacity" />
              <div className="relative p-2 rounded-xl bg-gradient-to-br from-gray-900 to-gray-950 border border-white/10 group-hover:border-emerald-500/30 transition-all">
                <Shield className="w-6 h-6 text-emerald-500" />
              </div>
            </div>
            <div className="flex flex-col">
              <span className="font-bold text-lg tracking-tight text-white font-display leading-none">SENTINEL</span>
              <span className="text-[10px] text-emerald-500/80 font-mono tracking-wider">AI SECURITY CLI</span>
            </div>
          </Link>

          {/* Desktop Nav */}
          <div className="hidden md:flex items-center gap-8 bg-white/5 px-6 py-2 rounded-full border border-white/5 backdrop-blur-md">
            {[
              { name: 'Features', path: '/features' },
              { name: 'How It Works', path: '/how-it-works' },
              { name: 'Playground', path: '/playground' },
              { name: 'Docs', path: '/docs' }
            ].map((link) => (
              <Link
                key={link.path}
                to={link.path}
                className={`text-sm font-medium transition-all relative ${isActive(link.path)
                  ? 'text-white'
                  : 'text-gray-400 hover:text-white'
                  }`}
              >
                {link.name}
                {isActive(link.path) && (
                  <span className="absolute -bottom-1 left-1/2 -translate-x-1/2 w-1 h-1 bg-emerald-500 rounded-full" />
                )}
              </Link>
            ))}
          </div>

          {/* Right Actions */}
          <div className="flex items-center gap-4">
            <a
              href="https://github.com/KunjShah95/SENTINEL-CLI"
              target="_blank"
              rel="noopener noreferrer"
              className="hidden sm:flex items-center gap-2 px-4 py-2 rounded-lg text-gray-400 hover:text-white hover:bg-white/5 transition-colors text-sm font-medium"
            >
              <Github className="w-4 h-4" />
              <span>Star</span>
            </a>
            <Link
              to="/docs"
              className="group relative px-5 py-2.5 rounded-lg bg-emerald-600 hover:bg-emerald-500 transition-all text-sm font-bold text-white shadow-lg shadow-emerald-500/20 overflow-hidden"
            >
              <div className="absolute inset-0 bg-white/20 translate-y-full group-hover:translate-y-0 transition-transform duration-300" />
              <div className="relative flex items-center gap-2">
                <Sparkles className="w-3.5 h-3.5" />
                <span>Install Bot</span>
              </div>
            </Link>
          </div>
        </div>
      </div>
    </nav>
  );
}
