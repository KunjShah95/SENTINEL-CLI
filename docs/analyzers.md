# Sentinel Analyzers Reference

Sentinel provides 20+ built-in analyzers for security, code quality, dependency checking, and more.

## 🔐 Security Analysis

| Analyzer | Description |
|----------|-------------|
| Security Scanner | XSS, SQL injection, CSRF, command injection, dangerous APIs |
| Secrets Detection | 20+ regex patterns for API keys, tokens, passwords, private keys |
| Dependency Scanner | npm audit, CVE checking, license issues, unpinned versions |
| API Security | CORS, JWT, rate limiting, hardcoded secrets in configs |
| Environment Security | .env file analysis, secret exposure |
| Docker Security | Root user detection, secrets in ENV, ADD/COPY, health checks |
| Kubernetes Security | Privileged containers, securityContext, resource limits |
| GraphQL Security | Query depth limits, introspection, sensitive data exposure |

## 📊 Code Quality

| Analyzer | Description |
|----------|-------------|
| Quality Analyzer | Complexity, maintainability, code smells |
| Bug Analyzer | Null checks, logic errors, common mistakes |
| Performance Analyzer | Memory leaks, N+1 queries, inefficient operations |
| TypeScript Analyzer | `any` types, @ts-ignore, type safety issues |
| Accessibility (A11y) | WCAG 2.1 compliance, alt text, ARIA, form labels |

## ⚛️ Framework-Specific

| Analyzer | Description |
|----------|-------------|
| React/JSX | Hooks rules, missing keys, dangerous innerHTML |
| Vue | Composition API, template issues |
| Go | Concurrency issues, error handling |
| Custom | User-defined YAML rules |
