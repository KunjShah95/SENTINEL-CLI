import { useEffect, useRef } from 'react';
import { FeatureCard } from '../components/FeatureCard';
import { 
  Brain, 
  Shield, 
  Bug, 
  Lock, 
  FileSearch, 
  Package, 
  GitBranch, 
  FileCheck, 
  Zap, 
  Code, 
  Puzzle, 
  Terminal,
  AlertTriangle,
  CheckCircle2,
  BarChart3,
  Download,
  MessageSquare,
  Wrench,
  History,
  Bell,
  Layout,
  Database,
  Container,
  Globe,
  Users,
  Trello
} from 'lucide-react';

export function Features() {
  const revealRefs = useRef<(HTMLDivElement | null)[]>([]);

  useEffect(() => {
    const observer = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (entry.isIntersecting) {
            entry.target.classList.add('active');
          }
        });
      },
      { threshold: 0.1 }
    );

    revealRefs.current.forEach((ref) => {
      if (ref) observer.observe(ref);
    });

    return () => observer.disconnect();
  }, []);

  const addToRefs = (el: HTMLDivElement | null) => {
    if (el && !revealRefs.current.includes(el)) {
      revealRefs.current.push(el);
    }
  };

  return (
    <div className="pt-20 overflow-x-hidden">
      {/* Hero */}
      <section className="relative py-32 px-6">
        <div className="absolute inset-0 grid-background opacity-30" />
        <div className="max-w-7xl mx-auto text-center relative z-10 reveal" ref={addToRefs}>
          <h1 className="text-5xl md:text-7xl font-bold mb-8 tracking-tight">
            Comprehensive <span className="text-gradient">Security Features</span>
          </h1>
          <p className="text-xl text-gray-400 max-w-3xl mx-auto leading-relaxed">
            SENTINEL provides enterprise-grade security analysis with the simplicity of a CLI tool. 
            Every feature is designed to catch vulnerabilities before they reach production.
          </p>
        </div>
      </section>

      {/* AI Review Engine */}
      <section className="py-24 px-6">
        <div className="max-w-7xl mx-auto">
          <div className="mb-16 reveal" ref={addToRefs}>
            <h2 className="text-3xl md:text-4xl font-bold mb-4">AI Review Engine</h2>
            <p className="text-xl text-gray-400">
              Advanced language models trained on security best practices
            </p>
          </div>
          
          <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-8 reveal" ref={addToRefs}>
            <FeatureCard 
              icon={Brain}
              title="Multi-LLM Support"
              description="Choose from GPT-4, Claude, Gemini, or run local models for maximum privacy"
            />
            <FeatureCard 
              icon={Code}
              title="Context-Aware Analysis"
              description="AI understands your codebase structure and identifies complex vulnerabilities"
            />
            <FeatureCard 
              icon={Zap}
              title="Smart Caching"
              description="Only re-analyzes changed files, saving time and API costs"
            />
            <FeatureCard 
              icon={FileSearch}
              title="Deep Code Review"
              description="Analyzes data flow, authentication patterns, and business logic flaws"
            />
            <FeatureCard 
              icon={CheckCircle2}
              title="False Positive Reduction"
              description="AI learns from your codebase to minimize noise and focus on real issues"
            />
            <FeatureCard 
              icon={Terminal}
              title="Explainable Results"
              description="Every finding includes detailed explanation and remediation guidance"
            />
          </div>
        </div>
      </section>

      {/* Security & Vulnerabilities */}
      <section className="py-24 px-6 bg-gray-950/50 relative">
        <div className="absolute top-0 left-0 w-full h-px bg-linear-to-r from-transparent via-gray-800 to-transparent" />
        <div className="max-w-7xl mx-auto">
          <div className="mb-16 reveal" ref={addToRefs}>
            <h2 className="text-3xl md:text-4xl font-bold mb-4">Security & Vulnerability Detection</h2>
            <p className="text-xl text-gray-400">
              Comprehensive coverage of OWASP Top 10 and beyond
            </p>
          </div>
          
          <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-8 reveal" ref={addToRefs}>
            <FeatureCard 
              icon={Shield}
              title="Injection Attacks"
              description="Detect SQL, NoSQL, command, and LDAP injection vulnerabilities"
            />
            <FeatureCard 
              icon={Lock}
              title="Authentication Issues"
              description="Find broken authentication, session management, and access control flaws"
            />
            <FeatureCard 
              icon={AlertTriangle}
              title="Sensitive Data Exposure"
              description="Identify hardcoded secrets, API keys, and insecure data handling"
            />
            <FeatureCard 
              icon={Bug}
              title="XXE & Deserialization"
              description="Catch unsafe XML parsing and insecure deserialization patterns"
            />
            <FeatureCard 
              icon={FileCheck}
              title="Security Misconfiguration"
              description="Detect insecure defaults, unnecessary features, and misconfigurations"
            />
            <FeatureCard 
              icon={Code}
              title="XSS Prevention"
              description="Find cross-site scripting vulnerabilities in frontend and backend code"
            />
          </div>
        </div>
      </section>

      {/* CI/CD & Automation */}
      <section className="py-24 px-6">
        <div className="max-w-7xl mx-auto">
          <div className="mb-16 reveal" ref={addToRefs}>
            <h2 className="text-3xl md:text-4xl font-bold mb-4">CI/CD & Automation</h2>
            <p className="text-xl text-gray-400">
              Seamlessly integrate into your development pipeline
            </p>
          </div>
          
          <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-8 reveal" ref={addToRefs}>
            <FeatureCard 
              icon={GitBranch}
              title="GitHub Actions"
              description="Pre-built actions for automatic security checks on every PR"
            />
            <FeatureCard 
              icon={GitBranch}
              title="GitLab CI/CD"
              description="Native integration with GitLab pipelines and security dashboards"
            />
            <FeatureCard 
              icon={GitBranch}
              title="Jenkins & CircleCI"
              description="Easy integration with popular CI/CD platforms via CLI"
            />
            <FeatureCard 
              icon={Terminal}
              title="Pre-commit Hooks"
              description="Catch issues before they're committed with Git hooks integration"
            />
            <FeatureCard 
              icon={Zap}
              title="Fail-Fast Mode"
              description="Configure thresholds to block deployments with critical issues"
            />
            <FeatureCard 
              icon={FileCheck}
              title="Status Checks"
              description="Automatic pass/fail status for pull request merge protection"
            />
          </div>
        </div>
      </section>

      {/* Reports & Outputs */}
      <section className="py-24 px-6 bg-gray-950/50 relative">
        <div className="absolute top-0 left-0 w-full h-px bg-linear-to-r from-transparent via-gray-800 to-transparent" />
        <div className="max-w-7xl mx-auto">
          <div className="mb-16 reveal" ref={addToRefs}>
            <h2 className="text-3xl md:text-4xl font-bold mb-4">Reports & Outputs</h2>
            <p className="text-xl text-gray-400">
              Flexible reporting for developers and security teams
            </p>
          </div>
          
          <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-8 reveal" ref={addToRefs}>
            <FeatureCard 
              icon={FileCheck}
              title="JSON Export"
              description="Machine-readable format for automation and custom tooling"
            />
            <FeatureCard 
              icon={BarChart3}
              title="HTML Reports"
              description="Beautiful, interactive reports with charts and filtering"
            />
            <FeatureCard 
              icon={FileSearch}
              title="Markdown Output"
              description="Perfect for documentation and GitHub issue creation"
            />
            <FeatureCard 
              icon={Download}
              title="SARIF Format"
              description="Standard format for integration with security dashboards"
            />
            <FeatureCard 
              icon={Terminal}
              title="Console Pretty Print"
              description="Color-coded terminal output with severity indicators"
            />
            <FeatureCard 
              icon={BarChart3}
              title="Trend Analysis"
              description="Track security metrics over time with historical data"
            />
          </div>
        </div>
      </section>

      {/* Advanced AI & Interactive */}
      <section className="py-24 px-6">
        <div className="max-w-7xl mx-auto">
          <div className="mb-16 reveal" ref={addToRefs}>
            <h2 className="text-3xl md:text-4xl font-bold mb-4">Advanced AI & Interactive</h2>
            <p className="text-xl text-gray-400">
              Interactive tools for deeper code understanding and automated fixes
            </p>
          </div>
          
          <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-8 reveal" ref={addToRefs}>
            <FeatureCard 
              icon={MessageSquare}
              title="Interactive AI Chat"
              description="Chat with your codebase. Ask questions about security, logic, or refactoring."
            />
            <FeatureCard 
              icon={Wrench}
              title="AI-Powered Auto-Fix"
              description="Automatically generate and apply fixes for identified security vulnerabilities."
            />
            <FeatureCard 
              icon={Brain}
              title="Code Refactoring"
              description="Get AI suggestions for improving code structure, readability, and performance."
            />
            <FeatureCard 
              icon={History}
              title="Historical Trends"
              description="Save analysis snapshots and track your security posture over time."
            />
            <FeatureCard 
              icon={Terminal}
              title="Interactive TUI"
              description="Rich terminal interface for browsing issues and applying fixes (Coming Soon)."
            />
            <FeatureCard 
              icon={Layout}
              title="Web Dashboard"
              description="Visual analytics and team metrics in a beautiful web interface (Coming Soon)."
            />
          </div>
        </div>
      </section>

      {/* Infrastructure & Ecosystem */}
      <section className="py-24 px-6 bg-gray-950/50 relative">
        <div className="absolute top-0 left-0 w-full h-px bg-linear-to-r from-transparent via-gray-800 to-transparent" />
        <div className="max-w-7xl mx-auto">
          <div className="mb-16 reveal" ref={addToRefs}>
            <h2 className="text-3xl md:text-4xl font-bold mb-4">Infrastructure & Ecosystem</h2>
            <p className="text-xl text-gray-400">
              Securing your entire stack from code to container
            </p>
          </div>
          
          <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-8 reveal" ref={addToRefs}>
            <FeatureCard 
              icon={Container}
              title="Docker Security"
              description="Scan Dockerfiles for best practices and insecure configurations."
            />
            <FeatureCard 
              icon={Database}
              title="API Schema Validation"
              description="Validate GraphQL and REST API schemas for security and breaking changes."
            />
            <FeatureCard 
              icon={Globe}
              title="SBOM Generation"
              description="Generate Software Bill of Materials (CycloneDX/SPDX) for compliance."
            />
            <FeatureCard 
              icon={Bell}
              title="Smart Notifications"
              description="Get instant alerts on Slack or Discord for critical security findings."
            />
            <FeatureCard 
              icon={Users}
              title="Team Annotations"
              description="Collaborate with your team by adding comments and suppressing false positives."
            />
            <FeatureCard 
              icon={Trello}
              title="Issue Tracker Sync"
              description="Sync findings directly with Jira, Linear, or GitHub Issues."
            />
          </div>
        </div>
      </section>

      {/* CTA */}
      <section className="py-32 px-6">
        <div className="max-w-5xl mx-auto relative">
          <div className="absolute inset-0 bg-emerald-600 rounded-3xl blur-3xl opacity-10" />
          <div className="relative bg-linear-to-br from-emerald-600 to-blue-700 rounded-3xl p-12 md:p-20 text-center overflow-hidden">
            <div className="relative z-10 reveal" ref={addToRefs}>
              <h2 className="text-4xl md:text-6xl font-bold mb-8 text-white">Start Using These Features Today</h2>
              <p className="text-xl mb-12 text-emerald-100 max-w-2xl mx-auto leading-relaxed">
                All features included in the open source version. No premium tiers, no limitations.
              </p>
              <a 
                href="https://github.com/sentinel-cli" 
                target="_blank"
                rel="noopener noreferrer"
                className="inline-block px-10 py-4 rounded-xl bg-white text-emerald-600 font-bold hover:bg-emerald-50 transition-all shadow-xl"
              >
                View on GitHub
              </a>
            </div>
          </div>
        </div>
      </section>
    </div>
  );
}
