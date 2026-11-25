'use strict';
// Tests ohne Minecraft: ein falscher Bot, der /ah und /orders wie ein GUI-Plugin beantwortet.
// Starten: node --test bot/
const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { EventEmitter } = require('node:events');
const { PreisTracker, parsePreis, statistik, lokal, naechsterScan } = require('./preistracker');

test('parsePreis versteht die üblichen Schreibweisen', () => {
  const fast = (a, b) => assert.ok(Math.abs(a - b) < 1e-9, `${a} != ${b}`);
  fast(parsePreis('1,5M'), 1.5);
  fast(parsePreis('1.5m'), 1.5);
  fast(parsePreis('500K'), 0.5);
  fast(parsePreis('$1,234,567'), 1.234567);
  fast(parsePreis('1.234.567'), 1.234567);
  fast(parsePreis('12.5k$'), 0.0125);
  fast(parsePreis('2,1 Mrd'), 2100);
  fast(parsePreis('§6$§e18.000'), 0.018);
  assert.strictEqual(parsePreis('kein Preis'), null);
});

test('statistik: billigster, Ø ohne Ausreißer', () => {
  const s = statistik([0.02, 0.018, 0.019, 5, 0.021, 0.0185], 'auf', 10);
  assert.strictEqual(s.bester, 0.018);
  assert.ok(s.schnitt < 0.021 && s.schnitt > 0.018, 'Ausreißer 5M darf den Schnitt nicht kaputt machen');
  assert.strictEqual(s.anzahl, 6);
  const o = statistik([0.01, 0.012, 0.011], 'ab', 2);
  assert.strictEqual(o.bester, 0.012);
  assert.ok(Math.abs(o.schnitt - 0.0115) < 1e-9);
});

test('Zeitplan: nächster Scan ist um 0 Uhr Berliner Zeit', () => {
  const jetzt = Date.UTC(2026, 10, 25, 22, 2); // 23:02 in Berlin (Winterzeit)
  const n = naechsterScan(jetzt, 'Europe/Berlin', '00:00');
  assert.strictEqual(new Date(n).toISOString(), '2026-11-25T23:00:00.000Z');
  assert.strictEqual(lokal(n, 'Europe/Berlin').minute, 0);
  const sommer = naechsterScan(Date.UTC(2026, 6, 1, 12), 'Europe/Berlin', '00:00');
  assert.strictEqual(new Date(sommer).toISOString(), '2026-07-01T22:00:00.000Z');
});

// ---------- Falscher Bot mit GUI
function fakeBot(markt) {
  const bot = new EventEmitter();
  bot.entity = {}; bot._client = { ended: false };
  bot.registry = {
    itemsArray: [
      { name: 'ancient_debris', displayName: 'Ancient Debris' },
      { name: 'diamond', displayName: 'Diamond' },
      { name: 'bedrock', displayName: 'Bedrock' },
      { name: 'dirt', displayName: 'Dirt' },
    ],
  };
  bot.registry.itemsByName = Object.fromEntries(bot.registry.itemsArray.map(i => [i.name, i]));
  bot.befehle = [];
  const fenster = (eintraege, seite, art, begriff) => {
    const w = new EventEmitter();
    w.slots = Array(54).fill(null);
    w.inventoryStart = 54;
    eintraege.slice((seite - 1) * 45, seite * 45).forEach((e, i) => {
      w.slots[i] = { name: e.id, displayName: e.id, count: e.menge, customLore: art === 'ah'
        ? [JSON.stringify({ text: `Preis: $${e.preis}` }), JSON.stringify({ text: `Verkäufer: ${e.wer}` })]
        : [JSON.stringify({ text: `Preis pro Stück: ${e.preis}` }), JSON.stringify({ text: `Menge: 0/${e.menge}` }), JSON.stringify({ text: `Von: ${e.wer}` })] };
    });
    for (let i = 45; i < 54; i++) w.slots[i] = { name: 'gray_stained_glass_pane', displayName: 'Glass' };
    if (eintraege.length > seite * 45) w.slots[53] = { name: 'arrow', displayName: 'Arrow', customName: JSON.stringify({ text: 'Nächste Seite →' }) };
    w._seite = seite; w._art = art; w._begriff = begriff;
    return w;
  };
  let offen = null;
  bot.chat = msg => {
    bot.befehle.push(msg);
    const [, art, ...rest] = msg.match(/^\/(ah|orders) (.+)$/) || [];
    if (!art) return;
    const begriff = rest.join(' ');
    const eintraege = (markt[art][begriff] || []);
    setTimeout(() => { offen = fenster(eintraege, 1, art, begriff); bot.emit('windowOpen', offen); }, 5);
  };
  bot.clickWindow = async slot => {
    const w = offen;
    if (slot === 53 && w.slots[53]?.name === 'arrow') {
      setTimeout(() => { offen = fenster(markt[w._art][w._begriff], w._seite + 1, w._art, w._begriff); bot.emit('windowOpen', offen); }, 5);
    }
  };
  bot.closeWindow = () => { offen = null; };
  return bot;
}

