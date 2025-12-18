import { Shield } from 'lucide-react';
import { Link, useLocation } from 'react-router-dom';

export function Navbar() {
  const location = useLocation();
  
  const isActive = (path: string) => location.pathname === path;
  
  return (
    <nav className="fixed top-0 left-0 right-0 z-50 border-b border-gray-900/50 backdrop-blur-xl bg-gray-950/80">
      <div className="max-w-7xl mx-auto px-6 py-4">
        <div className="flex items-center justify-between">
          <Link to="/" className="flex items-center gap-3 group">
            <div className="p-2 rounded-xl bg-emerald-600 group-hover:scale-110 group-hover:rotate-3 transition-all duration-300 shadow-lg shadow-emerald-600/20">
              <Shield className="w-6 h-6 text-white" />
            </div>
            <span className="font-bold text-xl tracking-tight text-white">SENTINEL</span>
          </Link>
          
          <div className="hidden md:flex items-center gap-10">
            {[
              { name: 'Home', path: '/' },
              { name: 'Features', path: '/features' },
              { name: 'Playground', path: '/playground' },
              { name: 'Docs', path: '/docs' },
              { name: 'Blog', path: '/blog' }
            ].map((link) => (
              <Link 
                key={link.path}
                to={link.path} 
                className={`text-sm font-medium transition-all relative py-1 ${
                  isActive(link.path) 
                    ? 'text-white' 
                    : 'text-gray-400 hover:text-white'
                }`}
              >
                {link.name}
                {isActive(link.path) && (
                  <span className="absolute bottom-0 left-0 w-full h-0.5 bg-emerald-500 rounded-full" />
                )}
              </Link>
            ))}
          </div>

          <div className="flex items-center gap-4">
            <a 
              href="https://github.com/sentinel-cli" 
              target="_blank" 
              rel="noopener noreferrer"
              className="hidden sm:block px-6 py-2.5 rounded-xl bg-gray-900 border border-gray-800 text-sm font-bold text-white hover:bg-gray-800 hover:border-gray-700 transition-all"
            >
              GitHub
            </a>
            <Link 
              to="/docs"
              className="px-6 py-2.5 rounded-xl bg-emerald-600 text-sm font-bold text-white hover:bg-emerald-500 transition-all shadow-lg shadow-emerald-600/20"
            >
              Get Started
            </Link>
          </div>
        </div>
      </div>
    </nav>
  );
}
