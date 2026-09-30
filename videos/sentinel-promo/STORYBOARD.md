---
format: 1920x1080
duration: 69s
message: "It shows its work — including when it refuses."
arc: BAB — cold open on the refusal, resolve to the policy behind it, then the economics and the install
audience: developers who already use AI coding agents daily
mode: autonomous
music: restrained minimal electronic underscore, no percussion, low sustained drone
---

# STORYBOARD — Sentinel launch

## Video direction

**Palette system** — from `frame.md`, and note the inverted key names (read its Sentinel brand
legend before painting anything). The film's ground is `{colors.ground}` `#0A0B0A`; primary text is
`{colors.ink-black}` `#ECEEE9`; secondary text is `{colors.cream-muted}` `#959C94`; hairlines and
borders are `{colors.border-dark}` `#222622`. Two semantic accents only:

- **Sage green `#8BD99A` = "go".** Affirmative state, stat numerals, the wordmark. Never a
  background for body copy.
- **Amber `#E8B35A` = "stopped".** A blocked, challenged, or denied state, and nothing else.
  It appears in Frame 01, Frame 03, resolves across Frame 04, and once more in Frame 05 on the
  word `cannot`. It is the reason the eye goes where it goes. This is the single most disciplined
  colour rule in the film.

**Timing model** — every frame's voice clip is placed at its frame's **start** by the assembler and
runs for its measured duration; the remainder of each frame is deliberate silence. Frame durations
are authored, not derived from speech: 28.85s of narration sits inside a 69s film (42% speech
density). The silence is not padding — it is where the holds, the block landing, and the evidence
resolve. **Reveals are cued to the voiceover while it speaks; the payoff reveal of a frame lands
in the silence after it.**

| Frame | Span | Voice in frame | Silence after |
| ----- | ---- | -------------- | ------------- |
| 01 | 0–7s | 0–1.39s | 5.61s |
| 02 | 7–13s | 0–2.94s | 3.06s |
| 03 | 13–22s | 0–5.16s | 3.84s |
| 04 | 22–30s | 0–4.97s | 3.03s |
| 05 | 30–38s | 0–4.82s | 3.18s |
| 06 | 38–49s | 0–3.69s | 7.31s |
| 07 | 49–59s | 0–3.75s | 6.25s |
| 08 | 59–69s | 0–2.13s | 7.87s |

**Motion grammar + reveal model** — one camera, one feel, for the whole 69 seconds. Long-tail
settles throughout (`power3`); **no bouncy eases anywhere** — no `back.out`, no `bounce.out`, no
`elastic.out`, not even on the hook's slam, because a smooth settle is what makes this read as a
launch film rather than a template. Nothing appears before the voiceover reaches it.

**Aliveness budget** — during a hold, the only sanctioned motion is **subtle jitter**
(`sine-wave-loop`, low-amplitude, finite tween across the hold) on the single element that needs
to feel live. No lazy breathing, no circular scale loops, no slow pan or push in any back half.
"I'd rather have no motion than bad motion."

**Rhythm and held-frame allocation** — the quiet is load-bearing:

- **Frames 01 and 04 are the two held frames.** Both are the spine; both go still after their key
  reveal. Frame 01 holds on the amber block because the silence *is* the joke landing. Frame 04
  holds on the two evidence lines because that is the payoff and the viewer must be able to read it.
- Frames 03, 06, and 08 run busiest — real terminal streams, a two-panel split, a typing block.
- Frames 02, 05, and 07 sit between: resolve on the voice, then settle into a long silence.
- Every frame ends on a held read. On short shots the final reveal and the hold are one window.

**Caption band** — the bottom ~17% of the canvas is reserved. All content is planned into the top
~83%. The terminal blocks in Frames 03, 04, 06, and 08 are the frames most at risk of this; every
load-bearing line sits in the upper two-thirds.

**Negative list** — what never appears in this film:

- No green-to-purple or purple-to-blue "AI" gradients. No glassmorphism, no floating bokeh, no
  volumetric light, no lens flare, no particle field.
- No drop shadows, no rounded surfaces, no gradient on a ground. The plane is flat; structure comes
  from 1px hairlines and type scale. 0 radius.
- No more than one display moment per frame. No second display word competing.
- **Slideshow** (front-load then freeze) and **screensaver** (everything floating independently) —
  the two failure modes this film is specifically built to avoid.
