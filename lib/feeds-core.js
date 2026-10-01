/* feeds-core.js - local news (RSS) and video (YouTube channel Atom feeds) for ATMOS, kept server-side because the stations' feeds send no CORS headers.
 *
 * Pure logic, no framework: used by api/feeds.js (Vercel serverless function), by tools/serve.mjs (local testing) and by the unit tests.
 *
 * Safety design (everything fetched here is untrusted text from third parties):
 *   - The browser never supplies a URL. It supplies a short city id, which selects from the fixed allowlist below, so there is nothing to point at
 *     an internal address (no SSRF) and nothing to abuse as an open proxy.
 *   - Every item link must be https and its host must belong to that source's own domain(s); anything else is dropped.
 *   - Titles and summaries are reduced to plain text (tags stripped, entities decoded, control characters removed, length capped).
 *     The client then inserts them with textContent, never innerHTML.
 *   - Each fetch has a timeout and a size cap; one failing source never fails the others.
 */
'use strict';

/* ---- sources ------------------------------------------------------------------------------------------------ */
const R = (id, name, url, hosts) => [id, { kind: 'rss', id, name, url, hosts }];
const SOURCES = Object.fromEntries([
  R('wfaa', 'WFAA · ABC', 'https://www.wfaa.com/feeds/syndication/rss/news', ['wfaa.com']),
  R('nbcdfw', 'NBC 5 · KXAS', 'https://www.nbcdfw.com/news/local/?rss=y', ['nbcdfw.com']),
  R('fox4', 'FOX 4 · KDFW', 'https://www.fox4news.com/rss/category/news', ['fox4news.com']),
  R('cbstx', 'CBS Texas · KTVT', 'https://www.cbsnews.com/texas/latest/rss/main', ['cbsnews.com']),
  R('ten', '10News · ABC KGTV', 'https://www.10news.com/index.rss', ['10news.com']),
  R('nbc7', 'NBC 7 · KNSD', 'https://www.nbcsandiego.com/news/local/?rss=y', ['nbcsandiego.com']),
  R('cbs8', 'CBS 8 · KFMB', 'https://www.cbs8.com/feeds/syndication/rss/news', ['cbs8.com']),
  R('fox5sd', 'FOX 5 · KSWB', 'https://fox5sandiego.com/feed/', ['fox5sandiego.com']),
  R('wusa9', 'WUSA9 · CBS', 'https://www.wusa9.com/feeds/syndication/rss/news', ['wusa9.com']),
  R('nbc4dc', 'NBC4 · WRC', 'https://www.nbcwashington.com/news/local/?rss=y', ['nbcwashington.com']),
  R('fox5dc', 'FOX 5 · WTTG', 'https://www.fox5dc.com/rss/category/news', ['fox5dc.com']),
  R('wtop', 'WTOP News', 'https://wtop.com/feed/', ['wtop.com']),
  R('king5', 'KING 5 · NBC', 'https://www.king5.com/feeds/syndication/rss/news', ['king5.com']),
  R('kiro7', 'KIRO 7 · CBS', 'https://www.kiro7.com/arc/outboundfeeds/rss/?outputType=xml', ['kiro7.com']),
  R('komo', 'KOMO · ABC', 'https://komonews.com/news/local.rss', ['komonews.com']),
  R('fox13sea', 'FOX 13 · KCPQ', 'https://www.fox13seattle.com/rss/category/news', ['fox13seattle.com']),
  R('local10', 'Local 10 · WPLG', 'https://www.local10.com/arc/outboundfeeds/rss/?outputType=xml', ['local10.com']),
  R('nbc6', 'NBC 6 · WTVJ', 'https://www.nbcmiami.com/news/local/?rss=y', ['nbcmiami.com']),
  R('cbsmia', 'CBS Miami · WFOR', 'https://www.cbsnews.com/miami/latest/rss/main', ['cbsnews.com']),
  R('wsvn', 'WSVN 7News', 'https://wsvn.com/feed/', ['wsvn.com']),
  R('wesh', 'WESH 2 · NBC', 'https://www.wesh.com/topstories-rss', ['wesh.com']),
  R('wftv', 'WFTV 9 · ABC', 'https://www.wftv.com/arc/outboundfeeds/rss/?outputType=xml', ['wftv.com']),
  R('wkmg', 'WKMG 6 · CBS', 'https://www.clickorlando.com/arc/outboundfeeds/rss/?outputType=xml', ['clickorlando.com']),
  R('fox35', 'FOX 35 · WOFL', 'https://www.fox35orlando.com/rss/category/news', ['fox35orlando.com']),
  R('wfla', 'WFLA 8 · NBC', 'https://www.wfla.com/feed/', ['wfla.com']),
  R('wtsp', 'WTSP 10 · CBS', 'https://www.wtsp.com/feeds/syndication/rss/news', ['wtsp.com']),
  R('fox13tpa', 'FOX 13 · WTVT', 'https://www.fox13news.com/rss/category/news', ['fox13news.com']),
  R('abc28', 'ABC Action News · WFTS', 'https://www.abcactionnews.com/index.rss', ['tampabay28.com', 'abcactionnews.com']),
  R('news4jax', 'News4JAX · WJXT', 'https://www.news4jax.com/arc/outboundfeeds/rss/?outputType=xml', ['news4jax.com']),
  R('firstcoast', 'First Coast News · WTLV', 'https://www.firstcoastnews.com/feeds/syndication/rss/news', ['firstcoastnews.com']),
  R('actionjax', 'Action News Jax · WFOX', 'https://www.actionnewsjax.com/arc/outboundfeeds/rss/?outputType=xml', ['actionnewsjax.com']),
  R('wral', 'WRAL · NBC', 'https://www.wral.com/news/rss/48/', ['wral.com']),
  R('wtvd', 'ABC11 · WTVD', 'https://abc11.com/feed/', ['abc11.com']),
  R('cbs17', 'CBS 17 · WNCN', 'https://www.cbs17.com/feed/', ['cbs17.com']),
  R('wsoc', 'WSOC 9 · ABC', 'https://www.wsoctv.com/arc/outboundfeeds/rss/?outputType=xml', ['wsoctv.com']),
  R('wcnc', 'WCNC · NBC', 'https://www.wcnc.com/feeds/syndication/rss/news', ['wcnc.com']),
  R('wbtv', 'WBTV · CBS', 'https://www.wbtv.com/arc/outboundfeeds/rss/?outputType=xml', ['wbtv.com']),
  R('wect', 'WECT 6 · NBC', 'https://www.wect.com/arc/outboundfeeds/rss/?outputType=xml', ['wect.com']),
  R('wway', 'WWAY · ABC', 'https://www.wwaytv3.com/feed/', ['wwaytv3.com']),
  R('japantimes', 'The Japan Times', 'https://www.japantimes.co.jp/news/feed/', ['japantimes.co.jp']),
  R('japantoday', 'Japan Today', 'https://japantoday.com/feed', ['japantoday.com']),
  R('nhk', 'NHK News (Japanese)', 'https://www3.nhk.or.jp/rss/news/cat0.xml', ['nhk.or.jp', 'nhk.jp']),
]);

