'use strict';
/* CoreMarket: Auction-Orders – Item-Preise aus Auktionshaus und Orders, mit Preistrend.
 * Daten: /api/preise (Übersicht) und /api/preise/<id> (Verlauf). Die Website holt sie vom Bot (bot/preistracker.js). */
(() => {
  const W = document.getElementById('ao');
  if (!W) return;
  const $ = s => document.querySelector(s);
  const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
  const ruhig = matchMedia('(prefers-reduced-motion: reduce)').matches;
  const leer = v => v === null || v === undefined || !Number.isFinite(v);
  const zahl = (x, d) => x.toLocaleString('de-DE', { maximumFractionDigits: d });
  // Preise kommen in Millionen: 1 = 1M, 0.018 = 18K, 0.00002 = 20
  const preis = v => {
    if (leer(v)) return '–';
    if (v >= 1000) return zahl(v / 1000, 2) + 'B';
    if (v >= 1) return zahl(v, v >= 100 ? 0 : 2) + 'M';
    if (v >= 0.001) { const k = v * 1000; return zahl(k, k >= 100 ? 0 : k >= 10 ? 1 : 2) + 'K'; }
    const c = v * 1e6; return zahl(c, c >= 100 ? 0 : 1);
  };
  const proz = v => leer(v) ? null : `${v > 0 ? '+' : v < 0 ? '−' : '±'}${zahl(Math.abs(v), Math.abs(v) >= 10 ? 0 : 1)} %`;
  const tausend = n => Number(n || 0).toLocaleString('de-DE');
  const uhr = t => new Date(t).toLocaleTimeString('de-DE', { hour: '2-digit', minute: '2-digit' });
  const tagKurz = t => new Date(t).toLocaleDateString('de-DE', { day: 'numeric', month: 'short' });
  const heuteOderTag = t => { const d = new Date(t), h = new Date(); const g = new Date(h); g.setDate(h.getDate() - 1); return d.toDateString() === h.toDateString() ? 'heute' : d.toDateString() === g.toDateString() ? 'gestern' : `am ${tagKurz(t)}`; };
  const vor = t => { const s = Math.max(0, Math.round((Date.now() - t) / 1000)); return s < 60 ? 'gerade eben' : s < 3600 ? `vor ${Math.round(s / 60)} Min.` : s < 86400 ? `vor ${Math.round(s / 3600)} Std.` : `${heuteOderTag(t)}`; };
  const dauer = ms => { const m = Math.max(1, Math.round(ms / 60000)); return m < 60 ? `${m} Min.` : `${Math.floor(m / 60)} Std. ${m % 60 ? `${m % 60} Min.` : ''}`.trim(); };
  const kopf = n => `https://mc-heads.net/avatar/${encodeURIComponent(String(n).replace(/^[.*]/, ''))}/24`;

  /* ---------- Item-Bilder: eigene Zuordnung, sonst Item-Textur, sonst Block-Textur, sonst Kürzel */
  const BILDER = W.dataset.bilder || '';
  const TEXTUR = { ancient_debris: 'block/ancient_debris_side', tnt: 'block/tnt_side', cactus: 'block/cactus_side', oak_log: 'block/oak_log', spruce_log: 'block/spruce_log', honey_block: 'block/honey_block_side', sponge: 'block/sponge', wet_sponge: 'block/wet_sponge', obsidian: 'block/obsidian', glowstone: 'block/glowstone', dragon_egg: 'block/dragon_egg', cobweb: 'block/cobweb', conduit: 'block/conduit', spawner: 'block/spawner', beacon: 'block/beacon', crafting_table: 'block/crafting_table_front', furnace: 'block/furnace_front', ender_chest: 'item/ender_eye', shulker_box: 'item/shulker_shell', chest: 'block/oak_planks', sniffer_egg: 'block/sniffer_egg_not_cracked_east', heavy_core: 'block/heavy_core', dragon_head: 'item/dragon_breath', wither_skeleton_skull: 'item/coal', trial_spawner: 'block/trial_spawner_side_inactive' };
  const bildUrl = (art, id) => BILDER.replace('{art}', art).replace('{id}', encodeURIComponent(id));
  const kuerzel = n => String(n || '?').replace(/[^A-Za-z0-9 ]/g, '').split(/\s+/).filter(Boolean).slice(0, 2).map(w => w[0]).join('').toUpperCase() || '?';
  function icon(id, name, gross) {
    const [art, tex] = (TEXTUR[id] || (id.startsWith('spawner_') ? 'block/spawner' : `item/${id}`)).split('/');
    return `<span class="mc-icon${gross ? ' gross' : ''}" data-kurz="${esc(kuerzel(name))}">${BILDER ? `<img src="${esc(bildUrl(art, tex))}" data-id="${esc(id)}" data-art="${art}" alt="" width="32" height="32" loading="lazy">` : ''}</span>`;
  }
  document.addEventListener('error', e => {
    const img = e.target; if (!(img instanceof HTMLImageElement) || !img.dataset.id || !img.closest('main')) return;
    if (img.dataset.art === 'item' && !img.dataset.block) { img.dataset.block = '1'; img.src = bildUrl('block', img.dataset.id); return; }
    img.remove();
  }, true);

  /* ---------- Suche: englische Namen, Minecraft-ID und ein paar deutsche Namen */
  const DEUTSCH = { spawner_skeleton: 'skelett skelly spawner', spawner_blaze: 'lohe blaze spawner', spawner_iron_golem: 'eisengolem iron golem spawner', spawner_creeper: 'creeper spawner', spawner_spider: 'spinne spawner', spawner_cow: 'kuh spawner', spawner_piglin: 'piglin spawner', spawner_zombie: 'zombie spawner', spawner_pig: 'schwein spawner', spawner_cave_spider: 'höhlenspinne spawner', spawner_wither_skeleton: 'wither skelett spawner', spawner_enderman: 'enderman spawner', ancient_debris: 'antiker schutt', netherite_ingot: 'netheritbarren', netherite_scrap: 'netheritplatten', diamond: 'diamant', diamond_block: 'diamantblock', elytra: 'elytren flügel', totem_of_undying: 'totem der unsterblichkeit', beacon: 'leuchtfeuer', enchanted_golden_apple: 'verzauberter goldener apfel notch apfel', golden_apple: 'goldener apfel', shulker_box: 'shulkerkiste', shulker_shell: 'shulkerschale', nether_star: 'netherstern', netherite_upgrade_smithing_template: 'netheritaufwertung schmiedevorlage', mace: 'streitkolben', heavy_core: 'schwerer kern', trident: 'dreizack', end_crystal: 'enderkristall', experience_bottle: 'erfahrungsfläschchen xp flasche', obsidian: 'obsidian', ender_pearl: 'enderperle', blaze_rod: 'lohenrute', gunpowder: 'schwarzpulver', slime_ball: 'schleimball', iron_ingot: 'eisenbarren', iron_block: 'eisenblock', gold_ingot: 'goldbarren', gold_block: 'goldblock', emerald: 'smaragd', emerald_block: 'smaragdblock', netherite_block: 'netheritblock', dragon_head: 'drachenkopf', dragon_egg: 'drachenei', wither_skeleton_skull: 'witherskelettschädel', sponge: 'schwamm', nautilus_shell: 'nautilusschale', heart_of_the_sea: 'herz des meeres', conduit: 'aquisator', echo_shard: 'echoscherbe', recovery_compass: 'bergungskompass', sniffer_egg: 'schnüffler ei', trial_key: 'prüfungsschlüssel', breeze_rod: 'böenrute', wind_charge: 'windkugel', cobweb: 'spinnennetz', honey_block: 'honigblock', oak_log: 'eichenstamm holz', sugar_cane: 'zuckerrohr', cactus: 'kaktus', bone: 'knochen', string: 'faden', leather: 'leder', carrot: 'karotte', wheat: 'weizen', cooked_beef: 'steak gebratenes rindfleisch', golden_carrot: 'goldene karotte', amethyst_shard: 'amethystsplitter', quartz: 'netherquarz', redstone: 'redstone', glowstone: 'leuchtstein', diamond_sword: 'diamantschwert', netherite_sword: 'netheritschwert', netherite_pickaxe: 'netheritspitzhacke', netherite_chestplate: 'netheritbrustpanzer', netherite_helmet: 'netherithelm', diamond_pickaxe: 'diamantspitzhacke', bow: 'bogen', crossbow: 'armbrust', shield: 'schild', ender_chest: 'endertruhe', hopper: 'trichter', chest: 'truhe kiste', name_tag: 'namensschild', saddle: 'sattel', spawner: 'spawner', tnt: 'tnt' };
  const norm = s => String(s || '').toLowerCase().replace(/ä/g, 'ae').replace(/ö/g, 'oe').replace(/ü/g, 'ue').replace(/ß/g, 'ss').replace(/[_\-']/g, ' ').replace(/[^a-z0-9 ]/g, '').replace(/\s+/g, ' ').trim();
  const beliebtheit = i => (i.ah.anzahl || 0) + (i.order.anzahl || 0) * 2;
  function suchen(q, max = 8) {
    q = norm(q); if (!q) return [];
    const k = q.replace(/ /g, '');
    const treffer = [];
    for (const i of ITEMS) {
      const n = i._n || (i._n = norm(i.name)), de = i._de ?? (i._de = norm(DEUTSCH[i.id] || '')), idn = i._id || (i._id = norm(i.id));
      let p = n === q || idn === q ? 0 : n.startsWith(q) ? 1 : (' ' + n).includes(' ' + q) ? 2 : de && (' ' + de).includes(' ' + q) ? 2.5 : n.includes(q) || n.replace(/ /g, '').includes(k) ? 3 : idn.includes(q) || de.includes(q) ? 3.5 : -1;
      if (p >= 0) treffer.push([p, i]);
    }
    return treffer.sort((a, b) => a[0] - b[0] || beliebtheit(b[1]) - beliebtheit(a[1])).slice(0, max).map(x => x[1]);
  }
  const markieren = (text, q) => { const n = text.toLowerCase(), p = n.indexOf(q.toLowerCase().trim()); return p < 0 || !q.trim() ? esc(text) : esc(text.slice(0, p)) + '<mark>' + esc(text.slice(p, p + q.trim().length)) + '</mark>' + esc(text.slice(p + q.trim().length)); };

  /* ---------- Daten */
  let UEB = null, ITEMS = [], AKTIV = null, DETAIL = null, ladeTimer = null;
  async function holen(url) {
    const r = await fetch(url, { cache: 'no-store', headers: { accept: 'application/json' } });
    let d = {}; try { d = await r.json(); } catch { /* leer */ }
    if (!r.ok) { const e = new Error(d.error || 'Das hat nicht geklappt.'); e.status = r.status; throw e; }
    return d;
  }
  async function uebersichtLaden() {
    clearTimeout(ladeTimer);
    try {
      UEB = await holen('/api/preise');
      ITEMS = (UEB.items || []).filter(i => i && i.id);
      $('#ao-demo').hidden = !UEB.demo;
      statusMalen(); chipsMalen(); listeMalen();
      if (!AKTIV) { const id = new URLSearchParams(location.search).get('item'); if (id) zeigen(id, false); }
    } catch (x) {
      $('#ao-status').innerHTML = `<span class="ao-status-text fehler-text">${esc(x.message)}</span>`;
      if (!UEB) $('#ao-karten').innerHTML = `<li class="leer">Die Preise sind gerade nicht erreichbar.</li>`;
    }
    ladeTimer = setTimeout(uebersichtLaden, 60000);
  }

  function statusMalen() {
    // Der Bot scannt rund um die Uhr reihum: Top-Items alle 15 Min., beliebte jede Stunde, der Rest so schnell es geht
    const s = UEB.scan || {}, teile = [];
    const laeuft = s.an !== false && s.online !== false && !s.pauseBis;
    if (s.aktuell && laeuft) teile.push(`Gerade geprüft: ${s.aktuell.name}`);
    else if (s.an === false) teile.push('Der Preis-Scanner ist gerade aus');
    else if (s.online === false) teile.push('Der Bot ist gerade nicht im Spiel');
    else if (s.pauseBis) teile.push(`Kurze Pause bis ${uhr(s.pauseBis)} Uhr`);
    if (s.topMin) teile.push(`Top-Items alle ${s.topMin} Min.`);
    if (s.runde) teile.push(`alle anderen etwa alle ${dauer(s.runde * 60000)}`);
    if (s.letzter) teile.push(`zuletzt ${vor(s.letzter)}`);
    $('#ao-status').innerHTML = `<span class="ao-status-text"><span class="punkt${laeuft ? ' an' : ''}"></span>${esc(teile.join(' · ').replace(/\.?$/, '.'))} ${tausend(ITEMS.length)} Items mit Preisen.</span>`;
  }
  function chipsMalen() {
    const top = ITEMS.slice().sort((a, b) => beliebtheit(b) - beliebtheit(a)).slice(0, 6);
    const c = $('#ao-chips');
    c.hidden = !top.length;
    c.innerHTML = `<span class="hinweis">Beliebt:</span>${top.map(i => `<a href="?item=${esc(i.id)}" data-item="${esc(i.id)}">${icon(i.id, i.name)}${esc(i.name)}</a>`).join('')}`;
  }

  /* ---------- Trefferliste unter der Suche */
  const feld = $('#ao-suche'), box = $('#ao-treffer');
  let markiert = -1, liste = [];
  function trefferMalen() {
    const q = feld.value;
    liste = suchen(q);
    markiert = liste.length ? 0 : -1;
    if (!q.trim()) { box.hidden = true; feld.setAttribute('aria-expanded', 'false'); return; }
    box.innerHTML = liste.length ? liste.map((i, n) => `<a href="?item=${esc(i.id)}" role="option" id="ao-t${n}" data-item="${esc(i.id)}"${n === 0 ? ' class="markiert" aria-selected="true"' : ''}>${icon(i.id, i.name)}<span class="ao-t-name">${markieren(i.name, q)}<small>${esc(i.id)}</small></span><span class="ao-t-preis"><b>${preis(i.ah.min)}</b><small>Order ${preis(i.order.max)}</small></span></a>`).join('')
      : `<p class="nichts">Zu „${esc(q)}“ hat der Bot beim letzten Scan nichts gefunden.</p>`;
    box.hidden = false; feld.setAttribute('aria-expanded', 'true');
    feld.setAttribute('aria-activedescendant', liste.length ? 'ao-t0' : '');
  }
  function markieren2(n) {
    const a = box.querySelectorAll('a'); if (!a.length) return;
    markiert = (n + a.length) % a.length;
    a.forEach((x, i) => { x.classList.toggle('markiert', i === markiert); x.setAttribute('aria-selected', i === markiert); });
    a[markiert].scrollIntoView({ block: 'nearest' }); feld.setAttribute('aria-activedescendant', a[markiert].id);
  }
  feld.addEventListener('input', trefferMalen);
  feld.addEventListener('focus', () => { if (feld.value.trim()) trefferMalen(); });
  feld.addEventListener('keydown', e => {
    if (e.key === 'ArrowDown') { e.preventDefault(); markieren2(markiert + 1); }
    else if (e.key === 'ArrowUp') { e.preventDefault(); markieren2(markiert - 1); }
    else if (e.key === 'Escape') { box.hidden = true; feld.setAttribute('aria-expanded', 'false'); }
  });
  $('#ao-form').addEventListener('submit', e => {
    e.preventDefault();
    const i = liste[markiert] || suchen(feld.value, 1)[0];
    if (i) { zeigen(i.id); box.hidden = true; feld.blur(); }
  });
  document.addEventListener('click', e => {
    const a = e.target.closest('[data-item]');
    if (a && a.closest('main')) { e.preventDefault(); zeigen(a.dataset.item); box.hidden = true; return; }
    if (!e.target.closest('#ao-form')) { box.hidden = true; feld.setAttribute('aria-expanded', 'false'); }
  });
  addEventListener('popstate', () => { const id = new URLSearchParams(location.search).get('item'); id ? zeigen(id, false) : schliessen(false); });

  /* ---------- Ein Item */
  const STAPEL1 = /(_sword|_pickaxe|_axe|_shovel|_hoe|_helmet|_chestplate|_leggings|_boots|_horse_armor|shulker_box|^elytra|^totem_of_undying|^trident|^mace|^bow|^crossbow|^shield|^saddle|^music_disc.*|^potion|^enchanted_book|^cake|_bucket|^bucket_of|^flint_and_steel|^shears|^fishing_rod|_boat|_minecart|^minecart|^carrot_on_a_stick|^warped_fungus_on_a_stick|^brush|^spyglass|^goat_horn|^written_book|^writable_book|_bed|^bundle|^wolf_armor)$/;
  const STAPEL16 = /^(ender_pearl|snowball|egg|blue_egg|brown_egg|bucket|honey_bottle|armor_stand|.*_banner|.*_sign|.*_hanging_sign|wind_charge)$/;
  const stapel = id => STAPEL1.test(id) ? 1 : STAPEL16.test(id) ? 16 : 64;
  let bereich = null, menge = 1, aus = new Set();

  async function zeigen(id, push = true) {
    id = String(id).toLowerCase();
    AKTIV = id;
    const kurz = ITEMS.find(i => i.id === id);
    const art = $('#ao-item');
    art.hidden = false;
    if (push && new URLSearchParams(location.search).get('item') !== id) history.pushState(null, '', `?item=${encodeURIComponent(id)}`);
    if (kurz) { feld.value = kurz.name; document.title = `${kurz.name}: Preis und Trend – CoreMarket`; }
    art.innerHTML = `<div class="ao-item-kopf">${icon(id, kurz?.name || id, true)}<div><h2>${esc(kurz?.name || id)}</h2><p class="hinweis">Verlauf wird geladen …</p></div></div><div class="ao-graph-karte lade"></div>`;
    if (push) art.scrollIntoView({ behavior: ruhig ? 'auto' : 'smooth', block: 'start' });
    try {
      const d = await holen(`/api/preise/${encodeURIComponent(id)}`);
      if (AKTIV !== id) return;
      DETAIL = d; menge = 1; aus = new Set();
      bereich = standardBereich(d.verlauf || []);
      itemMalen();
    } catch (x) {
      if (AKTIV !== id) return;
      art.innerHTML = `<div class="ao-item-kopf">${icon(id, kurz?.name || id, true)}<div><h2>${esc(kurz?.name || id)}</h2><p class="fehler-text">${esc(x.message)}</p></div><button type="button" class="ao-zu" aria-label="Schließen">×</button></div>`;
      art.querySelector('.ao-zu').addEventListener('click', () => schliessen());
    }
  }
  function schliessen(push = true) {
    AKTIV = null; DETAIL = null; $('#ao-item').hidden = true; $('#ao-item').innerHTML = ''; feld.value = '';
    document.title = 'Auction-Orders: Item-Preise und Preistrend – CoreMarket';
    if (push) history.pushState(null, '', location.pathname);
  }

  const BEREICHE = [['24h', '24 Std.', 864e5], ['7t', '7 Tage', 7 * 864e5], ['30t', '30 Tage', 30 * 864e5], ['alles', 'Alles', Infinity]];
  function punkteIn(v, b) {
    const [, , ms] = BEREICHE.find(x => x[0] === b);
    const ab = Date.now() - ms;
    const l = v.filter(p => p.t >= ab);
    if (ms <= 7 * 864e5) return l;
    // lange Zeiträume ausdünnen: ein Punkt pro 6 Std. (30 Tage) bzw. pro Tag (alles), sonst wird die Kurve unruhig
    const fach = ms <= 30 * 864e5 ? 6 * 36e5 : 864e5, m = new Map();
    for (const p of l) { const k = Math.floor(p.t / fach), alt = m.get(k); if (!alt || (alt.q === 'l' && p.q !== 'l') || (p.q !== 'l' && p.t > alt.t)) m.set(k, p); }
    return [...m.values()].sort((a, b) => a.t - b.t);
  }
  function standardBereich(v) {
    for (const b of ['7t', '30t', 'alles', '24h']) if (punkteIn(v, b).filter(p => !leer(p.ahMin) || !leer(p.orderMax)).length >= 2) return b;
    return '7t';
  }

  function trendChip(v, label) {
    if (leer(v)) return `<span class="ao-trend">${label} <b>–</b></span>`;
    return `<span class="ao-trend ${v > 0.05 ? 'hoch' : v < -0.05 ? 'runter' : ''}">${label} <b>${v > 0.05 ? '▲' : v < -0.05 ? '▼' : '■'} ${proz(v)}</b></span>`;
  }

  function itemMalen() {
    const d = DETAIL, a = d.ah || {}, o = d.order || {}, st = stapel(d.id);
    const spanne = !leer(a.min) && !leer(o.max) ? o.max - a.min : null;
    const flip = spanne !== null && spanne > 0;
    const angebot = (x, art) => `<li>${x.verkaeufer ? `<img src="${kopf(x.verkaeufer)}" alt="" width="24" height="24" loading="lazy">` : '<span class="kein-kopf"></span>'}<span class="ao-a-wer">${esc(x.verkaeufer || 'unbekannt')}</span><span class="ao-a-menge">${x.menge > 1 ? `${tausend(x.menge)}×` : ''}</span><span class="ao-a-preis"><b>${preis(x.proStueck)}</b>${x.menge > 1 ? `<small>${art === 'ah' ? 'zusammen' : 'bis zu'} ${preis(x.proStueck * x.menge)}</small>` : ''}</span></li>`;
    $('#ao-item').innerHTML = `
      <div class="ao-item-kopf">
        ${icon(d.id, d.name, true)}
        <div class="ao-item-titel"><h2>${esc(d.name)}</h2><p class="hinweis">${d.id.startsWith('spawner_') ? 'Spawner' : `minecraft:${esc(d.id)}`} · Stand ${esc(vor(d.at))}${a.live ? ' <span class="ao-live">live</span>' : ''}${d.wartet ? ' · wird gerade neu geprüft' : d.taktMin ? ` · wird etwa alle ${esc(dauer(d.taktMin * 60000))} geprüft` : ''}</p></div>
        <div class="ao-trends">${trendChip(d.trend?.tag, '24 Std.')}${trendChip(d.trend?.woche, '7 Tage')}</div>
        <button type="button" class="ao-teilen knopf zweit klein" title="Link kopieren">Link kopieren</button>
        <button type="button" class="ao-zu" aria-label="Schließen">×</button>
      </div>
      <div class="ao-preise">
        <div class="ao-preis ah">
          <p class="ao-p-titel">Auktionshaus <small>billigster pro Stück</small></p>
          <p class="ao-p-wert">${preis(a.min)}</p>
          <p class="hinweis">Ø erste Seite <b>${preis(a.schnitt)}</b> · ${tausend(a.anzahl)} Angebot${a.anzahl === 1 ? '' : 'e'}</p>
        </div>
        <div class="ao-preis order">
          <p class="ao-p-titel">Orders <small>beste Order pro Stück</small></p>
          <p class="ao-p-wert">${preis(o.max)}</p>
          <p class="hinweis">${o.anzahl ? `Ø <b>${preis(o.schnitt)}</b> · ${tausend(o.anzahl)} Order${o.anzahl === 1 ? '' : 's'}` : 'Gerade sucht niemand dieses Item.'}</p>
        </div>
        <div class="ao-preis spanne${flip ? ' flip' : ''}">
          <p class="ao-p-titel">${flip ? 'Flip-Chance' : 'Spanne'} <small>${flip ? 'Order zahlt mehr als das AH' : 'AH minus Order'}</small></p>
          <p class="ao-p-wert">${spanne === null ? '–' : `${flip ? '+' : ''}${preis(Math.abs(spanne))}`}</p>
          <p class="hinweis">${spanne === null ? 'Dafür braucht es AH und Order.' : flip ? `Im AH für ${preis(a.min)} kaufen, an die Order für ${preis(o.max)} verkaufen. Sei schnell!` : `Sofort an eine Order verkaufen bringt ${zahl(Math.round(o.max / a.min * 100), 0)} % vom AH-Preis.`}</p>
        </div>
      </div>
      <div class="ao-rechner">
        <label class="feld-klein"><span>Ich habe</span><span class="ao-menge"><input type="number" id="ao-menge" min="1" max="1000000" value="${menge}" inputmode="numeric"><span>Stück</span></span></label>
        <div class="ao-schnell">${[1, st, st > 1 ? st * 27 : 0].filter((x, i, l) => x && l.indexOf(x) === i).map(x => `<button type="button" data-menge="${x}">${x === 1 ? '1 Stück' : x === st ? `1 Stack (${st})` : `Shulker (${tausend(x)})`}</button>`).join('')}</div>
        <p class="ao-wert" id="ao-wert"></p>
      </div>
      <div class="ao-graph-karte">
        <div class="ao-graph-kopf">
          <h3>Preistrend</h3>
          <div class="ao-tabs klein" role="tablist" aria-label="Zeitraum">${BEREICHE.map(([k, l]) => `<button type="button" role="tab" data-bereich="${k}" aria-selected="${k === bereich}">${l}</button>`).join('')}</div>
        </div>
        <div class="ao-legende">${[['ahMin', 'AH billigster', 'ah'], ['ahSchnitt', 'AH Ø erste Seite', 'ah2'], ['orderMax', 'Beste Order', 'or']].map(([k, l, c]) => `<button type="button" class="${c}" data-reihe="${k}" aria-pressed="${!aus.has(k)}"><i></i>${l}</button>`).join('')}</div>
        <div class="ao-graph" id="ao-graph"></div>
      </div>
      <div class="ao-angebote">
        <div><h3>Billigste im Auktionshaus</h3>${(d.ahTop || []).length ? `<ol class="ao-a-liste">${d.ahTop.map(x => angebot(x, 'ah')).join('')}</ol>` : '<p class="leer">Beim letzten Scan gab es kein Angebot.</p>'}</div>
        <div><h3>Beste Orders</h3>${(d.orderTop || []).length ? `<ol class="ao-a-liste">${d.orderTop.map(x => angebot(x, 'or')).join('')}</ol>` : '<p class="leer">Beim letzten Scan gab es keine Order.</p>'}</div>
      </div>
      <p class="hinweis ao-fuss">Angebote vom letzten Scan (${esc(vor((d.verlauf || []).filter(p => p.q !== 'l').pop()?.t || d.at))}). Kaufen und verkaufen geht nur im Spiel mit <b>/ah</b> und <b>/orders</b>.</p>`;
    const art = $('#ao-item');
    art.querySelector('.ao-zu').addEventListener('click', () => schliessen());
    art.querySelector('.ao-teilen').addEventListener('click', async e => {
      const b = e.currentTarget;
      try { await navigator.clipboard.writeText(location.href); b.textContent = 'Kopiert'; } catch { b.textContent = 'Ging nicht'; }
      setTimeout(() => { b.textContent = 'Link kopieren'; }, 1600);
    });
    art.querySelectorAll('[data-bereich]').forEach(b => b.addEventListener('click', () => {
      bereich = b.dataset.bereich;
      art.querySelectorAll('[data-bereich]').forEach(x => x.setAttribute('aria-selected', x === b));
      graphMalen();
    }));
    art.querySelectorAll('[data-reihe]').forEach(b => b.addEventListener('click', () => {
      const k = b.dataset.reihe; aus.has(k) ? aus.delete(k) : aus.add(k);
      if (aus.size === 3) aus.delete(k);
      art.querySelectorAll('[data-reihe]').forEach(x => x.setAttribute('aria-pressed', !aus.has(x.dataset.reihe)));
      graphMalen();
    }));
    const m = art.querySelector('#ao-menge');
    m.addEventListener('input', () => { menge = Math.max(1, Math.min(1e6, parseInt(m.value, 10) || 1)); wertMalen(); });
    art.querySelectorAll('[data-menge]').forEach(b => b.addEventListener('click', () => { menge = +b.dataset.menge; m.value = menge; wertMalen(); }));
    wertMalen();
    graphMalen(true);
  }
  function wertMalen() {
    const a = DETAIL.ah || {}, o = DETAIL.order || {};
    const teile = [];
    if (!leer(a.min)) teile.push(`im AH ab <b class="gold-text">${preis(a.min * menge)}</b>${!leer(a.schnitt) ? ` (Ø ${preis(a.schnitt * menge)})` : ''}`);
    if (!leer(o.max)) teile.push(`an die beste Order <b class="gruen-text">${preis(o.max * menge)}</b>`);
    $('#ao-wert').innerHTML = teile.length ? `${tausend(menge)} Stück sind ${teile.join(', ')}.${!leer(a.min) ? ` Willst du schnell verkaufen, stell es knapp unter <b>${preis(a.min)}</b> pro Stück ins AH.` : ''}` : 'Gerade gibt es keinen Preis.';
  }

  /* ---------- Graph (eigenes SVG, ohne Bibliothek) */
  const REIHEN = [['ahSchnitt', 'ah2', 'AH Ø'], ['orderMax', 'or', 'Beste Order'], ['ahMin', 'ah', 'AH billigster']];
  function schoeneSchritte(min, max, n) {
    const roh = (max - min) / n, p = Math.pow(10, Math.floor(Math.log10(roh || 1))), f = roh / p;
    const s = (f < 1.5 ? 1 : f < 3 ? 2 : f < 7 ? 5 : 10) * p;
    const l = []; for (let v = Math.ceil(min / s) * s; v <= max + s * 1e-9; v += s) l.push(v);
    return l;
  }
  function graphMalen(erstes) {
    const ziel = $('#ao-graph'); if (!ziel || !DETAIL) return;
    const v = punkteIn(DETAIL.verlauf || [], bereich);
    const aktiv = REIHEN.filter(([k]) => !aus.has(k) && v.some(p => !leer(p[k])));
    const werte = v.flatMap(p => aktiv.map(([k]) => p[k])).filter(x => !leer(x));
    if (v.length < 2 || !werte.length) {
      ziel.innerHTML = `<p class="ao-graph-leer">Für diesen Zeitraum gibt es noch zu wenig Punkte. Der Bot prüft dieses Item etwa alle ${dauer((DETAIL.taktMin || 180) * 60000)}, nach ein paar Runden wird hier eine Kurve draus.</p>`;
      return;
    }
    const B = Math.max(300, ziel.clientWidth || 600), H = B < 560 ? 230 : 300, L = 58, R = 14, O = 16, U = 30;
    const t0 = v[0].t, t1 = v[v.length - 1].t;
    let lo = Math.min(...werte), hi = Math.max(...werte);
    if (hi - lo < hi * 0.02) { lo *= .97; hi *= 1.03; }
    const pad = (hi - lo) * .12; lo = Math.max(0, lo - pad); hi += pad;
    const x = t => L + (t - t0) / ((t1 - t0) || 1) * (B - L - R);
    const y = w => O + (1 - (w - lo) / ((hi - lo) || 1)) * (H - O - U);
    const linie = k => { let d = '', an = false; for (const p of v) { if (leer(p[k])) { an = false; continue; } d += `${an ? 'L' : 'M'}${x(p.t).toFixed(1)},${y(p[k]).toFixed(1)}`; an = true; } return d; };
    const yT = schoeneSchritte(lo, hi, 4);
    const kurz = t1 - t0 <= 2 * 864e5;
    const xAnz = Math.max(2, Math.min(6, Math.floor((B - L) / 110)));
    const xT = Array.from({ length: xAnz }, (_, i) => t0 + (t1 - t0) * i / (xAnz - 1));
    let svg = `<svg viewBox="0 0 ${B} ${H}" width="${B}" height="${H}" role="img" aria-label="Preisverlauf von ${esc(DETAIL.name)}">
      <defs><linearGradient id="ao-flaeche" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#f2b23b" stop-opacity=".32"/><stop offset="1" stop-color="#f2b23b" stop-opacity="0"/></linearGradient></defs>
      ${yT.map(w => `<line class="gitter" x1="${L}" x2="${B - R}" y1="${y(w).toFixed(1)}" y2="${y(w).toFixed(1)}"/><text class="achse" x="${L - 8}" y="${(y(w) + 4).toFixed(1)}" text-anchor="end">${preis(w)}</text>`).join('')}
      ${xT.map((t, i) => `<text class="achse" x="${x(t).toFixed(1)}" y="${H - 8}" text-anchor="${i === 0 ? 'start' : i === xT.length - 1 ? 'end' : 'middle'}">${kurz ? uhr(t) : tagKurz(t)}</text>`).join('')}`;
    if (aktiv.some(([k]) => k === 'ahMin')) {
      const pts = v.filter(p => !leer(p.ahMin));
      if (pts.length > 1) svg += `<path class="flaeche" d="${linie('ahMin')}L${x(pts[pts.length - 1].t).toFixed(1)},${H - U}L${x(pts[0].t).toFixed(1)},${H - U}Z" fill="url(#ao-flaeche)"/>`;
    }
    for (const [k, c] of aktiv) svg += `<path class="linie ${c}${erstes && !ruhig ? ' malen' : ''}" d="${linie(k)}" pathLength="1"/>`;
    // letzter Wert als Punkt
    for (const [k, c] of aktiv) { const p = [...v].reverse().find(q => !leer(q[k])); if (p) svg += `<circle class="ende ${c}" cx="${x(p.t).toFixed(1)}" cy="${y(p[k]).toFixed(1)}" r="4"/>`; }
    svg += `<g class="zeiger" hidden><line class="zeiger-linie" y1="${O}" y2="${H - U}"/>${aktiv.map(([k, c]) => `<circle class="zeiger-punkt ${c}" data-k="${k}" r="5"/>`).join('')}</g>
      <rect class="fang" x="${L}" y="0" width="${B - L - R}" height="${H}" fill="transparent"/></svg><div class="ao-tip" hidden></div>`;
    ziel.innerHTML = svg;

    const s = ziel.querySelector('svg'), g = s.querySelector('.zeiger'), tip = ziel.querySelector('.ao-tip');
    const bewegen = e => {
      const r = s.getBoundingClientRect(), mx = (e.clientX - r.left) * (B / r.width);
      let best = v[0]; for (const p of v) if (Math.abs(x(p.t) - mx) < Math.abs(x(best.t) - mx)) best = p;
      const px = x(best.t);
      g.removeAttribute('hidden'); g.querySelector('line').setAttribute('x1', px); g.querySelector('line').setAttribute('x2', px);
      g.querySelectorAll('circle').forEach(c => { const w = best[c.dataset.k]; c.style.display = leer(w) ? 'none' : ''; if (!leer(w)) { c.setAttribute('cx', px); c.setAttribute('cy', y(w)); } });
      const quelle = { r: 'Scan', n: 'Scan', s: 'Scan', l: 'Live aus dem Auktionshaus' }[best.q] || '';
      tip.innerHTML = `<b>${new Date(best.t).toLocaleString('de-DE', { weekday: 'short', day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })}</b>${quelle ? `<small>${quelle}</small>` : ''}
        ${aktiv.slice().reverse().map(([k, c, l]) => leer(best[k]) ? '' : `<span class="${c}"><i></i>${l}: <b>${preis(best[k])}</b></span>`).join('')}
        ${!leer(best.ahAnzahl) ? `<small>${tausend(best.ahAnzahl)} im AH${best.orderAnzahl ? `, ${tausend(best.orderAnzahl)} Orders` : ''}</small>` : ''}`;
      tip.hidden = false;
      const sx = px * r.width / B, links = sx > r.width / 2;
      tip.style.left = links ? '' : `${sx + 14}px`; tip.style.right = links ? `${r.width - sx + 14}px` : '';
    };
    s.addEventListener('pointermove', bewegen);
    s.addEventListener('pointerdown', bewegen);
    s.addEventListener('pointerleave', () => { g.setAttribute('hidden', ''); tip.hidden = true; });
  }
  let breiteAlt = 0;
  new ResizeObserver(() => { const b = $('#ao-graph')?.clientWidth; if (b && Math.abs(b - breiteAlt) > 20) { breiteAlt = b; graphMalen(); } }).observe(W);

  /* ---------- Marktübersicht */
  const TABS = {
    beliebt: { titel: 'Gerade gefragt', info: 'Items mit den meisten Angeboten und Orders.', liste: l => l.sort((a, b) => beliebtheit(b) - beliebtheit(a)) },
    steigt: { titel: 'Werden teurer', info: 'Größter Anstieg des billigsten AH-Preises in den letzten 24 Stunden.', liste: l => l.filter(i => i.trend?.tag > 0).sort((a, b) => b.trend.tag - a.trend.tag) },
    faellt: { titel: 'Werden billiger', info: 'Größter Rückgang des billigsten AH-Preises in den letzten 24 Stunden. Vielleicht ein guter Moment zum Kaufen.', liste: l => l.filter(i => i.trend?.tag < 0).sort((a, b) => a.trend.tag - b.trend.tag) },
    flip: { titel: 'Flip-Chancen', info: 'Hier zahlt eine Order mehr, als das billigste Angebot im AH kostet: im AH kaufen, an die Order verkaufen. Preise ändern sich schnell, schau vorher im Spiel nach.', liste: l => l.filter(i => !leer(i.order.max) && !leer(i.ah.min) && i.order.max > i.ah.min).sort((a, b) => b.order.max / b.ah.min - a.order.max / a.ah.min) },
    az: { titel: 'Alle Items', info: '', liste: l => l.sort((a, b) => a.name.localeCompare(b.name, 'de')) },
  };
  let tab = 'beliebt', anzahl = 24;
  function spark(werte) {
    const w = werte.filter(x => !leer(x)); if (w.length < 2) return '';
    const lo = Math.min(...w), hi = Math.max(...w), B = 96, H = 30;
    const d = w.map((v, i) => `${i ? 'L' : 'M'}${(i / (w.length - 1) * B).toFixed(1)},${(H - 3 - ((v - lo) / ((hi - lo) || 1)) * (H - 6)).toFixed(1)}`).join('');
    return `<svg class="ao-spark ${w[w.length - 1] >= w[0] ? 'hoch' : 'runter'}" viewBox="0 0 ${B} ${H}" width="${B}" height="${H}" aria-hidden="true"><path d="${d}"/></svg>`;
  }
  function listeMalen() {
    const T = TABS[tab], l = T.liste(ITEMS.slice());
    $('#ao-liste-titel').textContent = T.titel;
    $('#ao-tab-info').textContent = T.info || `${tausend(l.length)} Items mit Preisen.`;
    const ziel = $('#ao-karten');
    if (!l.length) { ziel.innerHTML = `<li class="leer">${tab === 'flip' ? 'Gerade gibt es keine Flip-Chance. Die Orders zahlen überall weniger als das AH.' : 'Dazu gibt es gerade nichts.'}</li>`; $('#ao-mehr').hidden = true; return; }
    ziel.innerHTML = l.slice(0, anzahl).map((i, n) => {
      const t = i.trend?.tag, flip = tab === 'flip';
      return `<li class="ao-karte" style="--i:${Math.min(n, 12)}"><a href="?item=${esc(i.id)}" data-item="${esc(i.id)}">
        <span class="ao-k-kopf">${icon(i.id, i.name)}<span class="ao-k-name">${esc(i.name)}</span>${leer(t) ? '' : `<span class="ao-k-trend ${t > 0.05 ? 'hoch' : t < -0.05 ? 'runter' : ''}">${proz(t)}</span>`}</span>
        <span class="ao-k-preise"><span><small>AH ab</small><b class="gold-text">${preis(i.ah.min)}</b></span><span><small>Order</small><b class="gruen-text">${preis(i.order.max)}</b></span>${flip ? `<span><small>Gewinn</small><b>+${zahl(Math.round((i.order.max / i.ah.min - 1) * 100), 0)} %</b></span>` : spark(i.spark || [])}</span>
      </a></li>`;
    }).join('');
    $('#ao-mehr').hidden = l.length <= anzahl;
  }
  document.querySelectorAll('[data-tab]').forEach(b => b.addEventListener('click', () => {
    tab = b.dataset.tab; anzahl = 24;
    document.querySelectorAll('[data-tab]').forEach(x => x.setAttribute('aria-selected', x === b));
    if (UEB) listeMalen();
  }));
  $('#ao-mehr').addEventListener('click', () => { anzahl += 48; listeMalen(); });
  document.addEventListener('visibilitychange', () => { if (!document.hidden && UEB && Date.now() - UEB.stand > 120000) uebersichtLaden(); });

  uebersichtLaden();
})();