- **No fabricated Sentinel logo.** The capture's only `logo-*` asset is a Lucide hamburger icon.
  The wordmark is typeset in Geist, never drawn or imitated.
- **No comparative claim against any named competitor**, anywhere, in any frame.
- **No burned-in captions.** The film's entire design language is large terminal type; a caption
  rail over it would be redundant clutter competing with the load-bearing lines.

---

## Frame 1 — It stopped itself

- scene: Cold open on a terminal already mid-run. A single amber line lands hard: the blast-radius block on `src/billing/retry.js`. Three words of type hold above it. Nothing else on screen.
- voiceover: "It stopped itself."
- duration: 7s
- transition_in: cut
- status: animated
- src: compositions/frames/01-it-stopped-itself.html
- type: hook
- persuasion: Pattern interruption — every competitor video shows an agent succeeding; this one shows one refusing, cold, with no setup
- beat: tension + surprise
- blueprint: kinetic-type-beats (Adapt)
- sfx: impact-bass-1
- asset_candidates:

Adapt: keep the kinetic-type slam as the signature move; the substitution is that the "word" being
slammed is a claim, and the amber terminal line beneath it is the receipt.

Scene 1 (0.0–0.2s): bare `{colors.ground}` field, empty. The frame is deliberately empty for the
first beat — this is a cold open and should feel like walking in on something already in progress.
Centered, very low density for this instant only.

Scene 2 (0.2–1.4s): on the voiceover, `it stopped itself.` arrives as a **kinetic beat-slam** — the
blueprint's own signature move, three words each on its own landing, per-word staggered — Geist at `h1`
lowercase, off-white, timed to finish as the last word lands. Upper-left third, rule-of-thirds rather
than centered, leaving the lower two-thirds for the evidence. A 36×2 sage-green rule stub sits above
it as the only ornament.

Scene 3 (1.4–3.4s): **in the silence after the voiceover**, the amber line types on behind a
blinking caret (**type-on with caret**, `discrete-text-sequence`) — `→ blast-radius
src/billing/retry.js` — then a second amber line lands on **hard-cut / flash word-swap**
(`discrete-text-sequence`): `blocked · cite file:line + rollback`. Lower-left, mono at `term-load`
for phone legibility. Amber, and amber only. The proof arriving *after* the claim is spoken, in
silence, is the whole point of the frame.

Scene 4 (3.4–7.0s): **held frame.** 3.6s of held silence. Nothing moves. The caret stops blinking
and holds. At most a **subtle jitter** (`sine-wave-loop`, low amplitude, finite tween across the
hold) on the blocked line. No breathing, no drift, no back-half push.

---

## Frame 2 — The name

- scene: The terminal recedes. Massive lowercase type resolves on near-black: `sentinel`. One line beneath it states the thesis.
- voiceover: "Sentinel. The coding agent that shows its work."
- duration: 6s
- transition_in: zoom-through
- status: animated
- src: compositions/frames/02-the-name.html
- type: product_intro
- persuasion: Promise stated plainly — the product line, unembellished
- beat: clarity
- blueprint: titlecard-reveal (Reproduce)
- sfx: ping
- asset_candidates:

The value beat. It must be legible as a value claim with all evidence deleted. `shows its work` is
the claim; the remaining six frames are six kinds of proof.

Scene 1 (0.0–0.4s): bare ground, empty. A single sage-green rule stub draws on as **SVG self-draw**
(`svg-path-draw`) above the optical centre — thin, and the only element.

Scene 2 (0.4–1.7s): on "Sentinel", the wordmark resolves by **per-word staggered reveal**
(`dynamic-content-sequencing`) — lowercase `sentinel` at `display` scale, off-white, left-anchored,
sitting on the rule stub. One display moment; nothing competes.

Scene 3 (1.7–2.94s): on "shows its work", the thesis line arrives beneath as **hard-cut / flash
word-swap** (`discrete-text-sequence`), mono at `term-load`, sage-grey, with the two words
`shows its work` in off-white. Left-anchored to the wordmark, generous empty right half.

Scene 4 (2.94–6.0s): **held.** 3.1s of silence on the resolved lockup. Subtle jitter
(`sine-wave-loop`, low amplitude) on the wordmark only. The promise sits still and is trusted.

---

## Frame 3 — One ask, and then it stops

