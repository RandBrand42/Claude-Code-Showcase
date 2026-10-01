# Build Standards for Showcase Apps

Every app in this collection was built to the same bar. This document is the brief that each app was
built against, kept here so the process is transparent and repeatable.

## 1. Ground rules

- **Scope.** Work only inside your own app folder (`<repo>/<app-slug>/`). Do not edit other apps, `tools/`, or `docs/`.
- **Mock data only.** All people, companies, products, metrics and documents are invented. Use obviously fictional
  brands. No real PII, no real company data, no JPI data, no real credentials of any kind.
- **No network, no auth.** The apps make **zero** external requests: no CDN scripts, no web fonts, no remote images,
  no analytics, no APIs. They must work fully offline. Never authenticate to any service.
- **No build step.** Plain HTML + CSS + JavaScript. Open `index.html` by double-clicking (file://) and it must work.
  Because file:// blocks ES-module imports, use **classic `<script src>` tags** (an IIFE / a single global namespace
  per file), not `import`. Multiple files are fine and encouraged for readability (`css/`, `js/`).
- **No npm dependencies.** Hand-roll everything (charts, physics, audio, markdown, graph layout, ...). That is part of the showcase.

## 2. Design bar ("a marvel to behold")

The front end is the headline. Aim for something that looks like a funded product studio shipped it.

- **Distinct art direction** per app (it is specified in your brief). Define a real design system up front:
  CSS custom properties for color, spacing, radii, shadows, motion durations/easings, and a type scale.
- **Typography.** System font stacks only, but use them deliberately: a display stack, a text stack, a mono stack
  (`"Segoe UI Variable Display","Segoe UI",system-ui,...`, `"Cascadia Code","SF Mono",Consolas,monospace`, serif stacks like
  `"Iowan Old Style","Palatino Linotype",Georgia,serif`). Use tabular numerals for numbers, tight tracking on large text,
  careful line-heights and a clear hierarchy.
- **Color.** A curated palette with intent (not default blue/purple gradients everywhere). Sufficient contrast (WCAG AA for text).
  Support `prefers-color-scheme` or provide a theme toggle where it suits the concept.
- **Motion.** An orchestrated entrance, smooth 60fps animation, spring/eased transitions, hover/press/focus states on
  every interactive element, number count-ups, animated chart transitions. Respect `prefers-reduced-motion`.
- **Polish everywhere.** Custom-styled scrollbars, sliders, selects, toggles, tooltips, focus rings. Empty, loading and error
  states. Nothing should look like an unstyled browser default. Inline SVG icons (hand-drawn set) - **no emoji as UI icons**.
- **Real content.** No lorem ipsum, no "Item 1 / Item 2". Write believable copy and realistic mock data.
- **Responsive.** Looks intentional from 360 px phones to 2560 px monitors. Touch support where interaction is spatial.
- **Accessible.** Semantic HTML, labels, keyboard operability, visible focus, ARIA where needed, `prefers-reduced-motion`.
- **Delightful details.** Keyboard shortcuts (with a `?` help overlay), a command palette where it fits, easter eggs,
  thoughtful micro-copy, a first-load "wow" moment that works **without** the user doing anything.

## 3. Engineering bar

- Clean, readable, commented-where-non-obvious code in the style of a senior engineer. No dead code, no giant copy-paste.
- Handle `devicePixelRatio`, resize, tab visibility (pause work when hidden), and cleanup of timers/listeners.
- Deterministic seeded PRNG for mock data so screenshots and demos are reproducible.
- Persist user state in `localStorage` only inside `try/catch` (it may be unavailable).
- Performance: avoid layout thrash, allocate outside hot loops, use typed arrays / offscreen canvases where it matters.
- **Zero console errors or warnings** on load and through every interaction.

## 4. Verification (mandatory - do not skip)

Use the project harness `tools/browse.mjs` (headless Edge/Chrome over the DevTools protocol; Windows-ready; WebGL2 works).

```powershell
# screenshot + console-error summary
node tools/browse.mjs "<app>/index.html" --out="<app>/screenshots/hero.png" --w=1440 --h=900 --wait=2500
# scripted interaction (click, type, key presses, drag, resize, eval, multiple screenshots)
node tools/browse.mjs "<app>/index.html" --out="<app>/screenshots/x.png" --script="<scratch>/scenario.mjs"
#   other flags: --mobile  --dark  --light  --reduced  --scale=2
```

Then **open the PNGs with the Read tool and critique them like a design director**: alignment, spacing rhythm, contrast,
clipped/overlapping text, empty areas, anything that looks default or cheap. Fix, re-shoot, repeat. Do at least three
full visual-review rounds. Also test: a narrow/mobile viewport, every primary interaction, and the keyboard shortcuts.
Fix every console error. The harness exit code is non-zero when there are console errors.

Keep throw-away scripts in your scratchpad/temp folder, not in the app folder. Final curated screenshots go in
`<app>/screenshots/` (`hero.png` plus 2-4 more that show distinct features) and are referenced from the README.

## 5. README requirements (`<app>/README.md`)

Write it like a product README, in this order:

1. **Title, tagline, hero screenshot.**
2. **Purpose** - what the app is, who it is for, and why it exists (what it demonstrates).
3. **Feature tour** - grouped, specific, with screenshots.
4. **Run it** - double-click `index.html` (no install). Optional: `python -m http.server`.
5. **Controls & keyboard shortcuts** - a table.
6. **How it works** - file map, key algorithms / data flow, notable technical decisions.
7. **Mock data** - state clearly that all data is fictional and how it is generated.
8. **Design notes** - palette, type, motion principles.
9. **Limitations & ideas** - honest, specific.
10. **Post-Creation Summary** - a candid account of how the app was made: the plan, the build phases, key decisions and
    trade-offs, problems hit and how they were solved, what was verified (screenshot rounds, scripted interaction tests,
    console cleanliness, viewport sizes) and what was *not* verified, plus final size (files / lines of code).
    Do not claim anything you did not actually do or check.

## 6. Finishing

- Time box: roughly **20-25 minutes** of wall-clock time. Get the core working and looking great within the first ~10,
  then spend the rest on polish, verification and docs. Check `Get-Date` periodically.
- Your final message to the orchestrator should be short (under 200 words): what was built, file list, what you verified,
  known issues. No need to repeat the README.
