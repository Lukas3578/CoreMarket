'use strict';
/* CoreMarket Marktplatz: Spieler handeln Spawner untereinander.
 * Login über den Bot (Code per /msg, wie beim Abo), Daten über /api/markt/*. */
(() => {
  const W = document.getElementById('markt');
  if (!W || !window.CM) return;
  const { spawnerIcon, toast, preis, esc, kopf24, vor, slug, tausend, leer, MC_NAME } = window.CM;
  const $ = s => document.querySelector(s);
  const $$ = s => document.querySelectorAll(s);
  const ART = W.dataset.seiteArt;
  const SPEICHER = 'cm-konto';
  const token = { get() { try { return localStorage.getItem(SPEICHER) || ''; } catch { return ''; } }, set(t) { try { t ? localStorage.setItem(SPEICHER, t) : localStorage.removeItem(SPEICHER); } catch { /* privat */ } } };

  async function api(pfad, body) {
    const t = token.get();
    const r = await fetch(pfad, { method: body ? 'POST' : 'GET', cache: 'no-store', headers: { 'Content-Type': 'application/json', ...(t ? { Authorization: 'Bearer ' + t } : {}) }, body: body ? JSON.stringify(body) : undefined });
    let d = {}; try { d = await r.json(); } catch { /* leer */ }
    if (r.status === 401 && t && pfad.startsWith('/api/markt')) { token.set(''); ICH = null; kontoZeigen(); }
    if (!r.ok) throw Object.assign(new Error(d.error || 'Das hat nicht geklappt.'), { status: r.status });
    return d;
  }
  const zahlM = v => preis(v) || '–';
  const cmZahl = v => leer(v) ? 'STOP' : preis(v);
  const ruf = r => r ? `<span class="ruf" title="Bewertungen: Trust, Neutral, Scam"><b class="r-t">${tausend(r.trust)}</b><i>/</i><b class="r-n">${tausend(r.neutral)}</b><i>/</i><b class="r-s">${tausend(r.scam)}</b></span>` : '';
  const spielerLink = n => `<a class="name-link" href="/spieler/${encodeURIComponent(n)}">${esc(n)}</a>`;

  /* ---------- Dialoge (einmal angelegt, von allen Marktplatz-Seiten benutzt) ---------- */
  document.body.insertAdjacentHTML('beforeend', `
  <dialog class="alarm-dialog markt-dialog" id="login-dialog">
    <form method="dialog" id="login-form">
      <h2>Anmelden</h2>
      <p class="hinweis-text">Damit niemand unter deinem Namen handelt, bestätigst du deinen Minecraft-Account einmal mit einer kurzen /msg an unseren Bank-Account im Spiel.</p>
      <label class="feld"><span>Minecraft-Name</span><input id="login-mc" maxlength="17" spellcheck="false" autocomplete="username" required></label>
      <div class="befehl-box" id="login-code" hidden><p>Schreib das im Spiel in den Chat:</p><div class="befehl"><code id="login-befehl"></code><button type="button" class="knopf zweit klein" id="login-kopieren">Kopieren</button></div><p class="hinweis" id="login-status"></p></div>
      <div class="dialog-knoepfe"><button type="button" class="knopf zweit" data-schliessen>Abbrechen</button><button class="knopf" id="login-los">Code holen</button></div>
    </form>
  </dialog>
  <dialog class="alarm-dialog markt-dialog" id="angebot-dialog">
    <form method="dialog" id="angebot-form">
      <h2>Angebot einstellen</h2>
      <div class="umschalter" role="radiogroup" aria-label="Was willst du">
        <label><input type="radio" name="a-art" value="verkauf" checked><span>Ich verkaufe</span></label>
        <label><input type="radio" name="a-art" value="ankauf"><span>Ich suche</span></label>
        <i class="umschalter-zeiger" aria-hidden="true"></i>
      </div>
      <label class="feld"><span>Spawner</span><select id="a-spawner" required></select></label>
      <div class="dialog-zeile">
        <label class="feld"><span>Menge</span><input id="a-menge" type="number" inputmode="numeric" min="1" max="10000" value="1" required></label>
        <label class="feld"><span>Preis pro Stück</span><span class="budget-feld"><input id="a-preis" type="number" inputmode="decimal" min="0.01" step="0.01" required><b>M</b></span></label>
      </div>
      <p class="hinweis" id="a-hinweis"></p>
      <label class="check"><input type="checkbox" id="a-vb"><span>Preis ist Verhandlungsbasis</span></label>
      <label class="feld"><span>Notiz (optional)</span><input id="a-notiz" maxlength="120" placeholder="z. B. nur abends online"></label>
      <div class="dialog-knoepfe"><button type="button" class="knopf zweit" data-schliessen>Abbrechen</button><button class="knopf">Einstellen</button></div>
    </form>
  </dialog>
  <dialog class="alarm-dialog markt-dialog" id="deal-dialog">
    <form method="dialog" id="deal-form">
      <h2 id="d-titel"></h2>
      <div class="d-partner" id="d-partner"></div>
      <label class="feld"><span>Menge</span><input id="d-menge" type="number" inputmode="numeric" min="1" value="1" required></label>
      <p class="d-summe" id="d-summe"></p>
      <p class="hinweis-text">Mit „Deal starten“ reservierst du die Menge. Danach trefft ihr euch im Spiel. Wenn alles übergeben ist, bewertet ihr euch unter „Meine Deals“, erst dann ist der Deal beendet. CoreMarket haftet nicht für diesen Handel.</p>
      <div class="dialog-knoepfe"><button type="button" class="knopf zweit" data-schliessen>Abbrechen</button><button class="knopf" id="d-los">Deal starten</button></div>
    </form>
  </dialog>
  <dialog class="alarm-dialog markt-dialog" id="bewerten-dialog">
    <form method="dialog" id="bewerten-form">
      <h2>Deal beenden</h2>
      <p class="hinweis-text" id="b-text"></p>
      <div class="bewertung-wahl" role="radiogroup" aria-label="Bewertung">
        <label class="bw-t"><input type="radio" name="b-wert" value="trust" required><span><b>Trust</b><small>Hat alles geklappt</small></span></label>
        <label class="bw-n"><input type="radio" name="b-wert" value="neutral"><span><b>Neutral</b><small>Ging so, aber erledigt</small></span></label>
        <label class="bw-s"><input type="radio" name="b-wert" value="scam"><span><b>Scam</b><small>Ich wurde betrogen</small></span></label>
      </div>
      <label class="feld"><span>Kommentar (optional)</span><input id="b-kommentar" maxlength="140"></label>
      <div class="dialog-knoepfe"><button type="button" class="knopf zweit" data-schliessen>Zurück</button><button class="knopf">Bewertung abgeben</button></div>
    </form>
  </dialog>`);
  $$('.markt-dialog [data-schliessen]').forEach(b => b.addEventListener('click', () => b.closest('dialog').close()));

  /* ---------- Konto ---------- */
  let ICH = null;
  async function ichLaden() {
    if (!token.get()) { ICH = null; return; }
    try { ICH = await api('/api/markt/ich'); } catch (e) { if (e.status !== 401) toast(e.message); ICH = null; }
  }
  function kontoZeigen() {
    const box = $('#markt-konto');
    if (!box) return;
    if (!ICH) {
      box.innerHTML = `<div class="mk-konto-text"><b>Nicht angemeldet.</b> Zum Einstellen und Handeln meldest du dich einmal mit deinem Minecraft-Namen an.</div><button type="button" class="knopf klein" data-login>Anmelden</button>`;
      return;
    }
    const offen = ICH.deals.filter(d => d.status === 'offen');
    const zuBewerten = offen.filter(d => !d.meine).length;
    box.innerHTML = `<img src="${kopf24(ICH.mc)}" alt="" width="36" height="36"><div class="mk-konto-text"><b>${esc(ICH.mc)}</b> ${ruf(ICH.ruf)}<small>${tausend(ICH.ruf.deals)} abgeschlossene Deals${offen.length ? `, ${offen.length} offen` : ''}</small></div>
      ${ART !== 'meine' ? `<a class="knopf zweit klein" href="/markt/meine">Meine Angebote und Deals${zuBewerten ? ` <b class="tab-zahl">${zuBewerten}</b>` : ''}</a>` : ''}
      <button type="button" class="knopf klein" data-neues-angebot>Angebot einstellen</button><button type="button" class="text-knopf" data-logout>Abmelden</button>`;
  }
  document.addEventListener('click', e => {
    if (e.target.closest('[data-login]')) loginOeffnen();
    if (e.target.closest('[data-logout]')) { api('/api/konto/logout', {}).catch(() => {}); token.set(''); ICH = null; kontoZeigen(); if (ART === 'meine') meineZeigen(); toast('Abgemeldet'); }
    const n = e.target.closest('[data-neues-angebot]');
    if (n) angebotOeffnen(n.dataset.neuesAngebot);
    const k = e.target.closest('[data-deal]');
    if (k) dealOeffnen(k.dataset.deal);
  });

  let loginTimer = null, nachLogin = null;
  function loginOeffnen(danach) {
    nachLogin = danach || null;
    $('#login-code').hidden = true; $('#login-los').hidden = false;
    $('#login-dialog').showModal();
  }
  $('#login-form').addEventListener('submit', async e => {
    e.preventDefault();
    const mc = $('#login-mc').value.trim();
    if (!MC_NAME.test(mc)) { toast('Bitte einen gültigen Minecraft-Namen eingeben'); return; }
    try {
      const r = await api('/api/konto/login', { mc });
      $('#login-befehl').textContent = r.befehl; $('#login-code').hidden = false; $('#login-los').hidden = true;
      $('#login-status').textContent = 'Warte auf deine Nachricht im Spiel … Der Code gilt 10 Minuten.';
      clearTimeout(loginTimer);
      const pruefen = async () => {
        try {
          const s = await api('/api/konto/login/status', { id: r.id });
          if (s.status === 'ok') {
            token.set(s.token); $('#login-dialog').close(); toast(`Angemeldet als ${s.kunde?.mc || mc}`);
            await ichLaden(); kontoZeigen(); seiteLaden(); if (nachLogin) nachLogin(); return;
          }
          if (s.status === 'abgelaufen') { $('#login-status').textContent = 'Der Code ist abgelaufen. Hol dir einen neuen.'; $('#login-los').hidden = false; return; }
        } catch { /* gleich nochmal */ }
        if ($('#login-dialog').open) loginTimer = setTimeout(pruefen, 2000);
      };
      loginTimer = setTimeout(pruefen, 2000);
    } catch (x) { $('#login-code').hidden = false; $('#login-befehl').textContent = ''; $('#login-status').textContent = x.message; }
  });
  $('#login-kopieren').addEventListener('click', async () => { try { await navigator.clipboard.writeText($('#login-befehl').textContent); toast('Kopiert'); } catch { /* egal */ } });

  /* ---------- Angebot einstellen ---------- */
  let SPAWNER = [];
  async function spawnerListe() {
    if (SPAWNER.length) return SPAWNER;
    try { SPAWNER = (await api('/api/markt')).spawner.map(s => ({ slug: s.slug, name: s.name })); } catch { SPAWNER = []; }
    return SPAWNER;
  }
  const cmPreis = s => window.CM.daten()?.preise?.spawner.find(x => slug(x.name) === s);
  function angebotHinweis() {
    const s = cmPreis($('#a-spawner').value), art = $('input[name="a-art"]:checked').value;
    $('#a-hinweis').textContent = s ? `Zum Vergleich bei CoreMarket: ${art === 'verkauf' ? `wir kaufen für ${zahlM(s.ankauf)}, wir verkaufen für ${zahlM(s.verkauf)}` : `wir verkaufen für ${zahlM(s.verkauf)}`}.` : '';
  }
  async function angebotOeffnen(art) {
    if (!ICH) return loginOeffnen(() => angebotOeffnen(art));
    const l = await spawnerListe();
    $('#a-spawner').innerHTML = l.map(s => `<option value="${esc(s.slug)}">${esc(s.name)}</option>`).join('');
    if (W.dataset.slug) $('#a-spawner').value = W.dataset.slug;
    if (art === 'verkauf' || art === 'ankauf') $(`input[name="a-art"][value="${art}"]`).checked = true;
    angebotHinweis();
    $('#angebot-dialog').showModal();
  }
  $('#a-spawner').addEventListener('change', angebotHinweis);
  $$('input[name="a-art"]').forEach(r => r.addEventListener('change', angebotHinweis));
  $('#angebot-form').addEventListener('submit', async e => {
    e.preventDefault();
    try {
      await api('/api/markt/angebot', { art: $('input[name="a-art"]:checked').value, spawner: $('#a-spawner').value, menge: $('#a-menge').value, preis: $('#a-preis').value, vb: $('#a-vb').checked, notiz: $('#a-notiz').value });
      $('#angebot-dialog').close(); e.target.reset(); toast('Angebot ist online');
      await ichLaden(); kontoZeigen(); seiteLaden();
    } catch (x) { toast(x.message); }
  });

  /* ---------- Deal starten ---------- */
  const ANGEBOTE = new Map();
  let dealAngebot = null;
  function dealOeffnen(id) {
    const a = ANGEBOTE.get(id); if (!a) return;
    if (!ICH) return loginOeffnen(() => dealOeffnen(id));
    if (ICH.mc.toLowerCase() === a.von.toLowerCase()) { toast('Das ist dein eigenes Angebot'); return; }
    dealAngebot = a;
    $('#d-titel').textContent = `${a.art === 'verkauf' ? 'Kaufen' : 'Verkaufen'}: ${a.name} Spawner`;
    $('#d-partner').innerHTML = `<img src="${kopf24(a.von)}" alt="" width="40" height="40"><div><b>${esc(a.von)}</b> ${ruf(a.ruf)}<small>${a.art === 'verkauf' ? 'verkauft' : 'sucht'} ${tausend(a.menge)} Stück für ${zahlM(a.preis)} pro Stück${a.vb ? ', VB' : ''}${a.notiz ? `. „${esc(a.notiz)}“` : ''}</small></div>`;
    const m = $('#d-menge'); m.max = a.menge; m.value = Math.min(a.menge, Math.max(1, +m.value || 1));
    dealSumme();
    $('#deal-dialog').showModal();
  }
  function dealSumme() {
    if (!dealAngebot) return;
    const m = Math.max(1, Math.min(dealAngebot.menge, Math.round(+$('#d-menge').value || 1)));
    $('#d-summe').innerHTML = `${tausend(m)}× ${zahlM(dealAngebot.preis)} = <b>${zahlM(Math.round(m * dealAngebot.preis * 100) / 100)}</b> ${dealAngebot.art === 'verkauf' ? 'zahlst du' : 'bekommst du'}`;
  }
  $('#d-menge').addEventListener('input', dealSumme);
  $('#deal-form').addEventListener('submit', async e => {
    e.preventDefault();
    try {
      await api('/api/markt/deal', { angebot: dealAngebot.id, menge: +$('#d-menge').value });
      $('#deal-dialog').close();
      toast(`Deal gestartet. Schreib ${dealAngebot.von} im Spiel an.`);
      setTimeout(() => { location.href = '/markt/meine'; }, 900);
    } catch (x) { toast(x.message); }
  });

  /* ---------- Zeilen ---------- */
  function angebotZeile(a, mitSpawner) {
    ANGEBOTE.set(a.id, a);
    const eigen = ICH && ICH.mc.toLowerCase() === a.von.toLowerCase();
    return `<li class="mk-zeile">
      <img class="z-kopf" src="${kopf24(a.von)}" alt="" width="32" height="32" loading="lazy">
      <span class="z-text"><b>${spielerLink(a.von)} ${ruf(a.ruf)}</b><small>${mitSpawner ? `<a href="/markt/${esc(a.spawner)}">${esc(a.name)} Spawner</a>, ` : ''}${tausend(a.menge)} Stück${a.notiz ? `, „${esc(a.notiz)}“` : ''}, ${esc(vor(a.at))}</small></span>
      <span class="z-preis ${a.art === 'verkauf' ? 'gold-text' : 'gruen-text'}">${zahlM(a.preis)}${a.vb ? ' <span class="vb">VB</span>' : ''}<small>pro Stück</small></span>
      ${eigen ? '<span class="mk-eigen">Dein Angebot</span>' : `<button type="button" class="knopf klein ${a.art === 'verkauf' ? '' : 'zweit'}" data-deal="${esc(a.id)}">${a.art === 'verkauf' ? 'Kaufen' : 'Verkaufen'}</button>`}
    </li>`;
  }

  /* ---------- Übersicht ---------- */
  async function uebersicht() {
    const d = await api('/api/markt');
    $('#markt-test').hidden = d.dauerhaft !== false;
    const z = d.zahlen;
    $('#mz-angebote').textContent = tausend(z.angebote); $('#mz-haendler').textContent = tausend(z.haendler);
    $('#mz-deals').textContent = tausend(z.deals); $('#mz-volumen').textContent = z.volumen ? zahlM(z.volumen) : '–';
    const reihen = d.spawner.slice().sort((a, b) => (b.verkauf.anzahl + b.ankauf.anzahl) - (a.verkauf.anzahl + a.ankauf.anzahl));
    $('#markt-spawner').innerHTML = reihen.map(s => {
      const c = cmPreis(s.slug);
      return `<tr><td><a class="tab-spawner" href="/markt/${esc(s.slug)}">${spawnerIcon(s.name)}<span class="tab-name">${esc(s.name)}</span></a></td>
        <td>${s.verkauf.anzahl ? `<span class="betrag">${zahlM(s.verkauf.min)}</span><span class="staffel">${tausend(s.verkauf.anzahl)} Angebot${s.verkauf.anzahl === 1 ? '' : 'e'}, ${tausend(s.verkauf.stueck)} Stück</span>` : '<span class="staffel">keine Angebote</span>'}</td>
        <td>${s.ankauf.anzahl ? `<span class="betrag gruen-text">${zahlM(s.ankauf.max)}</span><span class="staffel">${tausend(s.ankauf.anzahl)} Gesuch${s.ankauf.anzahl === 1 ? '' : 'e'}, ${tausend(s.ankauf.stueck)} Stück</span>` : '<span class="staffel">keine Gesuche</span>'}</td>
        <td>${c ? `<span class="staffel">Verkauf ${cmZahl(c.verkauf)}<br>Ankauf ${cmZahl(c.ankauf)}</span>` : '<span class="staffel">–</span>'}</td></tr>`;
    }).join('');
    $('#markt-neu').innerHTML = d.neueste.map(a => angebotZeile(a, true)).join('') || '<li class="zeile-leer">Noch keine Angebote. Sei der Erste und stell eins ein.</li>';
    $('#markt-fertig').innerHTML = d.deals.map(x => `<li class="zeile"><span class="z-icon">${spawnerIcon(x.name)}</span><span class="z-text"><b>${tausend(x.menge)}× ${esc(x.name)} Spawner</b><small>${spielerLink(x.verkaeufer)} an ${spielerLink(x.kaeufer)}, ${esc(vor(x.ende))}</small></span><span class="z-preis">${zahlM(x.preis)}<small>pro Stück</small></span></li>`).join('') || '<li class="zeile-leer">Noch keine abgeschlossenen Deals.</li>';
  }

  /* ---------- Seite pro Spawner ---------- */
  async function spawnerSeite() {
    const s = W.dataset.slug;
    const d = await api(`/api/markt/spawner/${encodeURIComponent(s)}`);
    const ueber = await api('/api/markt').catch(() => ({}));
    $('#markt-test').hidden = ueber.dauerhaft !== false;
    $('#mk-icon').innerHTML = spawnerIcon(d.name);
    const c = cmPreis(s), v = $('#mk-vergleich');
    if (c) {
      v.hidden = false;
      v.innerHTML = `<span class="mk-cm">${spawnerIcon(d.name)}<b>CoreMarket</b></span><span>Verkauft für <b class="gold-text">${cmZahl(c.verkauf)}</b></span><span>Kauft für <b class="gruen-text">${cmZahl(c.ankauf)}</b></span><a class="paneel-mehr" href="/spawner/${esc(s)}">Sicher über CoreMarket handeln</a>`;
    }
    $('#mk-verkauf').innerHTML = d.verkauf.map(a => angebotZeile(a)).join('') || '<li class="zeile-leer">Gerade verkauft niemand diesen Spawner.</li>';
    $('#mk-ankauf').innerHTML = d.ankauf.map(a => angebotZeile(a)).join('') || '<li class="zeile-leer">Gerade sucht niemand diesen Spawner.</li>';
    $('#mk-letzte').innerHTML = d.letzte.map(x => `<li class="zeile"><img class="z-kopf" src="${kopf24(x.kaeufer)}" alt="" width="32" height="32" loading="lazy"><span class="z-text"><b>${tausend(x.menge)} Stück</b><small>${spielerLink(x.verkaeufer)} an ${spielerLink(x.kaeufer)}, ${esc(vor(x.ende))}</small></span><span class="z-preis">${zahlM(x.preis)}<small>pro Stück</small></span></li>`).join('') || '<li class="zeile-leer">Noch nichts gehandelt.</li>';
  }

  /* ---------- Meine Angebote und Deals ---------- */
  const STATUS = { abgeschlossen: 'Abgeschlossen', abgebrochen: 'Abgebrochen', abgelaufen: 'Abgelaufen' };
  const WERT = { trust: 'Trust', neutral: 'Neutral', scam: 'Scam' };
  function meineZeigen() {
    const inhalt = $('#meine-inhalt');
    if (!inhalt) return;
    inhalt.hidden = !ICH;
    if (!ICH) return;
    const offen = ICH.deals.filter(d => d.status === 'offen'), fertig = ICH.deals.filter(d => d.status !== 'offen');
    $('#meine-offen').innerHTML = offen.map(d => {
      const partner = d.rolle === 'verkaeufer' ? d.kaeufer : d.verkaeufer;
      return `<li class="deal">
        <span class="z-icon">${spawnerIcon(d.name)}</span>
        <div class="deal-text"><b>${d.rolle === 'verkaeufer' ? 'Du verkaufst' : 'Du kaufst'} ${tausend(d.menge)}× ${esc(d.name)} Spawner für ${zahlM(Math.round(d.menge * d.preis * 100) / 100)}</b>
          <small>${d.rolle === 'verkaeufer' ? 'an' : 'von'} ${spielerLink(partner)} ${ruf(d.partnerRuf)}, gestartet ${esc(vor(d.at))}. ${d.meine ? `Du hast mit ${WERT[d.meine]} bewertet, warte auf ${esc(partner)}.` : d.andere ? `${esc(partner)} hat schon bewertet. Bewerte jetzt auch, um den Deal zu beenden.` : `Trefft euch im Spiel, zum Beispiel mit /tpa ${esc(partner)}.`}</small></div>
        <div class="deal-knoepfe">${d.meine ? '' : `<button type="button" class="knopf klein" data-bewerten="${esc(d.id)}">Beenden und bewerten</button>`}${d.meine || d.andere ? '' : `<button type="button" class="text-knopf" data-abbrechen="${esc(d.id)}">Abbrechen</button>`}</div>
      </li>`;
    }).join('') || '<li class="zeile-leer">Keine offenen Deals. Such dir auf dem <a href="/markt">Marktplatz</a> ein Angebot aus.</li>';
    $('#meine-angebote').innerHTML = ICH.angebote.map(a => `<li class="mk-zeile">
      <span class="z-icon">${spawnerIcon(a.name)}</span>
      <span class="z-text"><b>${a.art === 'verkauf' ? 'Verkaufe' : 'Suche'} ${esc(a.name)} Spawner</b><small>${tausend(a.menge)} von ${tausend(a.rest)} frei${a.reserviert ? `, ${tausend(a.reserviert)} in offenen Deals` : ''}${a.status === 'pausiert' ? ', pausiert' : ''}</small></span>
      <span class="z-preis">${zahlM(a.preis)}<small>pro Stück</small></span>
      <span class="mk-aktionen"><button type="button" class="text-knopf" data-angebot-aktion="preis" data-id="${esc(a.id)}">Preis</button><button type="button" class="text-knopf" data-angebot-aktion="${a.status === 'pausiert' ? 'fortsetzen' : 'pausieren'}" data-id="${esc(a.id)}">${a.status === 'pausiert' ? 'Fortsetzen' : 'Pausieren'}</button><button type="button" class="text-knopf rot-text" data-angebot-aktion="loeschen" data-id="${esc(a.id)}">Löschen</button></span>
    </li>`).join('') || '<li class="zeile-leer">Du hast noch keine Angebote.</li>';
    $('#meine-fertig').innerHTML = fertig.map(d => {
      const partner = d.rolle === 'verkaeufer' ? d.kaeufer : d.verkaeufer;
      return `<li class="zeile"><span class="z-icon">${spawnerIcon(d.name)}</span><span class="z-text"><b>${tausend(d.menge)}× ${esc(d.name)} ${d.rolle === 'verkaeufer' ? 'an' : 'von'} ${esc(partner)}</b><small>${STATUS[d.status] || d.status}${d.meine ? `, du: ${WERT[d.meine]}` : ''}${d.andere ? `, ${esc(partner)}: ${WERT[d.andere]}` : ''}, ${esc(vor(d.ende || d.at))}</small></span><span class="z-preis">${zahlM(d.preis)}<small>pro Stück</small></span></li>`;
    }).join('') || '<li class="zeile-leer">Noch keine erledigten Deals.</li>';
  }
  let bewertenDeal = null;
  document.addEventListener('click', async e => {
    const b = e.target.closest('[data-bewerten]');
    if (b) {
      bewertenDeal = ICH?.deals.find(d => d.id === b.dataset.bewerten); if (!bewertenDeal) return;
      const partner = bewertenDeal.rolle === 'verkaeufer' ? bewertenDeal.kaeufer : bewertenDeal.verkaeufer;
      $('#b-text').textContent = `Wie lief der Handel mit ${partner}? Du kannst nur einmal bewerten, danach ist der Deal für dich beendet.`;
      $('#bewerten-form').reset(); $('#bewerten-dialog').showModal();
    }
    const x = e.target.closest('[data-abbrechen]');
    if (x && confirm('Deal abbrechen? Die reservierte Menge wird wieder frei.')) {
      try { await api(`/api/markt/deal/${x.dataset.abbrechen}`, { aktion: 'abbrechen' }); toast('Deal abgebrochen'); await ichLaden(); kontoZeigen(); meineZeigen(); } catch (y) { toast(y.message); }
    }
    const a = e.target.closest('[data-angebot-aktion]');
    if (a) {
      const body = { aktion: a.dataset.angebotAktion };
      if (body.aktion === 'loeschen' && !confirm('Angebot löschen?')) return;
      if (body.aktion === 'preis') { const p = prompt('Neuer Preis pro Stück in Millionen:'); if (!p) return; body.preis = p; }
      try { ICH = await api(`/api/markt/angebot/${a.dataset.id}`, body); kontoZeigen(); meineZeigen(); toast('Gespeichert'); } catch (y) { toast(y.message); }
    }
  });
  $('#bewerten-form').addEventListener('submit', async e => {
    e.preventDefault();
    const wert = $('input[name="b-wert"]:checked')?.value;
    if (!wert) { toast('Wähl Trust, Neutral oder Scam'); return; }
    if (wert === 'scam' && !confirm('Als Scam bewerten? Melde den Fall bitte zusätzlich im Discord mit /melden.')) return;
    try {
      const d = await api(`/api/markt/deal/${bewertenDeal.id}`, { aktion: 'bewerten', wert, text: $('#b-kommentar').value });
      $('#bewerten-dialog').close();
      toast(d.status === 'abgeschlossen' ? 'Deal abgeschlossen' : 'Bewertet. Der Deal endet, sobald dein Partner auch bewertet hat.');
      await ichLaden(); kontoZeigen(); meineZeigen();
    } catch (y) { toast(y.message); }
  });

  /* ---------- Neue Deals melden ---------- */
  const GESEHEN = 'cm-deals-gesehen';
  function neueDealsMelden() {
    if (!ICH) return;
    let alt = [];
    try { alt = JSON.parse(localStorage.getItem(GESEHEN) || '[]'); } catch { /* leer */ }
    const offen = ICH.deals.filter(d => d.status === 'offen');
    const erstes = !alt.length && !localStorage.getItem(GESEHEN);
    for (const d of offen) if (!alt.includes(d.id) && !erstes) {
      const partner = d.rolle === 'verkaeufer' ? d.kaeufer : d.verkaeufer;
      const text = d.rolle === 'verkaeufer' ? `${partner} will ${d.menge}× ${d.name} kaufen` : `${partner} will dir ${d.menge}× ${d.name} verkaufen`;
      toast(`Neuer Deal: ${text}`);
      try { if (Notification.permission === 'granted') new Notification('CoreMarket Marktplatz', { body: text, icon: '/logo.png' }); } catch { /* egal */ }
    }
    try { localStorage.setItem(GESEHEN, JSON.stringify(offen.map(d => d.id).slice(-50))); } catch { /* egal */ }
  }

  /* ---------- Laden ---------- */
  async function seiteLaden() {
    try {
      if (ART === 'uebersicht') await uebersicht();
      else if (ART === 'spawner') await spawnerSeite();
      else if (ART === 'meine') meineZeigen();
    } catch (e) { toast(e.message); }
  }
  (async () => {
    await ichLaden(); kontoZeigen(); neueDealsMelden();
    await seiteLaden();
    setInterval(async () => {
      if (document.hidden) return;
      await ichLaden(); kontoZeigen(); neueDealsMelden();
      if (ART === 'meine') meineZeigen(); else seiteLaden();
    }, ART === 'meine' ? 20000 : 45000);
  })();
})();