- scene: A real terminal session plays at speed. The operator's command types, then the tool stream lands line by line: the grep, the read, and then the block. The block is the last line and it is amber.
- voiceover: "You ask for one thing. It reads the code, finds the line that matters, and stops."
- duration: 9s
- transition_in: push-slide LEFT
- status: animated
- src: compositions/frames/03-one-ask.html
- type: feature_showcase
- persuasion: Show-don't-tell proof — the actual mechanism, at the actual speed, with the product's own strings
- beat: tension + focus
- blueprint: agent-progress-theater (Adapt)
- sfx: typing, impact-bass-2
- asset_candidates:

Adapt: keep the progress-theater signature — trigger → working theater → receipt — but compress the
"working" into two real tool lines rather than a scanning montage, because the product's own speed
is part of the credibility.

Real strings, in this order, all from the product's own hero transcript:

```
~/ledgerline                                    BUILD · idle
$ sentinel ask -b "raise the retry limit for failed charges"
→ grep "MAX_RETRIES" src/                       2 matches
→ readFile src/billing/retry.js:40-72           33 lines
→ blast-radius src/billing/retry.js             blocked · cite file:line + rollback
```

Scene 1 (0.0–0.3s): bare ground; a 1px hairline top bar draws across as terminal chrome, and the
`~/ledgerline` + `BUILD · idle` title row lands. Establishes we are inside a terminal. Left-aligned,
upper third; nothing below it yet.

Scene 2 (0.3–1.8s): on "You ask for one thing", the prompt types on (**type-on with caret**,
`discrete-text-sequence`) — `$ sentinel ask -b "raise the retry limit for failed charges"`, with a
soft `typing` cue under it. Mono at `term-line`.

Scene 3 (1.8–3.6s): on "It reads the code, finds the line that matters", the two tool lines land in
sequence, each on its own beat — `→ grep "MAX_RETRIES" src/` + `2 matches` (1.8–2.7s), then
`→ readFile src/billing/retry.js:40-72` + `33 lines` (2.7–3.6s). Per-line staggered reveal
(`dynamic-content-sequencing`). Everything above holds perfectly still while these land.

Scene 4 (3.6–5.16s): on "and stops", the amber block lands alone and hard —
`→ blast-radius src/billing/retry.js`, then `blocked · cite file:line + rollback` at `term-load`.
Amber, and amber only. `impact-bass-2` on the landing. Every other line holds dead still so the
block is the only thing that moves.

Scene 5 (5.16–9.0s): **held, 3.8s of silence.** The dramatic comma. The block holds; subtle jitter
only. Do **not** advance to any result — Frame 4 owns that, and cutting straight to it would spend
the whole beat.

---

## Frame 4 — The evidence

- scene: Same terminal, same frame — but now the amber block resolves into the agent's re-issued call. The file:line and the rollback land as two separate, oversized lines.
- voiceover: "Then it shows its work — the line it read, and the exact command that undoes it."
- duration: 8s
- transition_in: cut
- status: animated
- src: compositions/frames/04-the-evidence.html
- type: benefit_highlight
- persuasion: Feature-to-benefit translation — "justifies before it lands" becomes "you can audit any change it makes"
- beat: relief + control
- blueprint: kinetic-type-beats (Adapt)
- sfx: click-soft
- asset_candidates:

The payoff of the film's spine. The refusal was only interesting because an answer followed it.
This is the beat that separates Sentinel from an agent that merely refuses to do things.

The two lines, verbatim from the product's own transcript:

```
retry.js:58  caps retries at 3
rollback     revert the checkpoint
```

Scene 1 (0.0–0.3s): **hard cut in**, landing mid-motion on both sides. Same terminal, same frame,
the amber block still present but the caret now on a fresh line below it. The cut is the one genuine
dramatic snap in the film rather than a navigational move.

Scene 2 (0.3–2.3s): on "shows its work", the amber block **de-emphasises** — amber drops to
sage-grey, a real state change, not a crossfade — and the first evidence line types on at
`term-load`, now off-white: `retry.js:58  caps retries at 3`.

Scene 3 (2.3–4.4s): on "and the exact command that undoes it", the second evidence line lands on its
own beat at `term-load`: `rollback  revert the checkpoint`. Sage-green for the `rollback` token only —
the one place green means "this is your way out."

Scene 4 (4.4–8.0s): **held payoff, 3.6s.** Both lines still, nothing moves. Subtle jitter on the
rollback line only. This is the frame the whole film earned; it is not interrupted.

---

## Frame 5 — The rule, not the mood

