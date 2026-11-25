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
    const html = P.spawner.map((s, i) => `<tr${erstes ? ` class="neu" style="--i:${i}"` : ''}><td>${esc(s.name)}</td>${zelle(s.ankauf, s.ankaufAb, s.ankaufStaffel, 'kaufen')}${zelle(s.verkauf, s.verkaufAb, s.verkaufStaffel, 'verkaufen')}</tr>`).join('')
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
      const zelle = tr.cells[0];
      if (!zelle || tr.cells.length < 3) return;
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
    if (!P.spawner.length) { $('#rechner').hidden = true; return; }
    $('#rechner').hidden = false;
    const alt = sel.value;
    SPAWNER = P.spawner;
    sel.innerHTML = SPAWNER.map((x, k) => `<option value="${k}">${esc(x.name)}</option>`).join('');
    if (alt && SPAWNER[+alt]) sel.value = alt;
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
        ${l.length ? `<ul class="spieler">${l.map((m, i) => `<li style="--i:${i}" title="Dabei seit ${esc(datum(m.seit))}"><img src="${kopf(m.name)}" alt="" width="32" height="32" loading="lazy"><span>${markiere(m.name)}</span></li>`).join('')}</ul>` : '<p class="leer">Noch keine Mitglieder eingetragen.</p>'}</div>`;
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
    if (d.preise) {
      tabelleZeigen(d.preise, erstesMal); vorschauZeigen(d.preise); laufbandZeigen(d.preise); kaefigZeigen(d.preise); rechnerFuellen(d.preise);
    } else fehler('Gerade sind keine Preise freigegeben.');
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

  /* ---------- Kopf, Fortschritt, Nach-oben ---------- */
  const kopfEl = $('#kopf'), balken = $('#fortschritt'), hoch = $('#nach-oben');
  let tick = false;
  const scroll = () => {
    tick = false;
    const y = scrollY, max = document.documentElement.scrollHeight - innerHeight;
    kopfEl.classList.toggle('gescrollt', y > 10);
    balken.style.setProperty('--p', max > 0 ? (y / max).toFixed(4) : 0);
    hoch.classList.toggle('da', y > innerHeight * 1.2);
  };
  addEventListener('scroll', () => { if (!tick) { tick = true; requestAnimationFrame(scroll); } }, { passive: true });
  scroll();
  hoch.addEventListener('click', e => { e.preventDefault(); scrollTo({ top: 0, behavior: ruhig ? 'auto' : 'smooth' }); });

  /* ---------- Menü (Handy) ---------- */
  const mk = $('#menue-knopf'), menue = $('#menue');
  const menueZu = () => { menue.classList.remove('offen'); mk.setAttribute('aria-expanded', 'false'); mk.setAttribute('aria-label', 'Menü öffnen'); };
  mk.addEventListener('click', () => {
    const o = menue.classList.toggle('offen');
    mk.setAttribute('aria-expanded', String(o)); mk.setAttribute('aria-label', o ? 'Menü schließen' : 'Menü öffnen');
  });
  addEventListener('keydown', e => { if (e.key === 'Escape') menueZu(); });

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
    const LICHT = '.vorschau-karte, .weg, .zitat, .schritt, .clan, .warum-punkt, .rang, .regeln li, .tabelle-rahmen';
    addEventListener('pointermove', e => {
      const el = e.target.closest?.(LICHT);
      if (!el) return;
      const r = el.getBoundingClientRect();
      el.style.setProperty('--mx', `${e.clientX - r.left}px`);
      el.style.setProperty('--my', `${e.clientY - r.top}px`);
    }, { passive: true });
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
