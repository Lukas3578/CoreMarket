'use strict';
/*
 * Marktplatz: Spieler handeln Spawner untereinander.
 *
 *  - Angebote: "verkauf" (Spieler verkauft Spawner) oder "ankauf" (Spieler sucht Spawner)
 *  - Deal: ein anderer Spieler nimmt ein Angebot an (Menge wählen). Die Menge ist dann reserviert.
 *  - Ende: Nach der Übergabe im Spiel bewertet jeder den anderen einmal mit trust, neutral oder scam.
 *    Erst wenn beide bewertet haben, ist der Deal abgeschlossen. Vorher kann jeder abbrechen.
 *  - Ruf: Summe der Bewertungen, die ein Spieler bekommen hat.
 *
 * CoreMarket ist nur Vermittler und haftet für nichts. Gespeichert wird alles in einer JSON-Datei
 * (MARKT_DATEI). Die Datei muss auf einem dauerhaften Speicher liegen, sonst ist alles nach einem
 * Neustart weg (z. B. Render Free).
 */
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');

const MC = /^[.*]?[A-Za-z0-9_]{2,16}$/;
const WERTE = ['trust', 'neutral', 'scam'];
const MAX_ANGEBOTE = 20;        // offene Angebote pro Spieler
const MAX_OFFENE_DEALS = 10;    // offene Deals pro Spieler
const DEAL_ABLAUF = 7 * 86400000; // offene Deals ohne Bewertung werden nach 7 Tagen geschlossen

// Spawner, die man immer handeln kann (zusätzlich zu denen aus der CoreMarket-Preisliste)
const STANDARD = ['Skelly', 'Creeper', 'Iron-Golem', 'Spider', 'Blaze', 'Kuh', 'Piglin', 'Zombie', 'Zombie-Piglin', 'Schwein', 'Enderman', 'Höhlenspinne', 'Hexe', 'Schleim', 'Magmawürfel', 'Wither-Skelett', 'Schaf', 'Huhn'];
const slug = n => String(n).toLowerCase().replace(/ä/g, 'ae').replace(/ö/g, 'oe').replace(/ü/g, 'ue').replace(/ß/g, 'ss').replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
const id = () => crypto.randomBytes(8).toString('hex');
const fehler = (status, text) => Object.assign(new Error(text), { status });
const sauber = (t, max) => String(t ?? '').replace(/[\u0000-\u001f\u007f<>]/g, '').trim().slice(0, max);