const Y = (id, name, channel) => [id, { kind: 'yt', id, name, channel, url: 'https://www.youtube.com/feeds/videos.xml?channel_id=' + channel }];
const VIDEO = Object.fromEntries([
  Y('v-nbcdfw', 'NBC 5 DFW', 'UC_0RDXvWZPaveq0fcYZhE6A'),
  Y('v-fox4', 'FOX 4 Dallas-Fort Worth', 'UCruQg25yVBppUWjza8AlyZA'),
  Y('v-cbstx', 'CBS Texas', 'UCxMXl9L79X1Mq_4iwCOyPFg'),
  Y('v-nbc7', 'NBC 7 San Diego', 'UCUPU09hfdemclhLeO_ecgnA'),
  Y('v-cbs8', 'CBS 8 San Diego', 'UCMscWako8oDvpdF4pppku-g'),
  Y('v-fox5sd', 'FOX 5 San Diego', 'UCI45Rmi0nNhfxLTXkRmbLMA'),
  Y('v-nbc4dc', 'NBC4 Washington', 'UC1VKVKhJLc7PjdPPVxTDk0Q'),
  Y('v-fox5dc', 'FOX 5 Washington DC', 'UCHLyP4MuA-JAFBCwxXOEDdA'),
  Y('v-king5', 'KING 5 Seattle', 'UCp1KrVaZDZ7BOI_QBuTWWmg'),
  Y('v-fox13sea', 'FOX 13 Seattle', 'UC5bKZHg4PzURMOWcvanl6nA'),
  Y('v-local10', 'WPLG Local 10', 'UCgVZ0mrM3liHNhRYC5Mchgg'),
  Y('v-news4jax', 'News4JAX', 'UC_YFbvKedjnVjqrZqBR4L8Q'),
  Y('v-wcnc', 'WCNC Charlotte', 'UC-RxXi2Xws6Uk22vp-sLbGA'),
  Y('v-nhkworld', 'NHK WORLD-JAPAN', 'UCSPEjw8F2nQDtmUKPFNF7_A'),
  Y('v-japantimes', 'The Japan Times', 'UCo_QfGG3FlWVh3Z0AoxuwBA'),
  Y('v-noaa', 'NOAA', 'UCe9IxQeBttZIYl5c43ycf9g'),
]);

