#!/usr/bin/env node
/**
 * browse.mjs - zero-dependency headless-browser driver for verifying the showcase apps.
 * Talks to Edge/Chrome over the Chrome DevTools Protocol (Node 22+ built-in WebSocket).
 *
 * Usage:
 *   node tools/browse.mjs <page.html | http://url> [options]
 *
 * Options:
 *   --out=FILE        screenshot path (default: ./shot.png)        --w=1440 --h=900   viewport
 *   --wait=1500       ms to wait after load before the first shot   --scale=1          device scale factor
 *   --script=FILE     scenario module: export default async (page) => { ... }   (see below)
 *   --mobile          emulate a 390x844 touch phone                 --dark / --light   prefers-color-scheme
 *   --reduced         emulate prefers-reduced-motion
 *
 * Scenario API  (page = ...):
 *   await page.wait(ms)
 *   await page.eval("js expression")            -> returns value (awaits promises)
 *   await page.click("css selector")            real mouse click at element centre
 *   await page.clickAt(x, y)                    real mouse click at viewport coords
 *   await page.drag(x1,y1,x2,y2,{steps:12})     real mouse drag
 *   await page.move(x, y)                       mouse move (hover)
 *   await page.type("text")                     types into the focused element
 *   await page.key("Enter" | "Control+k" | "ArrowDown" | "a")   key press (with modifiers)
 *   await page.scroll(dy)                       wheel scroll at centre
 *   await page.resize(w, h)                     change viewport
 *   await page.shot("name.png")                 screenshot (relative to --out's folder)
 *   page.logs                                   array of {type,text} console output + exceptions
 *
 * Exit summary always prints console errors / uncaught exceptions - fix every one of them.
 */
import { spawn } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

const args = Object.fromEntries(process.argv.slice(2).filter(a => a.startsWith('--')).map(a => { const [k, v] = a.slice(2).split('='); return [k, v ?? true]; }));
const target = process.argv.slice(2).find(a => !a.startsWith('--'));
if (!target) { console.error('usage: node tools/browse.mjs <page> [--out= --w= --h= --wait= --script= --mobile --dark]'); process.exit(2); }

const W = +(args.w || (args.mobile ? 390 : 1440)), H = +(args.h || (args.mobile ? 844 : 900));
const outFile = path.resolve(args.out || 'shot.png');
const outDir = path.dirname(outFile);
fs.mkdirSync(outDir, { recursive: true });
const url = /^https?:|^file:/.test(target) ? target : pathToFileURL(path.resolve(target)).href;

const candidates = [
  'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe', 'C:/Program Files/Microsoft/Edge/Application/msedge.exe',
  'C:/Program Files/Google/Chrome/Application/chrome.exe', 'C:/Program Files (x86)/Google/Chrome/Application/chrome.exe',
  '/usr/bin/google-chrome', '/usr/bin/chromium', '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
];
const exe = candidates.find(p => fs.existsSync(p));
if (!exe) { console.error('No Edge/Chrome found'); process.exit(2); }

const port = 9300 + Math.floor(Math.random() * 500);
const profile = fs.mkdtempSync(path.join(os.tmpdir(), 'showcase-browse-'));
const proc = spawn(exe, [
  '--headless=new', `--remote-debugging-port=${port}`, `--user-data-dir=${profile}`,
  '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist', '--enable-webgl',
  '--autoplay-policy=no-user-gesture-required', '--no-first-run', '--no-default-browser-check',
  '--hide-scrollbars', '--mute-audio', '--allow-file-access-from-files', `--window-size=${W},${H}`, 'about:blank',
], { stdio: 'ignore' });

const sleep = ms => new Promise(r => setTimeout(r, ms));
async function cleanup() {
  // On Windows proc.kill() leaves Edge's child processes (and the debugging port) alive; kill the whole tree.
  try { if (process.platform === 'win32') spawn('taskkill', ['/pid', String(proc.pid), '/T', '/F'], { stdio: 'ignore' }); else proc.kill(); } catch {}
  await sleep(600); try { fs.rmSync(profile, { recursive: true, force: true }); } catch {} }

