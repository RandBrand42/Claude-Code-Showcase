# Deploying to Vercel (and adding apps later)

The suite is 100% static files. Vercel only needs to run one tiny Node script at deploy time
(`tools/build-registry.mjs`) to rebuild the gallery's app list. There are no dependencies to install.

## 1. One-time setup

1. **Put the folder in a GitHub repository.** Either initialise this folder, or copy its contents into an existing repo:

   ```bash
   git init -b main
   git add .
   git commit -m "Add Claude Code Showcase app suite"
   git remote add origin https://github.com/<org>/<repo>.git
   git push -u origin main
   ```

   `_scratch/` and `shot.png` are already git-ignored (they are local test output).

2. **Link the repo to a Vercel project** (Add New Project, import the repo). `vercel.json` already carries the settings,
   so leave the dashboard defaults alone:

   | Setting | Value (from `vercel.json`) |
   |---|---|
   | Framework preset | Other (`"framework": null`) |
   | Build command | `node tools/build-registry.mjs` |
   | Output directory | `.` (the repository root) |
   | Install command | default (nothing to install) |

3. **Optional but recommended: set the repo URL** in `site.config.json` so the gallery's README buttons open the
   Markdown on GitHub (a static host cannot render `.md` files, so without a repo URL the buttons are hidden on the
   hosted site):

   ```json
   { "title": "Claude Code Showcase", "repoUrl": "https://github.com/<org>/<repo>", "branch": "main" }
   ```

4. Push. Share the Vercel URL. Every later push to `main` redeploys automatically.

> **Not yet verified:** `vercel.json` has not been deployed. It uses only standard settings, but the first deploy is the
> real test. If Vercel rejects a setting, the build log names it.

## 2. Test the hosted behaviour locally first

```bash
node tools/serve.mjs          # serves the repo exactly as a static host would, on http://localhost:8080
```

It also prints your LAN address, so a phone on the same Wi-Fi can open the gallery. Windows Firewall may prompt to
allow Node; only allow it on networks you trust.

## 3. Adding a new app to the suite

Each app is a self-contained top-level folder. To add one:

1. Create `my-new-app/` containing an `index.html`. Reference its own files with **relative** paths
   (`css/style.css`, `js/app.js`) and use classic `<script src>` tags. No `import` statements, because browsers block
   ES-module imports from `file://`, and the suite is meant to work both ways.
2. Add `my-new-app/app.json`:

   ```json
   {
     "name": "My New App",
     "kind": "Creative",
     "tagline": "One-line pitch",
     "description": "One or two sentences about what it does.",
     "tech": ["Canvas", "Web Audio"],
     "hue": 150,
     "order": 100,
     "feature": false
   }
   ```

   | Field | Required | Notes |
   |---|:-:|---|
   | `name`, `kind`, `tagline`, `description`, `tech` | yes | `kind` becomes a filter chip; new kinds appear automatically |
   | `hue` | no | 0-360 card accent colour (default 220) |
   | `order` | no | lower sorts first (default 1000, so new apps land at the end) |
   | `feature` | no | `true` gives the card a featured treatment |

3. Add `my-new-app/screenshots/hero.png` (about 1440x900) and a `README.md` (optional but expected).
4. Rebuild the gallery data and thumbnail:

   ```bash
   npm run thumbs      # makes assets/thumbs/my-new-app.webp from the hero screenshot (needs Edge or Chrome locally)
   npm run registry    # rewrites registry.js
   ```

   Commit `registry.js`, `assets/thumbs/` and the new folder, then push. Vercel also re-runs the registry step on every
   deploy, so a forgotten `registry.js` cannot leave a new app out of the gallery. The thumbnail step cannot run on
   Vercel (it needs a browser), which is why thumbnails are committed. If a thumbnail is missing the card falls back
   to the full `hero.png`.

If a manifest is invalid the build **fails with a message** instead of silently dropping the app.

## 4. Files that make this work

| File | Purpose |
|---|---|
| `vercel.json` | Build command, output directory and a few safe response headers |
| `package.json` | Convenience scripts only (`build`, `registry`, `thumbs`, `serve`); no dependencies |
| `site.config.json` | Site title and the GitHub repo URL used for README links |
| `<app>/app.json` | Per-app metadata for the gallery |
| `registry.js` | **Generated** list of apps and code statistics read by `index.html` |
| `assets/thumbs/*.webp` | **Generated** 960 px gallery thumbnails (about 450 KB for all nine, against about 6 MB of PNGs) |
| `tools/build-registry.mjs` | Scans for apps, validates manifests, writes `registry.js` |
| `tools/make-thumbs.scenario.mjs` | Makes the thumbnails using the headless browser harness |
| `tools/serve.mjs` | Local static server with LAN addresses |

## 5. Phones and tablets

Every app has a viewport tag and several have phone layouts, but the apps are designed for large screens. The gallery
shows a dismissible notice on small screens. Phone behaviour was only checked in emulated phone-sized windows, never
on a real device. GPU-heavy apps (Fluxfield, Infinitum, Orbital) will run slower on phones.