- scene: Six mode names stack and step through one at a time. A tool-allowlist bracket opens beside the active one, showing exactly what it may touch.
- voiceover: "Six modes. Each one an allowlist the model cannot talk its way out of."
- duration: 8s
- transition_in: push-slide LEFT
- status: animated
- src: compositions/frames/05-the-rule.html
- type: feature_showcase
- persuasion: Mechanism depth — answers the skeptic's "so what if the model asks nicely?" before they ask it
- beat: skepticism → trust
- blueprint: grid-card-assemble (Adapt)
- sfx: click-soft
- asset_candidates:

Adapt: keep the assemble-and-settle signature but use the frame spec's **fadelist** treatment — a
vertical opacity stack at 1.0/0.5/0.22 — instead of a card grid, because six mode names read better
as a list than as tiles, and the preset caps visible density.

Explains that the refusal was policy rather than whim, which retroactively strengthens Frame 1.
Without this the gate looks like a limitation; with it, it looks like design.

Real content — the six modes and their stated purposes: `BUILD` actually making changes · `PLAN`
questions, review, exploration · `REVIEW` diff review with a focused prompt · `SCAN` security
scanning · `FIX` safe auto-fix, no shell · `SWE` reproduce-first bug fixes.

Scene 1 (0.0–0.3s): bare ground with a left-aligned hairline axis running the height of the type
column. Nothing else.

Scene 2 (0.3–1.4s): on "Six modes", the six names reveal down the left third via **cluster→outward
expansion** (`center-outward-expansion`), but only three legible at any instant on the 1.0/0.5/0.22
opacity ladder. Mono at `term-line`, mode names in off-white, purposes in sage-grey.

Scene 3 (1.4–3.2s): on "an allowlist", a tool-allowlist bracket **draws on** beside the active mode
via **SVG self-draw** (`svg-path-draw`), sage green. Its permission rows step in one per landing —
file edits allowed / shell allowed, per the product's real mode definitions.

Scene 4 (3.2–4.82s): on "cannot talk its way out of", the bracket **locks** — a hard snap on the
closing bracket. The single word `cannot` in the on-screen copy takes the film's amber. This is the
one amber appearance outside the terminal frames and it is consistent with the rule: the model
being denied *is* a denied state, which is exactly what amber marks.

Scene 5 (4.82–8.0s): hold. Subtle jitter on the locked bracket only. The rule sits still and is
believed.

---

## Frame 6 — It keeps going

- scene: Two terminals side by side. Left: a watcher asleep between ticks. Right: an operator types a steer. The left terminal wakes and absorbs the instruction on its next tick.
- voiceover: "It keeps working when you walk away. And you can still steer it."
- duration: 11s
- transition_in: push-slide LEFT
- status: animated
- src: compositions/frames/06-it-keeps-going.html
- type: benefit_highlight
- persuasion: Future pacing — the viewer's own Tuesday night, where they are not at the keyboard
- beat: relief + control
- blueprint: panel-edit-live-sync (Adapt)
- sfx: key-press, ping
- asset_candidates:

Adapt: keep the cause→effect-across-the-divide signature; the cause and the effect are separated by a
1px hairline and land in **different panels**, which is the whole point of the beat.

Real strings, two cause-and-effect pairs:

Left terminal — `sentinel watch "keep the sync green" -t "command:npm test" -t git -g "npm test
exits 0"`, then `watching: command, git`.
Right terminal — `sentinel steer "also check the retry path"`.
Left again — the instruction absorbed on the next tick, closing on `7 tick(s), $0.41, stopped:
budget`.

Scene 1 (0.0–0.4s): the split establishes — two panels on the same ground, divided by a 1px hairline
in `{colors.border-dark}`. Both empty. Symmetric 50/50, one divider, no gap between panels.

Scene 2 (0.4–2.0s): on "It keeps working when you walk away", the left panel's watcher command types
on (**type-on with caret**), then its status line `watching: command, git` lands beneath. Mono at
`term-line`. The right panel stays empty — the asymmetry is the setup.

Scene 3 (2.0–3.69s): on "And you can still steer it", the right panel's `sentinel steer "also check
the retry path"` types on with a soft `key-press`. Both panels are live simultaneously; they are
never crossfaded into each other, because they are concurrent, not sequential.

Scene 4 (3.69–8.4s): **in the silence**, the left panel's next tick fires — `ping` — and the steer
instruction is absorbed as a sage-green line lands there: `▸ operator: also check the retry path`.
The tick's work then streams beneath it, closing on `7 tick(s), $0.41, stopped: budget`. Cause on
the right, effect on the left, one beat apart. This is the clearest demonstration in the film.

