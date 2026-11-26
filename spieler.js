'use strict';
/*
 * Spieler-Index: Wer verkauft was im Auktionshaus?
 *
 * Der Bot speichert pro Item die günstigsten Angebote im AH mit Verkäufername (ahTop)
 * und die besten Orders (orderTop). Dieser Index geht im Hintergrund langsam alle Items
 * durch und sortiert die Angebote nach Spielern. So kann die Website zu jedem Spieler
 * zeigen, was er gerade im /ah anbietet – soweit der Bot es gesehen hat.
 *
 * Grenzen (stehen auch auf der Seite): nur Items, die der Bot scannt, und pro Item nur
 * die günstigsten Angebote. Ein komplettes /ah <name> kann nur der Bot selbst liefern.
 */
const MC = /^[.*]?[A-Za-z0-9_]{2,16}$/; // mit . oder * davor = Bedrock-Spieler
const PAUSE_MS = 700;          // zwischen zwei Items – schont den Bot
const RUNDE_PAUSE_MS = 120000; // nach einer kompletten Runde

module.exports = function spielerIndex({ holeUebersicht, holeItem, istDemo }) {
  const proItem = new Map();     // item-id -> { name, at, ah: [...], orders: [...] }
  const proSpieler = new Map();  // name klein -> Set(item-id)
  const stand = { runden: 0, items: 0, gescannt: 0, rundeStart: 0, letzte: 0, laeuft: false };

  const wer = x => String(x?.verkaeufer || x?.kaeufer || x?.spieler || x?.name || '').trim();

  function austragen(id) {
    const alt = proItem.get(id);
    if (!alt) return;
    for (const a of [...alt.ah, ...alt.orders]) {
      const set = proSpieler.get(a.wer.toLowerCase());
      if (set) { set.delete(id); if (!set.size) proSpieler.delete(a.wer.toLowerCase()); }
    }
    proItem.delete(id);
  }

  function eintragen(d) {
    austragen(d.id);
    const ah = (d.ahTop || []).map(x => ({ wer: wer(x), menge: Number(x.menge) || 1, proStueck: Number(x.proStueck ?? x.preis) })).filter(x => MC.test(x.wer) && Number.isFinite(x.proStueck));
    const orders = (d.orderTop || []).map(x => ({ wer: wer(x), menge: Number(x.menge) || 1, proStueck: Number(x.proStueck ?? x.preis) })).filter(x => MC.test(x.wer) && Number.isFinite(x.proStueck));
    if (!ah.length && !orders.length) return;
    proItem.set(d.id, { name: d.name || d.id, at: d.at || Date.now(), ah, orders });
    for (const a of [...ah, ...orders]) {
      const k = a.wer.toLowerCase();
      if (!proSpieler.has(k)) proSpieler.set(k, new Set());
      proSpieler.get(k).add(d.id);
    }
  }

  const schlaf = ms => new Promise(r => setTimeout(r, ms).unref?.());
  async function runde() {
    if (stand.laeuft) return;
    stand.laeuft = true;
    try {
      const u = await holeUebersicht();
      if (!u || u.demo || istDemo()) return; // Demo-Daten haben ausgedachte Namen
      const items = (u.items || [])
        .filter(i => (i.ah?.anzahl || 0) + (i.order?.anzahl || 0) > 0)
        .sort((a, b) => ((b.ah?.anzahl || 0) + (b.order?.anzahl || 0) * 2) - ((a.ah?.anzahl || 0) + (a.order?.anzahl || 0) * 2));
      stand.items = items.length; stand.gescannt = 0; stand.rundeStart = Date.now();
      for (const i of items) {
        try { const d = await holeItem(i.id); if (d && d.id) eintragen(d); } catch { /* einzelnes Item egal */ }
        stand.gescannt++; stand.letzte = Date.now();
        await schlaf(PAUSE_MS);
      }
      stand.runden++;
    } finally { stand.laeuft = false; }
  }
  async function dauerlauf() {
    for (;;) {
      try { await runde(); } catch (e) { console.warn('[spieler] Runde abgebrochen:', e.message); }
      await schlaf(RUNDE_PAUSE_MS);
    }
  }

  /* ---------- Mojang: gibt es den Namen, wie schreibt er sich, UUID ---------- */
  const mojangCache = new Map();
  async function mojang(name) {
    if (/^[.*]/.test(name)) return undefined; // Bedrock-Namen kennt Mojang nicht
    const k = name.toLowerCase(), c = mojangCache.get(k);
    if (c && Date.now() - c.zeit < (c.d === undefined ? 5 * 60000 : 6 * 3600000)) return c.d;
    let d;
    const ctrl = new AbortController(), t = setTimeout(() => ctrl.abort(), 5000);
    try {
      const r = await fetch(`https://api.mojang.com/users/profiles/minecraft/${encodeURIComponent(name)}`, { signal: ctrl.signal, headers: { accept: 'application/json' } });
      if (r.status === 204 || r.status === 404) d = null;
      else if (r.ok) { const j = await r.json(); d = j?.id ? { uuid: j.id, name: j.name } : null; }
      else d = undefined; // Mojang hat ein Problem – unbekannt
    } catch { d = undefined; } finally { clearTimeout(t); }
    mojangCache.set(k, { d, zeit: Date.now() });
    if (mojangCache.size > 5000) mojangCache.delete(mojangCache.keys().next().value);
    return d;
  }

  const indexInfo = () => ({ items: stand.items, gescannt: stand.gescannt, runden: stand.runden, laeuft: stand.laeuft, letzte: stand.letzte, spieler: proSpieler.size });

  function angeboteVon(name) {
    const ids = proSpieler.get(name.toLowerCase());
    const ah = [], orders = [];
    if (ids) for (const id of ids) {
      const it = proItem.get(id); if (!it) continue;
      for (const a of it.ah) if (a.wer.toLowerCase() === name.toLowerCase()) ah.push({ id, item: it.name, menge: a.menge, proStueck: a.proStueck, at: it.at });
      for (const a of it.orders) if (a.wer.toLowerCase() === name.toLowerCase()) orders.push({ id, item: it.name, menge: a.menge, proStueck: a.proStueck, at: it.at });
    }
    // gleiche Angebote (gleiches Item, gleicher Preis) zusammenfassen
    const zus = l => {
      const m = new Map();
      for (const x of l) { const k = `${x.id}|${x.proStueck}`; const v = m.get(k); if (v) { v.menge += x.menge; v.stapel++; } else m.set(k, { ...x, stapel: 1 }); }
      return [...m.values()].sort((a, b) => b.proStueck * b.menge - a.proStueck * a.menge);
    };
    return { ah: zus(ah), orders: zus(orders) };
  }
  // richtige Schreibweise aus dem Index, falls Mojang gerade nicht antwortet
  function nameImIndex(name) {
    const ids = proSpieler.get(name.toLowerCase()); if (!ids) return null;
    for (const id of ids) { const it = proItem.get(id); const a = it && [...it.ah, ...it.orders].find(x => x.wer.toLowerCase() === name.toLowerCase()); if (a) return a.wer; }
    return null;
  }

  async function spieler(name) {
    if (!MC.test(name)) return null;
    const m = await mojang(name);
    const echt = m?.name || nameImIndex(name) || name;
    return { name: echt, uuid: m?.uuid || null, existiert: m === undefined ? null : !!m, ...angeboteVon(echt), index: indexInfo() };
  }

  function top(n = 30) {
    const l = [];
    for (const k of proSpieler.keys()) {
      const { ah } = angeboteVon(k);
      if (!ah.length) continue;
      l.push({ name: nameImIndex(k) || k, angebote: ah.reduce((s, x) => s + x.stapel, 0), items: new Set(ah.map(x => x.id)).size, wert: ah.reduce((s, x) => s + x.proStueck * x.menge, 0) });
    }
    return { top: l.sort((a, b) => b.wert - a.wert).slice(0, n), index: indexInfo() };
  }

  return { dauerlauf, spieler, top, mojang, MC };
};
