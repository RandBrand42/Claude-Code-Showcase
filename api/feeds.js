/* GET /api/feeds?city=dal  ->  { city, fetchedAt, news[], videos[], channels[], errors[] }
 * Vercel serverless function (Node). Uses only the plain Node request/response API so tools/serve.mjs can run it locally too.
 * All the logic, and the allowlist of sources, is in lib/feeds-core.js. */
'use strict';
const { collect } = require('../lib/feeds-core.js');

module.exports = async function handler(req, res) {
  const send = (code, body, extra) => {
    res.statusCode = code;
    res.setHeader('Content-Type', 'application/json; charset=utf-8');
    res.setHeader('X-Content-Type-Options', 'nosniff');
    for (const k of Object.keys(extra || {})) res.setHeader(k, extra[k]);
    res.end(JSON.stringify(body));
  };
  if (req.method !== 'GET' && req.method !== 'HEAD') return send(405, { error: 'GET only' }, { Allow: 'GET, HEAD' });
  let city = '';
  try { city = String(new URL(req.url, 'http://x').searchParams.get('city') || '').toLowerCase(); } catch (e) { /* fall through */ }
  if (!/^[a-z]{2,5}$/.test(city)) return send(400, { error: 'Pass ?city=<id>, for example ?city=dal' });
  try {
    const out = await collect(city);
    if (!out) return send(404, { error: 'No feeds for that city' });
    // five minutes in the CDN, then serve stale while refreshing: station feeds change slowly and this keeps load off them
    return send(200, out, { 'Cache-Control': 'public, s-maxage=300, stale-while-revalidate=900' });
  } catch (e) {
    return send(502, { error: 'Feeds are unavailable right now' }, { 'Cache-Control': 'no-store' });
  }
};
