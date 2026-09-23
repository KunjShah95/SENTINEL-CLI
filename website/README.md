# Sentinel Website

Marketing + documentation site for Sentinel CLI. Built from scratch with
Next.js 15 (App Router), React 19, Tailwind CSS 3, and TypeScript.

## Develop

```bash
cd website
npm install
npm run dev      # http://localhost:3000
```

## Verify

```bash
npm run build      # lint + typecheck + production build
npm run typecheck  # tsc --noEmit
npx next start -p 3107
```

## Routes

| Route | Page |
|---|---|
| `/` | Landing: hero, principles, modes table, docs index |
| `/docs` | Overview: architecture + agent loop |
| `/docs/installation` | Requirements, install, keys |
| `/docs/quickstart` | Chat, one-shot, local models |
| `/docs/modes` | BUILD / PLAN / REVIEW permissions |
| `/docs/tools` | Sandboxed tool reference |
| `/docs/tui` | Slash commands + shortcuts |
| `/docs/config` | Provider env vars, config files |
| `/docs/mcp` | MCP stdio server + client config |
| `/docs/development` | Lint, typecheck, tests |

## Design notes

Terminal-minimalist system: near-black surfaces (`ink`), one green accent
(`moss`) for actions and active states, amber reserved for warnings. Flat
surfaces, 6px radius, 4px spacing scale, Inter + JetBrains Mono. No gradients,
no purple, no oversized padding.

Accessibility: skip link, one `h1` per page, labelled navs, visible focus
rings, keyboard-operable mobile menu and copy buttons, `prefers-reduced-motion`
support, custom 404 with useful next steps.
