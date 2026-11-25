'use strict';
/*
 * CoreMarket Webserver
 * - liefert die Seite aus /public aus (gzip, ETag, Caching)
 * - holt die Daten vom Bot und hält sie im Speicher (/api/daten)
 * - fällt auf die letzten guten Daten zurück, wenn der Bot kurz weg ist
 * - /health für Render und das Keep-Alive-Script
 * Keine Abhängigkeiten, nur Node >= 18.
 */
const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');
const zlib = require('node:zlib');
const crypto = require('node:crypto');

const PORT = Number(process.env.PORT) || 3000;
const API = process.env.COREMARKET_API || 'https://hugo.vortexpvp.eu/api/public';
const DISCORD = process.env.DISCORD_INVITE || 'https://discord.gg/UT6dYchUB';
const CACHE_MS = Math.max(5, Number(process.env.CACHE_SEKUNDEN) || 30) * 1000;
const TIMEOUT_MS = 8000;
const PUBLIC = path.join(__dirname, 'public');
const START = Date.now();

const TYPEN = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.png': 'image/png',
  '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon',
  '.txt': 'text/plain; charset=utf-8',
  '.xml': 'application/xml; charset=utf-8',
  '.webmanifest': 'application/manifest+json',
};
const KOMPRIMIERBAR = /^(text\/|application\/(json|xml|manifest)|image\/svg)/;

const SICHERHEIT = {
  'X-Content-Type-Options': 'nosniff',
  'Referrer-Policy': 'strict-origin-when-cross-origin',
  'X-Frame-Options': 'DENY',
  'Permissions-Policy': 'camera=(), microphone=(), geolocation=(), interest-cohort=()',
  'Content-Security-Policy': [
    "default-src 'self'",
    "img-src 'self' data: https://mc-heads.net",
    "style-src 'self' https://fonts.googleapis.com",
    "style-src-attr 'unsafe-inline'",
    "font-src https://fonts.gstatic.com",
    "script-src 'self'",
    "connect-src 'self'",
    "base-uri 'none'",
    "form-action 'none'",
    "frame-ancestors 'none'",
  ].join('; '),
};

/* ---------- Dateien einmal beim Start laden ---------- */
const dateien = new Map();
function ladeDateien() {
  const lauf = dir => {
    for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
      const voll = path.join(dir, e.name);
      if (e.isDirectory()) { lauf(voll); continue; }
      const url = '/' + path.relative(PUBLIC, voll).split(path.sep).join('/');
      const inhalt = fs.readFileSync(voll);
      const typ = TYPEN[path.extname(e.name).toLowerCase()] || 'application/octet-stream';
      const etag = '"' + crypto.createHash('sha1').update(inhalt).digest('base64url').slice(0, 16) + '"';
      dateien.set(url, { inhalt, typ, etag, gzip: KOMPRIMIERBAR.test(typ) && inhalt.length > 512 ? zlib.gzipSync(inhalt, { level: 9 }) : null });
    }
  };
  lauf(PUBLIC);
  // Versionsnummer an CSS/JS hängen, damit Browser nach einem Deploy sofort die neue Version holen
  const v = name => (dateien.get(name)?.etag || '').replace(/"/g, '').slice(0, 8);
  const vorlage = dateien.get('/index.html').inhalt.toString('utf8')
    .replace('style.css"', `style.css?v=${v('/style.css')}"`)
    .replace('app.js"', `app.js?v=${v('/app.js')}"`)
    .replaceAll('{{DISCORD}}', escAttr(DISCORD));
  return vorlage;
}
const escAttr = s => String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
const INDEX = ladeDateien();

/* ---------- Bot-Daten mit Cache ---------- */
const cache = { daten: null, zeit: 0, fehler: null, laeuft: null };

async function holeDaten() {
  if (cache.laeuft) return cache.laeuft;
  cache.laeuft = (async () => {
    const ctrl = new AbortController();
    const t = setTimeout(() => ctrl.abort(), TIMEOUT_MS);
    try {
      const r = await fetch(API, { signal: ctrl.signal, headers: { accept: 'application/json', 'user-agent': 'CoreMarket-Website' } });
      if (!r.ok) throw new Error(`Bot antwortet mit HTTP ${r.status}`);
      const d = await r.json();
      if (!d || typeof d !== 'object') throw new Error('Bot liefert keine gültigen Daten');
      cache.daten = d; cache.zeit = Date.now(); cache.fehler = null;
    } catch (e) {
      cache.fehler = e.name === 'AbortError' ? 'Bot antwortet nicht (Timeout)' : e.message;
      console.warn(`[daten] ${cache.fehler}`);
    } finally {
      clearTimeout(t);
      cache.laeuft = null;
    }
  })();
  return cache.laeuft;
}

