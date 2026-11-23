'use strict';
(() => {
  const CFG = window.COREMARKET || {};
  const $ = s => document.querySelector(s);
  const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
  // 14.5 → "14,5M" · 0.5 → "500K" · null → STOP (wie im Discord)
  const preis = v => v === null || v === undefined ? null : v >= 1 ? `${(Math.round(v * 100) / 100).toFixed(Math.round(v * 100) % 10 ? 2 : 1).replace('.', ',')}M` : `${Math.round(v * 1000)}K`;
  const datum = t => new Date(t).toLocaleDateString('de-DE', { day: 'numeric', month: 'long', year: 'numeric' });
  const zeit = t => new Date(t).toLocaleString('de-DE', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' });
  const tausend = n => Number(n || 0).toLocaleString('de-DE');
  const kopf = name => `https://mc-heads.net/avatar/${encodeURIComponent(String(name).replace(/^[.*]/, ''))}/32`;

  function discord(link) {
    const url = link || CFG.discord || '';
    document.querySelectorAll('.discord-link').forEach(a => { if (url) a.href = url; else { a.removeAttribute('href'); a.setAttribute('aria-disabled', 'true'); a.title = 'Einladung folgt'; } });
  }

  function preiseZeigen(P) {
    const body = $('#preis-tabelle tbody');
    if (!P) { $('#preise').hidden = true; return; }
    if (P.aktualisiert) $('#preis-stand').textContent = `Zuletzt geändert am ${zeit(P.aktualisiert)}`;
    const zelle = (v, ab, st, klasse) => {
      if (v === null || v === undefined) return `<td class="${klasse}"><span class="stop" title="Gerade kein Handel">STOP</span></td>`;
      const staffel = ab ? `<span class="staffel">ab ${ab} Stück: ${st === null || st === undefined ? 'Basispreis' : preis(st)}</span>` : '';
      return `<td class="${klasse}"><span class="betrag">${preis(v)}</span>${staffel}</td>`;
    };
    body.innerHTML = P.spawner.map(s => `<tr><td>${esc(s.name)}</td>${zelle(s.ankauf, s.ankaufAb, s.ankaufStaffel, 'kaufen')}${zelle(s.verkauf, s.verkaufAb, s.verkaufStaffel, 'verkaufen')}</tr>`).join('')
      || '<tr><td colspan="3" class="leer">Gerade keine Preise eingetragen.</td></tr>';

    // Käfig: zeigt reihum die Spawner, die wir gerade verkaufen
    const liste = P.spawner.flatMap(s => [s.verkauf !== null ? { name: s.name, p: s.verkauf, art: 'kaufst du bei uns' } : null, s.ankauf !== null ? { name: s.name, p: s.ankauf, art: 'zahlen wir dir' } : null]).filter(Boolean);
    if (!liste.length) { $('#k-name').textContent = 'Gerade'; $('#k-preis').textContent = 'STOP'; $('#k-art').textContent = 'kein Handel'; return; }
    let i = 0; const box = $('.kaefig-inhalt');
    const zeige = () => { const x = liste[i % liste.length]; i++; box.classList.remove('wechsel'); void box.offsetWidth; box.classList.add('wechsel'); $('#k-name').textContent = x.name; $('#k-preis').textContent = preis(x.p); $('#k-art').textContent = x.art; };
    zeige();
    if (liste.length > 1 && !matchMedia('(prefers-reduced-motion: reduce)').matches) setInterval(zeige, 3200);
  }

  let CLANS = [];
  function clansZeigen(filter = '') {
    const q = filter.trim().toLowerCase(), ziel = $('#clans');
    const html = CLANS.map(c => {
      const l = c.mitglieder.filter(m => !q || m.name.toLowerCase().includes(q));
      if (q && !l.length) return '';
      return `<div class="clan"><h3><span class="kuerzel">${esc(c.key)}</span> ${esc(c.name)}<span class="anz">${c.anzahl} Mitglied${c.anzahl === 1 ? '' : 'er'}</span></h3>
        ${l.length ? `<ul class="spieler">${l.map(m => `<li title="Dabei seit ${esc(datum(m.seit))}"><img src="${kopf(m.name)}" alt="" width="32" height="32" loading="lazy" onerror="this.style.visibility='hidden'"><span>${esc(m.name)}</span></li>`).join('')}</ul>` : '<p class="leer">Noch keine Mitglieder eingetragen.</p>'}</div>`;
    }).join('');
    ziel.innerHTML = html || `<p class="leer">Niemand mit „${esc(filter)}“ in unserem Clan. Wer nicht hier steht, handelt nicht in unserem Namen.</p>`;
  }

  function vouchesZeigen(V) {
    if (!V) { $('#vouches').hidden = true; return; }
    if (V.anzahl) $('#vouch-schnitt').textContent = `${String(V.schnitt).replace('.', ',')} von 5 Sternen aus ${tausend(V.anzahl)} Bewertungen`;
    if (V.neueste.length) $('#zitate').innerHTML = V.neueste.map(v => `<figure class="zitat"><span class="sterne" aria-label="${v.sterne} von 5 Sternen">${'★'.repeat(v.sterne)}${'☆'.repeat(5 - v.sterne)}</span><blockquote>„${esc(v.text)}“</blockquote><figcaption>${esc(v.von)}${v.haendler ? ` über ${esc(v.haendler)}` : ''}${v.was ? `, ${esc(v.was)}` : ''}</figcaption></figure>`).join('');
    if (V.haendler.length) { $('#rang').hidden = false; $('#rang-liste').innerHTML = V.haendler.map(h => `<li><span>${esc(h.name)}${h.clan ? ` <small>${esc(h.clan)}</small>` : ''}</span><span>${h.anzahl} · <span class="sterne">★</span> ${String(h.schnitt).replace('.', ',')}</span></li>`).join(''); }
  }

  function zahlenZeigen(d) {
    const z = d.zahlen || {}, teile = [];
    if (z.spawner) teile.push([tausend(z.spawner), 'Spawner gehandelt']);
    if (z.mitglieder) teile.push([tausend(z.mitglieder), 'Spieler in CM0 und CM1']);
    if (d.vouches?.anzahl) teile.push([String(d.vouches.schnitt).replace('.', ',') + ' ★', 'Durchschnittliche Bewertung']);
    if (teile.length) { $('#zahlen').hidden = false; $('#zahlen').innerHTML = teile.map(([w, l]) => `<div><dt>${l}</dt><dd>${w}</dd></div>`).join(''); }
  }

  async function laden() {
    discord('');
    if (!CFG.api) return fehler('Keine API-Adresse in config.js eingetragen.');
    try {
      const r = await fetch(CFG.api, { cache: 'no-store' });
      if (!r.ok) throw new Error(`HTTP ${r.status}`);
      const d = await r.json();
      document.title = `${d.marke} – Spawner kaufen und verkaufen auf HugoSMP`;
      $('#marke').textContent = d.marke; $('#marke2').textContent = d.marke;
      if (d.text) $('#ueber').textContent = d.text;
      discord(d.invite);
      if (d.live) { $('#live').hidden = false; $('#live-text').textContent = d.live.online ? `${tausend(d.live.spieler)} Spieler gerade auf ${d.server}` : `${d.server} ist gerade offline`; if (!d.live.online) $('.punkt').classList.add('aus'); }
      preiseZeigen(d.preise); CLANS = d.clans || []; clansZeigen(); vouchesZeigen(d.vouches); zahlenZeigen(d);
      $('#fuss-stand').textContent = `Daten vom ${zeit(d.stand)}`;
    } catch (e) { fehler('Die aktuellen Daten sind gerade nicht erreichbar. Schau im Discord vorbei – dort stehen die Preise immer aktuell.'); console.warn(e); }
  }
  function fehler(text) {
    $('#preis-tabelle tbody').innerHTML = `<tr><td colspan="3" class="leer">${esc(text)}</td></tr>`;
    $('#clans').innerHTML = `<p class="leer">${esc(text)}</p>`;
    $('#k-name').textContent = 'Preise'; $('#k-preis').textContent = '?'; $('#k-art').textContent = 'gerade nicht erreichbar';
  }
  $('#suche').addEventListener('input', e => clansZeigen(e.target.value));
  laden();
})();
