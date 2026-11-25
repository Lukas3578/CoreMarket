'use strict';
/*
 * CoreMarket Preis-Tracker – Modul für den CoreMarket-Bot (mineflayer)
 *
 * Was es macht:
 *  - Jede Nacht um 0 Uhr (Europe/Berlin) sucht der Bot JEDES Item im Auktionshaus und in den Orders.
 *  - Pro Item blättert er ein paar Seiten durch und merkt sich:
 *      Auktionshaus: billigster Preis pro Stück, Ø der billigsten Angebote (erste Seite), Anzahl
 *      Orders:       höchster Preis pro Stück (was Leute zahlen), Ø der besten Orders, Anzahl
 *  - Beliebte Items werden zusätzlich alle 2 Stunden kurz gescannt (für den 24-Std.-Graphen).
 *  - Der Live-Leser vom Auktionshaus kann seine Daten mit liveAh(items) reingeben,
 *    dann ist der billigste Preis immer der aktuellste.
 *  - Alles landet in einer JSON-Datei (Verlauf bis 400 Tage) und wird als API ausgegeben:
 *      GET /api/public/preise          Übersicht aller Items
 *      GET /api/public/preise/<id>     ein Item mit ganzem Verlauf
 *
 * Einbauen: siehe bot/README.md. Keine Abhängigkeiten außer dem, was mineflayer ohnehin mitbringt.
 * Alle Preise in MILLIONEN (wie im restlichen Bot): 1 = 1M, 0.5 = 500K, 0.0012 = 1.200.
 */
const fs = require('node:fs');
const path = require('node:path');
const { EventEmitter } = require('node:events');

/* ================================================================ Einstellungen */
const STANDARD = {
  datei: path.join(process.cwd(), 'daten', 'preise.json'),
  zeitzone: 'Europe/Berlin',
  scanUm: '00:00',            // Uhrzeit für den großen Scan
  nachholenBisStunde: 6,      // war der Bot um 0 Uhr offline, holt er den Scan bis 6 Uhr nach
  seiten: 2,                  // so viele Seiten pro Suche durchblättern
  schnittAnzahl: 10,          // Ø aus den X billigsten Angeboten (bzw. X besten Orders)
  pauseMs: 1800,              // Pause zwischen zwei Befehlen (gegen Spam-Kicks)
  seitePauseMs: 700,          // Pause beim Umblättern
  timeoutMs: 9000,            // so lange auf das Fenster warten
  orders: true,               // Orders mitscannen
  schnellAlleMin: 120,        // beliebte Items alle X Minuten (0 = aus)
  schnellAnzahl: 30,          // so viele beliebte Items
  immer: ['ancient_debris', 'netherite_ingot', 'diamond', 'elytra', 'totem_of_undying', 'beacon',
    'enchanted_golden_apple', 'shulker_box', 'nether_star', 'netherite_upgrade_smithing_template',
    'mace', 'heavy_core', 'trident', 'end_crystal', 'experience_bottle', 'spawner'],
  seltenJedenXtenTag: 3,      // Items ohne ein Angebot in den letzten 3 Scans nur jeden 3. Tag scannen
  liveAlleMin: 30,            // Live-Preise höchstens alle X Minuten als Punkt in den Verlauf
  items: null,                // eigene Item-Liste (Array mit ids), sonst alle aus bot.registry
  weglassen: /^(air|.*_spawn_egg|command_block.*|chain_command_block|repeating_command_block|structure_.*|jigsaw|barrier|light|debug_stick|knowledge_book|bedrock|end_portal_frame|reinforced_deepslate|petrified_oak_slab|budding_amethyst|spawner_minecart|test_.*|vault|trial_spawner|frogspawn|farmland|dirt_path|infested_.*|player_head|written_book|filled_map|potion|splash_potion|lingering_potion|tipped_arrow|enchanted_book|suspicious_stew|firework_star|ominous_bottle|goat_horn)$/,
  befehle: {
    ah: begriff => `/ah ${begriff}`,
    orders: begriff => `/orders ${begriff}`,
  },
  suchbegriff: item => item.displayName || item.name.replace(/_/g, ' '),
  log: (...a) => console.log('[preise]', ...a),
};

