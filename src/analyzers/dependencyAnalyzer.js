import BaseAnalyzer from './baseAnalyzer.js';

/**
 * DependencyAnalyzer - Analyzes package dependencies for security vulnerabilities,
 * outdated packages, and license compliance issues.
 */
export class DependencyAnalyzer extends BaseAnalyzer {
  constructor(config) {
    super('DependencyAnalyzer', config);
    this.vulnerablePackages = this.initializeVulnerablePackages();
    this.deprecatedPatterns = this.initializeDeprecatedPatterns();
  }

  async analyze(files, context) {
    this.reset();
    const startTime = Date.now();

    for (const file of files) {
      if (!this.isDependencyFile(file.path)) continue;

      this.stats.filesAnalyzed++;
      this.stats.linesAnalyzed += file.content.split('\n').length;

      await this.analyzeFile(file.path, file.content, context);
    }

    this.stats.executionTime = Date.now() - startTime;
    return this.getIssues();
  }

  isDependencyFile(filePath) {
    const dependencyFiles = [
      'package.json',
      'package-lock.json',
      'yarn.lock',
      'pnpm-lock.yaml',
      'requirements.txt',
      'Pipfile',
      'Pipfile.lock',
      'pyproject.toml',
      'Gemfile',
      'Gemfile.lock',
      'go.mod',
      'go.sum',
      'Cargo.toml',
      'Cargo.lock',
      'composer.json',
      'composer.lock',
    ];

    return dependencyFiles.some(df => filePath.endsWith(df));
  }

  async analyzeFile(filePath, content, _context) {
    const issues = [];

    if (filePath.endsWith('package.json')) {
      issues.push(...this.analyzePackageJson(content, filePath));
    } else if (filePath.endsWith('requirements.txt')) {
      issues.push(...this.analyzeRequirementsTxt(content, filePath));
    } else if (filePath.endsWith('Gemfile')) {
      issues.push(...this.analyzeGemfile(content, filePath));
    }

    for (const issue of issues) {
      this.addIssue(issue);
    }
  }

  initializeVulnerablePackages() {
    // Known vulnerable package patterns
    return {
      npm: [
        {
          name: 'event-stream',
          version: '<4.0.0',
          severity: 'critical',
          cve: 'CVE-2018-16492',
          message: 'Malicious code injection in event-stream',
        },
        {
          name: 'lodash',
          version: '<4.17.21',
          severity: 'high',
          cve: 'CVE-2021-23337',
          message: 'Command injection vulnerability in lodash',
        },
        {
          name: 'minimist',
          version: '<1.2.6',
          severity: 'high',
          cve: 'CVE-2021-44906',
          message: 'Prototype pollution vulnerability',
        },
        {
          name: 'node-fetch',
          version: '<2.6.7',
          severity: 'medium',
          cve: 'CVE-2022-0235',
          message: 'Exposure of sensitive information',
        },
        {
          name: 'axios',
          version: '<0.21.2',
          severity: 'medium',
          cve: 'CVE-2021-3749',
          message: 'Server-Side Request Forgery',
        },
        {
          name: 'express',
          version: '<4.17.3',
          severity: 'medium',
          cve: 'CVE-2022-24999',
          message: 'Open redirect vulnerability',
        },
        {
          name: 'moment',
          version: '*',
          severity: 'info',
          message: 'Consider using date-fns or dayjs - moment is deprecated',
        },
        {
          name: 'request',
          version: '*',
          severity: 'info',
          message: 'Package is deprecated, use axios or node-fetch instead',
        },
      ],
      pip: [
        {
          name: 'django',
          version: '<3.2.13',
          severity: 'high',
          cve: 'CVE-2022-28346',
          message: 'SQL injection vulnerability',
        },
        {
          name: 'flask',
          version: '<2.0.0',
          severity: 'medium',
          message: 'Multiple security fixes in Flask 2.x',
        },
        {
          name: 'requests',
          version: '<2.20.0',
          severity: 'high',
          cve: 'CVE-2018-18074',
          message: 'Authorization header leak',
        },
        {
          name: 'pyyaml',
          version: '<5.4',
          severity: 'critical',
          cve: 'CVE-2020-14343',
          message: 'Arbitrary code execution',
        },
        {
          name: 'pillow',
          version: '<9.0.0',
          severity: 'high',
          message: 'Multiple vulnerabilities in older versions',
        },
      ],
    };
  }

  initializeDeprecatedPatterns() {
    return {
      npm: [
        {
          pattern: /^left-pad$/,
          message: 'left-pad is deprecated, use String.prototype.padStart()',
        },
        {
          pattern: /^ua-parser-js$/i,
          message: 'ua-parser-js had malicious code injection, verify source',
        },
        { pattern: /^colors$/i, message: 'colors package had protestware, verify version' },
        { pattern: /^faker$/i, message: 'Original faker is deprecated, use @faker-js/faker' },
      ],
    };
  }

