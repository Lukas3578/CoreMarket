'use strict';
/* CoreMarket: Abo (Login per /msg, Abo kaufen, Endertruhe/Inventar ansehen) und Auktionshaus live.
 * Alle Anfragen gehen an /api/konto/* auf dieser Website, der Server reicht sie an den Bot weiter. */
(() => {
  const $ = s => document.querySelector(s);
  const $$ = s => document.querySelectorAll(s);
  const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
  const ruhig = matchMedia('(prefers-reduced-motion: reduce)').matches;
  const preis = v => v === null || v === undefined ? '–' : v >= 1
    ? `${(Math.round(v * 100) / 100).toFixed(Math.round(v * 100) % 10 ? 2 : 1).replace('.', ',')}M`
    : v >= 0.001 ? `${(Math.round(v * 1e5) / 100).toString().replace('.', ',')}K` : `${Math.round(v * 1e6)}`;
  const datum = t => new Date(t).toLocaleDateString('de-DE', { day: 'numeric', month: 'long', year: 'numeric' });
  const uhr = t => new Date(t).toLocaleTimeString('de-DE', { hour: '2-digit', minute: '2-digit' });
  const vor = t => { const s = Math.max(0, Math.round((Date.now() - t) / 1000)); return s < 60 ? 'gerade eben' : s < 3600 ? `vor ${Math.round(s / 60)} Min.` : s < 86400 ? `vor ${Math.round(s / 3600)} Std.` : `am ${datum(t)}`; };
  const kopf = n => `https://mc-heads.net/avatar/${encodeURIComponent(String(n).replace(/^[.*]/, ''))}/24`;
  const MC = /^[.*]?[A-Za-z0-9_]{2,16}$/;

  /* ---------- Login merken */
  const SPEICHER = 'cm-konto';
  const token = { get() { try { return localStorage.getItem(SPEICHER) || ''; } catch { return ''; } }, set(t) { try { t ? localStorage.setItem(SPEICHER, t) : localStorage.removeItem(SPEICHER); } catch { /* privat */ } } };
  async function api(pfad, body) {
    const t = token.get();
    const r = await fetch('/api/konto/' + pfad, { method: body ? 'POST' : 'GET', cache: 'no-store', headers: { 'Content-Type': 'application/json', ...(t ? { Authorization: 'Bearer ' + t } : {}) }, body: body ? JSON.stringify(body) : undefined });
    let d = {}; try { d = await r.json(); } catch { /* leer */ }
    if (r.status === 401 && t) token.set('');
    if (!r.ok) { const e = new Error(d.error || 'Das hat nicht geklappt.'); e.status = r.status; throw e; }
    return d;
  }

  function nurText(teile) { return (teile || []).map(x => x.t).join(''); }
  /* ---------- Item-Bilder: Vanilla-Textur, sonst Block-Textur, sonst Kürzel */
  const wurzel = $('#markt') || $('#konto');
  const BILDER = wurzel?.dataset.bilder || '';
  const bildUrl = (id, art) => BILDER.replace('{art}', art).replace('{id}', encodeURIComponent(id));
  const kuerzel = n => String(n || '?').replace(/[^A-Za-zÄÖÜäöü0-9 ]/g, '').split(/\s+/).filter(Boolean).slice(0, 2).map(w => w[0]).join('').toUpperCase() || '?';
  function icon(it) {
    const id = String(it.id || '').replace(/^minecraft:/, '');
    const maske = it.ench?.length && id && BILDER ? ` style="--maske:url('${esc(bildUrl(id, 'item'))}')"` : '';
    return `<span class="mc-icon${maske ? ' glanz' : ''}"${maske} data-kurz="${esc(kuerzel(nurText(it.nameF) || it.name || id))}">${id && BILDER ? `<img src="${esc(bildUrl(id, 'item'))}" data-id="${esc(id)}" alt="" width="32" height="32" loading="lazy">` : ''}</span>`;
  }
  // Bild-Fehler: einmal Block-Textur probieren, dann Kürzel zeigen
  document.addEventListener('error', e => {
    const img = e.target; if (!(img instanceof HTMLImageElement) || !img.dataset.id) return;
    if (!img.dataset.block) { img.dataset.block = '1'; img.src = bildUrl(img.dataset.id, 'block'); return; }
    img.remove();
  }, true);

  const VZ = { protection: 'Schutz', fire_protection: 'Feuerschutz', feather_falling: 'Federfall', blast_protection: 'Explosionsschutz', projectile_protection: 'Schusssicher', respiration: 'Atmung', aqua_affinity: 'Wasseraffinität', thorns: 'Dornen', depth_strider: 'Wasserläufer', frost_walker: 'Eisläufer', binding_curse: 'Fluch der Bindung', soul_speed: 'Seelenläufer', swift_sneak: 'Huschen', sharpness: 'Schärfe', smite: 'Bann', bane_of_arthropods: 'Nemesis der Gliederfüßer', knockback: 'Rückstoß', fire_aspect: 'Verbrennung', looting: 'Plünderung', sweeping_edge: 'Schwungkraft', sweeping: 'Schwungkraft', efficiency: 'Effizienz', silk_touch: 'Behutsamkeit', unbreaking: 'Haltbarkeit', fortune: 'Glück', power: 'Stärke', punch: 'Schlag', flame: 'Flamme', infinity: 'Unendlichkeit', luck_of_the_sea: 'Glück des Meeres', lure: 'Köder', loyalty: 'Treue', impaling: 'Harpune', riptide: 'Sog', channeling: 'Entladung', multishot: 'Mehrfachschuss', quick_charge: 'Schnellladen', piercing: 'Durchschuss', mending: 'Reparatur', vanishing_curse: 'Fluch des Verschwindens', density: 'Dichte', breach: 'Bresche', wind_burst: 'Windstoß' };
  const ROEM = ['', 'I', 'II', 'III', 'IV', 'V', 'VI', 'VII', 'VIII', 'IX', 'X'];
  const verz = e => `${VZ[e.n] || e.n.replace(/_/g, ' ')}${e.l > 1 || !['mending', 'silk_touch', 'infinity', 'aqua_affinity', 'channeling', 'multishot', 'flame', 'binding_curse', 'vanishing_curse'].includes(e.n) ? ' ' + (ROEM[e.l] || e.l) : ''}`;

  /* ---------- Text genau wie im Spiel (Farben und Formatierung aus dem Item) */
  const FARBE = { black: '#000000', dark_blue: '#0000AA', dark_green: '#00AA00', dark_aqua: '#00AAAA', dark_red: '#AA0000', dark_purple: '#AA00AA', gold: '#FFAA00', gray: '#AAAAAA', dark_gray: '#555555', blue: '#5555FF', green: '#55FF55', aqua: '#55FFFF', red: '#FF5555', light_purple: '#FF55FF', yellow: '#FFFF55', white: '#FFFFFF' };
  const farbe = c => /^#[0-9a-f]{6}$/i.test(c || '') ? c : FARBE[c] || '#FFFFFF';
  const mcText = teile => (teile || []).map(x => `<span style="color:${farbe(x.c)}${x.b ? ';font-weight:700' : ''}${x.i ? ';font-style:italic' : ''}${x.u || x.s ? `;text-decoration:${[x.u && 'underline', x.s && 'line-through'].filter(Boolean).join(' ')}` : ''}"${x.o ? ' class="verschleiert"' : ''}>${esc(x.t)}</span>`).join('');
  

  /* ======================================================== Abo-Seite */
  const K = $('#konto');
  if (K) {
    let INFO = {}, ICH = null, warteTimer = null;
    const zeige = id => { $$('.konto-schritt').forEach(x => { x.hidden = x.id !== id; }); $('#konto-lade').hidden = true; };
    const fuss = () => { $('#k-fuss').hidden = !ICH; if (ICH) $('#k-ich').textContent = ICH.mc; };
    $$('[data-kopie]').forEach(b => b.addEventListener('click', async () => {
      const t = $('#' + b.dataset.kopie).textContent;
      try { await navigator.clipboard.writeText(t); b.textContent = 'Kopiert'; setTimeout(() => { b.textContent = 'Kopieren'; }, 1600); } catch { getSelection().selectAllChildren($('#' + b.dataset.kopie)); }
    }));

    async function start() {
      try { INFO = await api('info'); } catch { INFO = {}; }
      if (INFO.preis) $('#abo-einleitung').innerHTML = `Für <b>${esc(preis(INFO.preis))}</b> pro ${INFO.tage === 30 ? 'Monat' : `${INFO.tage} Tage`} siehst du die Endertruhe und das Inventar anderer Spieler${INFO.markt ? ' und das ganze Auktionshaus live' : ''}. Bezahlt wird im Spiel an unseren Bank-Account <b>${esc(INFO.bank || '')}</b>, ein Passwort brauchst du nicht.`;
      $('#k-server').textContent = INFO.server || 'HugoSMP';
      if (!INFO.an) { $('#konto-lade').textContent = 'Das Abo gibt es gerade nicht. Schau später wieder vorbei oder frag im Discord.'; return; }
      if (token.get()) { try { ICH = await api('ich'); } catch { ICH = null; } }
      weiter();
    }
    function weiter() {
      fuss(); clearTimeout(warteTimer);
      if (!ICH) return zeige('k-login');
      if (!ICH.abo.aktiv) {
        zeige('k-kaufen');
        $('#k-preis-text').innerHTML = `${ICH.abo.bis ? `Dein Abo ist am ${esc(datum(ICH.abo.bis))} abgelaufen. ` : ''}Ein Monat kostet <b>${esc(preis(INFO.preis))}</b>. Du zahlst mit <b>/pay</b> an <b>${esc(INFO.bank)}</b>, das Abo startet, sobald das Geld da ist.`;
        if (ICH.auftrag) zahlenZeigen(ICH.auftrag); else { $('#k-zahlen').hidden = true; $('#k-kaufen-form').hidden = false; }
        return;
      }
      zeige('k-tool');
      $('#k-abo-bis').textContent = `Abo läuft bis ${datum(ICH.abo.bis)}. Heute ${ICH.heute} von ${ICH.limit} Abfragen.`;
      verlaufZeigen();
    }

    // ---- Login
    $('#k-login-form').addEventListener('submit', async e => {
      e.preventDefault();
      const mc = $('#k-mc').value.trim(), knopf = e.target.querySelector('button');
      if (!MC.test(mc)) { $('#k-mc').setCustomValidity('Bitte einen gültigen Minecraft-Namen eingeben.'); $('#k-mc').reportValidity(); return; }
      $('#k-mc').setCustomValidity(''); knopf.disabled = true;
      try {
        const r = await api('login', { mc });
        $('#k-code-text').textContent = r.befehl; $('#k-code').hidden = false; $('#k-code-status').textContent = 'Warte auf deine Nachricht … Der Code gilt 10 Minuten.';
        const pruefen = async () => {
          try {
            const s = await api('login/status', { id: r.id });
            if (s.status === 'ok') { token.set(s.token); ICH = s.kunde; $('#k-code').hidden = true; return weiter(); }
            if (s.status === 'abgelaufen') { $('#k-code-status').textContent = 'Der Code ist abgelaufen. Hol dir einen neuen.'; knopf.disabled = false; return; }
          } catch { /* gleich nochmal */ }
          warteTimer = setTimeout(pruefen, 2000);
        };
        clearTimeout(warteTimer); warteTimer = setTimeout(pruefen, 2000);
      } catch (x) { $('#k-code').hidden = false; $('#k-code-text').textContent = ''; $('#k-code-status').textContent = x.message; }
      finally { setTimeout(() => { knopf.disabled = false; }, 4000); }
    });
    $('#k-mc').addEventListener('input', e => e.target.setCustomValidity(''));

    // ---- Abo kaufen
    function zahlenZeigen(a) {
      $('#k-kaufen-form').hidden = true; $('#k-zahlen').hidden = false; $('#k-pay-text').textContent = a.befehl;
      $('#k-zahlen-status').textContent = `Warte auf deine Zahlung von ${preis(a.summe)} … Nur diese Zahlung zählt fürs Abo, andere Zahlungen an uns nicht.`;
      const pruefen = async () => {
        try { ICH = await api('ich'); if (ICH.abo.aktiv) return weiter(); if (!ICH.auftrag) { $('#k-zahlen-status').textContent = 'Die Zeit für die Zahlung ist abgelaufen. Starte den Kauf einfach nochmal.'; $('#k-kaufen-form').hidden = false; return; } } catch { /* gleich nochmal */ }
        warteTimer = setTimeout(pruefen, 3000);
      };
      clearTimeout(warteTimer); warteTimer = setTimeout(pruefen, 3000);
    }
    $('#k-kaufen-form').addEventListener('submit', async e => {
      e.preventDefault();
      try { ICH = await api('abo', { monate: +$('#k-monate').value }); zahlenZeigen(ICH.auftrag); } catch (x) { $('#k-preis-text').textContent = x.message; }
    });
    $('#k-abbrechen').addEventListener('click', async () => { clearTimeout(warteTimer); try { ICH = await api('abo/abbrechen', {}); } catch { /* egal */ } weiter(); });

    // ---- Ansehen
    const ART = { ec: 'Endertruhe', inv: 'Inventar' };
    $$('input[name="art"]').forEach(r => r.addEventListener('change', () => { $('#k-art-hinweis').hidden = r.value !== 'inv' || !r.checked; }));
    $('#k-art-hinweis').hidden = true;
    $('#k-ansehen-form').addEventListener('submit', async e => {
      e.preventDefault();
      const art = $('input[name="art"]:checked').value, name = $('#k-ziel').value.trim(), knopf = e.target.querySelector('button'), erg = $('#k-ergebnis');
      if (!MC.test(name)) { $('#k-ziel').setCustomValidity('Bitte einen gültigen Minecraft-Namen eingeben.'); $('#k-ziel').reportValidity(); return; }
      $('#k-ziel').setCustomValidity(''); knopf.disabled = true; knopf.textContent = 'Wird geöffnet …';
      erg.innerHTML = `<p class="hinweis">${esc(ART[art])} von ${esc(name)} wird im Spiel geöffnet, das dauert ein paar Sekunden.</p>`;
      try {
        const r = await api('ansehen', { art, name });
        erg.innerHTML = fensterHtml(r);
        fensterKlicks(erg, r);
      } catch (x) { erg.innerHTML = `<p class="fehler-text">${esc(x.message)}</p>`; }
      finally { knopf.disabled = false; knopf.textContent = 'Ansehen'; try { ICH = await api('ich'); $('#k-abo-bis').textContent = `Abo läuft bis ${datum(ICH.abo.bis)}. Heute ${ICH.heute} von ${ICH.limit} Abfragen.`; verlaufZeigen(); } catch { /* egal */ } }
    });
    $('#k-ziel').addEventListener('input', e => e.target.setCustomValidity(''));

    function fensterHtml(r) {
      const n = Math.max(9, Math.ceil((r.groesse || 27) / 9) * 9), bySlot = new Map(r.slots.map(s => [s.slot, s]));
      const zellen = Array.from({ length: n }, (_, i) => {
        const s = bySlot.get(i);
        if (!s) return '<li class="slot"></li>';
        const d = s.dura && s.dura.max ? s.dura.rest / s.dura.max : null;
        return `<li class="slot voll"><button type="button" data-slot="${i}" aria-label="${esc(s.menge > 1 ? `${s.menge}× ` : '')}${esc(nurText(s.nameF) || s.name)}">${icon(s)}${s.menge > 1 ? `<span class="anzahl">${s.menge}</span>` : ''}${d !== null && d < 1 ? `<span class="haltbar"><i style="width:${Math.round(d * 100)}%;background:hsl(${Math.round(d * 120)} 80% 50%)"></i></span>` : ''}</button></li>`;
      }).join('');
      const gesamt = r.slots.length;
      return `<div class="fenster-kopf"><h3>${esc(ART[r.art])} von ${esc(r.name)}</h3><p class="hinweis">${gesamt} Item${gesamt === 1 ? '' : 's'}, gelesen um ${esc(uhr(r.at))}${r.cache ? ' (eben schon abgefragt)' : ''}. Tipp auf ein Item für Details.</p></div>
        <ol class="mc-fenster">${zellen}</ol><div class="item-info" id="item-info" hidden></div>`;
    }
    function fensterKlicks(erg, r) {
      const bySlot = new Map(r.slots.map(s => [s.slot, s]));
      erg.querySelectorAll('[data-slot]').forEach(b => b.addEventListener('click', () => {
        erg.querySelectorAll('.slot.an').forEach(x => x.classList.remove('an')); b.parentElement.classList.add('an');
        const s = bySlot.get(+b.dataset.slot), box = $('#item-info'); box.hidden = false;
        // Aufbau wie der Tooltip im Spiel (mit F3+H): Name, Verzauberungen, Lore, Haltbarkeit, Item-ID
        const zeilen = [`<div class="tt-name">${mcText(s.nameF?.length ? s.nameF : [{ t: s.name, c: 'white' }])}</div>`];
        for (const e of s.ench || []) zeilen.push(`<div style="color:${e.n.endsWith('_curse') ? '#FF5555' : '#AAAAAA'}">${esc(verz(e))}</div>`);
        for (const l of s.loreF?.length ? s.loreF : (s.lore || []).map(t => [{ t, c: 'dark_purple', i: true }])) zeilen.push(`<div>${mcText(l) || '&nbsp;'}</div>`);
        if (s.dura?.max) zeilen.push(`<div style="color:#FFFFFF">Haltbarkeit: ${s.dura.rest} / ${s.dura.max}</div>`);
        zeilen.push(`<div style="color:#555555">minecraft:${esc(s.id)}${s.menge > 1 ? ` (${s.menge} Stück)` : ''}</div>`);
        box.innerHTML = `<div class="mc-tooltip">${zeilen.join('')}</div>`;
      }));
    }
    function verlaufZeigen() {
      const v = ICH?.verlauf || [], ziel = $('#k-verlauf');
      const T = { ok: '', offline: 'nicht online', 'geschützt': 'geschützt', keinRecht: 'ging nicht', fehler: 'ging nicht' };
      ziel.innerHTML = v.length ? `<h3>Zuletzt angesehen</h3><ul>${v.slice(0, 8).map(l => `<li><button type="button" class="text-knopf" data-nochmal="${esc(l.art)}|${esc(l.ziel)}">${esc(ART[l.art] || l.art)} von ${esc(l.ziel)}</button> <span class="hinweis">${esc(vor(l.at))}${T[l.status] ? `, ${esc(T[l.status])}` : ''}</span></li>`).join('')}</ul>` : '';
      ziel.querySelectorAll('[data-nochmal]').forEach(b => b.addEventListener('click', () => {
        const [art, name] = b.dataset.nochmal.split('|'); $(`input[name="art"][value="${art}"]`).checked = true; $('#k-ziel').value = name; $('#k-ziel').focus();
      }));
    }
    $('#k-abmelden').addEventListener('click', async () => { try { await api('logout', {}); } catch { /* egal */ } token.set(''); ICH = null; weiter(); });
    start();
  }

  /* ======================================================== Auktionshaus */
  const M = $('#markt');
  if (M) {
    let DATEN = null, version = 0, timer = null, ersteRunde = true;
    const gesehen = new Set();
    const zugang = (html) => { $('#markt-lade').hidden = true; $('#markt-inhalt').hidden = true; const z = $('#markt-zugang'); z.hidden = false; z.innerHTML = html; };
    async function laden() {
      clearTimeout(timer);
      try {
        const d = await api('markt' + (version ? `?v=${version}` : ''));
        if (!d.gleich) { DATEN = d; version = d.version; malen(); } else if (DATEN) { Object.assign(DATEN, { voll: d.voll, schnell: d.schnell, laeuft: d.laeuft }); standMalen(); }
        timer = setTimeout(laden, document.hidden ? 30000 : 4000);
      } catch (x) {
        if (x.status === 401 || x.status === 402) return zugang(`<div class="hinweis-box"><div><h3>Nur mit Abo</h3><p>${x.status === 401 ? 'Melde dich an und hol dir das Abo, dann siehst du hier alle Angebote live.' : 'Dein Abo ist abgelaufen. Verlänger es, dann geht es hier weiter.'}</p></div><a class="knopf" href="/abo">Zum Abo</a></div>`);
        if (x.status === 404) return zugang(`<p class="leer">${esc(x.message)}</p>`);
        $('#markt-lade').textContent = x.message; timer = setTimeout(laden, 15000);
      }
    }
    document.addEventListener('visibilitychange', () => { if (!document.hidden) laden(); });
    const filtern = () => {
      const q = $('#markt-suche').value.trim().toLowerCase(), ohneFake = $('#markt-fake').checked, sort = $('#markt-sort').value;
      let l = DATEN.items.filter(i => (!ohneFake || i.echt !== 'nein') && (!q || `${i.name} ${i.id} ${i.verkaeufer}`.toLowerCase().replace(/_/g, ' ').includes(q)));
      const st = i => i.proStueck ?? 1e12;
      l = sort === 'billig' ? l.sort((a, b) => st(a) - st(b)) : sort === 'teuer' ? l.sort((a, b) => st(b) - st(a)) : sort === 'name' ? l.sort((a, b) => a.name.localeCompare(b.name, 'de')) : l.sort((a, b) => (b.seit || 0) - (a.seit || 0) || st(a) - st(b));
      return l;
    };
    const zeile = (i, neu) => `<li class="markt-zeile${neu ? ' frisch' : ''}${i.echt === 'nein' ? ' fake' : ''}">
        ${icon(i)}
        <div class="markt-name"><b>${i.menge > 1 ? `${i.menge}× ` : ''}${esc(i.name)}${i.echt === 'nein' ? ' <span class="fake-marke" title="Im Amboss umbenannt, wahrscheinlich nicht das echte Item">Fake?</span>' : ''}</b>
          <span class="hinweis">${i.ench?.length ? esc(i.ench.map(verz).join(', ')) : esc(String(i.id).replace(/_/g, ' '))}</span></div>
        <div class="markt-preis"><span class="betrag">${preis(i.preis)}</span>${i.menge > 1 ? `<span class="hinweis">${preis(i.proStueck)} pro Stück</span>` : ''}</div>
        <div class="markt-wer">${i.verkaeufer ? `<img src="${kopf(i.verkaeufer)}" alt="" width="24" height="24" loading="lazy"><span>${esc(i.verkaeufer)}</span>` : '<span class="hinweis">Verkäufer unbekannt</span>'}${i.seit ? `<span class="hinweis neu-seit">${esc(vor(i.seit))} dazugekommen</span>` : ''}</div>
      </li>`;
    function standMalen() {
      const d = DATEN;
      $('#markt-stand').textContent = `${d.anzahl} Angebote. ${d.voll ? `Komplett gelesen ${vor(d.voll)}` : 'Wird gerade zum ersten Mal gelesen'}${d.schnell && d.schnell > d.voll ? `, nach neuen geschaut ${vor(d.schnell)}` : ''}.${d.laeuft ? ' Liest gerade …' : ''}`;
    }
    function malen() {
      $('#markt-lade').hidden = true; $('#markt-zugang').hidden = true; $('#markt-inhalt').hidden = false;
      standMalen();
      const l = filtern();
      $('#markt-liste').innerHTML = l.length ? l.slice(0, 400).map(i => { const neu = !ersteRunde && !gesehen.has(i.k) && !ruhig; return zeile(i, neu); }).join('') : `<li class="leer">${DATEN.items.length ? 'Dazu gibt es gerade kein Angebot.' : 'Noch keine Angebote gelesen. Das dauert nach dem Start ein paar Minuten.'}</li>`;
      DATEN.items.forEach(i => gesehen.add(i.k)); ersteRunde = false;
      const w = DATEN.weg || [];
      $('#markt-weg').hidden = !w.length;
      $('#markt-weg-liste').innerHTML = w.slice(0, 15).map(i => `<li class="markt-zeile weg">${icon(i)}<div class="markt-name"><b>${i.menge > 1 ? `${i.menge}× ` : ''}${esc(i.name)}</b><span class="hinweis">${esc(i.verkaeufer || '')}</span></div><div class="markt-preis"><span class="betrag">${preis(i.preis)}</span></div><div class="markt-wer"><span class="hinweis">${esc(vor(i.wegAt))}</span></div></li>`).join('');
    }
    let suchT;
    $('#markt-suche').addEventListener('input', () => { clearTimeout(suchT); suchT = setTimeout(() => DATEN && malen(), 120); });
    $('#markt-sort').addEventListener('change', () => DATEN && malen());
    $('#markt-fake').addEventListener('change', () => DATEN && malen());
    setInterval(() => { if (DATEN && !document.hidden) standMalen(); }, 15000);
    laden();
  }
})();
