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

  let start = {};
  try { start = JSON.parse($('#start-daten')?.textContent || '{}'); } catch { /* egal, dann wird geladen */ }

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

  /* ---------- Preise ---------- */
  let kaefigTimer = null;
  function preiseZeigen(P, erstes) {
    const body = $('#preis-tabelle tbody');
    if (!P) { $('#preise').hidden = true; $('#laufband').hidden = true; return; }
    $('#preise').hidden = false;
    if (P.aktualisiert) $('#preis-stand').textContent = `Zuletzt geändert am ${zeit(P.aktualisiert)}`;
    const zelle = (v, ab, st, klasse) => {
      if (leer(v)) return `<td class="${klasse}"><span class="stop" title="Gerade kein Handel">STOP</span></td>`;
      const staffel = ab ? `<span class="staffel">ab ${ab} Stück: ${leer(st) ? 'Basispreis' : preis(st)}</span>` : '';
      return `<td class="${klasse}"><span class="betrag">${preis(v)}</span>${staffel}</td>`;
    };
    const html = P.spawner.map((s, i) => `<tr${erstes ? ` class="neu" style="--i:${i}"` : ''}><td>${esc(s.name)}</td>${zelle(s.ankauf, s.ankaufAb, s.ankaufStaffel, 'kaufen')}${zelle(s.verkauf, s.verkaufAb, s.verkaufStaffel, 'verkaufen')}</tr>`).join('')
      || '<tr><td colspan="3" class="leer">Gerade keine Preise eingetragen.</td></tr>';
    if (body.innerHTML !== html) body.innerHTML = html;

    // Laufband
    const band = P.spawner.filter(s => !leer(s.verkauf)).map(s => `<span>${esc(s.name)} <b>${preis(s.verkauf)}</b></span>`);
    if (band.length) {
      const spur = $('#laufband-spur');
      let teile = band;
      while (teile.length < 8) teile = teile.concat(band); // genug für breite Bildschirme
      const neu = teile.join('') + teile.join(''); // zweimal hintereinander -> nahtlose Schleife
      if (spur.innerHTML !== neu) { spur.innerHTML = neu; spur.style.setProperty('--dauer', `${teile.length * 3.2}s`); }
      $('#laufband').hidden = false;
    }

    // Käfig: zeigt reihum die aktuellen Preise
    const liste = P.spawner.flatMap(s => [
      !leer(s.verkauf) ? { name: s.name, p: s.verkauf, art: 'kaufst du bei uns' } : null,
      !leer(s.ankauf) ? { name: s.name, p: s.ankauf, art: 'zahlen wir dir' } : null,
    ]).filter(Boolean);
    clearInterval(kaefigTimer);
    if (!liste.length) return kaefigSetzen({ name: 'Gerade', preis: 'STOP', art: 'kein Handel' });
    let i = 0;
    const naechster = () => { const x = liste[i++ % liste.length]; kaefigSetzen({ name: x.name, preis: preis(x.p), art: x.art }, i > 1); };
    naechster();
    if (liste.length > 1 && !ruhig) kaefigTimer = setInterval(naechster, 3400);
  }

  function kaefigSetzen(x, animiert) {
    const box = $('.kaefig-inhalt');
    const setzen = () => {
      $('#k-name').textContent = x.name; $('#k-preis').textContent = x.preis; $('#k-art').textContent = x.art;
      box.classList.remove('raus'); box.classList.remove('rein'); void box.offsetWidth; box.classList.add('rein');
    };
    if (!animiert || ruhig) return setzen();
    box.classList.remove('rein'); box.classList.add('raus');
    setTimeout(setzen, 280);
  }

  /* ---------- Rechner ---------- */
  let SPAWNER = [];
  function rechnerFuellen(P) {
    if (!P || !P.spawner.length) { $('#rechner').hidden = true; return; }
    $('#rechner').hidden = false;
    const sel = $('#r-spawner'), alt = sel.value;
    SPAWNER = P.spawner;
    sel.innerHTML = SPAWNER.map((x, k) => `<option value="${k}">${esc(x.name)}</option>`).join('');
    if (alt && SPAWNER[+alt]) sel.value = alt;
    rechnen(false);
  }
  let letzteSumme = '';
  function rechnen(pop = true) {
    const s = SPAWNER[+$('#r-spawner').value];
    const feld = $('#r-menge');
    const menge = Math.max(1, Math.min(10000, Math.round(+feld.value || 1)));
    const kaufen = $('input[name="r-art"]:checked').value === 'kaufen';
    const summe = $('.r-summe'), info = $('#r-ergebnis small');
    if (!s) { summe.textContent = '–'; info.textContent = ''; return; }
    const basis = kaufen ? s.verkauf : s.ankauf, ab = kaufen ? s.verkaufAb : s.ankaufAb, st = kaufen ? s.verkaufStaffel : s.ankaufStaffel;
    let text;
    if (leer(basis)) {
      text = 'STOP'; summe.classList.add('stop-text');
      info.textContent = `${s.name} ${kaufen ? 'verkaufen' : 'kaufen'} wir gerade nicht.`;
    } else {
      const staffelGilt = ab && menge >= ab && !leer(st);
      const stueck = staffelGilt ? st : basis;
      text = preis(Math.round(stueck * menge * 100) / 100); summe.classList.remove('stop-text');
      let zusatz = `${menge}× ${preis(stueck)}${stueck !== basis ? ' (Mengenpreis)' : ''}, ${kaufen ? 'du zahlst' : 'du bekommst'}`;
      if (ab && menge < ab && !leer(st) && st !== basis) zusatz += `. Ab ${ab} Stück${kaufen ? ' nur' : ''} ${preis(st)} pro Stück`;
      info.textContent = zusatz;
    }
    summe.textContent = text;
    if (pop && text !== letzteSumme && !ruhig) { summe.classList.remove('pop'); void summe.offsetWidth; summe.classList.add('pop'); }
    letzteSumme = text;
  }
  $('#rechner-form').addEventListener('submit', e => e.preventDefault());
  $('#rechner-form').addEventListener('input', () => rechnen());
  $('#rechner-form').addEventListener('change', () => rechnen());
  $$('.menge button').forEach(b => b.addEventListener('click', () => {
    const f = $('#r-menge');
    f.value = Math.max(1, Math.min(10000, (Math.round(+f.value) || 1) + Number(b.dataset.schritt)));
    rechnen();
  }));

  /* ---------- Clan ---------- */
  let CLANS = [];
  function clansZeigen(filter = '') {
    const q = filter.trim().toLowerCase(), ziel = $('#clans');
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
    ziel.innerHTML = html || `<p class="leer">Niemand mit „${esc(filter)}“ in unserem Clan. Wer nicht hier steht, handelt nicht in unserem Namen.</p>`;
    ziel.querySelectorAll('img').forEach(img => img.addEventListener('error', () => img.classList.add('kaputt'), { once: true }));
  }
  let suchTimer;
  $('#suche').addEventListener('input', e => { clearTimeout(suchTimer); suchTimer = setTimeout(() => clansZeigen(e.target.value), 90); });

  /* ---------- Vouches ---------- */
  function vouchesZeigen(V) {
    if (!V) { $('#vouches').hidden = true; return; }
    $('#vouches').hidden = false;
    if (V.anzahl) $('#vouch-schnitt').textContent = `${komma(V.schnitt)} von 5 Sternen aus ${tausend(V.anzahl)} Bewertungen`;
    const sterne = n => Array.from({ length: 5 }, (_, k) => `<span class="${k < n ? '' : 'aus'}" style="--s:${k}">★</span>`).join('');
    if (V.neueste?.length) {
      $('#zitate').innerHTML = V.neueste.map((v, i) => `<figure class="zitat zeigen" style="--i:${i % 4}"><span class="sterne" role="img" aria-label="${v.sterne} von 5 Sternen">${sterne(v.sterne)}</span><blockquote>„${esc(v.text)}“</blockquote><figcaption>${esc(v.von)}${v.haendler ? ` über ${esc(v.haendler)}` : ''}${v.was ? `, ${esc(v.was)}` : ''}</figcaption></figure>`).join('');
      beobachte($('#zitate'));
    }
    if (V.haendler?.length) {
      $('#rang').hidden = false;
      $('#rang-liste').innerHTML = V.haendler.map(h => `<li><span>${esc(h.name)}${h.clan ? ` <small>${esc(h.clan)}</small>` : ''}</span><span class="wert">${tausend(h.anzahl)} · Ø ${komma(h.schnitt)} <span class="sterne">★</span></span></li>`).join('');
    }
  }

  /* ---------- Kennzahlen ---------- */
  let zahlenGezeigt = false;
  function zahlenZeigen(d) {
    const z = d.zahlen || {}, teile = [];
    if (z.spawner) teile.push([z.spawner, 'Spawner gehandelt', n => tausend(Math.round(n))]);
    if (z.mitglieder) teile.push([z.mitglieder, 'Spieler in CM0 und CM1', n => tausend(Math.round(n))]);
    if (d.vouches?.anzahl) teile.push([d.vouches.schnitt, 'Ø Bewertung', n => komma(n.toFixed(1)) + ' ★']);
    if (!teile.length) return;
    const dl = $('#zahlen');
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
    if (d.marke) {
      document.title = `${d.marke} – Spawner kaufen und verkaufen auf HugoSMP`;
      $('#marke').textContent = d.marke; $('#marke2').textContent = d.marke;
    }
    if (d.text) $('#ueber').textContent = d.text;
    discord(d.invite);
    if (d.live) {
      const p = $('#live-punkt');
      p.className = 'punkt ' + (d.live.online ? 'an' : 'aus');
      $('#live').textContent = d.live.online ? `${tausend(d.live.spieler)} Spieler gerade auf ${d.server || 'HugoSMP'}` : `${d.server || 'HugoSMP'} ist gerade nicht erreichbar`;
    }
    preiseZeigen(d.preise, erstesMal);
    rechnerFuellen(d.preise);
    CLANS = d.clans || [];
    clansZeigen($('#suche').value);
    vouchesZeigen(d.vouches);
    zahlenZeigen(d);
    if (d.stand) $('#fuss-stand').textContent = `Daten vom ${zeit(d.stand)}${d._alt ? ' (Bot gerade nicht erreichbar)' : ''}`;
    erstesMal = false;
  }

  function fehler(text) {
    $('#rechner').hidden = true;
    $('#laufband').hidden = true;
    $('#preis-tabelle tbody').innerHTML = `<tr><td colspan="3" class="leer">${esc(text)}</td></tr>`;
    $('#clans').innerHTML = `<p class="leer">${esc(text)}</p>`;
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
  else laden().then(ok => { if (!ok) fehler('Die aktuellen Daten sind gerade nicht erreichbar. Schau im Discord vorbei – dort stehen die Preise immer aktuell.'); });
  // Alle 60 Sekunden still nachladen, solange der Tab offen ist
  setInterval(() => { if (!document.hidden) laden(); }, 60000);

  beobachte();

  /* ---------- Kopf, Fortschritt, aktiver Menüpunkt ---------- */
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

  const links = [...$$('#menue a')];
  if ('IntersectionObserver' in window) {
    const io = new IntersectionObserver(es => es.forEach(e => {
      if (!e.isIntersecting) return;
      links.forEach(a => a.classList.toggle('aktiv', a.getAttribute('href') === '#' + e.target.id));
    }), { rootMargin: '-45% 0px -50% 0px' });
    links.forEach(a => { const s = document.querySelector(a.getAttribute('href')); if (s) io.observe(s); });
  }

  hoch.addEventListener('click', e => { e.preventDefault(); scrollTo({ top: 0, behavior: ruhig ? 'auto' : 'smooth' }); });

  /* ---------- Menü (Handy) ---------- */
  const mk = $('#menue-knopf'), menue = $('#menue');
  const menueZu = () => { menue.classList.remove('offen'); mk.setAttribute('aria-expanded', 'false'); mk.setAttribute('aria-label', 'Menü öffnen'); };
  mk.addEventListener('click', () => {
    const o = menue.classList.toggle('offen');
    mk.setAttribute('aria-expanded', String(o)); mk.setAttribute('aria-label', o ? 'Menü schließen' : 'Menü öffnen');
  });
  links.forEach(a => a.addEventListener('click', menueZu));
  addEventListener('keydown', e => { if (e.key === 'Escape') menueZu(); });

  /* ---------- Käfig folgt leicht der Maus ---------- */
  const kaefig = $('#kaefig');
  if (!ruhig && matchMedia('(hover: hover) and (pointer: fine)').matches) {
    const buehne = kaefig.parentElement;
    buehne.addEventListener('pointermove', e => {
      const r = buehne.getBoundingClientRect();
      const x = (e.clientX - r.left) / r.width - .5, y = (e.clientY - r.top) / r.height - .5;
      kaefig.style.transform = `rotateY(${x * 14}deg) rotateX(${-y * 14}deg)`;
    });
    buehne.addEventListener('pointerleave', () => { kaefig.style.transform = ''; });
  }
})();