test('Voller Scan: liest AH + Orders, blättert, speichert, API passt', async () => {
  const debris = Array.from({ length: 60 }, (_, i) => ({ id: 'ancient_debris', menge: i % 3 ? 1 : 4, preis: (i % 3 ? 1 : 4) * (18000 + i * 100), wer: `Spieler${i}` }));
  debris.push({ id: 'cobblestone', menge: 1, preis: 10, wer: 'Fake' }); // falsches Item in der Suche -> ignorieren
  const markt = {
    ah: { 'Ancient Debris': debris, 'Diamond': [{ id: 'diamond', menge: 64, preis: 64 * 1500, wer: 'Bob' }] },
    orders: { 'Ancient Debris': [{ id: 'ancient_debris', menge: 128, preis: '15K', wer: 'Kaeufer1' }, { id: 'ancient_debris', menge: 64, preis: '16,5K', wer: 'Kaeufer2' }] },
  };
  const bot = fakeBot(markt);
  const datei = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'preise-')), 'preise.json');
  const t = new PreisTracker(bot, { datei, pauseMs: 1, seitePauseMs: 1, seiten: 2, log: () => {} });
  await t.vollerScan({ grund: 'test' });

  assert.ok(!bot.befehle.includes('/ah Bedrock'), 'Bedrock wird weggelassen');
  assert.deepStrictEqual(bot.befehle.filter(b => b.startsWith('/ah')), ['/ah Ancient Debris', '/ah Diamond', '/ah Dirt']);

  const u = t.uebersicht();
  const d = u.items.find(x => x.id === 'ancient_debris');
  assert.ok(d, 'Ancient Debris in der Übersicht');
  assert.strictEqual(d.ah.min, 0.018);                  // billigster pro Stück
  assert.strictEqual(d.ah.anzahl, 60);                  // 2 Seiten: 45 + 15, Cobblestone nicht
  assert.strictEqual(d.order.max, 0.0165);              // höchste Order pro Stück
  assert.strictEqual(d.order.anzahl, 2);
  assert.ok(!u.items.find(x => x.id === 'dirt'), 'Items ohne Angebot nicht in der Übersicht');
  const dia = u.items.find(x => x.id === 'diamond');
  assert.strictEqual(dia.ah.min, 0.0015);               // 64er-Stack -> pro Stück

  const det = t.item('minecraft:ancient_debris');
  assert.strictEqual(det.verlauf.length, 1);
  assert.strictEqual(det.ahTop[0].verkaeufer, 'Spieler0');
  assert.strictEqual(det.orderTop[0].verkaeufer, 'Kaeufer2');

  // Live-Preis ist neuer -> gewinnt
  t.liveAh([{ id: 'ancient_debris', proStueck: 0.0172, verkaeufer: 'Schnell', echt: 'ja' }, { id: 'ancient_debris', proStueck: 0.001, echt: 'nein' }]);
  assert.strictEqual(t.item('ancient_debris').ah.min, 0.0172);
  assert.strictEqual(t.item('ancient_debris').ah.live, true);

  // gespeichert und wieder ladbar
  t._speichern(true);
  const t2 = new PreisTracker(bot, { datei, log: () => {} });
  assert.strictEqual(t2.item('ancient_debris').ah.min, 0.0172);
  assert.ok(t2.d.letzterScanTag, 'Scan-Tag gemerkt');

  // Middleware
  let out = {};
  const res = { setHeader() {}, end(b) { out.body = JSON.parse(b); }, set statusCode(c) { out.status = c; } };
  t2.middleware()({ method: 'GET', url: '/api/public/preise/ancient_debris' }, res, () => { out.next = true; });
  assert.strictEqual(out.status, 200);
  assert.strictEqual(out.body.id, 'ancient_debris');
  t2.middleware()({ method: 'GET', url: '/etwas/anderes' }, res, () => { out.next = true; });
  assert.ok(out.next);
});

test('Trend: Vergleich mit gestern und letzter Woche', () => {
  const datei = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'preise-')), 'preise.json');
  const t = new PreisTracker(null, { datei, log: () => {}, leser: { ah: async () => [], orders: async () => [] } });
  const jetzt = Date.now(), it = { name: 'diamond', displayName: 'Diamond' };
  const p = v => [{ proStueck: v, menge: 1, preis: v }];
  t.eintragen(it, p(0.002), [], 'n', jetzt - 7 * 864e5);
  t.eintragen(it, p(0.0011), [], 'n', jetzt - 864e5);
  t.eintragen(it, p(0.001), [], 'n', jetzt);
  const k = t.item('diamond');
  assert.strictEqual(k.trend.tag, -9.1);
  assert.strictEqual(k.trend.woche, -50);
  assert.deepStrictEqual(k.spark, [0.002, 0.0011, 0.001]);
});
