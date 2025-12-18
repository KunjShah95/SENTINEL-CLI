import React from 'react';
import { BookOpen, Clock, User, ArrowRight, Search, Tag } from 'lucide-react';

const posts = [
  {
    id: 1,
    title: 'Automating Security Fixes with AI: A Deep Dive',
    excerpt: 'How we built the SENTINEL Auto-Fix engine to handle complex vulnerability remediation without breaking builds.',
    author: 'Sarah Chen',
    date: 'June 12, 2024',
    readTime: '8 min read',
    category: 'Engineering',
    image: 'https://images.unsplash.com/photo-1550751827-4bd374c3f58b?auto=format&fit=crop&q=80&w=800'
  },
  {
    id: 2,
    title: 'The State of Dependency Security in 2024',
    excerpt: 'Analyzing over 1 million open-source packages to identify emerging trends in supply chain attacks.',
    author: 'Marcus Thorne',
    date: 'May 28, 2024',
    readTime: '12 min read',
    category: 'Research',
    image: 'https://images.unsplash.com/photo-1558494949-ef010cbdcc51?auto=format&fit=crop&q=80&w=800'
  },
  {
    id: 3,
    title: 'Securing Your CI/CD Pipeline with SENTINEL',
    excerpt: 'A step-by-step guide to integrating automated security gates into GitHub Actions and GitLab CI.',
    author: 'Elena Rodriguez',
    date: 'May 15, 2024',
    readTime: '6 min read',
    category: 'Tutorial',
    image: 'https://images.unsplash.com/photo-1614064641938-3bbee52942c7?auto=format&fit=crop&q=80&w=800'
  },
  {
    id: 4,
    title: 'Detecting Zero-Day Vulnerabilities in Node.js',
    excerpt: 'Using static analysis and behavioral patterns to identify potential exploits before they are disclosed.',
    author: 'David Kim',
    date: 'April 30, 2024',
    readTime: '10 min read',
    category: 'Security',
    image: 'https://images.unsplash.com/photo-1563986768609-322da13575f3?auto=format&fit=crop&q=80&w=800'
  }
];

export function Blog() {
  return (
    <div className="pt-20 min-h-screen bg-gray-950">
      {/* Hero Section */}
      <section className="py-24 border-b border-gray-900">
        <div className="max-w-7xl mx-auto px-6">
          <div className="max-w-3xl">
            <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 text-xs font-bold uppercase tracking-wider mb-6">
              <BookOpen className="w-3 h-3" />
              Sentinel Blog
            </div>
            <h1 className="text-5xl md:text-6xl font-bold text-white mb-6 tracking-tight">
              Security <span className="text-emerald-500">Insights</span> & Guides
            </h1>
            <p className="text-xl text-gray-400 leading-relaxed">
              Deep dives into security research, engineering challenges, and best practices for modern development teams.
            </p>
          </div>
        </div>
      </section>

      {/* Search & Filter */}
      <section className="py-8 bg-gray-900/30 sticky top-20 z-40 backdrop-blur-md border-b border-gray-900">
        <div className="max-w-7xl mx-auto px-6 flex flex-wrap items-center justify-between gap-6">
          <div className="flex gap-2">
            {['All', 'Engineering', 'Research', 'Tutorial', 'Security'].map((cat) => (
              <button 
                key={cat}
                className="px-4 py-2 rounded-full text-sm font-medium border border-gray-800 text-gray-400 hover:text-white hover:border-emerald-500/50 transition-all"
              >
                {cat}
              </button>
            ))}
          </div>
          <div className="relative w-full md:w-64">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-500" />
            <input 
              type="text" 
              placeholder="Search articles..."
              className="w-full bg-gray-950 border border-gray-800 rounded-xl py-2 pl-10 pr-4 text-sm text-gray-300 focus:outline-none focus:border-emerald-500/50 transition-all"
            />
          </div>
        </div>
      </section>

      {/* Blog Grid */}
      <section className="py-24">
        <div className="max-w-7xl mx-auto px-6">
          <div className="grid md:grid-cols-2 gap-12">
            {posts.map((post) => (
              <article key={post.id} className="group cursor-pointer">
                <div className="relative aspect-video rounded-3xl overflow-hidden mb-8 border border-gray-800">
                  <img 
                    src={post.image} 
                    alt={post.title}
                    className="w-full h-full object-cover transition-transform duration-700 group-hover:scale-105"
                  />
                  <div className="absolute top-4 left-4">
                    <span className="px-3 py-1 rounded-full bg-emerald-600 text-white text-[10px] font-bold uppercase tracking-wider">
                      {post.category}
                    </span>
                  </div>
                </div>
                
                <div className="space-y-4">
                  <div className="flex items-center gap-4 text-xs text-gray-500 font-medium">
                    <div className="flex items-center gap-1.5">
                      <Clock className="w-3.5 h-3.5" />
                      {post.readTime}
                    </div>
                    <div className="flex items-center gap-1.5">
                      <User className="w-3.5 h-3.5" />
                      {post.author}
                    </div>
                    <span>{post.date}</span>
                  </div>
                  
                  <h2 className="text-2xl font-bold text-white group-hover:text-emerald-400 transition-colors leading-tight">
                    {post.title}
                  </h2>
                  
                  <p className="text-gray-400 leading-relaxed">
                    {post.excerpt}
                  </p>
                  
                  <div className="pt-4 flex items-center gap-2 text-sm font-bold text-white group-hover:gap-4 transition-all">
                    Read Article
                    <ArrowRight className="w-4 h-4 text-emerald-500" />
                  </div>
                </div>
              </article>
            ))}
          </div>
        </div>
      </section>

      {/* Newsletter */}
      <section className="py-24 bg-emerald-600">
        <div className="max-w-7xl mx-auto px-6 text-center">
          <h2 className="text-3xl font-bold text-white mb-6">Get security insights in your inbox</h2>
          <p className="text-emerald-100 mb-10 max-w-2xl mx-auto">
            Join 5,000+ developers who receive our weekly digest on security research and SENTINEL updates.
          </p>
          <form className="max-w-md mx-auto flex gap-4">
            <input 
              type="email" 
              placeholder="Enter your email"
              className="flex-1 px-6 py-4 rounded-2xl bg-white/10 border border-white/20 text-white placeholder-emerald-200 focus:outline-none focus:bg-white/20 transition-all"
            />
            <button className="px-8 py-4 rounded-2xl bg-white text-emerald-600 font-bold hover:bg-emerald-50 transition-all">
              Subscribe
            </button>
          </form>
        </div>
      </section>
    </div>
  );
}
