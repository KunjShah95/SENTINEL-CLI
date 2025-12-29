import { BrowserRouter as Router, Routes, Route } from 'react-router-dom';
import { Navbar } from './components/Navbar';
import { Footer } from './components/Footer';
import { Home } from './pages/Home';
import { Features } from './pages/Features';
import { HowItWorks } from './pages/HowItWorks';
import { Docs } from './pages/Docs';
import { Changelog } from './pages/Changelog';
import { Playground } from './pages/Playground';
import { Blog } from './pages/Blog';
import { Analytics } from "@vercel/analytics/react"



export default function App() {
  return (
    <Router>
      <div className="min-h-screen bg-gray-950 text-white selection:bg-emerald-500/30">
        <Navbar />
        <Routes>
          <Route path="/" element={<Home />} />
          <Route path="/features" element={<Features />} />
          <Route path="/how-it-works" element={<HowItWorks />} />
          <Route path="/docs" element={<Docs />} />
          <Route path="/changelog" element={<Changelog />} />
          <Route path="/playground" element={<Playground />} />
          <Route path="/blog" element={<Blog />} />
        </Routes>
        <Footer />
        <Analytics />
      </div>
    </Router>
  );
}