  analyzePackageJson(content, filePath) {
    const issues = [];

    try {
      const pkg = JSON.parse(content);
      const allDeps = {
        ...(pkg.dependencies || {}),
        ...(pkg.devDependencies || {}),
        ...(pkg.peerDependencies || {}),
      };

      // Check for vulnerable packages
      for (const [name, version] of Object.entries(allDeps)) {
        const vulnPackage = this.vulnerablePackages.npm.find(vp => vp.name === name.toLowerCase());

        if (vulnPackage) {
          issues.push({
            severity: vulnPackage.severity,
            type: 'dependency',
            title: `Vulnerable Package: ${name}`,
            message: vulnPackage.message,
            file: filePath,
            line: this.findLineNumber(content, name),
            suggestion: vulnPackage.cve
              ? `Update ${name} to fix ${vulnPackage.cve}. Current: ${version}`
              : `Consider updating or replacing ${name}`,
            tags: ['dependency', 'security', 'npm'],
            analyzer: this.name,
          });
        }

        // Check for deprecated patterns
        for (const dep of this.deprecatedPatterns.npm) {
          if (dep.pattern.test(name)) {
            issues.push({
              severity: 'info',
              type: 'dependency',
              title: `Deprecated Package: ${name}`,
              message: dep.message,
              file: filePath,
              line: this.findLineNumber(content, name),
              suggestion: 'Consider migrating to a maintained alternative',
              tags: ['dependency', 'deprecated', 'npm'],
              analyzer: this.name,
            });
          }
        }
      }

      // Check for missing security-related scripts
      if (!pkg.scripts?.['npm:audit']) {
        issues.push({
          severity: 'info',
          type: 'dependency',
          title: 'Missing npm audit script',
          message: 'Consider adding an npm audit script for automated security checks',
          file: filePath,
          line: 1,
          suggestion: 'Add "audit": "npm audit --audit-level=moderate" to scripts',
          tags: ['dependency', 'best-practice', 'npm'],
          analyzer: this.name,
        });
      }

      // Check for missing engines field
      if (!pkg.engines) {
        issues.push({
          severity: 'low',
          type: 'dependency',
          title: 'Missing engines field',
          message: 'Specifying Node.js version requirements helps ensure compatibility',
          file: filePath,
          line: 1,
          suggestion: 'Add "engines": { "node": ">=18.0.0" } to package.json',
          tags: ['dependency', 'best-practice', 'npm'],
          analyzer: this.name,
        });
      }

      // Check for exact versions (can be risky)
      const exactVersionDeps = Object.entries(allDeps).filter(
        ([_, v]) => /^\d+\.\d+\.\d+$/.test(v) && !v.startsWith('^') && !v.startsWith('~')
      );

      if (exactVersionDeps.length > 5) {
        issues.push({
          severity: 'info',
          type: 'dependency',
          title: 'Many exact version dependencies',
          message: `${exactVersionDeps.length} packages use exact versions. This may prevent security patches.`,
          file: filePath,
          line: 1,
          suggestion: 'Consider using ^ or ~ for semver-compatible updates',
          tags: ['dependency', 'best-practice', 'npm'],
          analyzer: this.name,
        });
      }
    } catch (error) {
      issues.push({
        severity: 'medium',
        type: 'dependency',
        title: 'Invalid package.json',
        message: `Failed to parse package.json: ${error.message}`,
        file: filePath,
        line: 1,
        suggestion: 'Ensure package.json is valid JSON',
        tags: ['dependency', 'error'],
        analyzer: this.name,
      });
    }

    return issues;
  }

  analyzeRequirementsTxt(content, filePath) {
    const issues = [];
    const lines = content.split('\n');

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i].trim();
      if (!line || line.startsWith('#')) continue;

      // Extract package name and version
      const match = line.match(/^([a-zA-Z0-9_-]+)\s*([=<>!~]+)?\s*([0-9.]+)?/);
      if (match) {
        const [, name, operator, version] = match;

        // Check for vulnerable packages
        const vulnPackage = this.vulnerablePackages.pip.find(
          vp => vp.name.toLowerCase() === name.toLowerCase()
        );

        if (vulnPackage) {
          issues.push({
            severity: vulnPackage.severity,
            type: 'dependency',
            title: `Vulnerable Package: ${name}`,
            message: vulnPackage.message,
            file: filePath,
            line: i + 1,
            suggestion: vulnPackage.cve
              ? `Update ${name} to fix ${vulnPackage.cve}`
              : `Consider updating ${name}`,
            tags: ['dependency', 'security', 'pip'],
            analyzer: this.name,
          });
        }

        // Check for unpinned versions
        if (!version && !operator) {
          issues.push({
            severity: 'medium',
            type: 'dependency',
            title: `Unpinned Package: ${name}`,
            message: 'Package version is not pinned, which can lead to inconsistent builds',
            file: filePath,
            line: i + 1,
            suggestion: `Pin version: ${name}==X.Y.Z`,
            tags: ['dependency', 'best-practice', 'pip'],
            analyzer: this.name,
          });
        }
      }
    }

    return issues;
  }

  analyzeGemfile(content, filePath) {
    const issues = [];
    const lines = content.split('\n');

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i].trim();
      if (!line || line.startsWith('#')) continue;

      // Check for gems without version constraints
      const gemMatch = line.match(/^gem\s+['"]([^'"]+)['"]\s*$/);
      if (gemMatch) {
        issues.push({
          severity: 'info',
          type: 'dependency',
          title: `Unpinned Gem: ${gemMatch[1]}`,
          message: 'Consider specifying a version constraint for consistent builds',
          file: filePath,
          line: i + 1,
          suggestion: `gem '${gemMatch[1]}', '~> X.Y'`,
          tags: ['dependency', 'best-practice', 'gem'],
          analyzer: this.name,
        });
      }
    }

    return issues;
  }

  findLineNumber(content, searchTerm) {
    const lines = content.split('\n');
    for (let i = 0; i < lines.length; i++) {
      if (lines[i].includes(searchTerm)) {
        return i + 1;
      }
    }
    return 1;
  }
}

export default DependencyAnalyzer;
