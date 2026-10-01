# INFINITUM

*A museum of mathematics: a GPU deep-zoom fractal explorer in plain HTML, CSS and WebGL2.*

![hero](screenshots/hero.png)

> `hero.png` predates a palette retune. Two later screenshots (`tour-seahorse-valley.png`, `julia-inset.png`) were captured by the orchestrating
> session, which also ran the app headlessly with 0 console errors: intro, `J` (Julia view), `P` (palette) and `T` (tour) all worked, reaching about 10^4 zoom in
> df64 mode. The images look blocky because headless Edge renders with software WebGL at a reduced adaptive resolution. See the
> Post-Creation Summary for everything that was and was not verified.

## Purpose
A showcase of hand-written shader work and gallery-style UI: six fractal families, double-single (two-float) arithmetic for deep zoom, cosine palettes, progressive anti-aliasing, cinematic dives and a hands-free tour. No network, no dependencies, no build step.

## Feature tour
- **Families:** Mandelbrot, Julia, Burning Ship, Tricorn, Multibrot (power 2-8), Newton (any real polynomial of degree 2-8, typed live; presets z^3-1, z^3-2z+2, z^8+15z^4-16, z^5-z-1). Switching cross-fades.
- **Deep zoom:** float32 shallow, automatically switches to double-single (hi+lo float pairs, error-free transforms hidden behind uniform `1.0` barriers) below scale 6e-3. Live `10^x` readout and a depth meter with a hatched precision-limit zone.
- **Colour:** smooth iteration colouring, IQ cosine palettes (14 presets, 12 live sliders, random composer, animated cycling), orbit traps (point/line/circle/cross), distance-estimate edge glow, lit **Relief** mode with a draggable light, interior black/period/trap. Palette and lighting edits re-shade cached iteration data without re-iterating.
- **Progressive rendering:** 1 sample while moving at an adaptive resolution scale, then Halton-jittered samples accumulate when idle (a "Refining n / N" indicator shows progress). Pauses when hidden; handles DPR and resize.
- **Julia companion:** a live inset shows the Julia set for the parameter under the cursor; click to lock, `J` to fly into it, optional "Julia orbit" loop.
- **Dive and Tour:** 14 plates with gallery-label captions. Dives use an exponential zoom path with gentle rotation and palette drift; Tour chains them and starts by itself after ~16 s of inactivity. Bookmarks persist in `localStorage`.
- **Share and export:** URL-hash links encode family, view, palette and parameters; tiled PNG export up to 4096 px with progress.

## Run it
Double-click `index.html` (works from `file://`). Optionally `python -m http.server`.

## Controls
| Input | Action |
|---|---|
| drag / WASD / arrows | pan (with inertia) |
| wheel / pinch / `+` `-` | zoom about the cursor |
| double-click, right-click | zoom in / out (Shift+double-click also zooms out) |
| `Q` `E` | rotate |
| `Home`, `Alt+Left/Right` | reset, undo/redo view |
| `P` / `M` | next palette / colouring mode |
| `J` `T` `B` | Julia view, tour, bookmark |
| `F` `H` `I` `?` | fullscreen, hide UI, info, shortcuts |

## How it works
- `js/shaders.js` iterate (float and df64 paths, Brent periodicity detection, distance estimate, traps, Newton), shade (palette, relief lighting, running-average accumulation) and display programs.
- `js/core.js` families, palettes, bookmarks, polynomial parser and Durand-Kerner root finder, URL-hash codec, precision model.
- `js/renderer.js` WebGL2 pipeline: iterate into an RGBA32F data texture, shade into an RGBA16F accumulator, display with cross-fade; tiled export.
- `js/ui.js` dock, popovers, custom sliders and toggles. `js/app.js` camera, input, render loop, dives, tour, intro, export.
- `tests/selftest.js` + `tests/verify.mjs`: GPU data vs a double-precision CPU reference.

## Mock data
There is no data. Bookmarks are coordinates of well-known regions with invented captions.

## Design notes
Ink-black stage, hairline inset frame, ivory wall label in an Iowan/Palatino serif with italic titles and tracked mono coordinates, frosted-glass dock, gold accent. Motion is slow and eased; `prefers-reduced-motion` skips dives and the auto-tour.

## Precision limits (honest)
Double-single carries about 46 usable bits. The app computes the smallest usable scale from the centre magnitude: roughly **1e-11 to 1e-12** near the real axis and about **3e-11** for |c| near 0.75. Below that the zoom is held and a warning shows instead of rendering noise. Newton stays in float32 (limit around 1e-5 to 1e-6). Bookmarks (including "The Abyss" at 6e-10) sit inside the limit. Perturbation theory was not attempted.

## Limitations and ideas
Very high iteration counts at 4096 px may stall weak GPUs (tiles are 384 px to mitigate). Periodicity detection uses sub-pixel tolerance, so deep minibrot interiors cost full iterations. Burning Ship / Tricorn distance estimates are approximate. Ideas: perturbation with BigInt reference orbit, series approximation, video export.

## Post-Creation Summary
**Plan and phases.** Shaders first (float and df64 paths), then a numeric test, then UI and app logic, written as a few large files.

**Verified:** `tests/selftest.js` ran on the real GPU through the project harness. Float shallow views matched a CPU double reference (mean error 8e-7 for Mandelbrot); Multibrot power 3 in df64 at 1e-7 matched to 8e-8 across all 256 samples; no NaN/Inf in 98,304 values across Mandelbrot, Julia, Ship, Newton and deep views; at scale 1e-10 the float32 path produced **1 distinct value** along a 256-px row (solid blocks) while double-single produced **219**. A periodicity false-positive bug (orbits shadowing repelling cycles were classed as interior) was found and fixed this way.

**Also verified:** one full-app headless run (1280x800, 8.5 s wait, intro plus dive) loaded with 0 console errors and 0 warnings; `hero.png` is that capture. Visible in it: wall label, frosted dock, Julia companion inset, depth marker, df64 path active at 10^4.

**Not verified (candidly):** the headless harness then became unresponsive ("Could not attach to browser", hangs), so the rest of the review never happened. `hero.png` predates a palette retune (the intro now uses Ink & Gold; the shot shows the earlier, garish Sunstroke palette) and the depth-meter tick marks added afterwards; it also caught the image mid-dive at the low motion resolution. Not screenshotted or scripted: Relief mode, palette/other popovers, Newton, mobile layout, export, tour, undo/redo, keyboard shortcuts, 60fps behaviour. Bookmark coordinates were not visually checked and some may need adjusting. The deep-zoom CPU comparison at 1e-6..1e-10 compared zero points because every sampled pixel exceeded the test's iteration cutoff; only the distinct-value test covers those depths.

**Size:** 6 JS/CSS/HTML source files plus tests, roughly 1,700 lines.
