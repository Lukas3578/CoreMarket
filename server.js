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
// Abo-Funktionen (Login, Endertruhe/Inventar) laufen über den Bot. Die Website reicht die Anfragen nur durch.
const BOT = (process.env.BOT_URL || new URL(API).origin).replace(/\/+$/, '');
// Item-Bilder (Vanilla-Texturen). Eigene Quelle per ITEM_BILDER, {art} = item oder block, {id} = z. B. diamond_sword
const BILDER = process.env.ITEM_BILDER || 'https://assets.mcasset.cloud/1.21.4/assets/minecraft/textures/{art}/{id}.png';
// Preise aus Auktionshaus und Orders (bot/preistracker.js). PREISE_DEMO: auto = Demo-Daten, bis der Bot echte liefert; an; aus
const PREISE_API = (process.env.PREISE_API || `${API.replace(/\/+$/, '')}/preise`).replace(/\/+$/, '');
const PREISE_DEMO = (process.env.PREISE_DEMO || 'auto').toLowerCase();
const BILDER_HOST = (() => { try { return new URL(BILDER.replace(/[{}]/g, '')).origin; } catch { return ''; } })();
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
    `img-src 'self' data: https://mc-heads.net${BILDER_HOST ? ' ' + BILDER_HOST : ''}`,
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
}
const escAttr = s => String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
ladeDateien();

/* ---------- Seiten ---------- */
// Reihenfolge = Reihenfolge im Menü. "menue: false" -> nicht im Hauptmenü.
const SEITEN = [
  { pfad: '/', datei: 'start', menue: false, titel: 'CoreMarket – Spawner kaufen und verkaufen auf HugoSMP',
    beschreibung: 'CoreMarket ist der Spawner-Trading-Clan auf HugoSMP: faire Preise für Blaze, Iron Golem, Creeper und mehr – sicher über Discord-Tickets mit verifizierten Händlern.' },
  { pfad: '/preise', datei: 'preise', name: 'Preise', titel: 'Spawner-Preise & Rechner – CoreMarket',
    beschreibung: 'Aktuelle An- und Verkaufspreise für Spawner auf HugoSMP, mit Mengenrabatten und Preisrechner.' },
  { pfad: '/ablauf', datei: 'ablauf', name: "So läuft's", titel: 'So läuft ein Handel – CoreMarket',
    beschreibung: 'In vier Schritten zum Spawner: Discord beitreten, Minecraft verbinden, Ticket öffnen, Übergabe im Spiel.' },
  { pfad: '/clan', datei: 'clan', name: 'Clan', titel: 'Unser Clan – CoreMarket',
    beschreibung: 'Alle Mitglieder von CoreMarket (CM0) und CoreMarket1 (CM1). Prüf hier, ob ein Händler wirklich zu uns gehört.' },
  { pfad: '/bewertungen', datei: 'bewertungen', name: 'Bewertungen', titel: 'Bewertungen – CoreMarket',
    beschreibung: 'Was Kunden über ihren Handel mit CoreMarket sagen, und welche Händler die meisten Vouches haben.' },
  { pfad: '/auction-orders', datei: 'auction-orders', name: 'Auction-Orders', js: 'preise.js', titel: 'Auction-Orders: Item-Preise und Preistrend – CoreMarket',
    beschreibung: 'Was ist ein Item auf HugoSMP gerade wert? Billigster Preis im Auktionshaus, beste Order und der Preistrend der letzten Tage – jede Nacht neu gescannt.' },
  { pfad: '/abo', datei: 'abo', name: 'Abo', skript: true, titel: 'Abo: Endertruhe und Inventar ansehen – CoreMarket',
    beschreibung: 'Mit dem CoreMarket-Abo siehst du Endertruhen und Inventare anderer Spieler auf HugoSMP.' },
  { pfad: '/fragen', datei: 'fragen', name: 'Fragen', titel: 'Häufige Fragen – CoreMarket',
    beschreibung: 'Antworten auf die häufigsten Fragen zum Spawner-Handel mit CoreMarket auf HugoSMP.' },
];