/* ================================================================ Hilfen */
const warte = ms => new Promise(r => setTimeout(r, ms));
const rund = v => v === null || v === undefined || !Number.isFinite(v) ? null : Math.round(v * 1e8) / 1e8;

/** "1,5M" / "1.5m" / "500K" / "$1,234,567" / "1.234.567" / "2,1 Mrd" / "12.5k$" -> Millionen */
function parsePreis(text) {
  if (text === null || text === undefined) return null;
  if (typeof text === 'number') return text / 1e6;
  let s = String(text).replace(/§./g, '').replace(/[$€\s]/g, '').toLowerCase();
  const m = s.match(/(-?[\d.,]+)(mrd|bn|b|m|mio|k|t)?/);
  if (!m) return null;
  let zahl = m[1];
  const faktor = { k: 1e3, m: 1e6, mio: 1e6, b: 1e9, bn: 1e9, mrd: 1e9, t: 1e12 }[m[2]] || 1;
  // Trennzeichen erkennen: "1.234.567" / "1,234,567" sind Tausender, "1,5" / "1.5" ist Komma
  const punkte = (zahl.match(/\./g) || []).length, kommas = (zahl.match(/,/g) || []).length;
  if (punkte && kommas) zahl = zahl.lastIndexOf(',') > zahl.lastIndexOf('.') ? zahl.replace(/\./g, '').replace(',', '.') : zahl.replace(/,/g, '');
  else if (punkte > 1 || (punkte === 1 && /\.\d{3}$/.test(zahl) && faktor === 1)) zahl = zahl.replace(/\./g, '');
  else if (kommas > 1 || (kommas === 1 && /,\d{3}$/.test(zahl) && faktor === 1)) zahl = zahl.replace(/,/g, '');
  else zahl = zahl.replace(',', '.');
  const v = parseFloat(zahl);
  return Number.isFinite(v) ? (v * faktor) / 1e6 : null;
}

/** Statistik über Preise pro Stück. richtung 'auf' = billigste zuerst (AH), 'ab' = höchste zuerst (Orders) */
function statistik(preise, richtung, n) {
  const l = preise.filter(p => Number.isFinite(p) && p > 0).sort((a, b) => richtung === 'auf' ? a - b : b - a);
  if (!l.length) return { bester: null, schnitt: null, median: null, anzahl: 0 };
  const top = l.slice(0, n);
  // Ausreißer raus: alles, was mehr als 4x vom Median der Top-Liste weg ist (Troll-Angebote, Tippfehler)
  const med = top[Math.floor(top.length / 2)];
  const sauber = top.filter(p => p <= med * 4 && p >= med / 4);
  const schnitt = sauber.reduce((s, p) => s + p, 0) / (sauber.length || 1);
  return { bester: rund(l[0]), schnitt: rund(schnitt), median: rund(med), anzahl: l.length };
}