let wsUrl;
for (let i = 0; i < 240 && !wsUrl; i++) { // up to ~60 s: Edge start-up is slow on a loaded machine
  try { const t = await (await fetch(`http://127.0.0.1:${port}/json`)).json(); wsUrl = t.find(x => x.type === 'page')?.webSocketDebuggerUrl; } catch {}
  if (!wsUrl) await sleep(250);
}
if (!wsUrl) { console.error('Could not attach to browser'); await cleanup(); process.exit(2); }

const ws = new WebSocket(wsUrl);
await new Promise((res, rej) => { ws.onopen = res; ws.onerror = rej; });
let id = 0; const pending = new Map(); const logs = [];
ws.onmessage = ev => {
  const m = JSON.parse(ev.data);
  if (m.id && pending.has(m.id)) { const { res, rej } = pending.get(m.id); pending.delete(m.id); m.error ? rej(new Error(m.error.message)) : res(m.result); return; }
  if (m.method === 'Runtime.consoleAPICalled') {
    const text = m.params.args.map(a => a.value ?? a.description ?? a.type).join(' ');
    logs.push({ type: m.params.type, text });
  } else if (m.method === 'Runtime.exceptionThrown') {
    const d = m.params.exceptionDetails;
    logs.push({ type: 'exception', text: `${d.exception?.description || d.text} (line ${d.lineNumber + 1}:${d.columnNumber})` });
  } else if (m.method === 'Log.entryAdded') {
    const e = m.params.entry; if (e.level === 'error' || e.level === 'warning') logs.push({ type: 'log-' + e.level, text: `${e.text} ${e.url || ''}` });
  }
};
const send = (method, params = {}) => new Promise((res, rej) => { const i = ++id; pending.set(i, { res, rej }); ws.send(JSON.stringify({ id: i, method, params })); });

await send('Page.enable'); await send('Runtime.enable'); await send('Log.enable');
const metrics = { width: W, height: H, deviceScaleFactor: +(args.scale || 1), mobile: !!args.mobile };
await send('Emulation.setDeviceMetricsOverride', metrics);
if (args.mobile) await send('Emulation.setTouchEmulationEnabled', { enabled: true });
const feats = [];
if (args.dark) feats.push({ name: 'prefers-color-scheme', value: 'dark' });
if (args.light) feats.push({ name: 'prefers-color-scheme', value: 'light' });
if (args.reduced) feats.push({ name: 'prefers-reduced-motion', value: 'reduce' });
if (feats.length) await send('Emulation.setEmulatedMedia', { features: feats });

const evalJs = async (expression) => {
  const r = await send('Runtime.evaluate', { expression, awaitPromise: true, returnByValue: true });
  if (r.exceptionDetails) throw new Error(r.exceptionDetails.exception?.description || r.exceptionDetails.text);
  return r.result.value;
};
const mods = (combo) => { const parts = combo.split('+'); const key = parts.pop(); let m = 0; for (const p of parts) { const l = p.toLowerCase(); if (l === 'alt') m |= 1; if (l === 'control' || l === 'ctrl') m |= 2; if (l === 'meta' || l === 'cmd') m |= 4; if (l === 'shift') m |= 8; } return { key, m }; };
const KEYCODES = { Enter: 13, Escape: 27, Tab: 9, Backspace: 8, Delete: 46, ArrowLeft: 37, ArrowUp: 38, ArrowRight: 39, ArrowDown: 40, ' ': 32, Space: 32, Home: 36, End: 35, PageUp: 33, PageDown: 34 };

