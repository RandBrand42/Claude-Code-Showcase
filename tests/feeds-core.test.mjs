// Unit tests for the news / video collector. Run:  node tests/feeds-core.test.mjs
// Add --live to also fetch every real source once (needs network; prints a summary only).
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
const require = createRequire(import.meta.url);
const here = path.dirname(fileURLToPath(import.meta.url));
const F = require(path.join(here, '..', 'lib', 'feeds-core.js'));

let pass = 0, fail = 0;
const t = async (name, fn) => { try { await fn(); pass++; console.log('  ok   ' + name); } catch (e) { fail++; console.log('  FAIL ' + name + '\n       ' + String(e.message).split('\n').join('\n       ')); } };
const eq = (a, b, m) => { if (JSON.stringify(a) !== JSON.stringify(b)) throw new Error((m || 'expected equal') + '\n  got:      ' + JSON.stringify(a) + '\n  expected: ' + JSON.stringify(b)); };
const ok = (c, m) => { if (!c) throw new Error(m || 'assertion failed'); };
const NOW = Date.UTC(2026, 9, 1, 12);

console.log('text hygiene');
await t('tags, CDATA and entities become plain text', () => eq(F.plain('<![CDATA[<b>Storms &amp; hail</b> &#8211; <i>tonight</i>]]>', 100), 'Storms & hail – tonight'));
await t('escaped markup is stripped too (double encoding)', () => eq(F.plain('&lt;script&gt;alert(1)&lt;/script&gt;Hello &lt;a href=x&gt;there&lt;/a&gt;', 100), 'Hello there'));
await t('script and style blocks vanish with their content', () => eq(F.plain('a<script>evil()</script>b<style>x{}</style>c', 50), 'a b c'));
await t('control and bidi override characters are removed', () => eq(F.plain('ab‮cd\u0000e', 20), 'abcde'));
await t('long text is cut with an ellipsis', () => { const s = F.plain('x'.repeat(500), 40); eq(s.length, 40); ok(s.endsWith('…')); });
await t('numeric entities that are not valid code points are dropped', () => eq(F.plain('a&#1114112;b&#xD800;c', 20), 'abc'));

console.log('links');
const hosts = ['wfaa.com'];
await t('https link on the source domain is kept', () => eq(F.safeLink('https://www.wfaa.com/article/news/a', hosts), 'https://www.wfaa.com/article/news/a'));
await t('http is upgraded to https', () => eq(F.safeLink('http://wfaa.com/x', hosts), 'https://wfaa.com/x'));
await t('another domain is rejected', () => eq(F.safeLink('https://evil.example/x', hosts), ''));
await t('look-alike host is rejected', () => { eq(F.safeLink('https://wfaa.com.evil.example/x', hosts), ''); eq(F.safeLink('https://notwfaa.com/x', hosts), ''); });
await t('javascript: data: and credentials are rejected', () => { eq(F.safeLink('javascript:alert(1)', hosts), ''); eq(F.safeLink('data:text/html,hi', hosts), ''); eq(F.safeLink('https://user:pw@wfaa.com/x', hosts), ''); });

console.log('parsing');
const RSS = `<?xml version="1.0"?><rss><channel><title>T</title>
<item><title><![CDATA[Tornado watch &amp; flash flood warning]]></title><link>https://www.wfaa.com/article/1</link><pubDate>Thu, 01 Oct 2026 10:00:00 GMT</pubDate><description><![CDATA[<p>Details <b>here</b>.</p>]]></description></item>
<item><title>Off-site</title><link>https://evil.example/1</link></item>
<item><title>Future</title><link>https://www.wfaa.com/article/2</link><pubDate>Thu, 01 Oct 2030 10:00:00 GMT</pubDate></item>
<item><title></title><link>https://www.wfaa.com/article/3</link></item>
</channel></rss>`;
await t('RSS items: good one kept, off-site and empty dropped, future dates clamped', () => {
  const items = F.parseNews(RSS, F.SOURCES.wfaa, NOW);
  eq(items.map((i) => i.url), ['https://www.wfaa.com/article/1', 'https://www.wfaa.com/article/2']);
  eq(items[0].title, 'Tornado watch & flash flood warning'); eq(items[0].summary, 'Details here .');
  ok(items[1].t <= NOW + 3600e3, 'future date must be clamped');
});
const ATOM = `<feed xmlns:yt="http://www.youtube.com/xml/schemas/2015"><title>Chan</title><published>2007-01-01T00:00:00+00:00</published>
<entry><yt:videoId>dQw4w9WgXcQ</yt:videoId><title>Watch &quot;this&quot;</title><published>2026-10-01T09:00:00+00:00</published></entry>
<entry><yt:videoId>bad id!</yt:videoId><title>Bad</title></entry></feed>`;
await t('YouTube Atom: valid ids only', () => { const v = F.parseVideos(ATOM, F.VIDEO['v-noaa'], NOW); eq(v.length, 1); eq(v[0].id, 'dQw4w9WgXcQ'); eq(v[0].title, 'Watch "this"'); });