Scene 5 (8.4–11.0s): hold both panels. Subtle jitter on the right panel's caret only, so the two
terminals read as still-running without anything looping.

---

## Frame 7 — What it cost

- scene: A cost counter ticks through a session's worth of work — every turn priced as it lands — and settles on `$0.00`. A stat row resolves beneath it.
- voiceover: "Every turn prints what it cost. The default costs nothing."
- duration: 10s
- transition_in: zoom-through
- status: animated
- src: compositions/frames/07-what-it-cost.html
- type: social_proof
- persuasion: Statistical proof, and risk reversal — the price is the risk being removed
- beat: confidence
- blueprint: dataviz-countup (Reproduce)
- sfx: pop
- asset_candidates:

Converts the trust the first five frames earned into a decision. Trust alone does not make anyone
install; a price of zero does.

Scene 1 (0.0–0.3s): bare ground, empty. Centered, very low density.

Scene 2 (0.3–1.9s): on "Every turn prints what it cost", a **value-scaled counter**
(`counting-dynamic-scale`) begins ticking — the number climbs and its size grows with the value, so
the climb itself escalates. Beneath it, a stack of per-turn rows lands one per beat, each with its
own token count and cost. The counter must **not** be pre-settled on screen; the climb is the beat.
Centered hero, ~50% of frame.

Scene 3 (1.9–3.75s): on "The default costs nothing", the counter's climb decelerates and lands on
`$0.00` — the scale settling as the value stops, per the value-scaled recipe. Sage green, and now the
largest element in the frame. A soft `pop` on the landing.

Scene 4 (3.75–6.5s): **in the silence**, four stat cards resolve beneath via per-card staggered
reveal, top-border-only per the frame spec, numerals in green and labels in sage-grey: `19`
sandboxed local tools · `12` providers one client · `0` servers · `0` telemetry. Arranged 3 across
plus 1 beneath, per the stat-grid treatment's aspect behaviour.

Scene 5 (6.5–10.0s): hold the resolved grid. No breathing, no push. The number and the stats sit
still and are read.

**No comparative claim of any kind appears in this frame or anywhere in the film.** `BENCHMARKS.md`
§5 is explicit that the SWE-mini results must not be presented as beating a named competitor, and
nothing here asserts otherwise.

---

## Frame 8 — Run it

- scene: The terminal, empty and waiting. The install sequence types itself out line by line, then the product starts and a first prompt waits at the caret.
- voiceover: "Four commands, and then you just type."
- duration: 10s
- transition_in: push-slide LEFT
- status: animated
- src: compositions/frames/08-run-it.html
- type: cta
- persuasion: Friction removal — the barrier is the install, so the install is the last thing we show
- beat: momentum
- blueprint: prompt-type-submit-generate (Reproduce)
- sfx: typing, chime
- asset_candidates:

Closes on the only action we are asking for. The invitation is the command itself, typed, not a
button.

Real install block, verbatim from the product's own site:

```
git clone https://github.com/KunjShah95/SENTINEL-CLI.git
cd SENTINEL-CLI
npm install
npm link
export GROQ_API_KEY=gsk_…
sentinel
```

Scene 1 (0.0–0.3s): empty terminal, caret blinking at a fresh prompt. Upper-left, everything below
empty.

Scene 2 (0.3–2.13s): on "Four commands", the install block types on line by line (**type-on with
caret**, `discrete-text-sequence`), each line cued on its own landing: `git clone …` / `cd
SENTINEL-CLI` / `npm install` / `npm link`. Four lines, four landings, `typing` underneath. Mono at
`term-line`.

Scene 3 (2.13–5.2s): **in the silence**, `export GROQ_API_KEY=gsk_…` types on, then `sentinel` —
the product starts, and a first prompt waits at the caret. The block holds.

Scene 4 (5.2–8.2s): the end card — the wordmark `sentinel` in Geist at display scale resolves above
the repo URL as a mono label. **No logo mark is drawn**: the capture's only `logo-*` candidate is a
Lucide hamburger icon, and a fabricated logo would ship off-brand. The wordmark is typeset.

Scene 5 (8.2–10.0s): hold the end card on a soft `chime`, then cut to black. This is the only frame
in the film with a real exit; every other frame's exit is its injected `transition_in`.