/* city id (same ids as atmos/js/data.js) -> which sources to read */
const DFW = { news: ['wfaa', 'nbcdfw', 'fox4', 'cbstx'], video: ['v-nbcdfw', 'v-fox4', 'v-cbstx'] };
const SDG = { news: ['ten', 'nbc7', 'cbs8', 'fox5sd'], video: ['v-nbc7', 'v-cbs8', 'v-fox5sd'] };
const JPN = { news: ['japantimes', 'japantoday', 'nhk'], video: ['v-nhkworld', 'v-japantimes'] };
const CITY_FEEDS = {
  dal: DFW, ftw: DFW, san: SDG, oce: SDG,
  dc: { news: ['wusa9', 'nbc4dc', 'fox5dc', 'wtop'], video: ['v-nbc4dc', 'v-fox5dc'] },
  sea: { news: ['king5', 'kiro7', 'komo', 'fox13sea'], video: ['v-king5', 'v-fox13sea'] },
  mia: { news: ['local10', 'nbc6', 'cbsmia', 'wsvn'], video: ['v-local10'] },
  orl: { news: ['wesh', 'wftv', 'wkmg', 'fox35'], video: ['v-noaa'] },
  tpa: { news: ['wfla', 'wtsp', 'fox13tpa', 'abc28'], video: ['v-noaa'] },
  jax: { news: ['news4jax', 'firstcoast', 'actionjax'], video: ['v-news4jax'] },
  clt: { news: ['wsoc', 'wcnc', 'wbtv'], video: ['v-wcnc'] },
  ral: { news: ['wral', 'wtvd', 'cbs17'], video: ['v-noaa'] },
  ilm: { news: ['wect', 'wway'], video: ['v-noaa'] },
  tyo: JPN, osa: JPN, spk: JPN, fuk: JPN, nah: JPN,
};

/* ---- text hygiene ------------------------------------------------------------------------------------------- */
const NAMED = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ', ndash: '–', mdash: '—', hellip: '…', rsquo: '’', lsquo: '‘', rdquo: '”', ldquo: '“' };
function decodeEntities(s) {
  return s.replace(/&(#x[0-9a-f]+|#\d+|[a-z]+);/gi, (m, e) => {
    if (e[0] === '#') {
      const cp = e[1] === 'x' || e[1] === 'X' ? parseInt(e.slice(2), 16) : parseInt(e.slice(1), 10);
      return cp > 0 && cp < 0x110000 && !(cp >= 0xd800 && cp < 0xe000) ? String.fromCodePoint(cp) : '';
    }
    return Object.prototype.hasOwnProperty.call(NAMED, e.toLowerCase()) ? NAMED[e.toLowerCase()] : m;
  });
}
/** Reduce anything (CDATA, escaped HTML, markup) to short plain text. */
function plain(raw, max) {
  if (raw == null) return '';
  let s = String(raw).replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, '$1');
  s = decodeEntities(s);
  s = s.replace(/<(script|style)[\s\S]*?<\/\1>/gi, ' ').replace(/<[^>]*>/g, ' ');   // tags
  s = decodeEntities(s).replace(/<[^>]*>/g, ' ');                                      // double-encoded markup
  s = s.replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f-\u009f‪-‮⁦-⁩]/g, '').replace(/\s+/g, ' ').trim();
  return s.length > max ? s.slice(0, max - 1).trimEnd() + '…' : s;
}
/** A link is kept only if it is a plain https URL on one of the source's own hosts. */
function safeLink(raw, hosts) {
  if (!raw) return '';
  let u; try { u = new URL(decodeEntities(String(raw).replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, '$1')).trim()); } catch (e) { return ''; }
  if (u.protocol === 'http:') u.protocol = 'https:';
  if (u.protocol !== 'https:' || u.username || u.password) return '';
  const h = u.hostname.toLowerCase();
  if (!hosts.some((d) => h === d || h.endsWith('.' + d))) return '';
  return u.href.length > 600 ? '' : u.href;
}
function parseDate(raw, now) {
  const t = Date.parse(plain(raw, 60));
  if (!isFinite(t) || t < 946684800000) return null;
  return Math.min(t, now + 3600e3);
}

