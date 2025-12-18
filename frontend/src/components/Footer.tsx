import { Shield, Github, Lock, Users, Twitter, LinkedinIcon } from 'lucide-react';
import { Link } from 'react-router-dom';

export function Footer() {
  return (
    <footer className="border-t border-gray-900 bg-gray-950 pt-24 pb-12">
      <div className="max-w-7xl mx-auto px-6">
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-16 mb-20">
          <div className="space-y-6">
            <Link to="/" className="flex items-center gap-3 group">
              <div className="p-2 rounded-xl bg-emerald-600 shadow-lg shadow-emerald-600/20">
                <Shield className="w-6 h-6 text-white" />
              </div>
              <span className="font-bold text-xl tracking-tight text-white">SENTINEL</span>
            </Link>
            <p className="text-gray-400 text-sm leading-relaxed max-w-xs">
              The next-generation AI-powered security CLI for modern development teams. Secure your code, faster.
            </p>
            <div className="flex gap-4">
              <a
                href="https://x.com/kunjshah_dev"
                target="_blank"
                rel="noopener noreferrer"
                aria-label="Twitter"
                title="Twitter"
                className="p-2 rounded-lg bg-gray-900 border border-gray-800 text-gray-400 hover:text-white hover:border-gray-700 transition-all"
              >
                <Twitter className="w-5 h-5" />
              </a>
              <a
                href="https://github.com/KunjShah95"
                target="_blank"
                rel="noopener noreferrer"
                aria-label="GitHub"
                title="GitHub"
                className="p-2 rounded-lg bg-gray-900 border border-gray-800 text-gray-400 hover:text-white hover:border-gray-700 transition-all"
              >
                <Github className="w-5 h-5" />
              </a>
              <a
                href="https://www.linkedin.com/in/kunjshah05"
                target="_blank"
                rel="noopener noreferrer"
                aria-label="LinkedIn"
                title="LinkedIn"
                className="p-2 rounded-lg bg-gray-900 border border-gray-800 text-gray-400 hover:text-white hover:border-gray-700 transition-all"
              >
                <LinkedinIcon className="w-5 h-5" />
              </a>
            </div>
          </div>

          <div>
            <h4 className="text-white font-bold mb-6 uppercase tracking-widest text-xs">Product</h4>
            <ul className="space-y-4 text-gray-400 text-sm">
              <li>
                <Link to="/features" className="hover:text-emerald-400 transition-colors">
                  Features
                </Link>
              </li>
              <li>
                <Link to="/playground" className="hover:text-emerald-400 transition-colors">
                  Playground
                </Link>
              </li>
              <li>
                <Link to="/docs" className="hover:text-emerald-400 transition-colors">
                  Documentation
                </Link>
              </li>
              <li>
                <Link to="/blog" className="hover:text-emerald-400 transition-colors">
                  Blog
                </Link>
              </li>
            </ul>
          </div>

          <div>
            <h4 className="text-white font-bold mb-6 uppercase tracking-widest text-xs">Security</h4>
            <ul className="space-y-4 text-gray-400 text-sm">
              <li>
                <a href="#" className="hover:text-emerald-400 transition-colors flex items-center gap-2">
                  <Lock className="w-4 h-4" /> Security Policy
                </a>
              </li>
              <li>
                <a href="#" className="hover:text-emerald-400 transition-colors">
                  Responsible Disclosure
                </a>
              </li>
              <li>
                <a href="#" className="hover:text-emerald-400 transition-colors">
                  Privacy Policy
                </a>
              </li>
              <li>
                <a href="#" className="hover:text-emerald-400 transition-colors">
                  Terms of Service
                </a>
              </li>
            </ul>
          </div>

          <div>
            <h4 className="text-white font-bold mb-6 uppercase tracking-widest text-xs">Community</h4>
            <ul className="space-y-4 text-gray-400 text-sm">
              <li>
                <a
                  href="https://github.com/sentinel-cli"
                  className="hover:text-emerald-400 transition-colors flex items-center gap-2"
                >
                  <Github className="w-4 h-4" /> GitHub
                </a>
              </li>
              <li>
                <a href="#" className="hover:text-emerald-400 transition-colors flex items-center gap-2">
                  <Users className="w-4 h-4" /> Contribute
                </a>
              </li>
              <li>
                <a href="#" className="hover:text-emerald-400 transition-colors">
                  Discord Server
                </a>
              </li>
              <li>
                <Link to="/changelog" className="hover:text-emerald-400 transition-colors">
                  Changelog
                </Link>
              </li>
            </ul>
          </div>
        </div>

        <div className="pt-8 border-t border-gray-900 flex flex-col md:flex-row justify-between items-center gap-6 text-gray-500 text-xs">
          <p>© 2025 SENTINEL-CLI. Built with love for the open source community.</p>
WARN! Due to `builds` existing in your configuration file, the Build and Development Settings defined in your Project Settings will not apply. Learn More: https://vercel.link/unused-build-settings
          <div className="flex gap-8">
            <span>MIT License</span>
            <span>v2.0.4</span>
          </div>
        </div>
      </div>
    </footer>
  );
}
