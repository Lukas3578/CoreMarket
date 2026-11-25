'use strict';
/*
 * Demo-Daten für /auction-orders, solange der Bot noch keine Preise liefert.
 * Gleiches Format wie bot/preistracker.js (uebersicht() und item(id)), Preise in Millionen.
 * Die Seite zeigt dazu groß „Demo-Daten“ an – das sind KEINE echten Preise.
 */
const BASIS = [
  ['ancient_debris', 'Ancient Debris', 0.018, 60, 12], ['netherite_ingot', 'Netherite Ingot', 0.085, 34, 9],
  ['netherite_scrap', 'Netherite Scrap', 0.02, 22, 6], ['diamond', 'Diamond', 0.0016, 80, 15],
  ['diamond_block', 'Block of Diamond', 0.0145, 25, 4], ['elytra', 'Elytra', 2.4, 9, 3],
  ['totem_of_undying', 'Totem of Undying', 0.32, 28, 7], ['beacon', 'Beacon', 1.15, 7, 2],
  ['enchanted_golden_apple', 'Enchanted Golden Apple', 0.85, 14, 5], ['golden_apple', 'Golden Apple', 0.0022, 40, 10],
  ['shulker_box', 'Shulker Box', 0.24, 31, 8], ['shulker_shell', 'Shulker Shell', 0.11, 18, 6],
  ['nether_star', 'Nether Star', 0.58, 11, 4], ['netherite_upgrade_smithing_template', 'Netherite Upgrade', 0.14, 19, 6],
  ['mace', 'Mace', 3.6, 4, 1], ['heavy_core', 'Heavy Core', 1.45, 6, 2], ['trident', 'Trident', 0.78, 8, 2],
  ['end_crystal', 'End Crystal', 0.0042, 36, 9], ['experience_bottle', "Bottle o' Enchanting", 0.0006, 70, 14],
  ['obsidian', 'Obsidian', 0.00016, 55, 12], ['ender_pearl', 'Ender Pearl', 0.0009, 48, 11],
  ['blaze_rod', 'Blaze Rod', 0.0007, 39, 8], ['gunpowder', 'Gunpowder', 0.00011, 44, 9],
  ['slime_ball', 'Slimeball', 0.00021, 27, 5], ['iron_ingot', 'Iron Ingot', 0.00008, 90, 18],
  ['iron_block', 'Block of Iron', 0.0007, 30, 6], ['gold_ingot', 'Gold Ingot', 0.00012, 65, 12],
  ['gold_block', 'Block of Gold', 0.00105, 21, 4], ['emerald', 'Emerald', 0.00042, 50, 10],
  ['emerald_block', 'Block of Emerald', 0.0037, 14, 3], ['netherite_block', 'Block of Netherite', 0.78, 5, 2],
  ['dragon_head', 'Dragon Head', 0.52, 3, 1], ['dragon_egg', 'Dragon Egg', 45, 1, 1],
  ['wither_skeleton_skull', 'Wither Skeleton Skull', 0.065, 16, 5], ['spawner', 'Spawner', 28, 6, 3],
  ['sponge', 'Sponge', 0.0019, 17, 3], ['wet_sponge', 'Wet Sponge', 0.0015, 6, 1],
  ['nautilus_shell', 'Nautilus Shell', 0.009, 12, 3], ['heart_of_the_sea', 'Heart of the Sea', 0.08, 7, 2],
  ['conduit', 'Conduit', 0.12, 4, 1], ['echo_shard', 'Echo Shard', 0.013, 15, 4],
  ['recovery_compass', 'Recovery Compass', 0.11, 5, 1], ['sniffer_egg', 'Sniffer Egg', 0.22, 3, 1],
  ['trial_key', 'Trial Key', 0.006, 20, 5], ['ominous_trial_key', 'Ominous Trial Key', 0.035, 9, 3],
  ['breeze_rod', 'Breeze Rod', 0.0024, 23, 6], ['wind_charge', 'Wind Charge', 0.0004, 26, 5],
  ['tnt', 'TNT', 0.0009, 33, 7], ['cobweb', 'Cobweb', 0.00035, 19, 4], ['honey_block', 'Honey Block', 0.0011, 11, 2],
  ['oak_log', 'Oak Log', 0.00002, 40, 8], ['spruce_log', 'Spruce Log', 0.000025, 22, 5],
  ['sugar_cane', 'Sugar Cane', 0.000015, 37, 9], ['cactus', 'Cactus', 0.000012, 18, 4],
  ['bone', 'Bone', 0.00003, 25, 5], ['string', 'String', 0.000035, 29, 6], ['leather', 'Leather', 0.00006, 21, 4],
  ['carrot', 'Carrot', 0.000008, 24, 6], ['wheat', 'Wheat', 0.00001, 20, 5], ['cooked_beef', 'Steak', 0.00004, 31, 6],
  ['golden_carrot', 'Golden Carrot', 0.00028, 26, 6], ['amethyst_shard', 'Amethyst Shard', 0.00009, 14, 3],
  ['quartz', 'Nether Quartz', 0.00005, 28, 6], ['lapis_lazuli', 'Lapis Lazuli', 0.00004, 23, 4],
  ['redstone', 'Redstone Dust', 0.00003, 35, 7], ['glowstone', 'Glowstone', 0.00018, 15, 3],
  ['diamond_sword', 'Diamond Sword', 0.012, 18, 2], ['netherite_sword', 'Netherite Sword', 0.42, 12, 3],
  ['netherite_pickaxe', 'Netherite Pickaxe', 0.48, 10, 3], ['netherite_chestplate', 'Netherite Chestplate', 0.75, 8, 2],
  ['netherite_helmet', 'Netherite Helmet', 0.46, 7, 2], ['diamond_pickaxe', 'Diamond Pickaxe', 0.015, 14, 2],
  ['bow', 'Bow', 0.0011, 9, 1], ['crossbow', 'Crossbow', 0.0016, 8, 1], ['shield', 'Shield', 0.0009, 10, 2],
  ['ender_chest', 'Ender Chest', 0.0055, 16, 4], ['hopper', 'Hopper', 0.0011, 20, 5], ['chest', 'Chest', 0.00004, 18, 3],
  ['name_tag', 'Name Tag', 0.0045, 13, 3], ['saddle', 'Saddle', 0.0035, 6, 1], ['music_disc_pigstep', 'Music Disc (Pigstep)', 0.09, 2, 1],
];

