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
import { Article } from './pages/Article';
import { Contact } from './pages/Contact';
import { Contact2 } from './pages/Contact2';
import { Analytics } from "@vercel/analytics/react"



export default function App() {
  return (
    <Router>
      <div className="min-h-screen bg-[var(--color-void)] text-[var(--color-text-primary)]">
        <Navbar />
        <Routes>
          <Route path="/" element={<Home />} />
          <Route path="/features" element={<Features />} />
          <Route path="/how-it-works" element={<HowItWorks />} />
          <Route path="/docs" element={<Docs />} />
          <Route path="/changelog" element={<Changelog />} />
          <Route path="/playground" element={<Playground />} />
          <Route path="/blog" element={<Blog />} />
          <Route path="/blog/article" element={<Article />} />
          <Route path="/contact" element={<Contact />} />
          <Route path="/contact/success" element={<Contact2 />} />
        </Routes>
        <Footer />
        <Analytics />
      </div>
    </Router>
  );
}