async function daten() {
  if (!cache.daten || Date.now() - cache.zeit > CACHE_MS) {
    if (cache.daten) holeDaten(); // alte Daten sofort liefern, im Hintergrund erneuern
    else await holeDaten();
  }
  return cache.daten ? { ...cache.daten, _alt: Date.now() - cache.zeit > CACHE_MS * 4 } : null;
}

/* ---------- Antworten ---------- */
function senden(req, res, status, body, kopf = {}) {
  const gz = kopf._gzip;
  delete kopf._gzip;
  const h = { ...SICHERHEIT, ...kopf };
  let inhalt = body;
  if (gz && /\bgzip\b/.test(req.headers['accept-encoding'] || '')) { inhalt = gz; h['Content-Encoding'] = 'gzip'; }
  if (h['Content-Type'] && KOMPRIMIERBAR.test(h['Content-Type'])) h['Vary'] = 'Accept-Encoding';
  h['Content-Length'] = Buffer.byteLength(inhalt);
  res.writeHead(status, h);
  res.end(req.method === 'HEAD' ? undefined : inhalt);
}

function json(req, res, status, obj, extra = {}) {
  const body = Buffer.from(JSON.stringify(obj));
  senden(req, res, status, body, { 'Content-Type': TYPEN['.json'], 'Cache-Control': 'no-store', _gzip: body.length > 512 ? zlib.gzipSync(body) : null, ...extra });
}

async function startseite(req, res) {
  const d = await daten();
  // Daten direkt in die Seite legen: kein zweiter Request, Inhalte sofort da
  const roh = JSON.stringify({ daten: d, discord: DISCORD }).replace(/</g, '\\u003c').replace(/\u2028/g, '\\u2028').replace(/\u2029/g, '\\u2029');
  const html = Buffer.from(INDEX.replace('<!--START-DATEN-->', `<script id="start-daten" type="application/json">${roh}</script>`));
  senden(req, res, 200, html, { 'Content-Type': TYPEN['.html'], 'Cache-Control': 'no-cache', _gzip: zlib.gzipSync(html) });
}

function datei(req, res, url) {
  const f = dateien.get(url);
  if (!f) return false;
  if (req.headers['if-none-match'] === f.etag) { res.writeHead(304, { ...SICHERHEIT, ETag: f.etag }); res.end(); return true; }
  const lange = /\?v=/.test(req.url) || /\.(png|ico|svg)$/.test(url);
  senden(req, res, 200, f.inhalt, { 'Content-Type': f.typ, ETag: f.etag, 'Cache-Control': lange ? 'public, max-age=31536000, immutable' : 'public, max-age=300', _gzip: f.gzip });
  return true;
}

function nichtGefunden(req, res) {
  const f = dateien.get('/404.html');
  senden(req, res, 404, f.inhalt, { 'Content-Type': TYPEN['.html'], 'Cache-Control': 'no-cache', _gzip: f.gzip });
}

const server = http.createServer(async (req, res) => {
  const t0 = Date.now();
  res.on('finish', () => { if (req.url !== '/health') console.log(`${req.method} ${req.url} ${res.statusCode} ${Date.now() - t0}ms`); });
  try {
    if (req.method !== 'GET' && req.method !== 'HEAD') return senden(req, res, 405, 'Methode nicht erlaubt', { Allow: 'GET, HEAD', 'Content-Type': TYPEN['.txt'] });
    const url = decodeURIComponent(new URL(req.url, 'http://x').pathname);
    if (url.includes('..') || url.includes('\0')) return nichtGefunden(req, res);

    if (url === '/health' || url === '/healthz') return json(req, res, 200, { ok: true, laufzeit: Math.round((Date.now() - START) / 1000), daten: cache.daten ? Math.round((Date.now() - cache.zeit) / 1000) + 's alt' : 'keine', fehler: cache.fehler });
    if (url === '/api/daten') {
      const d = await daten();
      return d ? json(req, res, 200, d) : json(req, res, 503, { fehler: cache.fehler || 'Keine Daten' }, { 'Retry-After': '30' });
    }
    if (url === '/' || url === '/index.html') return await startseite(req, res);
    if (url === '/404.html') return nichtGefunden(req, res);
    if (datei(req, res, url)) return;
    nichtGefunden(req, res);
  } catch (e) {
    console.error(e);
    if (!res.headersSent) senden(req, res, 500, 'Interner Fehler', { 'Content-Type': TYPEN['.txt'] });
  }
});

server.keepAliveTimeout = 65000;
server.listen(PORT, () => {
  console.log(`CoreMarket läuft auf Port ${PORT}, Daten von ${API}`);
  holeDaten();
  // Daten warm halten, damit Besucher nie auf den Bot warten müssen
  setInterval(holeDaten, CACHE_MS).unref();
});

for (const sig of ['SIGTERM', 'SIGINT']) process.on(sig, () => { server.close(() => process.exit(0)); setTimeout(() => process.exit(0), 5000).unref(); });
