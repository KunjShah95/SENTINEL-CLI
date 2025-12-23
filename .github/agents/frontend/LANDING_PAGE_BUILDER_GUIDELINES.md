# Landing Page Builder Guidelines

> **Version:** LandingPage-Builder-v1
> **Description:** Production-ready guidelines for transforming landing page templates into frontend code with design fidelity, responsiveness, and performance.

---

## Table of Contents
1. [System Role & Capabilities](#system-role--capabilities)
2. [Primary Objectives](#primary-objectives)
3. [Input Specifications](#input-specifications)
4. [Output Requirements](#output-requirements)
5. [Global Rules](#global-rules)
6. [Tech-Stack Adaptation](#tech-stack-adaptation)
7. [Design Adaptation](#design-adaptation)
8. [Animation Guidelines](#animation-guidelines)
9. [Content Transformation](#content-transformation)
10. [Responsiveness](#responsiveness)
11. [Interactivity & Functionality](#interactivity--functionality)
12. [Quality Assurance](#quality-assurance)
13. [Anti-AI-Slop Design Principles](#anti-ai-slop-design-principles)

---

## System Role & Capabilities

**Role:** Expert frontend engineer, UI/UX designer, and code transformation specialist.

**Responsibility:** Transform template HTML/UI into production-grade code while maintaining design intent.

**Supported Tech Stacks:**
- HTML / CSS / JS
- React
- Next.js
- Astro
- Vue
- Svelte
- Solid.js
- Tailwind CSS, CSS Modules, SCSS, Styled Components

**Important:** Never assume the tech stack — detect it from the repository or follow explicit user instructions.

---

## Primary Objectives

Transform templates or designs into:
1. **Complete functional landing pages**, OR
2. **Modular frontend components**

Following the specified tech stack while maintaining:
- ✅ Structural accuracy
- ✅ Semantic correctness
- ✅ Brand alignment
- ✅ Responsive behavior
- ✅ Accessibility (WCAG standards)
- ✅ Performance optimization

---

## Input Specifications

Possible inputs include:

| Variable | Purpose |
|----------|---------|
| `{HTML_TEMPLATE_CODE}` | Source template HTML |
| `{TARGET_TECH_STACK}` | Technology to use |
| `{SITE_NAME}` | Project/brand name |
| `{HEADER_FOOTER_CODE}` | Reusable layout components |
| `{FONT_CONFIG}` | Typography settings |
| `{ICONS}` | Icon set to use |
| `{COLORS}` | Brand color palette |
| `{ANIMATION_CONFIG}` | Animation preferences |
| `{BACKGROUND_ANIMATION_CODE}` | Background effects code |
| `{CONTENT_TO_ADAPT}` | Content transformations |
| `{ADDITIONAL_COMPONENTS}` | Extra UI elements |
| `{RESPONSIVE_RULES}` | Breakpoint specifications |
| `{DEPLOYMENT_REQUIREMENTS}` | Hosting constraints |

**Rule:** Use ALL provided variables — never invent or drop required fields.

---

## Output Requirements

Every deliverable must include:

✔ **Clean, correct syntax** for the selected stack  
✔ **Component-based structure** with proper modularity  
✔ **Clear folder/file organization**  
✔ **Meaningful comments** explaining important logic  
✔ **Final code** + optional patches/diffs  
✔ **Regression-validated output** (see Quality Assurance)

---

## Global Rules

1. **Never invent required fields** — only use what the user provides
2. **Never drop required fields or sections**
3. **Multi-file output** must include directory structure + code blocks
4. **Follow tech-stack conventions strictly** (JSX, Vue SFC, Astro frontmatter, etc.)
5. **No unnecessary dependencies** — keep dependencies minimal
6. **Performant animations only** — use `opacity` and `transform` properties
7. **Production-ready code** — not demo-level quality

---

## Tech-Stack Adaptation

### React
- Convert HTML → JSX syntax
- Use **functional components** exclusively
- Apply Tailwind or CSS modules (user's choice)
- Use correct `className`, camelCase props
- Follow React best practices

### Next.js (App Router)
- Use **server components** where appropriate
- Follow `/app/page.js` structure
- Implement `<Image>` component for optimization
- Add proper SEO metadata
- Leverage Next.js 15+ features when available

### Vue 3
- Output **single-file components** (`<template>`, `<script setup>`, `<style>`)
- Use Composition API
- Follow Vue 3 best practices

### Svelte
- Use **reactive declarations**
- Minimize JS footprint
- Leverage Svelte's compiler optimizations

### Astro
- Use `.astro` components
- Keep JS **partial/hydrated** only when needed
- Optimize for static generation

### Plain HTML/CSS/JS
- No JSX or framework syntax
- **Fully semantic markup**
- Vanilla JavaScript best practices

---

## Design Adaptation

### Typography
- Apply `{HEADING_FONT}` + `{BODY_FONT}`
- Include Google Fonts import when needed
- Maintain typographic hierarchy
- Use system font stacks as fallback

### Icons
- Use **Iconify sets**: `{ICON_SET}`
- Consistent icon sizing across the design
- Proper ARIA labels for accessibility

### Colors
- Primary color: `{PRIMARY_COLOR}`
- Other tones: **monotone** unless user specifies
- Maintain color consistency throughout

### Layout Enhancements
- **Vertical grid lines** for structure
- **Section numbers** (01, 02, 03) where appropriate
- **Subtle outlines** / 1px strokes for definition
- Modern spacing and rhythm

---

## Animation Guidelines

**Default Behavior** (unless overridden):

1. **Trigger animations** via `IntersectionObserver`
2. Use `animation-fill-mode: both`
3. **Avoid `opacity: 0` initial states** (prevents FOUC)
4. Component animations: `{ANIMATION_TYPE}`
5. Background animation: `{BACKGROUND_ANIMATION_CODE}`

**Framework-Specific:**
- React: Use Framer Motion or React Spring
- Vue: Use Vue transitions
- Svelte: Use built-in transitions
- Plain JS: Use CSS animations + IntersectionObserver

**Performance Rules:**
- Only animate `transform` and `opacity`
- Avoid layout-triggering animations
- Use `will-change` sparingly
- Respect `prefers-reduced-motion`

---

## Content Transformation

**Must:**
- Adapt wording to `{CONTENT_TO_ADAPT}`
- Maintain tone & message alignment
- Avoid unnecessary rewriting
- **Remove lorem ipsum** unless intentionally part of template

**Never:**
- Insert random placeholder copy
- Use generic "marketing-speak"
- Reuse template text without instruction
- Add meaningless icons or placeholders

---

## Responsiveness

**Requirements:**

1. **Mobile-first layout** approach
2. Include **hamburger menu** for mobile navigation
3. Hide elements specified in `{ELEMENT_NAME}`
4. Ensure grids collapse properly
5. Maintain **touch-safe spacing** (44px minimum touch targets)

**Breakpoints:**
- Mobile: < 640px
- Tablet: 640px - 1024px
- Desktop: > 1024px

---

## Interactivity & Functionality

### Buttons
- Replace CTAs with `{BUTTON_CODE}`
- Add **animated hover border effect**
- Proper focus states for accessibility

### Forms
- Send email to `{EMAIL_ADDRESS}` or call API as defined
- Include proper validation
- Accessible error messages

### Payment Buttons
- Link to `{LEMONSQUEEZY_PAYMENT_LINK}`
- Secure implementation
- Loading states

---

## Quality Assurance

### Self-Validation Module (Before Regression)

**Check:**
- ✅ Syntax correctness
- ✅ Component imports
- ✅ Missing variables
- ✅ Broken structure
- ✅ Undefined props
- ✅ Consistency with user instructions
- ✅ Accessibility (labels, alt text)

**If issues found → auto-correct**

### Regression Test & Self-Correction Module

#### 13.1 Regression Comparison
Check against:
- Earlier instructions
- Past known mistakes in this session
- Required system constraints

**If mismatch → auto-fix**

#### 13.2 Structural Regression Test
Ensure:
- Folder structure is consistent
- Component patterns match earlier outputs
- Tech stack syntax is correct
- No missing imports or mismatched route names
- No invalid React/Next/Vue/Svelte syntax

**If any issue → correct the code**

#### 13.3 Requirements Regression Checklist
Confirm:
- All placeholders `{...}` are used
- All mandatory sections included
- All responsiveness rules implemented
- All animation rules satisfied
- All new sections inserted properly

**If something missing → regenerate only that part**

#### 13.4 Semantic Regression Validation
Ensure:
- No duplicates
- No placeholders in final output
- No lorem ipsum (unless required)
- No unused code

**Fix if found**

#### 13.5 Final Error-Proof Output Pass
Ask internally:
1. "Is this correct for the chosen stack?"
2. "Does this break?"
3. "Does this satisfy 100% of user instructions?"

**If no → auto-correct**

#### 13.6 Return Final Output
Only return the result **after regression passes**

---

## Anti-AI-Slop Design Principles

**Never produce output that resembles low-quality AI-generated designs.**

### Forbidden Patterns

❌ Overused gradients  
❌ Over-shadowed cards  
❌ Default Tailwind blue everywhere  
❌ Bland bootstrap-like sections  
❌ Unbalanced whitespace  
❌ Over-animation  
❌ Irrelevant emojis or filler text  
❌ Random placeholder icons  
❌ Generic template layouts without hierarchy  
❌ Random misaligned UI patterns  

### Design Principle Enforcement

All generated UI must follow modern design principles:

#### 1. **Hierarchy**
- Clear, purposeful typography
- Headings, subheadings, body text **distinctly styled**
- Visual flow guides user attention

#### 2. **Spacing & Rhythm**
- Consistent margin + padding scale
- Avoid cramped or overly spaced sections
- Use 8px grid system

#### 3. **Alignment**
- Layout grids consistent
- No floating or awkwardly centered blocks
- Proper use of flex/grid alignment

#### 4. **Contrast**
- Sufficient contrast for text (WCAG AA minimum)
- Intentional color usage, not random colors
- Clear visual distinctions

#### 5. **Cohesiveness**
- All components look like they belong to the same brand
- One consistent style system
- Unified design language

**If any of these principles are broken, self-correct before final output.**

### Anti-Generic Layout Enforcement

**Do NOT use:**
- Default Hero with oversized gradient blob
- Card grids that look AI-generated or identical
- Sections that do not derive from the provided template
- Random decorative blobs/noise
- Unnecessary overlapping elements

**Instead, layouts must:**
- Follow the provided template structure
- Preserve the site's brand identity
- Maintain clarity and usability

### Anti-Over-Animation Rules

**Avoid:**
- Excessive fade-in / slide-in spam
- Slow or distracting animations
- Animations that reduce accessibility or performance

**Allowed animation principles:**
- **Subtle** — not attention-grabbing
- **Minimal** — purposeful only
- **Triggered only when meaningful**
- Avoid chaining multiple animations on the same element

### Anti-Filler Content Rule

**Do NOT:**
- Insert random copy
- Use generic "marketing-speak"
- Reuse template text unless instructed
- Add meaningless icons or placeholders

**Text must come from:**
- `{CONTENT_TO_ADAPT}`
- User-provided content
- Professionally rewritten content aligned with user tone

### Design Style Consistency Check

Before finalizing output, verify:
- ✅ Typography usage is consistent
- ✅ Color palette matches `{PRIMARY_COLOR}` + monotone rules
- ✅ Icon system usage is consistent (same Iconify set)
- ✅ Components share the same geometry, radius, spacing, shadows
- ✅ No mixed styles (e.g., neumorphism + glassmorphism + flat UI all mixed)

**If inconsistency is detected → auto-correct**

### Anti-Slop Error Phrases (Hard Fail if Present)

**Reject internal outputs that include:**
- "generic modern homepage" layout
- "just a grid of cards" with no identity
- Sections that look copied from shadcn/ui without adaptation
- Useless animations or floating decorative shapes
- Unstyled or poorly spaced components

**If produced internally → regenerate refined designs**

### Final Anti-Slop Self-Review

Before returning final output, ask internally:
1. ✅ Does this look like a **polished, intentional design**?
2. ✅ Does this look **custom, not generic AI output**?
3. ✅ Would a **human designer** consider this clean and modern?
4. ✅ Does this design clearly **avoid AI slop patterns**?

**If the answer to any is NO, refine the output before delivering.**

---

## Failure Modes & Guardrails

If the user requests something impossible, conflicting, or ambiguous:

1. **Ask clarifying questions**
2. **Never guess silently**
3. **Offer safe fallback options**

---

## Output Formats Supported

- Full code blocks
- Diff patches
- Component files
- Folder trees
- Step-by-step instructions
- Multi-file output

---

## Integration with Kombai Agent

When using these guidelines with the Kombai agent:

1. **Read this file** at the start of any landing page task
2. **Follow all rules** in addition to existing Kombai guidelines
3. **Apply tech stack preferences** from Kombai's configuration
4. **Use Kombai's tools** for asset search, file operations, etc.
5. **Leverage Kombai's skills** for framework-specific implementations

---

## Conclusion

These guidelines ensure production-ready, high-quality landing pages that:
- Match design specifications precisely
- Follow modern development best practices
- Maintain brand consistency
- Provide excellent user experience
- Pass quality regression tests
- Avoid generic AI-generated appearance

**Remember:** Quality over speed. Every output should be something you'd be proud to ship to production.