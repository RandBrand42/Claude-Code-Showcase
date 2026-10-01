# Changelog

## Batch A - performance, polish and navigation

Reported after testing the hosted build.

| Area | Change | Evidence |
|---|---|---|
| **Gallery** | Idle GPU use reduced. Removed the full-screen blur layer and its animation, the full-screen blend-mode grain, the animated headline gradient and all `backdrop-filter` badges (each had to re-blur behind an always-animating canvas). The star canvas now runs at 30 fps, drops to 12 fps after 8 s without input, uses fewer points and renders at 1x. | Code change only. **GPU load was not measured**; please re-check on the RTX 4000 |
| **Infinitum** | New **Frame rate** control in Render quality (Smooth 60 / Balanced 30 / Eco 20), default Balanced 30. Adaptive resolution thresholds now follow the cap, and dives and the auto-tour render at up to 60% resolution unless the cap is 60. | Syntax-checked; loads clean. **GPU load not measured** |
| **Prism** | The low drone ("hum") is now optional ambience, off by default, with an **Ambience hum** toggle in the pause menu. Choice is remembered. | Syntax-checked; loads clean. Audio not listened to |
| **Meridian** | **Bug fixed:** "big order" rows and toasts reused the CSS class `big`, which is the huge tightly-tracked KPI numeral style, so their text was crushed together. Renamed to `bigorder`. | Reproduced in a screenshot before the fix; computed letter-spacing is `normal` and the toast reads correctly after |
| **Meridian** | Live feed **speed toggle**: Real-time (the day's actual arrival rate, Poisson-style gaps), Relaxed (one order per 5-10 s, the new default) and Fast (1-3 s, the old behaviour). Choice is remembered. | Toggle present and switching verified in a scripted run |
| **Meridian** | **Density** now clearly different: compact tightens spacing and the whole type scale, not just five padding variables. Feed row height follows density. | `data-density` toggles; visual comparison screenshots captured but not side-by-side reviewed |
| **Meridian** | The "+amount" badge no longer lands on the "Orders per minute" label during its pop animation. | CSS change; not re-captured |
| **All apps** | **"Showcase" link** back to the gallery (`assets/showcase-nav.js`), placed per app to avoid each app's own controls. Phone placements checked for overlaps; Meridian and Mnemo hide it on phones because they have no free spot. | Geometric overlap test on all nine apps at desktop and phone size; click test returns to the gallery |

Also: Orbital and Mnemo gained inline favicons (they logged a 404 for `/favicon.ico` when served over http).

## Batch B1 - Neuron Forge simple mode

| Area | Change | Evidence |
|---|---|---|
| **Neuron Forge** | New **Simple mode** (top-bar switch, `E` key, or `index.html#simple`): plain-language labels, expert controls hidden, a Coach that narrates what the network is doing, kid-friendly tooltips / guided tour / experiments, five Missions on the existing scoring engine, and a 12-word glossary. The normal app is unchanged: switching off restores the original text. | Scripted run: no jargon left in visible text, Coach changes state (including correct "memorizing" detection on the Swirl), 5 missions load, glossary has 12 entries, two on/off round trips restore every text label, 0 console errors, phone layout has no horizontal overflow, diagram labels measured as unclipped |
| **Neuron Forge** | Only change to existing code: `main.js` now exposes `renderLearn` on `NFApp`. | |

**Not verified:** reading level with real children, screen readers, Firefox / Safari, and the Coach wording in every edge case.

## Batch B2 (part 1) - Resonance: restyle any song into another genre

| Area | Change | Evidence |
|---|---|---|
| **Resonance** | New **STYLE** picker (header, under the LCD): 14 genres (Piano, Orchestral Strings, Harpsichord, Jazz, Blues, Rock, Reggae, Funk, Lo-fi Hip-Hop, Trap, House, Techno, Synthwave, Ambient) plus **Original**. A style keeps the notes, key, pattern structure and chain, and changes tempo, swing, the whole patch and effects, chord stacking, how the notes are played (gate / velocity / slides, with repeatable humanising) and writes a genre drum arrangement (groove, variation, breakdown and fill assigned to patterns A-D by how busy each was). Styles always derive from a saved copy of the song, so **Original** is an exact undo and styles never stack. Blues also switches the scale (and scale lock) to the blues scale. | **3,472** logic checks pass (melody identity, tempo / swing / chord, no drum hits beyond the pattern length, no stacking, exact restore; across 4 source songs and 5 pattern lengths) and a negative control proves the checker can fail. **45 offline audio renders** (15 variants x 3 songs): 0 NaN, 0 clipped samples, no silent renders, peaks <= -4 dB. Driven through the real UI in headless Edge: modal, apply, LCD, restore, live playback; 0 console errors |
| **Resonance** | Pattern lengths **12 and 24 steps** added (appended to the step list, so saved patches keep their step-count index) for waltz and 6/8 material. | Covered by the logic checks above |
| **Resonance** | New hidden **TRIM** parameter (-12..+18 dB, default 0, not on the panel) in the master chain ahead of the compressor, used to even out loudness between styles. | See below |

**Provisional:** the per-style loudness trims are first estimates. The first render matrix showed a 21 dB loudness spread between styles (Rock about -16 dB RMS, Strings on a sparse source about -35 dB), so trims were added but **have not yet been re-measured**; they will be calibrated against the song library.
**Not verified:** how any of it sounds. Nobody has listened. Everything above is numerical (levels, timing, structure), not musical judgement.

### Not yet done (from the same feedback list)
Resonance genre switching / song library / themes, Prism "Dark Side" theme, Atmos live data, Mnemo OneDrive/Claude/Copilot access.
