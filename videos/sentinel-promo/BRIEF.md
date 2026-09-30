---
workflow: product-launch-video
flow: automation
storyboard: no
message: "It shows its work — including when it refuses."
destination: youtube
aspect: 1920x1080
language: en
audience: developers who already use AI coding agents daily (Claude Code / Cursor users)
length: 70s
angle: refusal-as-hero
narration: minimal
style_preset: broadside
---

## Intent

A product launch video for **Sentinel**, a minimalist AI coding agent for the terminal.
The user asked for a demo video with high-polish motion design, aimed at going around online.

The chosen direction is a three-part composite:

- **Spine (beat A) — "It stopped itself."** The agent reaches for
  `db/migrate/0042_add_index.sql`, the write is **refused on screen**, and the agent
  re-issues the call citing the file:line and the rollback. Every competitor video shows
  an agent succeeding; showing one that *refuses* is the pattern-break.
- **Texture (beat E) — real terminal.** The connective tissue is real Sentinel TUI
  output, not invented mock-ups: the tool-call stream, the activity line, the footer.
- **Close (beat D) — the counter.** The economics told by a live cost counter rather
  than a stat card: a full session's work landing on `$0.00`.

Tone: confident, dry, engineering-credible. No hype adjectives, no "revolutionary".
The product's own line is "The coding agent that shows its work" — the video should
earn that line rather than assert it.

## Customizations

- **Sell, not show-it-as-is.** The site is the source for *brand* (colors, fonts, logo)
  and for the argument; the story is the product's, not a tour of the pages.
- **Design derives from Sentinel's own site**, captured from `sentinel-cli.vercel.app`.
  The `broadside` preset is used as the *structural* system only — its frame rules and
  type ramp are remixed onto Sentinel's own brand tokens. It is **not** adopted from the
  saved `onramp-demo` recipe, which carries a different company's captured fonts and palette.
- **Phone-legibility adjustment.** Full-frame raw terminal output is illegible at phone
  size, and phones are where this gets watched. The terminal stays real, but is scaled and
  cropped so the load-bearing line reads, and key lines are restated as display type.
- **Stat count-up** on the closing `$0.00` figure.

## Assets

- `https://sentinel-cli.vercel.app` — brand tokens, logo, and hero/terminal imagery.
  This is the capture source of truth for the design system.
- `npx tsx scripts/tui-snapshot.tsx` — real, assertion-backed TUI frames from
  `scripts/tui-snapshot.tsx`, including the `.env` secrets-file refusal already present
  in the fixture. Preferred over invented terminal mock-ups wherever it fits.

## Notes

- **Hard constraint — do not overclaim.** `BENCHMARKS.md` §5 states explicitly: *"Do not
  present SWE-mini 15/15 as 'beats Claude Code'."* No comparative superiority claim against
  named competitors appears anywhere in this video. The refusal and the `$0.00` are both
  real and need no inflation.
- `sentinel-cli.dev` does not currently resolve; capture from `sentinel-cli.vercel.app`.
- Real numbers available for the stat frame, all sourced: `$0` default cost (Groq free
  tier), `19` sandboxed local tools, `12` providers (the site says 12; the code registry
  lists 14 including GitHub Copilot and Perplexity — prefer the site's published figure
  of 12, or phrase as "a dozen-plus"), `0` servers, `0` telemetry.
- The `watch`/`steer` split-terminal beat and the `race` cross-critique beat are real and
  film well, but are **out of scope** for this 70s cut. They are the first candidates if
  a second video is made.