module.exports = function markt({ datei, holeKunde, spawnerNamen, dauerhaft }) {
  /* ---------- Speicher ---------- */
  let D = { angebote: [], deals: [], version: 1 };
  try {
    if (fs.existsSync(datei)) D = { ...D, ...JSON.parse(fs.readFileSync(datei, 'utf8')) };
  } catch (e) { console.error('[markt] Datei kaputt, starte leer:', e.message); }
  let speichernTimer = null;
  function speichern() {
    clearTimeout(speichernTimer);
    speichernTimer = setTimeout(() => {
      try {
        fs.mkdirSync(path.dirname(datei), { recursive: true });
        const tmp = datei + '.tmp';
        fs.writeFileSync(tmp, JSON.stringify(D));
        fs.renameSync(tmp, datei); // erst komplett schreiben, dann tauschen: nie halbe Datei
      } catch (e) { console.error('[markt] Speichern fehlgeschlagen:', e.message); }
    }, 300);
  }
  const jetztSpeichern = () => { clearTimeout(speichernTimer); try { fs.mkdirSync(path.dirname(datei), { recursive: true }); fs.writeFileSync(datei + '.tmp', JSON.stringify(D)); fs.renameSync(datei + '.tmp', datei); } catch { /* egal */ } };
  process.on('SIGTERM', jetztSpeichern);
  process.on('SIGINT', jetztSpeichern);

  /* ---------- Spawner-Liste ---------- */
  function spawnerListe() {
    const m = new Map();
    for (const n of [...(spawnerNamen() || []), ...STANDARD]) if (!m.has(slug(n))) m.set(slug(n), n);
    return [...m].map(([s, name]) => ({ slug: s, name }));
  }
  const spawnerName = s => spawnerListe().find(x => x.slug === s)?.name;

  /* ---------- Ruf ---------- */
  function ruf(name) {
    const k = String(name).toLowerCase(), r = { trust: 0, neutral: 0, scam: 0, deals: 0 };
    for (const d of D.deals) {
      if (d.verkaeufer.toLowerCase() !== k && d.kaeufer.toLowerCase() !== k) continue;
      if (d.status === 'abgeschlossen') r.deals++;
      for (const [von, b] of Object.entries(d.bewertungen || {})) if (von.toLowerCase() !== k) r[b.wert]++;
    }
    return r;
  }
  const rufCache = new Map();
  const rufVon = n => { const k = n.toLowerCase(); if (!rufCache.has(k)) rufCache.set(k, ruf(n)); return rufCache.get(k); };
  const rufNeu = () => rufCache.clear();

  /* ---------- Aufräumen: alte offene Deals schließen ---------- */
  function aufraeumen() {
    let neu = false;
    for (const d of D.deals) if (d.status === 'offen' && d.at < Date.now() - DEAL_ABLAUF) { d.status = Object.keys(d.bewertungen || {}).length ? 'abgeschlossen' : 'abgelaufen'; d.ende = Date.now(); neu = true; }
    // geschlossene Angebote nach 30 Tagen vergessen, Deals bleiben (für den Ruf)
    const vorher = D.angebote.length;
    D.angebote = D.angebote.filter(a => a.status === 'offen' || a.status === 'pausiert' || a.geaendert > Date.now() - 30 * 86400000);
    if (neu || vorher !== D.angebote.length) { rufNeu(); speichern(); }
  }
  setInterval(aufraeumen, 10 * 60000).unref();
  aufraeumen();

  /* ---------- Ausgabe ---------- */
  const reserviert = a => D.deals.filter(d => d.angebot === a.id && d.status === 'offen').reduce((s, d) => s + d.menge, 0);
  const frei = a => Math.max(0, a.rest - reserviert(a));
  const oeffentlich = a => ({ id: a.id, art: a.art, spawner: a.spawner, name: spawnerName(a.spawner) || a.spawner, von: a.von, preis: a.preis, menge: frei(a), vb: !!a.vb, notiz: a.notiz || '', at: a.at, ruf: rufVon(a.von) });
  const sichtbar = a => a.status === 'offen' && frei(a) > 0;
  const dealAus = (d, ich) => ({
    id: d.id, spawner: d.spawner, name: spawnerName(d.spawner) || d.spawner, menge: d.menge, preis: d.preis, verkaeufer: d.verkaeufer, kaeufer: d.kaeufer,
    at: d.at, ende: d.ende || 0, status: d.status, abbruchVon: d.abbruchVon || '',
    rolle: ich ? (d.verkaeufer.toLowerCase() === ich.toLowerCase() ? 'verkaeufer' : 'kaeufer') : '',
    meine: ich ? d.bewertungen?.[Object.keys(d.bewertungen || {}).find(k => k.toLowerCase() === ich.toLowerCase())]?.wert || '' : '',
    andere: ich ? Object.entries(d.bewertungen || {}).find(([k]) => k.toLowerCase() !== ich.toLowerCase())?.[1]?.wert || '' : '',
    partnerRuf: ich ? rufVon(d.verkaeufer.toLowerCase() === ich.toLowerCase() ? d.kaeufer : d.verkaeufer) : null,
  });

  function uebersicht() {
    const offen = D.angebote.filter(sichtbar);
    const liste = spawnerListe().map(s => {
      const v = offen.filter(a => a.spawner === s.slug && a.art === 'verkauf');
      const k = offen.filter(a => a.spawner === s.slug && a.art === 'ankauf');
      return { ...s, verkauf: { anzahl: v.length, stueck: v.reduce((n, a) => n + frei(a), 0), min: v.length ? Math.min(...v.map(a => a.preis)) : null }, ankauf: { anzahl: k.length, stueck: k.reduce((n, a) => n + frei(a), 0), max: k.length ? Math.max(...k.map(a => a.preis)) : null } };
    });
    const fertig = D.deals.filter(d => d.status === 'abgeschlossen');
    return {
      dauerhaft,
      spawner: liste,
      neueste: offen.sort((a, b) => b.at - a.at).slice(0, 12).map(oeffentlich),
      deals: fertig.sort((a, b) => (b.ende || 0) - (a.ende || 0)).slice(0, 10).map(d => ({ name: spawnerName(d.spawner) || d.spawner, spawner: d.spawner, menge: d.menge, preis: d.preis, verkaeufer: d.verkaeufer, kaeufer: d.kaeufer, ende: d.ende })),
      zahlen: { angebote: offen.length, haendler: new Set(offen.map(a => a.von.toLowerCase())).size, deals: fertig.length, volumen: fertig.reduce((n, d) => n + d.menge * d.preis, 0) },
    };
  }
  function spawnerSeite(s) {
    const name = spawnerName(s); if (!name) return null;
    const offen = D.angebote.filter(a => a.spawner === s && sichtbar(a)).map(oeffentlich);
    const fertig = D.deals.filter(d => d.spawner === s && d.status === 'abgeschlossen').sort((a, b) => (b.ende || 0) - (a.ende || 0));
    return {
      slug: s, name,
      verkauf: offen.filter(a => a.art === 'verkauf').sort((a, b) => a.preis - b.preis || a.at - b.at),
      ankauf: offen.filter(a => a.art === 'ankauf').sort((a, b) => b.preis - a.preis || a.at - b.at),
      letzte: fertig.slice(0, 8).map(d => ({ menge: d.menge, preis: d.preis, verkaeufer: d.verkaeufer, kaeufer: d.kaeufer, ende: d.ende })),
    };
  }
  function spieler(name) {
    const k = String(name).toLowerCase();
    const bewertungen = [];
    for (const d of D.deals) for (const [von, b] of Object.entries(d.bewertungen || {})) {
      const ueber = von.toLowerCase() === d.verkaeufer.toLowerCase() ? d.kaeufer : d.verkaeufer;
      if (ueber.toLowerCase() === k) bewertungen.push({ von, wert: b.wert, text: b.text || '', at: b.at, name: spawnerName(d.spawner) || d.spawner, menge: d.menge });
    }
    return { ruf: ruf(name), angebote: D.angebote.filter(a => a.von.toLowerCase() === k && sichtbar(a)).map(oeffentlich), bewertungen: bewertungen.sort((a, b) => b.at - a.at).slice(0, 20) };
  }
  function ich(mc) {
    const k = mc.toLowerCase();
    return {
      mc, ruf: ruf(mc),
      angebote: D.angebote.filter(a => a.von.toLowerCase() === k && a.status !== 'weg').sort((a, b) => b.at - a.at).map(a => ({ ...oeffentlich(a), status: a.status, rest: a.rest, reserviert: reserviert(a) })),
      deals: D.deals.filter(d => d.verkaeufer.toLowerCase() === k || d.kaeufer.toLowerCase() === k).sort((a, b) => (b.status === 'offen') - (a.status === 'offen') || b.at - a.at).slice(0, 60).map(d => dealAus(d, mc)),
    };
  }

  /* ---------- Aktionen ---------- */
  const LIMIT = new Map();
  function begrenzt(k, max, ms) { const l = (LIMIT.get(k) || []).filter(t => t > Date.now() - ms); if (l.length >= max) return true; l.push(Date.now()); LIMIT.set(k, l); return false; }
  const zahl = (v, lo, hi) => { const n = Number(String(v).replace(',', '.')); if (!Number.isFinite(n) || n < lo || n > hi) return null; return n; };

  function angebotNeu(mc, b) {
    if (begrenzt(`neu:${mc.toLowerCase()}`, 10, 10 * 60000)) throw fehler(429, 'Zu viele neue Angebote. Warte ein paar Minuten.');
    const art = b.art === 'ankauf' ? 'ankauf' : b.art === 'verkauf' ? 'verkauf' : null;
    if (!art) throw fehler(400, 'Wähl, ob du verkaufen oder kaufen willst.');
    if (!spawnerName(b.spawner)) throw fehler(400, 'Diesen Spawner gibt es nicht.');
    const menge = zahl(b.menge, 1, 10000), preis = zahl(b.preis, 0.01, 100000);
    if (!menge || !Number.isInteger(menge)) throw fehler(400, 'Die Menge muss eine ganze Zahl zwischen 1 und 10.000 sein.');
    if (!preis) throw fehler(400, 'Der Preis pro Stück muss zwischen 0,01M und 100.000M liegen.');
    const offen = D.angebote.filter(a => a.von.toLowerCase() === mc.toLowerCase() && (a.status === 'offen' || a.status === 'pausiert'));
    if (offen.length >= MAX_ANGEBOTE) throw fehler(400, `Du hast schon ${MAX_ANGEBOTE} Angebote. Lösch erst eins.`);
    const a = { id: id(), art, spawner: b.spawner, von: mc, preis: Math.round(preis * 1000) / 1000, menge, rest: menge, vb: !!b.vb, notiz: sauber(b.notiz, 120), at: Date.now(), geaendert: Date.now(), status: 'offen' };
    D.angebote.push(a); speichern();
    return oeffentlich(a);
  }
  function angebotAendern(mc, aid, b) {
    const a = D.angebote.find(x => x.id === aid);
    if (!a || a.status === 'weg') throw fehler(404, 'Dieses Angebot gibt es nicht mehr.');
    if (a.von.toLowerCase() !== mc.toLowerCase()) throw fehler(403, 'Das ist nicht dein Angebot.');
    if (b.aktion === 'loeschen') a.status = 'weg';
    else if (b.aktion === 'pausieren') a.status = 'pausiert';
    else if (b.aktion === 'fortsetzen') a.status = 'offen';
    else if (b.aktion === 'preis') { const p = zahl(b.preis, 0.01, 100000); if (!p) throw fehler(400, 'Ungültiger Preis.'); a.preis = Math.round(p * 1000) / 1000; }
    else throw fehler(400, 'Unbekannte Aktion.');
    a.geaendert = Date.now(); speichern();
    return ich(mc);
  }
  function dealNeu(mc, b) {
    if (begrenzt(`deal:${mc.toLowerCase()}`, 8, 10 * 60000)) throw fehler(429, 'Zu viele Deals auf einmal. Warte ein paar Minuten.');
    const a = D.angebote.find(x => x.id === b.angebot);
    if (!a || !sichtbar(a)) throw fehler(404, 'Dieses Angebot ist nicht mehr verfügbar.');
    if (a.von.toLowerCase() === mc.toLowerCase()) throw fehler(400, 'Du kannst nicht mit dir selbst handeln.');
    const menge = zahl(b.menge, 1, 10000);
    if (!menge || !Number.isInteger(menge) || menge > frei(a)) throw fehler(400, `Wähl eine Menge zwischen 1 und ${frei(a)}.`);
    const offen = D.deals.filter(d => d.status === 'offen' && (d.verkaeufer.toLowerCase() === mc.toLowerCase() || d.kaeufer.toLowerCase() === mc.toLowerCase()));
    if (offen.length >= MAX_OFFENE_DEALS) throw fehler(400, 'Du hast schon 10 offene Deals. Schließ erst welche ab.');
    const d = { id: id(), angebot: a.id, spawner: a.spawner, menge, preis: a.preis, verkaeufer: a.art === 'verkauf' ? a.von : mc, kaeufer: a.art === 'verkauf' ? mc : a.von, at: Date.now(), status: 'offen', bewertungen: {} };
    D.deals.push(d); speichern();
    return dealAus(d, mc);
  }
  function dealAktion(mc, did, b) {
    const d = D.deals.find(x => x.id === did);
    if (!d) throw fehler(404, 'Diesen Deal gibt es nicht.');
    const k = mc.toLowerCase();
    if (d.verkaeufer.toLowerCase() !== k && d.kaeufer.toLowerCase() !== k) throw fehler(403, 'Das ist nicht dein Deal.');
    if (d.status !== 'offen') throw fehler(400, 'Dieser Deal ist schon beendet.');
    if (b.aktion === 'abbrechen') {
      if (Object.keys(d.bewertungen || {}).length) throw fehler(400, 'Es wurde schon bewertet. Bitte bewerte jetzt auch, um den Deal zu beenden.');
      d.status = 'abgebrochen'; d.abbruchVon = mc; d.ende = Date.now();
    } else if (b.aktion === 'bewerten') {
      if (!WERTE.includes(b.wert)) throw fehler(400, 'Wähl Trust, Neutral oder Scam.');
      if (Object.keys(d.bewertungen).some(x => x.toLowerCase() === k)) throw fehler(400, 'Du hast diesen Deal schon bewertet.');
      d.bewertungen[mc] = { wert: b.wert, text: sauber(b.text, 140), at: Date.now() };
      if (Object.keys(d.bewertungen).length >= 2) {
        d.status = 'abgeschlossen'; d.ende = Date.now();
        // verkaufte Menge vom Angebot abziehen
        const a = D.angebote.find(x => x.id === d.angebot);
        if (a) { a.rest = Math.max(0, a.rest - d.menge); a.geaendert = Date.now(); if (!a.rest) a.status = 'weg'; }
      }
    } else throw fehler(400, 'Unbekannte Aktion.');
    rufNeu(); speichern();
    return dealAus(d, mc);
  }

  /* ---------- HTTP ---------- */
  async function http(req, res, url, body, json) {
    try {
      if (req.method === 'GET' && url === '/api/markt') return json(200, uebersicht());
      let m;
      if (req.method === 'GET' && (m = url.match(/^\/api\/markt\/spawner\/([a-z0-9-]{1,40})$/))) { const s = spawnerSeite(m[1]); return s ? json(200, s) : json(404, { error: 'Diesen Spawner gibt es nicht.' }); }
      if (req.method === 'GET' && (m = url.match(/^\/api\/markt\/spieler\/([.*]?[A-Za-z0-9_]{2,16})$/))) return json(200, spieler(m[1]));
      // ab hier nur angemeldet
      const kunde = await holeKunde(req);
      if (!kunde) return json(401, { error: 'Bitte melde dich an.' });
      const mc = kunde.mc;
      if (!MC.test(mc)) return json(401, { error: 'Bitte melde dich an.' });
      if (req.method === 'GET' && url === '/api/markt/ich') return json(200, ich(mc));
      if (req.method === 'POST' && url === '/api/markt/angebot') return json(200, angebotNeu(mc, body));
      if (req.method === 'POST' && (m = url.match(/^\/api\/markt\/angebot\/([a-f0-9]{16})$/))) return json(200, angebotAendern(mc, m[1], body));
      if (req.method === 'POST' && url === '/api/markt/deal') return json(200, dealNeu(mc, body));
      if (req.method === 'POST' && (m = url.match(/^\/api\/markt\/deal\/([a-f0-9]{16})$/))) return json(200, dealAktion(mc, m[1], body));
      return json(404, { error: 'Gibt es nicht.' });
    } catch (e) {
      if (!e.status) console.error('[markt]', e);
      return json(e.status || 500, { error: e.status ? e.message : 'Interner Fehler' });
    }
  }

  return { http, spawnerListe, spawnerName, ruf: rufVon, uebersicht };
};
