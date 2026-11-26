'use strict';
(() => {
  document.documentElement.classList.add('js');
  const $ = s => document.querySelector(s);
  const $$ = s => document.querySelectorAll(s);
  const ruhig = matchMedia('(prefers-reduced-motion: reduce)').matches;
  const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
  const leer = v => v === null || v === undefined;
  // 14.5 -> "14,5M", 0.5 -> "500K" (wie im Discord)
  const preis = v => leer(v) ? null : v >= 1
    ? `${(Math.round(v * 100) / 100).toFixed(Math.round(v * 100) % 10 ? 2 : 1).replace('.', ',')}M`
    : `${Math.round(v * 1000)}K`;
  const komma = n => String(n).replace('.', ',');
  const datum = t => new Date(t).toLocaleDateString('de-DE', { day: 'numeric', month: 'long', year: 'numeric' });
  const zeit = t => new Date(t).toLocaleString('de-DE', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' });
  const tausend = n => Number(n || 0).toLocaleString('de-DE');
  const kopf = name => `https://mc-heads.net/avatar/${encodeURIComponent(String(name).replace(/^[.*]/, ''))}/32`;
  const text = (sel, t) => { const el = $(sel); if (el) el.textContent = t; return el; };
  const FEHLER = 'Die aktuellen Daten sind gerade nicht erreichbar. Schau im Discord vorbei – dort stehen die Preise immer aktuell.';

  let start = {};
  try { start = JSON.parse($('#start-daten')?.textContent || '{}'); } catch { /* dann wird nachgeladen */ }

  /* ---------- Einblenden beim Scrollen ---------- */
  const beobachter = 'IntersectionObserver' in window && !ruhig
    ? new IntersectionObserver(eintraege => eintraege.forEach(e => { if (e.isIntersecting) { e.target.classList.add('sichtbar'); beobachter.unobserve(e.target); } }), { rootMargin: '0px 0px -8% 0px', threshold: .08 })
    : null;
  const beobachte = wurzel => (wurzel || document).querySelectorAll('.zeigen:not(.sichtbar)').forEach(el => beobachter ? beobachter.observe(el) : el.classList.add('sichtbar'));

  /* ---------- Zahlen hochzählen ---------- */
  function hochzaehlen(el, ziel, format) {
    if (ruhig) { el.textContent = format(ziel); return; }
    const t0 = performance.now(), dauer = 1400;
    const schritt = t => {
      const p = Math.min(1, (t - t0) / dauer), e = 1 - Math.pow(1 - p, 4);
      el.textContent = format(ziel * e);
      if (p < 1) requestAnimationFrame(schritt);
    };
    requestAnimationFrame(schritt);
  }

  function discord(link) {
    const url = link || start.discord;
    if (url) $$('.discord-link').forEach(a => { a.href = url; });
  }

  /* ---------- Preistabelle (Preise) ---------- */
  function tabelleZeigen(P, erstes) {
    const body = $('#preis-tabelle tbody');
    if (!body) return;
    if (P.aktualisiert) text('#preis-stand', `Zuletzt geändert am ${zeit(P.aktualisiert)}`);
    const zelle = (v, ab, st, klasse) => {
      if (leer(v)) return `<td class="${klasse}"><span class="stop" title="Gerade kein Handel">STOP</span></td>`;
      const staffel = ab ? `<span class="staffel">ab ${ab} Stück: ${leer(st) ? 'Basispreis' : preis(st)}</span>` : '';
      return `<td class="${klasse}"><span class="betrag">${preis(v)}</span>${staffel}</td>`;
    };
    const html = P.spawner.map((s, i) => `<tr${erstes ? ` class="neu" style="--i:${i}"` : ''}><td><a class="tab-spawner" href="/spawner/${slug(s.name)}">${spawnerIcon(s.name)}<span class="tab-name">${esc(s.name)}</span></a></td>${zelle(s.ankauf, s.ankaufAb, s.ankaufStaffel, 'kaufen')}${zelle(s.verkauf, s.verkaufAb, s.verkaufStaffel, 'verkaufen')}</tr>`).join('')
      || '<tr><td colspan="3" class="leer">Gerade keine Preise eingetragen.</td></tr>';
    if (body.dataset.stand === html) return;
    body.innerHTML = html; body.dataset.stand = html;
    preiseFiltern();
  }
  const preisSuche = $('#preis-suche');
  function preiseFiltern() {
    if (!preisSuche) return;
    const q = preisSuche.value.trim().toLowerCase();
    const body = $('#preis-tabelle tbody');
    let treffer = 0;
    body.querySelectorAll('tr:not(.lade):not(.kein-treffer)').forEach(tr => {
      if (!tr.cells[0] || tr.cells.length < 3) return;
      const zelle = tr.cells[0].querySelector('.tab-name') || tr.cells[0];
      const name = zelle.dataset.name ?? (zelle.dataset.name = zelle.textContent);
      const p = name.toLowerCase().indexOf(q);
      const passt = !q || p >= 0;
      tr.classList.toggle('weg-gefiltert', !passt);
      zelle.innerHTML = q && passt ? esc(name.slice(0, p)) + '<mark>' + esc(name.slice(p, p + q.length)) + '</mark>' + esc(name.slice(p + q.length)) : esc(name);
      if (passt) treffer++;
    });
    body.querySelector('.kein-treffer')?.remove();
    if (q && !treffer) body.insertAdjacentHTML('beforeend', `<tr class="kein-treffer"><td colspan="3" class="leer">Kein Spawner mit „${esc(preisSuche.value)}“ in der Liste.</td></tr>`);
  }
  if (preisSuche) preisSuche.addEventListener('input', preiseFiltern);

  /* ---------- Vorschau-Karten (Start) ---------- */
  function vorschauZeigen(P) {
    const ziel = $('#vorschau');
    if (!ziel) return;
    const liste = P.spawner.filter(s => !leer(s.verkauf) || !leer(s.ankauf)).slice(0, 4);
    if (!liste.length) { ziel.innerHTML = '<p class="leer">Gerade keine Preise eingetragen.</p>'; return; }
    const zeile = (label, v, klasse) => `<div class="v-zeile"><span>${label}</span>${leer(v) ? '<span class="stop">STOP</span>' : `<b class="${klasse}">${preis(v)}</b>`}</div>`;
    const html = liste.map((s, i) => `<a class="vorschau-karte zeigen" style="--i:${i}" href="/preise"><span class="v-name">${esc(s.name)}</span>${zeile('Du kaufst', s.verkauf, 'gold-text')}${zeile('Du verkaufst', s.ankauf, 'gruen-text')}</a>`).join('');
    if (ziel.dataset.stand === html) return;
    ziel.innerHTML = html; ziel.dataset.stand = html;
    beobachte(ziel);
  }

  /* ---------- Laufband (Start) ---------- */
  function laufbandZeigen(P) {
    const band = $('#laufband');
    if (!band) return;
    const teile0 = P.spawner.filter(s => !leer(s.verkauf)).map(s => `<span>${esc(s.name)} <b>${preis(s.verkauf)}</b></span>`);
    if (!teile0.length) { band.hidden = true; return; }
    let teile = teile0;
    while (teile.length < 8) teile = teile.concat(teile0); // genug für breite Bildschirme
    const neu = teile.join('') + teile.join(''); // zweimal -> nahtlose Schleife
    const spur = $('#laufband-spur');
    if (spur.dataset.stand !== neu) { spur.innerHTML = neu; spur.dataset.stand = neu; spur.style.setProperty('--dauer', `${teile.length * 3.2}s`); }
    band.hidden = false;
  }

  /* ---------- Käfig (Start) ---------- */
  let kaefigTimer = null, kaefigListe = '';
  function kaefigZeigen(P) {
    if (!$('#kaefig')) return;
    const liste = P.spawner.flatMap(s => [
      !leer(s.verkauf) ? { name: s.name, p: s.verkauf, art: 'kaufst du bei uns' } : null,
      !leer(s.ankauf) ? { name: s.name, p: s.ankauf, art: 'zahlen wir dir' } : null,
    ]).filter(Boolean);
    const schluessel = JSON.stringify(liste);
    if (schluessel === kaefigListe) return; // nichts geändert -> Rotation läuft weiter
    kaefigListe = schluessel;
    clearInterval(kaefigTimer);
    if (!liste.length) return kaefigSetzen({ name: 'Gerade', preis: 'STOP', art: 'kein Handel' });
    let i = 0;
    const naechster = () => { const x = liste[i++ % liste.length]; kaefigSetzen({ name: x.name, preis: preis(x.p), art: x.art }, i > 1); };
    naechster();
    if (liste.length > 1 && !ruhig) kaefigTimer = setInterval(naechster, 3400);
  }
  function kaefigSetzen(x, animiert) {
    const box = $('.kaefig-inhalt');
    if (!box) return;
    const setzen = () => {
      text('#k-name', x.name); text('#k-preis', x.preis); text('#k-art', x.art);
      box.classList.remove('raus', 'rein'); void box.offsetWidth; box.classList.add('rein');
    };
    if (!animiert || ruhig) return setzen();
    box.classList.remove('rein'); box.classList.add('raus');
    setTimeout(setzen, 280);
  }

  /* ---------- Rechner (Preise) ---------- */
  let SPAWNER = [];
  function rechnerFuellen(P) {
    const sel = $('#r-spawner');
    if (!sel) return;
    const block = $('#rechner');
    if (!P.spawner.length) { if (block) block.hidden = true; return; }
    if (block) block.hidden = false;
    const alt = sel.value;
    SPAWNER = P.spawner;
    sel.innerHTML = SPAWNER.map((x, k) => `<option value="${k}">${esc(x.name)}</option>`).join('');
    if (alt && SPAWNER[+alt]) sel.value = alt;
    const fest = $('#sp')?.dataset.slug;
    if (fest) { const k = SPAWNER.findIndex(x => slug(x.name) === fest); if (k >= 0) sel.value = String(k); }
    rechnen(false);
  }
  let letzteSumme = '';
  function rechnen(pop = true) {
    const s = SPAWNER[+$('#r-spawner').value];
    const menge = Math.max(1, Math.min(10000, Math.round(+$('#r-menge').value || 1)));
    const kaufen = $('input[name="r-art"]:checked').value === 'kaufen';
    const summe = $('.r-summe'), info = $('#r-ergebnis small');
    if (!s) { summe.textContent = '–'; info.textContent = ''; return; }
    const basis = kaufen ? s.verkauf : s.ankauf, ab = kaufen ? s.verkaufAb : s.ankaufAb, st = kaufen ? s.verkaufStaffel : s.ankaufStaffel;
    let wert;
    if (leer(basis)) {
      wert = 'STOP'; summe.classList.add('stop-text');
      info.textContent = `${s.name} ${kaufen ? 'verkaufen' : 'kaufen'} wir gerade nicht.`;
    } else {
      const stueck = ab && menge >= ab && !leer(st) ? st : basis;
      wert = preis(Math.round(stueck * menge * 100) / 100); summe.classList.remove('stop-text');
      let zusatz = `${menge}× ${preis(stueck)}${stueck !== basis ? ' (Mengenpreis)' : ''}, ${kaufen ? 'du zahlst' : 'du bekommst'}`;
      if (ab && menge < ab && !leer(st) && st !== basis) zusatz += `. Ab ${ab} Stück${kaufen ? ' nur' : ''} ${preis(st)} pro Stück`;
      info.textContent = zusatz;
    }
    summe.textContent = wert;
    if (pop && wert !== letzteSumme && !ruhig) { summe.classList.remove('pop'); void summe.offsetWidth; summe.classList.add('pop'); }
    letzteSumme = wert;
  }
  const form = $('#rechner-form');
  if (form) {
    form.addEventListener('submit', e => e.preventDefault());
    form.addEventListener('input', () => rechnen());
    form.addEventListener('change', () => rechnen());
    $$('.menge button').forEach(b => b.addEventListener('click', () => {
      const f = $('#r-menge');
      f.value = Math.max(1, Math.min(10000, (Math.round(+f.value) || 1) + Number(b.dataset.schritt)));
      rechnen();
    }));
  }

  /* ---------- Clan ---------- */
  let CLANS = [];
  function clansZeigen(filter = '') {
    const ziel = $('#clans');
    if (!ziel) return;
    const q = filter.trim().toLowerCase();
    if (!CLANS.length) { ziel.innerHTML = '<p class="leer">Noch keine Mitglieder eingetragen.</p>'; return; }
    const markiere = name => {
      if (!q) return esc(name);
      const p = name.toLowerCase().indexOf(q);
      return esc(name.slice(0, p)) + '<mark>' + esc(name.slice(p, p + q.length)) + '</mark>' + esc(name.slice(p + q.length));
    };
    const html = CLANS.map(c => {
      const l = c.mitglieder.filter(m => !q || m.name.toLowerCase().includes(q));
      if (q && !l.length) return '';
      return `<div class="clan"><h3><span class="kuerzel">${esc(c.key)}</span> ${esc(c.name)}<span class="anz">${tausend(c.anzahl)} Mitglied${c.anzahl === 1 ? '' : 'er'}</span></h3>
        ${l.length ? `<ul class="spieler">${l.map((m, i) => `<li style="--i:${i}"><a class="spieler-link" href="/spieler/${encodeURIComponent(m.name)}" title="Dabei seit ${esc(datum(m.seit))}"><img src="${kopf(m.name)}" alt="" width="32" height="32" loading="lazy"><span>${markiere(m.name)}</span></a></li>`).join('')}</ul>` : '<p class="leer">Noch keine Mitglieder eingetragen.</p>'}</div>`;
    }).join('');
    const neu = html || `<p class="leer treffer-nein">Niemand mit „${esc(filter)}“ in unserem Clan. Wer nicht hier steht, handelt nicht in unserem Namen.</p>`;
    if (ziel.dataset.stand === neu) return;
    ziel.innerHTML = neu; ziel.dataset.stand = neu;
    ziel.querySelectorAll('img').forEach(img => img.addEventListener('error', () => img.classList.add('kaputt'), { once: true }));
  }
  const suche = $('#suche');
  if (suche) {
    let suchTimer;
    suche.addEventListener('input', e => { clearTimeout(suchTimer); suchTimer = setTimeout(() => clansZeigen(e.target.value), 90); });
    // Link wie /clan?name=Steve füllt die Suche direkt
    const name = new URLSearchParams(location.search).get('name');
    if (name) suche.value = name.slice(0, 32);
  }

  /* ---------- Vouches ---------- */
  function vouchesZeigen(V) {
    if (!V) return;
    const schnitt = $('#vouch-schnitt');
    if (schnitt && V.anzahl) { schnitt.hidden = false; schnitt.innerHTML = `<b>${komma(V.schnitt)}</b> <span class="sterne">★</span> aus ${tausend(V.anzahl)} Bewertungen`; }
    const zitate = $('#zitate');
    if (zitate && V.neueste?.length) {
      const max = Number(zitate.dataset.max) || Infinity;
      const sterne = n => Array.from({ length: 5 }, (_, k) => `<span class="${k < n ? '' : 'aus'}" style="--s:${k}">★</span>`).join('');
      const html = V.neueste.slice(0, max).map((v, i) => `<figure class="zitat zeigen" style="--i:${i % 4}"><span class="sterne" role="img" aria-label="${v.sterne} von 5 Sternen">${sterne(v.sterne)}</span><blockquote>„${esc(v.text)}“</blockquote><figcaption>${esc(v.von)}${v.haendler ? ` über ${esc(v.haendler)}` : ''}${v.was ? `, ${esc(v.was)}` : ''}</figcaption></figure>`).join('');
      if (zitate.dataset.stand !== html) { zitate.innerHTML = html; zitate.dataset.stand = html; beobachte(zitate); }
    }
    const rang = $('#rang');
    if (rang && V.haendler?.length) {
      rang.hidden = false;
      $('#rang-liste').innerHTML = V.haendler.map(h => `<li><span>${esc(h.name)}${h.clan ? ` <small>${esc(h.clan)}</small>` : ''}</span><span class="wert">${tausend(h.anzahl)} · Ø ${komma(h.schnitt)} <span class="sterne">★</span></span></li>`).join('');
    }
  }

  /* ---------- Kennzahlen (Start) ---------- */
  let zahlenGezeigt = false;
  function zahlenZeigen(d) {
    const dl = $('#zahlen');
    if (!dl) return;
    const z = d.zahlen || {}, teile = [];
    if (z.spawner) teile.push([z.spawner, 'Spawner gehandelt', n => tausend(Math.round(n))]);
    if (z.mitglieder) teile.push([z.mitglieder, 'Spieler in CM0 und CM1', n => tausend(Math.round(n))]);
    if (d.vouches?.anzahl) teile.push([d.vouches.schnitt, 'Ø Bewertung', n => komma(n.toFixed(1)) + ' ★']);
    if (!teile.length) return;
    dl.hidden = false;
    dl.innerHTML = teile.map(([, l]) => `<div><dt>${l}</dt><dd>0</dd></div>`).join('');
    dl.querySelectorAll('dd').forEach((dd, k) => {
      const [w, , f] = teile[k];
      if (zahlenGezeigt) dd.textContent = f(w); else hochzaehlen(dd, w, f);
    });
    zahlenGezeigt = true;
  }

  /* ==========================================================
     Spawner-Icons: selbst gezeichnete Pixel-Käfige, Farbe je Mob
     ========================================================== */
  const MOBS = [
    // [Suchbegriffe, Minecraft-ID, Hauptfarbe, Schatten, Augen]
    [['zombie piglin', 'zombified', 'zombiepiglin'], 'zombified_piglin', '#e29a8f', '#5e9a4c', '#2a1a14'],
    [['wither'], 'wither_skeleton', '#3a3a3e', '#1e1e22', '#b8b8b8'],
    [['hoehlenspinne', 'cave spider', 'cavespider'], 'cave_spider', '#1f4a55', '#10262c', '#d8262f'],
    [['skelly', 'skelett', 'skeleton', 'skele'], 'skeleton', '#dadada', '#9b9b9b', '#3a3a3a'],
    [['creeper'], 'creeper', '#5cc04c', '#2f7a26', '#10240c'],
    [['iron golem', 'irongolem', 'eisengolem', 'golem'], 'iron_golem', '#dcd4c6', '#8f877b', '#7a2a1a'],
    [['spider', 'spinne'], 'spider', '#4a3b35', '#2a201c', '#d8262f'],
    [['blaze', 'lohe'], 'blaze', '#f5c63a', '#c4680f', '#3d1d00'],
    [['kuh', 'cow', 'mooshroom'], 'cow', '#5c3e2b', '#e9e2d8', '#111'],
    [['piglin'], 'piglin', '#eaa79b', '#b56c5f', '#2a1a14'],
    [['zombie'], 'zombie', '#3f8b47', '#2a5e30', '#10240c'],
    [['schwein', 'pig'], 'pig', '#f1a4aa', '#c56d77', '#3a1a1e'],
    [['enderman'], 'enderman', '#1d1424', '#0f0a14', '#d07ae0'],
    [['schleim', 'slime'], 'slime', '#7dd06b', '#4c9a3f', '#1d3a17'],
    [['magma'], 'magma_cube', '#5a1a0a', '#ff7a1a', '#ffd27a'],
    [['hexe', 'witch'], 'witch', '#5b3a6e', '#3a2448', '#9be36b'],
    [['schaf', 'sheep'], 'sheep', '#efefef', '#c9b8a6', '#2a2a2a'],
    [['huhn', 'chicken'], 'chicken', '#f4f4f4', '#d8262f', '#111'],
    [['waechter', 'guardian'], 'guardian', '#6fb5a3', '#3f7a6c', '#f2b23b'],
    [['dorfbewohner', 'villager'], 'villager', '#b8866b', '#6e4a36', '#2f7a26'],
    [['hase', 'rabbit'], 'rabbit', '#b5946e', '#7a5e40', '#111'],
    [['ghast'], 'ghast', '#efefef', '#bdbdbd', '#555'],
    [['silberfisch', 'silverfish'], 'silverfish', '#8f96a3', '#5a606c', '#111'],
  ];
  const normal = s => String(s || '').toLowerCase().replace(/ä/g, 'ae').replace(/ö/g, 'oe').replace(/ü/g, 'ue').replace(/ß/g, 'ss').replace(/[-_]+/g, ' ').replace(/\s+/g, ' ').trim();
  const slug = s => normal(s).replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
  function mob(name) {
    const n = normal(name).replace(/\s*spawner\s*/, '');
    const m = MOBS.find(([w]) => w.some(x => n.includes(x)));
    if (m) return { id: m[1], a: m[2], b: m[3], c: m[4] };
    let h = 0; for (const ch of n) h = (h * 31 + ch.charCodeAt(0)) % 360;
    return { id: n.replace(/ /g, '_'), a: `hsl(${h} 55% 58%)`, b: `hsl(${h} 50% 36%)`, c: '#111' };
  }
  const iconCache = new Map();
  const BILD_VORLAGE = document.body.dataset.bilder || '';
  const SPAWNER_TEX = BILD_VORLAGE ? BILD_VORLAGE.replace('{art}', 'block').replace('{id}', 'spawner') : '';
  function spawnerIcon(name) {
    if (iconCache.has(name)) return iconCache.get(name);
    const m = mob(name), r = [], kopfR = [];
    let ziel = r;
    const px = (x, y, f, w = 1, h = 1) => ziel.push(`<rect x="${x}" y="${y}" width="${w}" height="${h}" fill="${f}"/>`);
    const kopf = () => {
      px(3, 3, m.b, 10, 10); px(3, 3, m.a, 9, 9);   // Mob-Kopf
      px(4, 4, 'rgba(255,255,255,.3)', 3, 1);       // Glanz
      px(4, 6, m.c, 3, 2); px(9, 6, m.c, 3, 2);     // Augen
      if (m.id === 'creeper') { px(7, 8, m.c, 2, 3); px(6, 9, m.c, 1, 3); px(9, 9, m.c, 1, 3); }
      else if (m.id === 'pig' || m.id === 'piglin' || m.id === 'zombified_piglin') px(6, 9, m.b, 4, 3);
      else if (m.id === 'iron_golem' || m.id === 'villager') px(7, 8, m.b, 2, 4);
      else px(5, 10, m.b, 6, 1);
    };
    px(1, 1, '#140f0b', 14, 14);                 // dunkles Innere
    px(2, 10, '#5a2a0c', 12, 4); px(4, 12, '#a2480f', 8, 2); // Glut unten
    kopf();
    // Käfig: Rahmen und Gitterstäbe vor dem Mob (Ersatz, falls die echte Textur nicht lädt)
    r.push('<g class="spi-gitter">');
    const eisen = '#4b515d', dunkel = '#2b2f37';
    px(0, 0, dunkel, 16, 1); px(0, 15, dunkel, 16, 1); px(0, 0, dunkel, 1, 16); px(15, 0, dunkel, 1, 16);
    px(1, 1, eisen, 14, 1); px(1, 14, eisen, 14, 1); px(1, 1, eisen, 1, 14); px(14, 1, eisen, 1, 14);
    for (const k of [5, 10]) { px(k, 2, 'rgba(75,81,93,.55)', 1, 12); px(2, k, 'rgba(75,81,93,.55)', 12, 1); }
    r.push('</g>');
    ziel = kopfR; kopf();
    const mobSvg = `<svg class="spi-mob" viewBox="3 3 10 10" shape-rendering="crispEdges" aria-hidden="true">${kopfR.join('')}</svg>`;
    const tex = SPAWNER_TEX ? `<img class="spi-tex" src="${esc(SPAWNER_TEX)}" alt="" width="16" height="16" decoding="async">${mobSvg}` : '';
    const svg = `<span class="spi"><svg class="sp-svg" viewBox="0 0 16 16" shape-rendering="crispEdges" aria-hidden="true">${r.join('')}</svg>${tex}</span>`;
    iconCache.set(name, svg);
    return svg;
  }

  /* ---------- kleine Helfer ---------- */
  const vor = t => {
    const s = Math.max(0, Math.round((Date.now() - t) / 1000));
    if (s < 60) return 'gerade eben';
    if (s < 3600) return `vor ${Math.round(s / 60)} Min.`;
    if (s < 86400) return `vor ${Math.round(s / 3600)} Std.`;
    const tage = Math.round(s / 86400);
    return tage === 1 ? 'gestern' : `vor ${tage} Tagen`;
  };
  // Markt-Preise kommen in Millionen: 1 = 1M, 0.018 = 18K
  const marktPreis = v => {
    if (v === null || v === undefined || !Number.isFinite(v)) return '–';
    const z = (x, d) => x.toLocaleString('de-DE', { maximumFractionDigits: d });
    if (v >= 1000) return z(v / 1000, 2) + 'B';
    if (v >= 1) return z(v, v >= 100 ? 0 : 2) + 'M';
    if (v >= 0.001) { const k = v * 1000; return z(k, k >= 100 ? 0 : k >= 10 ? 1 : 2) + 'K'; }
    return z(v * 1e6, 0);
  };
  const kopf24 = name => `https://mc-heads.net/avatar/${encodeURIComponent(String(name).replace(/^[.*]/, ''))}/32`;
  const staffelText = (ab, st, kaufen) => ab && !leer(st) ? `ab ${ab} Stück ${preis(st)}${kaufen ? '' : ''}` : '';

  /* ---------- Online-Zahl oben ---------- */
  let onlineGezeigt = false;
  function onlineZeigen(d) {
    const el = $('#online');
    if (!el || !d.live) return;
    el.hidden = false;
    el.querySelector('.punkt').className = 'punkt ' + (d.live.online ? 'an' : 'aus');
    const z = $('#online-zahl');
    if (!d.live.online) { z.textContent = 'offline'; return; }
    if (onlineGezeigt) z.textContent = tausend(d.live.spieler); else hochzaehlen(z, d.live.spieler, n => tausend(Math.round(n)));
    onlineGezeigt = true;
  }

  /* ---------- Chips mit allen Spawnern ---------- */
  function chipsZeigen(P) {
    const ziel = $('#spawner-chips');
    if (!ziel) return;
    const fest = $('#sp')?.dataset.slug;
    const liste = P.spawner.filter(s => slug(s.name) !== fest);
    const html = liste.map((s, i) => {
      const p = !leer(s.verkauf) ? `<b class="gold-text">${preis(s.verkauf)}</b>` : !leer(s.ankauf) ? `<b class="gruen-text">${preis(s.ankauf)}</b>` : '<b class="stop">STOP</b>';
      return `<a class="chip" style="--i:${i}" href="/spawner/${slug(s.name)}">${spawnerIcon(s.name)}<span>${esc(s.name)}</span>${p}</a>`;
    }).join('') || '<p class="leer">Gerade keine Preise eingetragen.</p>';
    if (ziel.dataset.stand !== html) { ziel.innerHTML = html; ziel.dataset.stand = html; }
  }

  /* ---------- Zahlen-Kacheln ---------- */
  let kachelnGezeigt = false;
  function kachelnZeigen(d) {
    if (!$('#kacheln')) return;
    const setz = (id, wert, f = n => tausend(Math.round(n))) => {
      const el = $(id); if (!el) return;
      if (leer(wert)) { el.textContent = '–'; return; }
      if (kachelnGezeigt) el.textContent = f(wert); else hochzaehlen(el, wert, f);
    };
    setz('#z-online', d.live?.online ? d.live.spieler : null);
    setz('#z-abschluesse', d.zahlen?.abschluesse);
    setz('#z-spawner', d.zahlen?.spawner);
    if (d.zahlen?.verifiziert) text('#z-spawner-info', `${tausend(d.zahlen.verifiziert)} Kunden verifiziert`);
    kachelnGezeigt = true;
  }

  /* ---------- Listen „Wir verkaufen“ / „Wir kaufen“ ---------- */
  function listenZeigen(P) {
    const zeile = (s, wert, ab, st, klasse, info) => `<li><a class="zeile" href="/spawner/${slug(s.name)}">
      <span class="z-icon">${spawnerIcon(s.name)}</span>
      <span class="z-text"><b>${esc(s.name)} Spawner</b><small>${ab && !leer(st) ? `ab ${ab} Stück nur ${preis(st)}` : info}</small></span>
      <span class="z-preis ${klasse}">${preis(wert)}<small>pro Stück</small></span></a></li>`;
    const leerZeile = t => `<li class="zeile-leer">${t}</li>`;
    const v = $('#liste-verkauf'), a = $('#liste-ankauf');
    if (v) {
      const l = P.spawner.filter(s => !leer(s.verkauf));
      const html = l.map(s => zeile(s, s.verkauf, s.verkaufAb, s.verkaufStaffel, 'gold-text', 'Kauf über ein Ticket')).join('') || leerZeile('Gerade verkaufen wir keine Spawner.');
      if (v.dataset.stand !== html) { v.innerHTML = html; v.dataset.stand = html; }
    }
    if (a) {
      const l = P.spawner.filter(s => !leer(s.ankauf));
      const html = l.map(s => zeile(s, s.ankauf, s.ankaufAb, s.ankaufStaffel, 'gruen-text', 'Wir kaufen sofort an')).join('') || leerZeile('Gerade kaufen wir keine Spawner an.');
      if (a.dataset.stand !== html) { a.innerHTML = html; a.dataset.stand = html; }
    }
  }

  /* ---------- Bewertungen als Feed ---------- */
  function vouchFeed(V) {
    const ziel = $('#liste-vouches');
    if (!ziel) return;
    if (!V || !V.neueste?.length) { ziel.innerHTML = '<li class="zeile-leer">Noch keine Bewertungen.</li>'; return; }
    if (V.anzahl) text('#vouch-schnitt-kurz', `Ø ${komma(V.schnitt)} ★ aus ${tausend(V.anzahl)} Bewertungen.`);
    const html = V.neueste.slice(0, 5).map(v => `<li class="zeile zeile-vouch">
      <img class="z-kopf" src="${kopf24(v.von)}" alt="" width="32" height="32" loading="lazy">
      <span class="z-text"><b>${esc(v.von)}${v.haendler ? ` <span class="z-pfeil">→</span> ${nameLink(v.haendler)}` : ''}</b><small>„${esc(v.text)}“${v.was ? ` · ${esc(v.was)}` : ''}</small></span>
      <span class="z-preis"><span class="sterne">${'★'.repeat(v.sterne)}<span class="aus">${'★'.repeat(5 - v.sterne)}</span></span><small>${v.at ? vor(v.at) : ''}</small></span></li>`).join('');
    if (ziel.dataset.stand !== html) { ziel.innerHTML = html; ziel.dataset.stand = html; }
    const hl = $('#haendler-leiste');
    if (hl && V.haendler?.length) {
      hl.hidden = false;
      hl.innerHTML = `<p class="leiste-titel">Meiste Vouches</p>` + V.haendler.slice(0, 5).map((h, i) => `<a class="haendler-chip" href="/spieler/${encodeURIComponent(h.name)}"><span class="rang-nr">${i + 1}</span><img src="${kopf24(h.name)}" alt="" width="22" height="22" loading="lazy">${esc(h.name)}<small>${tausend(h.anzahl)} · ${komma(h.schnitt)} ★</small></a>`).join('');
    }
  }

  /* ---------- Markt-Paneel (Auktionshaus & Orders) ---------- */
  const BILDER = BILD_VORLAGE;
  const TEXTUR = { ancient_debris: 'block/ancient_debris_side', tnt: 'block/tnt_side', obsidian: 'block/obsidian', spawner: 'block/spawner', beacon: 'block/beacon', sponge: 'block/sponge', dragon_egg: 'block/dragon_egg', heavy_core: 'block/heavy_core', shulker_box: 'item/shulker_shell', ender_chest: 'item/ender_eye' };
  const itemBild = id => {
    if (!BILDER) return '';
    const [art, tex] = (TEXTUR[id] || (id.startsWith('spawner_') ? 'block/spawner' : `item/${id}`)).split('/');
    return `<img src="${esc(BILDER.replace('{art}', art).replace('{id}', encodeURIComponent(tex)))}" data-id="${esc(id)}" data-art="${art}" alt="" width="32" height="32" loading="lazy">`;
  };
  document.addEventListener('error', e => {
    const img = e.target;
    if (!(img instanceof HTMLImageElement) || !img.dataset.id || !img.closest('.dash, .sp, .app-seite, .ticker, #gs-treffer')) return;
    if (img.dataset.art === 'item' && !img.dataset.block) { img.dataset.block = '1'; img.src = BILDER.replace('{art}', 'block').replace('{id}', encodeURIComponent(img.dataset.id)); return; }
    img.remove();
  }, true);
  let MARKT = null, marktLaeuft = null;
  const marktHolen = () => marktLaeuft || (marktLaeuft = fetch('/api/preise').then(r => r.ok ? r.json() : null).then(d => (MARKT = d)).catch(() => null));
  async function marktPaneel() {
    const ziel = $('#liste-markt');
    if (!ziel) return;
    const d = await marktHolen();
    if (!d?.items?.length) { ziel.innerHTML = '<li class="zeile-leer">Die Marktpreise sind gerade nicht erreichbar.</li>'; return; }
    if (d.demo) { const c = $('#markt-chip'); c.className = 'live-chip demo-chip'; c.textContent = 'Demo-Daten'; }
    const beliebt = i => (i.ah?.anzahl || 0) + (i.order?.anzahl || 0) * 2;
    const liste = d.items.filter(i => !leer(i.ah?.min) || !leer(i.order?.max)).sort((a, b) => beliebt(b) - beliebt(a)).slice(0, 6);
    ziel.innerHTML = liste.map(i => {
      const t = i.trend?.tag;
      const trend = leer(t) ? '' : `<span class="trend ${t > 0 ? 'hoch' : t < 0 ? 'runter' : ''}">${t > 0 ? '▲' : t < 0 ? '▼' : '•'} ${komma(Math.abs(t).toFixed(1))} %</span>`;
      return `<li><a class="zeile" href="/auction-orders?item=${encodeURIComponent(i.id)}">
        <span class="z-icon mc">${itemBild(i.id)}</span>
        <span class="z-text"><b>${esc(i.name)}</b><small>${tausend(i.ah?.anzahl || 0)} im AH · ${tausend(i.order?.anzahl || 0)} Orders ${trend}</small></span>
        <span class="z-preis gruen-text">${marktPreis(i.ah?.min)}<small>${leer(i.order?.max) ? 'keine Order' : `Order ${marktPreis(i.order.max)}`}</small></span></a></li>`;
    }).join('');
  }

  /* ---------- Karussell ---------- */
  const karussell = $('#karussell');
  if (karussell) {
    const spur = $('#k-spur'), folien = [...spur.children], punkte = $('#k-punkte');
    let i = 0, timer = null;
    punkte.innerHTML = folien.map((_, k) => `<button type="button" role="tab" aria-label="Folie ${k + 1}"></button>`).join('');
    const knoepfe = [...punkte.children];
    const gehe = n => {
      i = (n + folien.length) % folien.length;
      spur.style.transform = `translateX(${-100 * i}%)`;
      knoepfe.forEach((b, k) => b.setAttribute('aria-selected', String(k === i)));
      folien.forEach((f, k) => { f.toggleAttribute('inert', k !== i); f.classList.toggle('aktiv', k === i); });
    };
    const start = () => { if (!ruhig) { clearInterval(timer); timer = setInterval(() => gehe(i + 1), 7000); } };
    const stopp = () => clearInterval(timer);
    karussell.querySelector('.k-vor').addEventListener('click', () => { gehe(i + 1); start(); });
    karussell.querySelector('.k-zurueck').addEventListener('click', () => { gehe(i - 1); start(); });
    knoepfe.forEach((b, k) => b.addEventListener('click', () => { gehe(k); start(); }));
    karussell.addEventListener('pointerenter', stopp);
    karussell.addEventListener('pointerleave', start);
    karussell.addEventListener('focusin', stopp);
    karussell.addEventListener('focusout', start);
    // Wischen am Handy
    let x0 = null;
    spur.addEventListener('pointerdown', e => { x0 = e.clientX; });
    spur.addEventListener('pointerup', e => { if (x0 === null) return; const dx = e.clientX - x0; x0 = null; if (Math.abs(dx) > 50) { gehe(i + (dx < 0 ? 1 : -1)); start(); } });
    document.addEventListener('visibilitychange', () => document.hidden ? stopp() : start());
    gehe(0); start();
  }

  /* ---------- Spawner-Seite ---------- */
  const SP = $('#sp');
  let spMarktGeholt = false;
  function spawnerSeite(d) {
    if (!SP || !d.preise) return;
    const liste = d.preise.spawner, k = liste.findIndex(x => slug(x.name) === SP.dataset.slug);
    if (k < 0) return;
    const s = liste[k];
    text('#sp-name', s.name);
    $('#sp-icon').innerHTML = spawnerIcon(s.name);
    const mitglieder = (d.clans || []).reduce((n, c) => n + (c.anzahl || 0), 0);
    if (mitglieder) text('#sp-haendler', `${tausend(mitglieder)} Händler in CM0 und CM1`);
    const feld = (id, wert, ab, st, wer) => {
      const el = $(id);
      el.innerHTML = leer(wert) ? '<span class="stop">STOP</span>' : `${preis(wert)}<small> pro Stück</small>`;
      $(id + '-staffel').textContent = leer(wert) ? `Gerade ${wer} wir diesen Spawner nicht.` : ab && !leer(st) ? `Ab ${ab} Stück: ${preis(st)} pro Stück` : 'Gleicher Preis für jede Menge';
    };
    feld('#sp-verkauf', s.verkauf, s.verkaufAb, s.verkaufStaffel, 'verkaufen');
    feld('#sp-ankauf', s.ankauf, s.ankaufAb, s.ankaufStaffel, 'kaufen');
    // Rechner auf die Richtung stellen, die es gibt
    if (leer(s.verkauf) && !leer(s.ankauf)) { const r = $('input[name="r-art"][value="verkaufen"]'); if (r && !r.checked) { r.checked = true; rechnen(false); } }
    const n = liste[(k + 1) % liste.length];
    if (n && n !== s) {
      const w = $('#sp-weiter'); w.hidden = false; w.href = `/spawner/${slug(n.name)}`;
      text('#sp-weiter-name', n.name); $('#sp-weiter-icon').innerHTML = spawnerIcon(n.name);
    }
    document.title = `${s.name} Spawner – Preis bei CoreMarket`;
    if (!spMarktGeholt) { spMarktGeholt = true; spawnerMarkt(s); }
  }
  async function spawnerMarkt(s) {
    const id = 'spawner_' + mob(s.name).id;
    try {
      const r = await fetch(`/api/preise/${encodeURIComponent(id)}`);
      if (!r.ok) return;
      const m = await r.json();
      if (m.demo || (leer(m.ah?.min) && leer(m.order?.max))) return; // keine ausgedachten Zahlen als Vergleich
      $('#sp-markt-werte').innerHTML = `<div><small>Billigstes Angebot</small><b class="gruen-text">${marktPreis(m.ah?.min)}</b></div><div><small>Beste Order</small><b>${marktPreis(m.order?.max)}</b></div>`;
      $('#sp-markt-link').href = `/auction-orders?item=${encodeURIComponent(id)}`;
      $('#sp-markt').hidden = false;
    } catch { /* dann eben ohne Vergleich */ }
  }

  /* ==========================================================
     Globale Suche oben: Spawner, Spieler, Seiten, Wiki, Items
     ========================================================== */
  const gs = $('#gs-eingabe'), gsTreffer = $('#gs-treffer'), gsBox = $('#globalsuche');
  let WIKI_INDEX = null, DATEN = null;
  const SEITEN_LISTE = [
    ['Startseite', '/'], ['Spawner-Preise', '/preise'], ['Rechner', '/preise#rechner'], ['Auction-Orders', '/auction-orders'],
    ['Clan', '/clan'], ['Bewertungen', '/bewertungen'], ["So läuft's", '/ablauf'], ['Wiki', '/wiki'], ['Häufige Fragen', '/fragen'], ['Abo', '/abo'],
  ];
  if (gs) {
    let auswahl = -1, zeitGs;
    const hervor = (t, q) => { const p = normal(t).indexOf(q); return p < 0 ? esc(t) : esc(t.slice(0, p)) + '<mark>' + esc(t.slice(p, p + q.length)) + '</mark>' + esc(t.slice(p + q.length)); };
    const wikiLaden = () => WIKI_INDEX || (WIKI_INDEX = fetch('/api/wiki').then(r => r.ok ? r.json() : []).catch(() => []));
    async function suchen() {
      const roh = gs.value.trim(), q = normal(roh);
      auswahl = -1;
      if (!q) { gsTreffer.hidden = true; gs.setAttribute('aria-expanded', 'false'); return; }
      const gruppen = [];
      const sp = (DATEN?.preise?.spawner || []).filter(s => normal(s.name).includes(q) || mob(s.name).id.includes(q.replace(/ /g, '_')));
      if (sp.length) gruppen.push(['Spawner', sp.slice(0, 5).map(s => `<a href="/spawner/${slug(s.name)}" role="option"><span class="gs-icon">${spawnerIcon(s.name)}</span><span>${hervor(s.name, q)} Spawner<small>${!leer(s.verkauf) ? `Kaufen ${preis(s.verkauf)}` : ''}${!leer(s.verkauf) && !leer(s.ankauf) ? ' · ' : ''}${!leer(s.ankauf) ? `Verkaufen ${preis(s.ankauf)}` : ''}</small></span></a>`)]);
      const leute = (DATEN?.clans || []).flatMap(c => c.mitglieder.map(m => [m.name, c.key])).filter(([n]) => normal(n).includes(q));
      if (leute.length) gruppen.push(['Clan-Mitglieder', leute.slice(0, 5).map(([n, k]) => `<a href="/spieler/${encodeURIComponent(n)}" role="option"><img class="gs-icon" src="${kopf24(n)}" alt="" width="28" height="28" loading="lazy"><span>${hervor(n, q)}<small>${esc(k)} · gehört zu CoreMarket</small></span></a>`)]);
      const seiten = SEITEN_LISTE.filter(([n]) => normal(n).includes(q));
      const wiki = (await wikiLaden()).filter(a => normal(a.t).includes(q) || normal(a.b).includes(q));
      if (seiten.length || wiki.length) gruppen.push(['Seiten & Wiki', [...seiten.map(([n, u]) => `<a href="${u}" role="option"><span class="gs-icon gs-seite">↗</span><span>${hervor(n, q)}<small>Seite</small></span></a>`), ...wiki.slice(0, 4).map(a => `<a href="/wiki/${esc(a.s)}" role="option"><span class="gs-icon gs-seite">W</span><span>${hervor(a.t, q)}<small>Wiki · ${esc(a.k)}</small></span></a>`)]]);
      if (q.length >= 2) {
        const markt = MARKT || await marktHolen();
        const items = (markt?.items || []).filter(i => normal(i.name).includes(q) || i.id.includes(q.replace(/ /g, '_'))).slice(0, 5);
        if (items.length) gruppen.push([`Items${markt.demo ? ' (Demo-Preise)' : ''}`, items.map(i => `<a href="/auction-orders?item=${encodeURIComponent(i.id)}" role="option"><span class="gs-icon mc">${itemBild(i.id)}</span><span>${hervor(i.name, q)}<small>AH ab ${marktPreis(i.ah?.min)}${leer(i.order?.max) ? '' : ` · Order ${marktPreis(i.order.max)}`}</small></span></a>`)]);
      }
      if (gs.value.trim() !== roh) return; // schon weitergetippt
      gsTreffer.innerHTML = gruppen.length
        ? gruppen.map(([t, l]) => `<p class="gs-gruppe">${t}</p>${l.join('')}`).join('')
        : `<p class="gs-nichts">Nichts gefunden zu „${esc(roh)}“.${normal(roh).length > 2 ? ' Wer nicht in unserer Clan-Liste steht, handelt nicht in unserem Namen.' : ''}</p>`;
      gsTreffer.hidden = false; gs.setAttribute('aria-expanded', 'true');
    }
    gs.addEventListener('input', () => { clearTimeout(zeitGs); zeitGs = setTimeout(suchen, 80); });
    gs.addEventListener('focus', () => { if (gs.value.trim()) suchen(); marktHolen(); });
    gs.addEventListener('keydown', e => {
      const links = [...gsTreffer.querySelectorAll('a')];
      if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
        e.preventDefault(); if (!links.length) return;
        auswahl = (auswahl + (e.key === 'ArrowDown' ? 1 : -1) + links.length) % links.length;
        links.forEach((l, k) => l.classList.toggle('markiert', k === auswahl));
        links[auswahl].scrollIntoView({ block: 'nearest' });
      } else if (e.key === 'Enter' && links.length) { e.preventDefault(); location.href = links[Math.max(0, auswahl)].href; }
      else if (e.key === 'Escape') { gsTreffer.hidden = true; gs.blur(); gsBox.classList.remove('offen'); }
    });
    document.addEventListener('click', e => { if (!e.target.closest('#globalsuche, #gs-mobil')) { gsTreffer.hidden = true; gsBox.classList.remove('offen'); } });
    addEventListener('keydown', e => {
      const tippt = /INPUT|TEXTAREA|SELECT/.test(document.activeElement?.tagName || '');
      if (((e.key === '/' && !$('#wiki-suche') && !$('#ao-suche')) || (e.key.toLowerCase() === 'k' && (e.ctrlKey || e.metaKey))) && (!tippt || e.ctrlKey || e.metaKey)) { e.preventDefault(); gsBox.classList.add('offen'); gs.focus(); }
    });
    $('#gs-mobil')?.addEventListener('click', () => { gsBox.classList.add('offen'); gs.focus(); });
  }

  /* ==========================================================
     Merkliste (nur im Browser gespeichert) + kleine Meldungen
     ========================================================== */
  const toastEl = $('#toast');
  let toastTimer;
  function toast(t) {
    if (!toastEl) return;
    toastEl.textContent = t; toastEl.hidden = false;
    toastEl.classList.remove('weg'); void toastEl.offsetWidth; toastEl.classList.add('da');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => { toastEl.classList.remove('da'); toastEl.classList.add('weg'); setTimeout(() => { toastEl.hidden = true; }, 300); }, 2200);
  }
  const MERK_KEY = 'cm-merkliste';
  const merkLesen = () => { try { const l = JSON.parse(localStorage.getItem(MERK_KEY) || '[]'); return Array.isArray(l) ? l.filter(x => typeof x === 'string').slice(0, 100) : []; } catch { return []; } };
  let MERK = merkLesen();
  const merkSpeichern = () => { try { localStorage.setItem(MERK_KEY, JSON.stringify(MERK)); } catch { /* privater Modus */ } };
  function merkKnoepfe() {
    $$('[data-merk]').forEach(b => {
      const an = MERK.includes(b.dataset.merk);
      b.setAttribute('aria-pressed', String(an));
      b.classList.toggle('an', an);
      const t = b.querySelector('span'); if (t) t.textContent = an ? 'Gemerkt' : 'Merken';
    });
    const z = $('.merk-zahl');
    if (z) { z.hidden = !MERK.length; z.textContent = MERK.length; }
  }
  document.addEventListener('click', e => {
    const b = e.target.closest('[data-merk]');
    if (!b) return;
    e.preventDefault();
    const k = b.dataset.merk, an = MERK.includes(k);
    MERK = an ? MERK.filter(x => x !== k) : [k, ...MERK];
    merkSpeichern(); merkKnoepfe();
    if (!an && !ruhig) { b.classList.remove('hops'); void b.offsetWidth; b.classList.add('hops'); }
    const name = k.split(':')[0] === 'spieler' ? k.slice(8) : (DATEN?.preise?.spawner.find(s => slug(s.name) === k.slice(8))?.name || k.slice(8)) + ' Spawner';
    toast(an ? `${name} von der Merkliste entfernt` : `${name} gemerkt`);
    if (DATEN) merkZeigen(DATEN);
  });
  addEventListener('storage', e => { if (e.key === MERK_KEY) { MERK = merkLesen(); merkKnoepfe(); if (DATEN) merkZeigen(DATEN); } });

  function merkZeigen(d) {
    const sp = MERK.filter(k => k.startsWith('spawner:')).map(k => d.preise?.spawner.find(s => slug(s.name) === k.slice(8))).filter(Boolean);
    const leute = MERK.filter(k => k.startsWith('spieler:')).map(k => k.slice(8));
    // Startseite: kleine Chip-Reihe
    const block = $('#merk-block');
    if (block) {
      block.hidden = !sp.length && !leute.length;
      $('#merk-chips').innerHTML = sp.map(s => `<a class="chip" href="/spawner/${slug(s.name)}">${spawnerIcon(s.name)}<span>${esc(s.name)}</span>${!leer(s.verkauf) ? `<b class="gold-text">${preis(s.verkauf)}</b>` : !leer(s.ankauf) ? `<b class="gruen-text">${preis(s.ankauf)}</b>` : '<b class="stop">STOP</b>'}</a>`).join('')
        + leute.map(n => `<a class="chip" href="/spieler/${encodeURIComponent(n)}"><img class="chip-kopf" src="${kopf24(n)}" alt="" width="28" height="28" loading="lazy"><span>${esc(n)}</span></a>`).join('');
    }
    // Merkliste-Seite
    if (!$('#merk-inhalt')) return;
    $('#merk-leer').hidden = !!(sp.length || leute.length);
    $('#merk-inhalt').hidden = !(sp.length || leute.length);
    const loesch = k => `<button type="button" class="merk-knopf rund klein an" data-merk="${esc(k)}" aria-pressed="true" aria-label="Von der Merkliste entfernen" title="Entfernen"><svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="m12 3 2.8 5.7 6.2.9-4.5 4.4 1.1 6.2L12 17.3l-5.6 2.9 1.1-6.2L3 9.6l6.2-.9z"/></svg></button>`;
    $('#merk-spawner').innerHTML = sp.map(s => `<li class="merk-zeile"><a class="zeile" href="/spawner/${slug(s.name)}"><span class="z-icon">${spawnerIcon(s.name)}</span><span class="z-text"><b>${esc(s.name)} Spawner</b><small>${!leer(s.ankauf) ? `Wir kaufen für ${preis(s.ankauf)}` : 'Wir kaufen gerade nicht'}</small></span><span class="z-preis gold-text">${leer(s.verkauf) ? '<span class="stop">STOP</span>' : preis(s.verkauf)}<small>Kaufpreis</small></span></a>${loesch('spawner:' + slug(s.name))}</li>`).join('') || '<li class="zeile-leer">Keine Spawner gemerkt.</li>';
    const mitglied = n => (d.clans || []).find(c => c.mitglieder.some(m => m.name.toLowerCase() === n.toLowerCase()));
    $('#merk-spieler').innerHTML = leute.map(n => { const c = mitglied(n); return `<li class="merk-zeile"><a class="zeile" href="/spieler/${encodeURIComponent(n)}"><img class="z-kopf" src="${kopf24(n)}" alt="" width="32" height="32" loading="lazy"><span class="z-text"><b>${esc(n)}</b><small>${c ? `${esc(c.key)} · gehört zu CoreMarket` : '<span class="rot-text">Nicht mehr im Clan</span>'}</small></span><span></span></a>${loesch('spieler:' + n)}</li>`; }).join('') || '<li class="zeile-leer">Keine Spieler gemerkt.</li>';
  }

  /* ==========================================================
     Live: Ticker auf der Startseite und Live-Feed-Seite
     ========================================================== */
  function ereignisse(d, markt) {
    const e = [];
    for (const v of d.vouches?.neueste || []) if (v.at) e.push({ art: 'vouch', at: v.at, v });
    if (d.preise?.aktualisiert) e.push({ art: 'preis', at: d.preise.aktualisiert });
    for (const i of (markt?.items || [])) if (i.at && (!leer(i.ah?.min) || !leer(i.order?.max))) e.push({ art: 'markt', at: i.at, i });
    return e.sort((a, b) => b.at - a.at);
  }
  const sterneKurz = n => `<span class="sterne">${'★'.repeat(n)}<span class="aus">${'★'.repeat(5 - n)}</span></span>`;
  const istMitglied = n => (DATEN?.clans || []).some(c => c.mitglieder.some(m => m.name.toLowerCase() === String(n).toLowerCase()));
  const nameLink = n => istMitglied(n) ? `<a class="name-link" href="/spieler/${encodeURIComponent(n)}">${esc(n)}</a>` : esc(n);

  function tickerZeigen(d) {
    const spur = $('#ticker-spur');
    if (!spur) return;
    const e = ereignisse(d, MARKT).slice(0, 14);
    if (!e.length) return;
    const teile = e.map(x => {
      if (x.art === 'vouch') return `<a class="t-teil" href="/bewertungen"><img src="${kopf24(x.v.von)}" alt="" width="20" height="20" loading="lazy"><b>${esc(x.v.von)}</b> bewertet ${esc(x.v.haendler || 'CoreMarket')} ${sterneKurz(x.v.sterne)}<small>${vor(x.at)}</small></a>`;
      if (x.art === 'preis') return `<a class="t-teil" href="/preise"><span class="t-icon">€</span><b>Spawner-Preise</b> aktualisiert<small>${vor(x.at)}</small></a>`;
      return `<a class="t-teil" href="/auction-orders?item=${encodeURIComponent(x.i.id)}"><span class="t-mc">${itemBild(x.i.id)}</span><b>${esc(x.i.name)}</b> AH ab <span class="gruen-text">${marktPreis(x.i.ah?.min)}</span><small>${vor(x.at)}</small></a>`;
    });
    const html = teile.join('') + teile.join('');
    if (spur.dataset.stand === html) return;
    spur.innerHTML = html; spur.dataset.stand = html;
    spur.style.setProperty('--dauer', `${teile.length * 5}s`);
    $('#ticker').hidden = false;
  }

  const feed = $('#live-feed');
  let feedFilter = 'alle';
  function feedZeigen(d) {
    if (!feed) return;
    const e = ereignisse(d, MARKT).filter(x => feedFilter === 'alle' || x.art === feedFilter).slice(0, 60);
    const zeile = x => {
      if (x.art === 'vouch') return `<li class="zeile feed-zeile"><img class="z-kopf" src="${kopf24(x.v.von)}" alt="" width="32" height="32" loading="lazy">
        <span class="z-text"><b>${esc(x.v.von)} <span class="z-pfeil">hat</span> ${x.v.haendler ? nameLink(x.v.haendler) : 'CoreMarket'} <span class="z-pfeil">bewertet</span></b><small>„${esc(x.v.text)}“${x.v.was ? ` · ${esc(x.v.was)}` : ''}</small></span>
        <span class="z-preis">${sterneKurz(x.v.sterne)}<small>${vor(x.at)}</small></span></li>`;
      if (x.art === 'preis') return `<li><a class="zeile feed-zeile" href="/preise"><span class="z-icon feed-art">€</span><span class="z-text"><b>Spawner-Preise wurden geändert</b><small>Neue An- und Verkaufspreise in der Preisliste</small></span><span class="z-preis"><span class="feed-tag">Preise</span><small>${vor(x.at)}</small></span></a></li>`;
      const t = x.i.trend?.tag;
      return `<li><a class="zeile feed-zeile" href="/auction-orders?item=${encodeURIComponent(x.i.id)}"><span class="z-icon mc">${itemBild(x.i.id)}</span>
        <span class="z-text"><b>${esc(x.i.name)} geprüft</b><small>${tausend(x.i.ah?.anzahl || 0)} Angebote im AH · ${tausend(x.i.order?.anzahl || 0)} Orders${leer(t) ? '' : ` · <span class="trend ${t > 0 ? 'hoch' : t < 0 ? 'runter' : ''}">${t > 0 ? '▲' : t < 0 ? '▼' : '•'} ${komma(Math.abs(t).toFixed(1))} %</span>`}</small></span>
        <span class="z-preis gruen-text">${marktPreis(x.i.ah?.min)}<small>${vor(x.at)}</small></span></a></li>`;
    };
    const html = e.map(zeile).join('') || '<li class="zeile-leer">Gerade ist es ruhig. Schau gleich nochmal vorbei.</li>';
    if (feed.dataset.stand !== html) { feed.innerHTML = html; feed.dataset.stand = html; }
    text('#live-stand', `Stand ${new Date().toLocaleTimeString('de-DE', { hour: '2-digit', minute: '2-digit', second: '2-digit' })}`);
  }
  $$('.live-filter [data-filter]').forEach(b => b.addEventListener('click', () => {
    feedFilter = b.dataset.filter;
    $$('.live-filter [data-filter]').forEach(x => x.setAttribute('aria-selected', String(x === b)));
    if (DATEN) feedZeigen(DATEN);
  }));
  // Markt-Daten regelmäßig frisch holen, wo sie gebraucht werden
  if ($('#live-feed') || $('#ticker')) {
    marktHolen().then(() => { if (DATEN) { tickerZeigen(DATEN); feedZeigen(DATEN); } });
    setInterval(() => {
      if (document.hidden) return;
      marktLaeuft = null;
      marktHolen().then(() => { if (DATEN) { tickerZeigen(DATEN); feedZeigen(DATEN); } });
    }, feed ? 30000 : 120000);
  }

  /* ==========================================================
     Spieler-Profil
     ========================================================== */
  const PROFIL = $('#profil');
  function profilZeigen(d) {
    if (!PROFIL) return;
    const name = PROFIL.dataset.name;
    let clan = null, mitglied = null;
    for (const c of d.clans || []) { const m = c.mitglieder.find(x => x.name.toLowerCase() === name.toLowerCase()); if (m) { clan = c; mitglied = m; break; } }
    if (!mitglied) return;
    text('#profil-name', mitglied.name);
    text('#profil-clan', `${clan.key} · ${clan.name}`);
    text('#profil-clan2', clan.name);
    if (mitglied.seit) text('#pz-seit', new Date(mitglied.seit).toLocaleDateString('de-DE', { day: 'numeric', month: 'short', year: 'numeric' }));
    const liste = d.vouches?.haendler || [];
    const k = liste.findIndex(h => h.name.toLowerCase() === name.toLowerCase());
    const h = liste[k];
    text('#pz-vouches', h ? tausend(h.anzahl) : '0');
    text('#pz-schnitt', h ? `${komma(h.schnitt)} ★` : '–');
    text('#pz-rang', h ? `#${k + 1}` : '–');
    const eigene = (d.vouches?.neueste || []).filter(v => (v.haendler || '').toLowerCase() === name.toLowerCase());
    $('#profil-vouches').innerHTML = eigene.map(v => `<li class="zeile zeile-vouch"><img class="z-kopf" src="${kopf24(v.von)}" alt="" width="32" height="32" loading="lazy"><span class="z-text"><b>${esc(v.von)}</b><small>„${esc(v.text)}“${v.was ? ` · ${esc(v.was)}` : ''}</small></span><span class="z-preis">${sterneKurz(v.sterne)}<small>${v.at ? vor(v.at) : ''}</small></span></li>`).join('')
      || `<li class="zeile-leer">${h ? 'Die Bewertungen sind älter und stehen nicht mehr in der Liste der neuesten.' : `${esc(mitglied.name)} hat noch keine Bewertungen. Nach deinem Handel kannst du mit <code>/vouch</code> die erste abgeben.`}</li>`;
    const andere = clan.mitglieder.filter(m => m !== mitglied).slice(0, 24);
    $('#profil-andere').innerHTML = andere.map((m, i) => `<a class="chip" style="--i:${i}" href="/spieler/${encodeURIComponent(m.name)}"><img class="chip-kopf" src="${kopf24(m.name)}" alt="" width="28" height="28" loading="lazy"><span>${esc(m.name)}</span></a>`).join('');
    document.title = `${mitglied.name} – CoreMarket Händler`;
  }
  $('#profil-kopieren')?.addEventListener('click', async () => {
    const n = $('#profil-name').textContent;
    try { await navigator.clipboard.writeText(n); toast(`„${n}“ kopiert`); } catch { toast('Kopieren ging nicht'); }
  });
  $('#profil-koerper')?.addEventListener('error', e => { e.target.closest('.profil-figur')?.classList.add('ohne-skin'); });

  /* ---------- Spawner-Bilder: Mob hinter dem echten Spawner-Käfig ---------- */
  document.addEventListener('load', e => {
    const img = e.target;
    if (img instanceof HTMLImageElement && img.classList.contains('spi-tex')) img.parentElement.classList.add('tex');
  }, true);
  document.addEventListener('error', e => {
    const img = e.target;
    if (img instanceof HTMLImageElement && img.classList.contains('spi-tex')) img.remove();
  }, true);

  /* ---------- Daten anwenden ---------- */
  let erstesMal = true;
  function anwenden(d) {
    if (d.marke) { text('#marke', d.marke); text('#marke2', d.marke); }
    if (d.text) text('#ueber', d.text);
    discord(d.invite);
    if (d.live && $('#live')) {
      $('#live-punkt').className = 'punkt ' + (d.live.online ? 'an' : 'aus');
      text('#live', d.live.online ? `${tausend(d.live.spieler)} Spieler gerade auf ${d.server || 'HugoSMP'}` : `${d.server || 'HugoSMP'} ist gerade nicht erreichbar`);
    }
    DATEN = d;
    onlineZeigen(d);
    kachelnZeigen(d);
    if (d.preise) {
      tabelleZeigen(d.preise, erstesMal); vorschauZeigen(d.preise); laufbandZeigen(d.preise); kaefigZeigen(d.preise); rechnerFuellen(d.preise);
      chipsZeigen(d.preise); listenZeigen(d.preise); spawnerSeite(d);
    } else fehler('Gerade sind keine Preise freigegeben.');
    vouchFeed(d.vouches);
    if (erstesMal) marktPaneel();
    merkZeigen(d); merkKnoepfe();
    tickerZeigen(d); feedZeigen(d); profilZeigen(d);
    CLANS = d.clans || [];
    clansZeigen(suche ? suche.value : '');
    vouchesZeigen(d.vouches);
    zahlenZeigen(d);
    // Kurzinfos in den Karten auf der Startseite
    const anzahl = CLANS.reduce((n, c) => n + (c.anzahl || 0), 0);
    if (anzahl) text('#weg-clan', `${tausend(anzahl)} Spieler in CM0 und CM1`);
    if (d.vouches?.anzahl) text('#weg-vouch', `${komma(d.vouches.schnitt)} ★ aus ${tausend(d.vouches.anzahl)} Bewertungen`);
    if (d.stand) text('#fuss-stand', `Daten vom ${zeit(d.stand)}${d._alt ? ' (Bot gerade nicht erreichbar)' : ''}`);
    erstesMal = false;
  }

  function fehler(t) {
    if ($('#rechner')) $('#rechner').hidden = true;
    if ($('#laufband')) $('#laufband').hidden = true;
    const body = $('#preis-tabelle tbody');
    if (body) body.innerHTML = `<tr><td colspan="3" class="leer">${esc(t)}</td></tr>`;
    if ($('#vorschau')) $('#vorschau').innerHTML = `<p class="leer">${esc(t)}</p>`;
    if ($('#clans') && !CLANS.length) $('#clans').innerHTML = `<p class="leer">${esc(t)}</p>`;
    kaefigSetzen({ name: 'Preise', preis: '?', art: 'gerade nicht erreichbar' });
  }

  async function laden() {
    try {
      const r = await fetch('/api/daten', { cache: 'no-store' });
      if (!r.ok) throw new Error(`HTTP ${r.status}`);
      anwenden(await r.json());
      return true;
    } catch (e) {
      console.warn(e);
      return false;
    }
  }

  discord();
  if (start.daten) anwenden(start.daten);
  else laden().then(ok => { if (!ok) fehler(FEHLER); });
  setInterval(() => { if (!document.hidden) laden(); }, 60000); // still nachladen, solange der Tab offen ist

  beobachte();

  /* ---------- Nach oben ---------- */
  const hoch = $('#nach-oben');
  let tick = false;
  const scroll = () => { tick = false; hoch?.classList.toggle('da', scrollY > innerHeight * 1.2); $('#kopf')?.classList.toggle('gescrollt', scrollY > 4); };
  addEventListener('scroll', () => { if (!tick) { tick = true; requestAnimationFrame(scroll); } }, { passive: true });
  scroll();
  hoch?.addEventListener('click', e => { e.preventDefault(); scrollTo({ top: 0, behavior: ruhig ? 'auto' : 'smooth' }); });

  /* ---------- Seitenleiste: am PC ein-/ausklappen (wird gemerkt), am Handy als Schublade ---------- */
  const leisteKnopf = $('#leiste-knopf'), schatten = $('#leiste-schatten'), B = document.body;
  const handy = () => matchMedia('(max-width: 899px)').matches;
  const merken = (k, v) => { try { localStorage.setItem(k, v); } catch { /* egal */ } };
  const holen = k => { try { return localStorage.getItem(k); } catch { return null; } };
  const wunsch = holen('cm-leiste');
  if (wunsch === 'schmal') B.classList.add('leiste-schmal');
  if (wunsch === 'breit') B.classList.add('leiste-breit');
  const istSchmal = () => B.classList.contains('leiste-schmal') || (!B.classList.contains('leiste-breit') && matchMedia('(max-width: 1199px)').matches);
  const schubladeZu = () => { B.classList.remove('leiste-offen'); if (schatten) schatten.hidden = true; leisteKnopf?.setAttribute('aria-expanded', 'false'); };
  leisteKnopf?.addEventListener('click', () => {
    if (handy()) {
      const auf = B.classList.toggle('leiste-offen');
      schatten.hidden = !auf; leisteKnopf.setAttribute('aria-expanded', String(auf));
      return;
    }
    const schmal = !istSchmal();
    B.classList.toggle('leiste-schmal', schmal); B.classList.toggle('leiste-breit', !schmal);
    merken('cm-leiste', schmal ? 'schmal' : 'breit');
  });
  schatten?.addEventListener('click', schubladeZu);
  $$('#seitenleiste a').forEach(a => a.addEventListener('click', () => { if (handy()) schubladeZu(); }));
  addEventListener('keydown', e => { if (e.key === 'Escape') schubladeZu(); });

  /* ---------- Überschrift Wort für Wort ---------- */
  const h1 = $('.held h1, .seitenkopf h1');
  if (h1 && !ruhig) {
    let w = 0;
    const wort = (txt, klasse) => {
      const aussen = document.createElement('span'); aussen.className = 'wort';
      const innen = document.createElement('span'); innen.textContent = txt; innen.style.setProperty('--w', w++);
      if (klasse) innen.className = klasse;
      aussen.append(innen); return aussen;
    };
    const teile = [];
    h1.childNodes.forEach(n => {
      if (n.nodeType === 3) n.textContent.split(/(\s+)/).forEach(t => teile.push(/^\s+$/.test(t) ? document.createTextNode(t) : t ? wort(t) : null));
      else if (n.nodeName === 'BR') teile.push(n.cloneNode());
      else n.textContent.split(/(\s+)/).forEach(t => teile.push(/^\s+$/.test(t) ? document.createTextNode(t) : t ? wort(t, n.className) : null));
    });
    h1.setAttribute('aria-label', h1.textContent.replace(/\s+/g, ' ').trim());
    h1.replaceChildren(...teile.filter(Boolean));
    h1.classList.remove('auftritt');
  }

  /* ---------- Lichtschein unter der Maus ---------- */
  if (!ruhig && matchMedia('(hover: hover)').matches) {
    const LICHT = '.vorschau-karte, .weg, .zitat, .schritt, .clan, .warum-punkt, .rang, .regeln li, .tabelle-rahmen, .wiki-karte';
    addEventListener('pointermove', e => {
      const el = e.target.closest?.(LICHT);
      if (!el) return;
      const r = el.getBoundingClientRect();
      el.style.setProperty('--mx', `${e.clientX - r.left}px`);
      el.style.setProperty('--my', `${e.clientY - r.top}px`);
    }, { passive: true });
  }

  /* ---------- Wiki: Suche ---------- */
  const wikiSuche = $('#wiki-suche'), wikiTreffer = $('#wiki-treffer');
  if (wikiSuche && wikiTreffer) {
    let index = [];
    try { index = JSON.parse($('#wiki-index').textContent); } catch { /* leer */ }
    const hervor = (t, q) => { const p = t.toLowerCase().indexOf(q); return p < 0 ? esc(t) : esc(t.slice(0, p)) + '<mark>' + esc(t.slice(p, p + q.length)) + '</mark>' + esc(t.slice(p + q.length)); };
    let auswahl = -1;
    const zeigen = () => {
      const q = wikiSuche.value.trim().toLowerCase();
      auswahl = -1;
      if (!q) { wikiTreffer.hidden = true; return; }
      const woerter = q.split(/\s+/);
      const liste = index
        .map(a => {
          const titel = a.t.toLowerCase(), beschr = a.b.toLowerCase();
          if (!woerter.every(w => titel.includes(w) || beschr.includes(w) || a.x.includes(w))) return null;
          return { a, punkte: (titel.includes(q) ? 10 : 0) + (beschr.includes(q) ? 4 : 0) + woerter.filter(w => titel.includes(w)).length * 2 };
        })
        .filter(Boolean).sort((x, y) => y.punkte - x.punkte).slice(0, 8);
      wikiTreffer.innerHTML = liste.length
        ? liste.map(({ a }) => `<a href="/wiki/${esc(a.s)}"><span class="kat">${esc(a.k)}</span>${hervor(a.t, q)}<small>${hervor(a.b, q)}</small></a>`).join('')
        : `<p class="nichts">Nichts gefunden zu „${esc(wikiSuche.value)}“. Frag im Discord – wir helfen dir.</p>`;
      wikiTreffer.hidden = false;
    };
    wikiSuche.addEventListener('input', zeigen);
    wikiSuche.addEventListener('focus', zeigen);
    wikiSuche.addEventListener('keydown', e => {
      const links = [...wikiTreffer.querySelectorAll('a')];
      if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
        e.preventDefault();
        if (!links.length) return;
        auswahl = (auswahl + (e.key === 'ArrowDown' ? 1 : -1) + links.length) % links.length;
        links.forEach((l, k) => l.classList.toggle('markiert', k === auswahl));
        links[auswahl].scrollIntoView({ block: 'nearest' });
      } else if (e.key === 'Enter' && links.length) {
        location.href = links[Math.max(0, auswahl)].href;
      } else if (e.key === 'Escape') { wikiTreffer.hidden = true; }
    });
    document.addEventListener('click', e => { if (!e.target.closest('.wiki-suche')) wikiTreffer.hidden = true; });
    // Taste "/" springt in die Suche
    addEventListener('keydown', e => { if (e.key === '/' && document.activeElement !== wikiSuche && !/INPUT|TEXTAREA|SELECT/.test(document.activeElement.tagName)) { e.preventDefault(); wikiSuche.focus(); } });
  }

  /* ---------- Wiki: Seitenleiste am Handy zu, Inhaltsverzeichnis folgt ---------- */
  const klapp = $('.wiki-leiste-klapp');
  if (klapp && matchMedia('(max-width: 900px)').matches) klapp.open = false;
  const tocLinks = [...$$('.wiki-toc a')];
  if (tocLinks.length && 'IntersectionObserver' in window) {
    const ziele = tocLinks.map(a => document.getElementById(a.getAttribute('href').slice(1))).filter(Boolean);
    const io = new IntersectionObserver(es => es.forEach(e => {
      if (e.isIntersecting) tocLinks.forEach(a => a.classList.toggle('aktiv', a.getAttribute('href') === '#' + e.target.id));
    }), { rootMargin: '-20% 0px -70% 0px' });
    ziele.forEach(z => io.observe(z));
  }

  /* ---------- Käfig folgt leicht der Maus ---------- */
  const kaefig = $('#kaefig');
  if (kaefig && !ruhig && matchMedia('(hover: hover) and (pointer: fine)').matches) {
    const buehne = kaefig.closest('.kaefig-buehne');
    buehne.addEventListener('pointermove', e => {
      const r = buehne.getBoundingClientRect();
      const x = (e.clientX - r.left) / r.width - .5, y = (e.clientY - r.top) / r.height - .5;
      kaefig.style.transform = `rotateY(${x * 14}deg) rotateX(${-y * 14}deg)`;
    });
    buehne.addEventListener('pointerleave', () => { kaefig.style.transform = ''; });
  }
})();