/* ---- parsing ------------------------------------------------------------------------------------------------ */
function tag(block, name) {
  const m = new RegExp('<' + name + '(?:\\s[^>]*)?>([\\s\\S]*?)</' + name + '>', 'i').exec(block);
  return m ? m[1] : '';
}
function blocks(xml, name) {
  const out = []; const re = new RegExp('<' + name + '[\\s>][\\s\\S]*?</' + name + '>', 'gi'); let m;
  while ((m = re.exec(xml)) && out.length < 60) out.push(m[0]);
  return out;
}
function parseNews(xml, src, now) {
  const items = [];
  for (const b of blocks(xml, 'item').concat(blocks(xml, 'entry'))) {
    const title = plain(tag(b, 'title'), 160);
    let link = tag(b, 'link');
    if (!link || /^\s*$/.test(link)) { const a = /<link[^>]*rel="alternate"[^>]*href="([^"]+)"/i.exec(b) || /<link[^>]*href="([^"]+)"/i.exec(b); link = a ? a[1] : tag(b, 'guid'); }
    const url = safeLink(link, src.hosts);
    if (!title || !url) continue;
    const t = parseDate(tag(b, 'pubDate') || tag(b, 'dc:date') || tag(b, 'published') || tag(b, 'updated'), now);
    const summary = plain(tag(b, 'description') || tag(b, 'summary') || tag(b, 'content:encoded'), 200);
    items.push({ title, url, source: src.name, t, summary: summary && summary !== title ? summary : '' });
  }
  return items;
}
function parseVideos(xml, src, now) {
  const items = [];
  for (const b of blocks(xml, 'entry')) {
    const id = plain(tag(b, 'yt:videoId'), 20);
    if (!/^[\w-]{11}$/.test(id)) continue;
    const title = plain(tag(b, 'title'), 140); if (!title) continue;
    items.push({ id, title, channel: src.name, t: parseDate(tag(b, 'published'), now) });
  }
  return items;
}

/* ---- fetching ----------------------------------------------------------------------------------------------- */
const UA = 'Mozilla/5.0 (compatible; ShowcaseAtmos/1.0; +https://github.com/RandBrand42/Claude-Code-Showcase)';
async function fetchText(url, fetchImpl, ms, maxBytes) {
  const ctl = new AbortController(); const timer = setTimeout(() => ctl.abort(), ms);
  try {
    const r = await fetchImpl(url, { headers: { 'User-Agent': UA, Accept: 'application/rss+xml, application/atom+xml, application/xml, text/xml, */*;q=0.5' }, signal: ctl.signal, redirect: 'follow' });
    if (!r.ok) throw new Error('HTTP ' + r.status);
    const len = +r.headers.get('content-length') || 0; if (len > maxBytes) throw new Error('too large');
    const buf = Buffer.from(await r.arrayBuffer()); if (buf.length > maxBytes) throw new Error('too large');
    return buf.toString('utf8');
  } finally { clearTimeout(timer); }
}

/** Collect news and videos for one city id. Never throws for a bad source; reports it in `errors`. */
async function collect(cityId, opts) {
  opts = opts || {};
  const fetchImpl = opts.fetch || fetch, now = opts.now || Date.now();
  const plan = Object.prototype.hasOwnProperty.call(CITY_FEEDS, cityId) ? CITY_FEEDS[cityId] : null;
  if (!plan) return null;
  const errors = [];
  const run = async (src, parse) => {
    try { return parse(await fetchText(src.url, fetchImpl, opts.timeout || 7000, 3e6), src, now); }
    catch (e) { errors.push({ source: src.name, error: e && e.name === 'AbortError' ? 'timed out' : String(e && e.message || e).slice(0, 60) }); return []; }
  };
  const [newsLists, videoLists] = await Promise.all([
    Promise.all(plan.news.map((id) => run(SOURCES[id], parseNews))),
    Promise.all(plan.video.map((id) => run(VIDEO[id], parseVideos))),
  ]);
  const seen = new Set();
  const news = newsLists.flatMap((l) => l.sort((a, b) => (b.t || 0) - (a.t || 0)).slice(0, 6)).filter((x) => !seen.has(x.url) && seen.add(x.url)).sort((a, b) => (b.t || 0) - (a.t || 0)).slice(0, 24);
  const seenV = new Set();
  const videos = videoLists.flatMap((l) => l.sort((a, b) => (b.t || 0) - (a.t || 0)).slice(0, 4)).filter((x) => !seenV.has(x.id) && seenV.add(x.id)).sort((a, b) => (b.t || 0) - (a.t || 0)).slice(0, 12);
  const channels = plan.video.map((id) => ({ name: VIDEO[id].name, channel: VIDEO[id].channel }));
  return { city: cityId, fetchedAt: now, news, videos, channels, errors };
}

module.exports = { SOURCES, VIDEO, CITY_FEEDS, plain, safeLink, decodeEntities, parseNews, parseVideos, collect };