// gleiche Zufallszahlen bei jedem Aufruf (pro Item und Tag), damit die Kurven nicht springen
function zufall(seed) { let s = seed >>> 0; return () => { s = (s + 0x6D2B79F5) >>> 0; let t = s; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }
const hash = s => [...s].reduce((h, c) => Math.imul(h ^ c.charCodeAt(0), 16777619) >>> 0, 2166136261);
const rund = v => Math.round(v * 1e8) / 1e8;

const TAG = 864e5, STD = 36e5;
function mitternacht(t) { const d = new Date(t); d.setUTCHours(23, 0, 0, 0); if (d.getTime() > t) d.setTime(d.getTime() - TAG); return d.getTime(); } // 0 Uhr Wien (Winterzeit)

function verlauf([id, , basis, ah, ord], jetzt) {
  const r = zufall(hash(id));
  const heute = mitternacht(jetzt);
  const richtung = (r() - .5) * .012; // leichter Trend pro Tag
  const p = [];
  let wert = basis * (1 - richtung * 30) * (0.92 + r() * .16);
  for (let d = 30; d >= 0; d--) {
    wert *= 1 + richtung + (r() - .5) * .07;
    if (r() < .04) wert *= r() < .5 ? .8 : 1.22; // ab und zu ein Sprung
    const t = heute - d * TAG;
    p.push(punkt(t, wert, ah, ord, r, 'n'));
  }
  // Schnell-Scans alle 2 Std. der letzten 3 Tage
  for (let t = heute - 3 * TAG + 2 * STD; t <= jetzt; t += 2 * STD) {
    if ((t - heute) % TAG === 0) continue;
    wert *= 1 + (r() - .5) * .03;
    p.push(punkt(t, wert, ah, ord, r, 's'));
  }
  return p.sort((a, b) => a.t - b.t);
}
function punkt(t, wert, ah, ord, r, q) {
  const ahAnzahl = Math.max(1, Math.round(ah * (0.7 + r() * .6)));
  const orderAnzahl = Math.max(0, Math.round(ord * (0.6 + r() * .8)));
  const orderMax = orderAnzahl ? wert * (r() < .08 ? 1.03 : 0.84 + r() * .06) : null; // selten Flip-Chance
  return { t, ahMin: rund(wert), ahSchnitt: rund(wert * (1.06 + r() * .1)), ahAnzahl, orderMax: orderMax && rund(orderMax), orderSchnitt: orderMax && rund(orderMax * (0.9 + r() * .06)), orderAnzahl, q };
}

function kurz(b, v, jetzt) {
  const [id, name] = b, l = v[v.length - 1], n = v.filter(x => x.q === 'n');
  const vor = ms => v.reduce((best, x) => Math.abs(jetzt - ms - x.t) < Math.abs(jetzt - ms - best.t) ? x : best).ahMin;
  const proz = alt => Math.round((l.ahMin / alt - 1) * 1000) / 10;
  return {
    id, name,
    ah: { min: l.ahMin, schnitt: l.ahSchnitt, anzahl: l.ahAnzahl, live: false },
    order: { max: l.orderMax, schnitt: l.orderSchnitt, anzahl: l.orderAnzahl },
    at: l.t, trend: { tag: proz(vor(TAG)), woche: proz(vor(7 * TAG)) },
    spark: n.slice(-14).map(x => x.ahMin),
  };
}
const SPIELER = ['Steve_Builder', 'xXDiamondXx', 'MrPofessor', 'Lena_mc', 'Kroko77', 'NetherNinja', 'Bananenbrot', 'Herobrine2k', 'ZockerJan', 'Mia_Craft'];
function status(jetzt) {
  const heute = mitternacht(jetzt);
  return { letzter: { start: heute, ende: heute + 52 * 60000, items: 1087 }, naechster: heute + TAG, schnellAlleMin: 120, laeuft: null };
}

module.exports = {
  uebersicht(jetzt = Date.now()) {
    return { demo: true, stand: jetzt, scan: status(jetzt), items: BASIS.map(b => kurz(b, verlauf(b, jetzt), jetzt)) };
  },
  item(id, jetzt = Date.now()) {
    const b = BASIS.find(x => x[0] === id);
    if (!b) return null;
    const v = verlauf(b, jetzt), k = kurz(b, v, jetzt), r = zufall(hash(id + jetzt.toString().slice(0, -7)));
    const angebote = (start, n, auf) => Array.from({ length: n }, (_, i) => {
      const menge = [1, 1, 2, 4, 8, 16, 32, 64][Math.floor(r() * 8)] * (b[2] > 0.1 ? 1 : 1 + Math.floor(r() * 2));
      const proStueck = rund(start * (auf ? 1 + i * (0.015 + r() * .03) : 1 - i * (0.02 + r() * .03)));
      return { preis: rund(proStueck * menge), menge, proStueck, verkaeufer: SPIELER[Math.floor(r() * SPIELER.length)] };
    });
    return { ...k, demo: true, ahTop: angebote(k.ah.min, Math.min(8, k.ah.anzahl), true), orderTop: k.order.max ? angebote(k.order.max, Math.min(8, k.order.anzahl), false) : [], live: null, verlauf: v, scan: status(jetzt) };
  },
};