console.log('configuration');
await t('every city source exists and every source has hosts and an https url', () => {
  for (const [city, p] of Object.entries(F.CITY_FEEDS)) {
    for (const id of p.news) { const s = F.SOURCES[id]; ok(s, city + ' news ' + id); ok(s.url.startsWith('https://') && s.hosts.length, id); }
    for (const id of p.video) { const s = F.VIDEO[id]; ok(s, city + ' video ' + id); ok(/^UC[\w-]{22}$/.test(s.channel), id); }
  }
});
await t('unknown city returns null (no fetch)', async () => eq(await F.collect('zzz', { fetch: () => { throw new Error('should not fetch'); } }), null));
await t('prototype keys are not treated as cities', async () => { eq(await F.collect('constructor', { fetch: () => { throw new Error('no'); } }), null); eq(await F.collect('__proto__', { fetch: () => { throw new Error('no'); } }), null); });

console.log('collection with a fake network');
await t('one failing source does not fail the rest; results are merged, de-duplicated and sorted', async () => {
  const fake = async (url) => {
    if (url.includes('wfaa')) return { ok: true, status: 200, headers: new Map(), arrayBuffer: async () => Buffer.from(RSS) };
    if (url.includes('nbcdfw')) return { ok: false, status: 500, headers: new Map(), arrayBuffer: async () => Buffer.from('') };
    if (url.includes('youtube')) return { ok: true, status: 200, headers: new Map(), arrayBuffer: async () => Buffer.from(ATOM) };
    throw Object.assign(new Error('network down'), { name: 'TypeError' });
  };
  fake.toString();
  const out = await F.collect('dal', { fetch: (u, o) => fake(u, o).then((r) => Object.assign(r, { headers: { get: () => null } })), now: NOW });
  eq(out.news.map((n) => n.url), ['https://www.wfaa.com/article/2', 'https://www.wfaa.com/article/1']);
  ok(out.errors.length >= 3, 'errors reported: ' + out.errors.length);
  eq(out.videos.length, 1, 'same video id from three channels de-duplicated');
  ok(out.channels.length === 3);
});
await t('a slow source times out instead of hanging', async () => {
  const slow = (u, o) => new Promise((res, rej) => { o.signal.addEventListener('abort', () => rej(Object.assign(new Error('aborted'), { name: 'AbortError' }))); });
  const t0 = Date.now(); const out = await F.collect('dal', { fetch: slow, timeout: 150, now: NOW });
  ok(Date.now() - t0 < 2000, 'took ' + (Date.now() - t0)); ok(out.errors.every((e) => e.error === 'timed out'));
});

if (process.argv.includes('--live')) {
  console.log('live (real network)');
  for (const city of Object.keys(F.CITY_FEEDS)) {
    const t0 = Date.now(); const out = await F.collect(city);
    console.log('  ' + city.padEnd(4), String(out.news.length).padStart(2) + ' news', String(out.videos.length).padStart(2) + ' videos', ' errors:', out.errors.map((e) => e.source + ' (' + e.error + ')').join('; ') || 'none', ' ' + (Date.now() - t0) + 'ms');
  }
}

console.log('\n' + pass + ' passed, ' + fail + ' failed');
process.exit(fail ? 1 : 0);