/** Lokale Uhrzeit in einer Zeitzone (auch bei Sommer-/Winterzeit richtig) */
function lokal(ts, zone) {
  const teile = Object.fromEntries(new Intl.DateTimeFormat('en-GB', { timeZone: zone, year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' })
    .formatToParts(new Date(ts)).map(p => [p.type, p.value]));
  return { tag: `${teile.year}-${teile.month}-${teile.day}`, minute: Number(teile.hour) * 60 + Number(teile.minute) };
}
function naechsterScan(jetzt, zone, um) {
  const [h, m] = um.split(':').map(Number), ziel = h * 60 + m;
  let t = Math.ceil(jetzt / 60000) * 60000;
  for (let i = 0; i < 26 * 60; i++, t += 60000) if (lokal(t, zone).minute === ziel) return t;
  return jetzt + 864e5;
}

/* ================================================================ Leser für mineflayer
 * Öffnet /ah <item> bzw. /orders <item>, liest jede Seite und blättert weiter.
 * Hat euer Bot schon einen Auktionshaus-Leser (für die Live-Seite), nehmt lieber den – siehe README.
 */
function mineflayerLeser(bot, cfg = {}) {
  const C = {
    // Zeilen in der Lore, in denen Preis / Verkäufer stehen (HugoSMP-Texte ggf. anpassen)
    preisZeile: /(preis|price|kosten|cost|bietet|zahlt|pays?)\b[^:\d$]*[:\s]\s*\$?\s*([\d.,]+\s*(?:mrd|mio|[kmbt])?)/i,
    stueckZeile: /(pro\s*st(ü|ue)ck|je\s*st(ü|ue)ck|each|per\s*item|pro\s*item|\/\s*st(ü|ue)ck)/i,
    verkaeuferZeile: /(verk(ä|ae)ufer|seller|von|by|spieler|player|owner|besitzer)\s*:?\s*([.*]?[A-Za-z0-9_]{2,17})/i,
    mengeZeile: /(menge|amount|anzahl)\s*:?\s*([\d.,]+)\s*(?:\/\s*([\d.,]+))?/i,
    weiter: /(n(ä|ae)chste|weiter|next|vor\b|→|»|>>)/i,
    deko: /^(.*_stained_glass_pane|glass_pane|barrier|air)$/,
    ...cfg,
  };
  let chat = null;
  try { chat = require('prismarine-chat')(bot.registry || bot.version); } catch { /* ohne Farben */ }
  const plain = j => {
    if (j === null || j === undefined) return '';
    if (typeof j === 'string') { try { j = JSON.parse(j); } catch { return j.replace(/§./g, ''); } }
    if (chat) { try { return new chat(j).toString(); } catch { /* weiter */ } }
    if (typeof j === 'object') return [j.text || '', ...(j.extra || []).map(plain)].join('');
    return String(j);
  };
  const lore = it => {
    const l = it.customLore ?? it.nbt?.value?.display?.value?.Lore?.value?.value ?? [];
    return (Array.isArray(l) ? l : []).map(plain);
  };
  const name = it => (it.customName ? plain(it.customName) : '') || it.displayName || it.name;

  function slotLesen(it, art) {
    if (!it || C.deko.test(it.name)) return null;
    const zeilen = lore(it);
    let preis = null, proStueck = null, verkaeufer = null, menge = it.count || 1;
    for (const z of zeilen) {
      const p = z.match(C.preisZeile);
      if (p) { const v = parsePreis(p[2]); if (v !== null) { if (C.stueckZeile.test(z)) proStueck = v; else if (preis === null) preis = v; } }
      const w = z.match(C.verkaeuferZeile); if (w && !verkaeufer) verkaeufer = w[3];
      const mg = z.match(C.mengeZeile); if (mg && art === 'orders') menge = parseInt((mg[3] || mg[2]).replace(/[.,]/g, ''), 10) || menge;
    }
    if (preis === null && proStueck === null) return null; // Knopf, Deko, Info-Item
    if (proStueck === null) proStueck = art === 'orders' ? preis : preis / menge;
    if (preis === null) preis = proStueck * menge;
    return { id: it.name, name: name(it), menge, preis: rund(preis), proStueck: rund(proStueck), verkaeufer };
  }

  function warteFenster() {
    return new Promise((ok, nein) => {
      const t = setTimeout(() => { bot.removeListener('windowOpen', auf); nein(new Error('Fenster kam nicht')); }, C.timeoutMs || 9000);
      const auf = w => { clearTimeout(t); ok(w); };
      bot.once('windowOpen', auf);
    });
  }
  // Nach einem Klick: entweder neues Fenster oder dasselbe Fenster mit neuen Slots
  function warteNeueSeite(alt) {
    return new Promise(ok => {
      let t = null, fertig = false;
      const ende = w => { if (fertig) return; fertig = true; clearTimeout(t); clearTimeout(max); bot.removeListener('windowOpen', neu); alt.removeListener?.('updateSlot', upd); ok(w); };
      const neu = w => ende(w);
      const upd = () => { clearTimeout(t); t = setTimeout(() => ende(alt), 350); };
      const max = setTimeout(() => ende(null), C.timeoutMs || 9000);
      bot.once('windowOpen', neu);
      alt.on?.('updateSlot', upd);
    });
  }

  async function suchen(art, befehl, seiten) {
    const auf = warteFenster();
    bot.chat(befehl);
    let w = await auf, alle = [];
    try {
      for (let s = 1; s <= seiten; s++) {
        const ende = w.inventoryStart ?? w.slots.length;
        const seite = [];
        let weiterSlot = null;
        for (let i = 0; i < ende; i++) {
          const it = w.slots[i];
          if (!it) continue;
          const x = slotLesen(it, art);
          if (x) seite.push({ ...x, seite: s });
          else if (C.weiter.test(name(it)) || (it.name === 'arrow' && /→|»|>|weiter|next/i.test(name(it)))) weiterSlot = i;
        }
        alle = alle.concat(seite);
        if (s === seiten || weiterSlot === null || !seite.length) break;
        const neu = warteNeueSeite(w);
        await bot.clickWindow(weiterSlot, 0, 0);
        const w2 = await neu;
        if (!w2) break;
        w = w2;
        await warte(C.seitePauseMs || 700);
      }
    } finally {
      try { bot.closeWindow(w); } catch { /* schon zu */ }
    }
    return alle;
  }
  return { suchen };
}

/* ================================================================ Tracker */
class PreisTracker extends EventEmitter {
  constructor(bot, optionen = {}) {
    super();
    this.bot = bot;
    this.o = { ...STANDARD, ...optionen, befehle: { ...STANDARD.befehle, ...(optionen.befehle || {}) } };
    // leser.ah(begriff, item) / leser.orders(begriff, item) -> [{ id, name, menge, preis, proStueck, verkaeufer }]
    const roh = bot && !(this.o.leser?.ah && this.o.leser?.orders) ? mineflayerLeser(bot, this.o.leserEinstellungen) : null;
    this.leser = {
      ah: this.o.leser?.ah || ((b, it) => roh.suchen('ah', this.o.befehle.ah(b, it), this.o.seiten)),
      orders: this.o.leser?.orders || ((b, it) => roh.suchen('orders', this.o.befehle.orders(b, it), this.o.seiten)),
    };
    // Exklusiv: der Bot kann nur ein Fenster gleichzeitig offen haben. Gebt hier eure Warteschlange rein,
    // z. B. exklusiv: fn => guiQueue.push(fn). Standard: eigene einfache Sperre (this.sperre).
    this._kette = Promise.resolve();
    this.exklusiv = this.o.exklusiv || (fn => this.sperre(fn));
    this.d = this._laden();
    this.scan = { laeuft: false, art: null, fertig: 0, gesamt: 0, start: 0, aktuell: null, stop: false };
    this._timer = null;
  }

  /** Einfache Sperre, damit sich Scan und andere Bot-Funktionen (Endertruhe ansehen …) nicht ins Gehege kommen */
  sperre(fn) {
    const lauf = this._kette.then(fn, fn);
    this._kette = lauf.catch(() => {});
    return lauf;
  }

  /* ---------- Speicher */
  _laden() {
    try {
      const d = JSON.parse(fs.readFileSync(this.o.datei, 'utf8'));
      if (d && d.items) return d;
    } catch { /* neu anfangen */ }
    return { version: 1, items: {}, scans: [], letzterScanTag: null, letzterSchnell: 0, fortschritt: null };
  }
  _speichern(sofort) {
    clearTimeout(this._speicherT);
    const los = () => {
      try {
        fs.mkdirSync(path.dirname(this.o.datei), { recursive: true });
        const tmp = this.o.datei + '.tmp';
        fs.writeFileSync(tmp, JSON.stringify(this.d));
        fs.renameSync(tmp, this.o.datei);
      } catch (e) { this.o.log('Speichern ging nicht:', e.message); }
    };
    if (sofort) los(); else this._speicherT = setTimeout(los, 5000);
  }

  /* ---------- Item-Liste */
  alleItems() {
    const reg = this.bot?.registry;
    let l = this.o.items
      ? this.o.items.map(id => reg?.itemsByName?.[id] || { name: id, displayName: id.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase()) })
      : (reg?.itemsArray || []).filter(i => !this.o.weglassen.test(i.name));
    const gesehen = new Set();
    return l.filter(i => i && !gesehen.has(i.name) && gesehen.add(i.name));
  }

  /* ---------- Ein Item scannen */
  async itemScannen(item, quelle) {
    const begriff = this.o.suchbegriff(item);
    const nurDiesesItem = l => (l || []).filter(x => String(x.id || '').replace(/^minecraft:/, '') === item.name && x.echt !== 'nein');
    let ah = [], orders = [], fehler = null;
    try { ah = nurDiesesItem(await this.exklusiv(() => this.leser.ah(begriff, item))); } catch (e) { fehler = e.message; }
    if (this.o.orders) {
      await warte(this.o.pauseMs);
      try { orders = nurDiesesItem(await this.exklusiv(() => this.leser.orders(begriff, item))); } catch (e) { fehler = fehler || e.message; }
    }
    if (fehler && !ah.length && !orders.length) return { fehler };
    this.eintragen(item, ah, orders, quelle);
    return { ah: ah.length, orders: orders.length };
  }

  /** Ergebnis einer Suche speichern. ah/orders: Listen mit proStueck */
  eintragen(item, ah, orders, quelle = 'n', t = Date.now()) {
    const id = item.name;
    const e = this.d.items[id] || (this.d.items[id] = { name: item.displayName || id, punkte: [] });
    if (item.displayName) e.name = item.displayName;
    const a = statistik(ah.map(x => x.proStueck), 'auf', this.o.schnittAnzahl);
    const o = statistik(orders.map(x => x.proStueck), 'ab', this.o.schnittAnzahl);
    e.punkte.push([t, a.bester, a.schnitt, a.anzahl, o.bester, o.schnitt, o.anzahl, quelle]);
    const kurz = x => ({ preis: x.preis, menge: x.menge, proStueck: x.proStueck, verkaeufer: x.verkaeufer || null });
    e.ahTop = ah.slice().sort((x, y) => x.proStueck - y.proStueck).slice(0, 8).map(kurz);
    e.orderTop = orders.slice().sort((x, y) => y.proStueck - x.proStueck).slice(0, 8).map(kurz);
    e.at = t;
    this._aufraeumen(e, t);
    this._speichern();
  }

  /** Vom Live-Leser des Auktionshauses: alle gerade gelesenen Angebote reingeben (items wie bei /api/kunde/markt) */
  liveAh(items, t = Date.now()) {
    const proId = new Map();
    for (const x of items || []) {
      if (x.echt === 'nein' || !Number.isFinite(x.proStueck)) continue;
      const id = String(x.id || '').replace(/^minecraft:/, '');
      if (!proId.has(id) || proId.get(id).proStueck > x.proStueck) proId.set(id, x);
    }
    for (const [id, x] of proId) {
      const e = this.d.items[id];
      if (!e) continue; // nur Items, die der Scan schon kennt
      e.live = { min: rund(x.proStueck), at: t, verkaeufer: x.verkaeufer || null };
      const letzter = e.punkte[e.punkte.length - 1];
      if (!letzter || t - letzter[0] >= this.o.liveAlleMin * 60000) {
        e.punkte.push([t, rund(x.proStueck), null, null, null, null, null, 'l']);
      }
    }
    this._speichern();
  }

  _aufraeumen(e, jetzt) {
    // Feine Punkte (Schnell-Scan, Live) nur 3 Tage, danach nur noch die Nacht-Scans. Alles nach 400 Tagen weg.
    e.punkte = e.punkte.filter(p => jetzt - p[0] < 400 * 864e5 && (p[7] === 'n' || jetzt - p[0] < 3 * 864e5));
  }

  _selten(id) {
    const n = (this.d.items[id]?.punkte || []).filter(p => p[7] === 'n').slice(-3);
    return n.length === 3 && n.every(p => !p[3] && !p[6]);
  }

  /* ---------- Großer Scan */
  async vollerScan({ grund = 'nacht' } = {}) {
    if (this.scan.laeuft) return false;
    const heute = lokal(Date.now(), this.o.zeitzone).tag;
    const tagNr = Math.floor(Date.now() / 864e5);
    let liste = this.alleItems().filter(i => !this._selten(i.name) || tagNr % this.o.seltenJedenXtenTag === 0);
    // abgebrochenen Scan von heute fortsetzen
    const f = this.d.fortschritt;
    const ab = f && f.tag === heute ? f.index : 0;
    Object.assign(this.scan, { laeuft: true, art: 'voll', fertig: ab, gesamt: liste.length, start: Date.now(), stop: false, fehler: 0 });
    this.o.log(`Großer Scan startet (${grund}): ${liste.length} Items${ab ? `, weiter ab ${ab}` : ''}`);
    this.emit('start', { art: 'voll', gesamt: liste.length });
    try {
      for (let i = ab; i < liste.length; i++) {
        if (this.scan.stop) break;
        if (!this._botBereit()) { await this._warteAufBot(); i--; continue; }
        this.scan.aktuell = liste[i].name;
        const r = await this.itemScannen(liste[i], 'n');
        if (r.fehler) this.scan.fehler++;
        this.scan.fertig = i + 1;
        this.d.fortschritt = { tag: heute, index: i + 1 };
        if (i % 25 === 0) this._speichern();
        this.emit('fortschritt', { ...this.scan });
        await warte(this.o.pauseMs);
      }
      if (!this.scan.stop) {
        this.d.letzterScanTag = heute;
        this.d.fortschritt = null;
        this.d.scans.push({ start: this.scan.start, ende: Date.now(), items: liste.length, fehler: this.scan.fehler });
        this.d.scans = this.d.scans.slice(-60);
        this.o.log(`Großer Scan fertig in ${Math.round((Date.now() - this.scan.start) / 60000)} Min.`);
      }
    } finally {
      this.scan.laeuft = false; this.scan.aktuell = null;
      this._speichern(true);
      this.emit('ende', { art: 'voll' });
    }
    return true;
  }

  /* ---------- Schneller Scan der beliebten Items */
  beliebteItems() {
    const reg = this.bot?.registry;
    const nachAnzahl = Object.entries(this.d.items)
      .map(([id, e]) => { const p = e.punkte.filter(x => x[7] === 'n').pop(); return [id, p ? (p[3] || 0) + (p[6] || 0) * 2 : 0]; })
      .sort((a, b) => b[1] - a[1]).slice(0, this.o.schnellAnzahl).map(x => x[0]);
    return [...new Set([...this.o.immer, ...nachAnzahl])]
      .map(id => reg?.itemsByName?.[id] || (this.d.items[id] ? { name: id, displayName: this.d.items[id].name } : null)).filter(Boolean);
  }
  async schnellScan() {
    if (this.scan.laeuft) return false;
    const liste = this.beliebteItems();
    Object.assign(this.scan, { laeuft: true, art: 'schnell', fertig: 0, gesamt: liste.length, start: Date.now(), stop: false, fehler: 0 });
    try {
      for (const it of liste) {
        if (this.scan.stop || !this._botBereit()) break;
        this.scan.aktuell = it.name;
        await this.itemScannen(it, 's');
        this.scan.fertig++;
        await warte(this.o.pauseMs);
      }
      this.d.letzterSchnell = Date.now();
    } finally { this.scan.laeuft = false; this.scan.aktuell = null; this._speichern(true); }
    return true;
  }

  _botBereit() { return !this.bot || !!(this.bot.entity && this.bot._client && !this.bot._client.ended); }
  async _warteAufBot() { await warte(15000); }

  /* ---------- Zeitplan */
  starten() {
    if (this._timer) return this;
    const pruefen = () => {
      if (this.scan.laeuft) return;
      const jetzt = Date.now(), z = lokal(jetzt, this.o.zeitzone);
      const [h, m] = this.o.scanUm.split(':').map(Number), um = h * 60 + m;
      if (this.d.letzterScanTag !== z.tag && z.minute >= um && z.minute < Math.max(um + 1, this.o.nachholenBisStunde * 60)) {
        this.vollerScan().catch(e => this.o.log('Scan-Fehler:', e.message));
      } else if (this.o.schnellAlleMin && jetzt - (this.d.letzterSchnell || 0) > this.o.schnellAlleMin * 60000 && Object.keys(this.d.items).length) {
        this.schnellScan().catch(e => this.o.log('Schnell-Scan-Fehler:', e.message));
      }
    };
    this._timer = setInterval(pruefen, 20000);
    this._timer.unref?.();
    setTimeout(pruefen, 5000).unref?.();
    return this;
  }
  stoppen() { clearInterval(this._timer); this._timer = null; this.scan.stop = true; this._speichern(true); }

  /* ================================================================ API */
  _kurz(id, e) {
    const p = e.punkte;
    const letzterVoll = [...p].reverse().find(x => x[7] !== 'l');
    const ahMin = e.live && (!letzterVoll || e.live.at > letzterVoll[0]) ? e.live.min : letzterVoll?.[1] ?? null;
    const ahWert = x => x[1];
    const jetzt = Date.now();
    const vor = (ms) => { // Punkt, der am nächsten an "jetzt - ms" liegt (±50 %)
      let best = null;
      for (const x of p) { const d = Math.abs(jetzt - ms - x[0]); if (ahWert(x) !== null && d < ms * .5 && (!best || d < best.d)) best = { d, v: ahWert(x) }; }
      return best?.v ?? null;
    };
    const proz = (alt) => alt && ahMin ? Math.round((ahMin / alt - 1) * 1000) / 10 : null;
    return {
      id, name: e.name,
      ah: { min: ahMin, schnitt: letzterVoll?.[2] ?? null, anzahl: letzterVoll?.[3] ?? 0, live: e.live?.at > (letzterVoll?.[0] || 0) },
      order: { max: letzterVoll?.[4] ?? null, schnitt: letzterVoll?.[5] ?? null, anzahl: letzterVoll?.[6] ?? 0 },
      at: Math.max(letzterVoll?.[0] || 0, e.live?.at || 0),
      trend: { tag: proz(vor(864e5)), woche: proz(vor(7 * 864e5)) },
      spark: p.filter(x => x[7] === 'n').slice(-14).map(x => x[1]),
    };
  }
  _status() {
    const s = this.d.scans[this.d.scans.length - 1];
    return {
      letzter: s ? { start: s.start, ende: s.ende, items: s.items } : null,
      naechster: naechsterScan(Date.now(), this.o.zeitzone, this.o.scanUm),
      schnellAlleMin: this.o.schnellAlleMin,
      laeuft: this.scan.laeuft ? { art: this.scan.art, fertig: this.scan.fertig, gesamt: this.scan.gesamt, start: this.scan.start } : null,
    };
  }
  uebersicht() {
    const items = Object.entries(this.d.items).map(([id, e]) => this._kurz(id, e)).filter(x => x.ah.anzahl || x.order.anzahl || x.ah.min !== null);
    return { stand: Date.now(), scan: this._status(), items };
  }
  item(id) {
    id = String(id || '').toLowerCase().replace(/^minecraft:/, '').replace(/[^a-z0-9_]/g, '');
    const e = this.d.items[id];
    if (!e) return null;
    return {
      ...this._kurz(id, e),
      ahTop: e.ahTop || [], orderTop: e.orderTop || [], live: e.live || null,
      verlauf: e.punkte.map(x => ({ t: x[0], ahMin: x[1], ahSchnitt: x[2], ahAnzahl: x[3], orderMax: x[4], orderSchnitt: x[5], orderAnzahl: x[6], q: x[7] })),
      scan: this._status(),
    };
  }

  /** Für Express oder node:http. app.use(tracker.middleware()) */
  middleware(basis = '/api/public/preise') {
    return (req, res, next) => {
      const url = new URL(req.url, 'http://x');
      if (req.method !== 'GET' || !(url.pathname === basis || url.pathname.startsWith(basis + '/'))) return next ? next() : false;
      const rest = decodeURIComponent(url.pathname.slice(basis.length + 1));
      const body = rest ? this.item(rest) : this.uebersicht();
      res.statusCode = body ? 200 : 404;
      res.setHeader('Content-Type', 'application/json; charset=utf-8');
      res.setHeader('Cache-Control', 'no-store');
      res.end(JSON.stringify(body || { error: 'Zu diesem Item gibt es noch keine Preise.' }));
      return true;
    };
  }
}

module.exports = { PreisTracker, mineflayerLeser, parsePreis, statistik, lokal, naechsterScan, STANDARD };
