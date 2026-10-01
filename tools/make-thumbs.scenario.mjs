/**
 * make-thumbs.scenario.mjs - turns each app's screenshots/hero.png into a small WebP for the gallery
 * (assets/thumbs/<app>.webp, 960 px wide). Run from the repo root; uses the headless browser's canvas,
 * so no image library is needed:
 *
 *   node tools/browse.mjs index.html --script=tools/make-thumbs.scenario.mjs --out=_scratch/thumbs-run.png
 *
 * Re-run whenever a hero screenshot changes or a new app is added, then run tools/build-registry.mjs.
 */
import fs from 'node:fs';
import path from 'node:path';

const WIDTH = 960, QUALITY = 0.82;

export default async (page) => {
  const root = process.cwd();
  const outDir = path.join(root, 'assets', 'thumbs');
  fs.mkdirSync(outDir, { recursive: true });
  const apps = fs.readdirSync(root, { withFileTypes: true })
    .filter((d) => d.isDirectory() && fs.existsSync(path.join(root, d.name, 'screenshots', 'hero.png')) && fs.existsSync(path.join(root, d.name, 'app.json')))
    .map((d) => d.name);

  for (const id of apps) {
    const dataUrl = await page.eval(`new Promise((resolve, reject) => {
      const img = new Image();
      img.onload = () => {
        const w = Math.min(${WIDTH}, img.naturalWidth), h = Math.round(img.naturalHeight * w / img.naturalWidth);
        const c = document.createElement('canvas'); c.width = w; c.height = h;
        const x = c.getContext('2d'); x.imageSmoothingQuality = 'high'; x.drawImage(img, 0, 0, w, h);
        try { resolve(c.toDataURL('image/webp', ${QUALITY})); } catch (e) { reject(e); }
      };
      img.onerror = () => reject(new Error('could not load ${id} hero'));
      img.src = ${JSON.stringify('')} + '${id}/screenshots/hero.png';
    })`);
    if (!dataUrl.startsWith('data:image/webp')) throw new Error(`${id}: browser did not produce WebP`);
    const buf = Buffer.from(dataUrl.split(',')[1], 'base64');
    fs.writeFileSync(path.join(outDir, `${id}.webp`), buf);
    const src = fs.statSync(path.join(root, id, 'screenshots', 'hero.png')).size;
    console.log(`${id.padEnd(14)} ${(src / 1024).toFixed(0).padStart(5)} KB png -> ${(buf.length / 1024).toFixed(0).padStart(4)} KB webp`);
  }
};