// Wiki: jede .md-Datei in wiki/ wird eine eigene Seite unter /wiki/<dateiname>
const wiki = require('./wiki');
const WIKI = wiki.laden(path.join(__dirname, 'wiki'));
if (WIKI.length) {
  SEITEN.push({ pfad: '/wiki', datei: 'wiki', name: 'Wiki', inhalt: wiki.uebersicht(WIKI), titel: 'Wiki – CoreMarket',
    beschreibung: 'Anleitungen und Erklärungen rund um den Spawner-Handel mit CoreMarket: Verifizierung, Tickets, Preisliste, Sicherheit und mehr.' });
  for (const a of WIKI) {
    SEITEN.push({ pfad: `/wiki/${a.slug}`, datei: 'wiki', menue: false, aktiv: '/wiki', inhalt: wiki.artikelSeite(WIKI, a),
      titel: `${a.titel} – CoreMarket Wiki`, beschreibung: a.beschreibung || `${a.titel} – CoreMarket Wiki` });
  }
}

const SEITEN_DIR = path.join(__dirname, 'seiten');
function baueSeiten() {
  const v = name => (dateien.get(name)?.etag || '').replace(/"/g, '').slice(0, 8);
  const layout = fs.readFileSync(path.join(SEITEN_DIR, '_layout.html'), 'utf8')
    .replace('/style.css"', `/style.css?v=${v('/style.css')}"`)
    .replace('/app.js"', `/app.js?v=${v('/app.js')}"`);
  const fertig = new Map();
  for (const s of SEITEN) {
    const nav = SEITEN.filter(x => x.menue !== false)
      .map(x => `<a href="${x.pfad}"${x.pfad === (s.aktiv || s.pfad) ? ` class="aktiv"${x.pfad === s.pfad ? ' aria-current="page"' : ''}` : ''}>${escAttr(x.name)}</a>`).join('');
    const inhalt = s.inhalt ?? fs.readFileSync(path.join(SEITEN_DIR, s.datei + '.html'), 'utf8');
    const html = layout
      .replace('{{INHALT}}', () => inhalt)
      .replace('{{NAV}}', nav)
      .replaceAll('{{TITEL}}', escAttr(s.titel))
      .replaceAll('{{BESCHREIBUNG}}', escAttr(s.beschreibung))
      .replaceAll('{{PFAD}}', s.pfad)
      .replaceAll('{{SEITE}}', s.datei)
      .replaceAll('{{DISCORD}}', escAttr(DISCORD))
      .replaceAll('{{BILDER}}', escAttr(BILDER))
      .replace('</body>', () => (s.skript ? `<script src="/konto.js?v=${v('/konto.js')}" defer></script>\n` : '') + (s.js ? `<script src="/${s.js}?v=${v('/' + s.js)}" defer></script>\n` : '') + '</body>');
    fertig.set(s.pfad, html);
  }
  return fertig;
}
const SEITEN_HTML = baueSeiten();

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

/* ---------- Abo: Anfragen an den Bot durchreichen ---------- */
async function konto(req, res, url) {
  const rest = url.slice('/api/konto/'.length);
  if (!/^(info|login|login\/status|ich|logout|abo|abo\/abbrechen|ansehen)$/.test(rest)) return json(req, res, 404, { error: 'Gibt es nicht.' });
  let body;
  if (req.method === 'POST') {
    body = await new Promise((ok, nein) => { let b = ''; req.on('data', c => { b += c; if (b.length > 4000) { nein(new Error('zu groß')); req.destroy(); } }); req.on('end', () => ok(b)); req.on('error', nein); }).catch(() => null);
    if (body === null) return json(req, res, 413, { error: 'Anfrage zu groß.' });
  }
  const ctrl = new AbortController(), t = setTimeout(() => ctrl.abort(), rest === 'ansehen' ? 45000 : 12000);
  try {
    const q = new URL(req.url, 'http://x').search;
    const ip = String(req.headers['x-forwarded-for'] || req.socket.remoteAddress || '').split(',')[0].trim();
    const r = await fetch(`${BOT}/api/kunde/${rest}${q}`, { method: req.method === 'POST' ? 'POST' : 'GET', signal: ctrl.signal, body: body || undefined,
      headers: { 'content-type': 'application/json', 'user-agent': 'CoreMarket-Website', 'x-kunde-ip': ip, ...(req.headers.authorization ? { authorization: req.headers.authorization } : {}) } });
    const text = await r.text(); let d; try { d = JSON.parse(text); } catch { d = { error: 'Der Bot hat komisch geantwortet.' }; }
    return json(req, res, r.status, d);
  } catch (e) {
    return json(req, res, 503, { error: e.name === 'AbortError' ? 'Der Bot hat zu lange gebraucht. Versuch es gleich nochmal.' : 'Der Bot ist gerade nicht erreichbar.' });
  } finally { clearTimeout(t); }
}

/* ---------- Preise (Auktionshaus + Orders) vom Bot, mit Cache und Demo-Fallback ---------- */
const preisDemo = require('./preise-demo');
const preisCache = new Map(); // schluessel -> { d, zeit, laeuft }
let preiseEcht = false; // sobald der Bot einmal echte Preise geliefert hat, nie wieder Demo
async function preisHolen(schluessel, url, maxAlterMs) {
  let c = preisCache.get(schluessel);
  if (!c) { c = { d: null, zeit: 0, laeuft: null, status: 0 }; preisCache.set(schluessel, c); if (preisCache.size > 400) preisCache.delete(preisCache.keys().next().value); }
  if (Date.now() - c.zeit < maxAlterMs) return c;
  if (!c.laeuft) c.laeuft = (async () => {
    const ctrl = new AbortController(), t = setTimeout(() => ctrl.abort(), TIMEOUT_MS);
    try {
      const r = await fetch(url, { signal: ctrl.signal, headers: { accept: 'application/json', 'user-agent': 'CoreMarket-Website' } });
      c.status = r.status;
      if (r.status === 404) { c.d = null; c.zeit = Date.now(); return; }
      if (!r.ok) throw new Error(`HTTP ${r.status}`);
      const d = await r.json();
      if (!d || typeof d !== 'object' || (schluessel === '_alle' ? !Array.isArray(d.items) : !d.id)) throw new Error('keine gültigen Preis-Daten');
      c.d = d; c.zeit = Date.now(); preiseEcht = true;
    } catch (e) { c.status = 0; console.warn(`[preise] ${schluessel}: ${e.name === 'AbortError' ? 'Timeout' : e.message}`); }
    finally { clearTimeout(t); c.laeuft = null; }
  })();
  if (!c.d) await c.laeuft; // ohne alte Daten warten, sonst alte sofort liefern
  return c;
}
async function preise(req, res, url) {
  const id = url === '/api/preise' ? '' : url.slice('/api/preise/'.length).toLowerCase().replace(/^minecraft:/, '');
  if (id && !/^[a-z0-9_]{1,64}$/.test(id)) return json(req, res, 404, { error: 'Dieses Item gibt es nicht.' });
  const demo = PREISE_DEMO === 'an' || PREISE_DEMO === 'true' || PREISE_DEMO === '1';
  let c = null;
  if (!demo) c = await preisHolen(id || '_alle', id ? `${PREISE_API}/${encodeURIComponent(id)}` : PREISE_API, id ? 60000 : 45000);
  if (c?.d) return json(req, res, 200, c.d, { 'Cache-Control': 'public, max-age=30' });
  // Bot kennt das Item (noch) nicht
  if (id && preiseEcht && c?.status === 404) return json(req, res, 404, { error: 'Zu diesem Item gibt es noch keine Preise. Der Bot scannt jede Nacht um 0 Uhr.' });
  const demoErlaubt = demo || (PREISE_DEMO === 'auto' && !preiseEcht);
  if (demoErlaubt) {
    const d = id ? preisDemo.item(id) : preisDemo.uebersicht();
    return d ? json(req, res, 200, d, { 'Cache-Control': 'public, max-age=30' }) : json(req, res, 404, { error: 'Zu diesem Item gibt es noch keine Preise.', demo: true });
  }
  return json(req, res, 503, { error: 'Die Preise sind gerade nicht erreichbar. Versuch es gleich nochmal.' }, { 'Retry-After': '30' });
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

async function seite(req, res, vorlage) {
  const d = await daten();
  // Daten direkt in die Seite legen: kein zweiter Request, Inhalte sofort da
  const roh = JSON.stringify({ daten: d, discord: DISCORD }).replace(/</g, '\\u003c').replace(/\u2028/g, '\\u2028').replace(/\u2029/g, '\\u2029');
  const html = Buffer.from(vorlage.replace('<!--START-DATEN-->', () => `<script id="start-daten" type="application/json">${roh}</script>`));
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

function umleiten(req, res, ziel) {
  res.writeHead(301, { ...SICHERHEIT, Location: ziel, 'Cache-Control': 'public, max-age=3600' });
  res.end();
}

function sitemap(req, res) {
  const basis = `https://${req.headers.host || 'coremarket.onrender.com'}`;
  const xml = `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${SEITEN.map(s => `  <url><loc>${basis}${s.pfad}</loc></url>`).join('\n')}\n</urlset>\n`;
  senden(req, res, 200, xml, { 'Content-Type': TYPEN['.xml'], 'Cache-Control': 'public, max-age=3600' });
}

function nichtGefunden(req, res) {
  const f = dateien.get('/404.html');
  senden(req, res, 404, f.inhalt, { 'Content-Type': TYPEN['.html'], 'Cache-Control': 'no-cache', _gzip: f.gzip });
}

const server = http.createServer(async (req, res) => {
  const t0 = Date.now();
  res.on('finish', () => { if (req.url !== '/health') console.log(`${req.method} ${req.url} ${res.statusCode} ${Date.now() - t0}ms`); });
  try {
    const url = decodeURIComponent(new URL(req.url, 'http://x').pathname);
    if (url.startsWith('/api/konto/') && (req.method === 'GET' || req.method === 'POST')) return await konto(req, res, url);
    if (req.method !== 'GET' && req.method !== 'HEAD') return senden(req, res, 405, 'Methode nicht erlaubt', { Allow: 'GET, HEAD', 'Content-Type': TYPEN['.txt'] });
    if (url.includes('..') || url.includes('\0')) return nichtGefunden(req, res);

    if (url === '/health' || url === '/healthz') return json(req, res, 200, { ok: true, laufzeit: Math.round((Date.now() - START) / 1000), daten: cache.daten ? Math.round((Date.now() - cache.zeit) / 1000) + 's alt' : 'keine', fehler: cache.fehler });
    if (url === '/api/preise' || url.startsWith('/api/preise/')) return await preise(req, res, url);
    if (url === '/api/daten') {
      const d = await daten();
      return d ? json(req, res, 200, d) : json(req, res, 503, { fehler: cache.fehler || 'Keine Daten' }, { 'Retry-After': '30' });
    }
    if (url === '/index.html') return umleiten(req, res, '/');
    if (url === '/auktionshaus') return umleiten(req, res, '/auction-orders'); // alte Seite, gibt es nicht mehr
    if (url.length > 1 && url.endsWith('/') && SEITEN_HTML.has(url.slice(0, -1))) return umleiten(req, res, url.slice(0, -1));
    if (SEITEN_HTML.has(url)) return await seite(req, res, SEITEN_HTML.get(url));
    if (url === '/sitemap.xml') return sitemap(req, res);
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
