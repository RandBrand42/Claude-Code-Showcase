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

### Not yet done (from the same feedback list)
Neuron Forge simplified mode, Resonance genre switching / song library / themes, Prism "Dark Side" theme, Atmos live data, Mnemo OneDrive/Claude/Copilot access.