const page = {
  logs,
  wait: sleep,
  eval: evalJs,
  async shot(name = 'shot.png') { const f = path.isAbsolute(name) ? name : path.join(outDir, name); const r = await send('Page.captureScreenshot', { format: 'png' }); fs.writeFileSync(f, Buffer.from(r.data, 'base64')); console.log('saved', f); return f; },
  async rect(sel) { return evalJs(`(()=>{const e=document.querySelector(${JSON.stringify(sel)});if(!e)return null;e.scrollIntoView({block:'center',inline:'center'});const r=e.getBoundingClientRect();return{x:r.x+r.width/2,y:r.y+r.height/2,w:r.width,h:r.height}})()`); },
  async mouse(type, x, y, extra = {}) { await send('Input.dispatchMouseEvent', { type, x, y, button: 'left', buttons: type === 'mouseReleased' || type === 'mouseMoved' ? 0 : 1, clickCount: 1, ...extra }); },
  async move(x, y) { await send('Input.dispatchMouseEvent', { type: 'mouseMoved', x, y }); },
  async clickAt(x, y) { await this.move(x, y); await this.mouse('mousePressed', x, y); await sleep(30); await this.mouse('mouseReleased', x, y); },
  async click(sel) { const r = await this.rect(sel); if (!r) throw new Error('click: no element ' + sel); await this.clickAt(r.x, r.y); },
  async drag(x1, y1, x2, y2, { steps = 12 } = {}) { await this.move(x1, y1); await this.mouse('mousePressed', x1, y1); for (let i = 1; i <= steps; i++) { await send('Input.dispatchMouseEvent', { type: 'mouseMoved', x: x1 + (x2 - x1) * i / steps, y: y1 + (y2 - y1) * i / steps, button: 'left', buttons: 1 }); await sleep(16); } await this.mouse('mouseReleased', x2, y2); },
  async type(text) { await send('Input.insertText', { text }); },
  async key(combo) { const { key, m } = mods(combo); const code = KEYCODES[key] || (key.length === 1 ? key.toUpperCase().charCodeAt(0) : 0); const text = key.length === 1 && !(m & 6) ? key : (key === 'Enter' ? '\r' : undefined); const base = { key: key === 'Space' ? ' ' : key, windowsVirtualKeyCode: code, nativeVirtualKeyCode: code, modifiers: m }; await send('Input.dispatchKeyEvent', { type: text ? 'keyDown' : 'rawKeyDown', ...base, text }); await send('Input.dispatchKeyEvent', { type: 'keyUp', ...base }); },
  async scroll(dy, x = W / 2, y = H / 2) { await send('Input.dispatchMouseEvent', { type: 'mouseWheel', x, y, deltaX: 0, deltaY: dy }); },
  async resize(w, h) { await send('Emulation.setDeviceMetricsOverride', { ...metrics, width: w, height: h }); await sleep(250); },
};

let exitCode = 0;
try {
  await send('Page.navigate', { url });
  await sleep(600);
  for (let i = 0; i < 40; i++) { if ((await evalJs('document.readyState')) === 'complete') break; await sleep(150); }
  await sleep(+(args.wait || 1500));
  if (args.script) {
    const mod = await import(pathToFileURL(path.resolve(args.script)).href);
    await mod.default(page);
  }
  await page.shot(path.basename(outFile));
} catch (e) { console.error('SCENARIO ERROR:', e.message); exitCode = 1; }

const bad = logs.filter(l => ['error', 'exception', 'log-error', 'assert'].includes(l.type));
const warn = logs.filter(l => ['warning', 'log-warning'].includes(l.type));
console.log(`\n--- console summary: ${bad.length} error(s), ${warn.length} warning(s), ${logs.length - bad.length - warn.length} other ---`);
for (const l of bad) console.log(`[${l.type}] ${l.text}`);
for (const l of warn.slice(0, 8)) console.log(`[${l.type}] ${l.text}`);
for (const l of logs.filter(l => !bad.includes(l) && !warn.includes(l)).slice(0, 10)) console.log(`[${l.type}] ${l.text}`);
if (bad.length) exitCode = exitCode || 1;
try { ws.close(); } catch {}
await cleanup();
process.exit(exitCode);
