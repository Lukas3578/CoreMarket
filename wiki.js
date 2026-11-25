'use strict';
/*
 * Wiki: liest wiki/*.md und baut daraus die Übersicht und die Artikelseiten.
 *
 * Kopf jeder Datei (zwischen den --- Zeilen):
 *   titel: Preisliste lesen
 *   beschreibung: Ein Satz, der in der Übersicht und bei Google steht.
 *   kategorie: Handel
 *   reihenfolge: 2
 *
 * Unterstütztes Markdown: ## und ### Überschriften, Absätze, **fett**, *kursiv*,
 * `code`, [Links](/pfad), Listen (- und 1.), Tabellen, --- als Trennlinie,
 * Codeblöcke mit ``` und Hinweis-Boxen:
 *   > [!tipp] Text      > [!achtung] Text      > [!info] Text
 */
const fs = require('node:fs');
const path = require('node:path');

const KATEGORIEN = ['Erste Schritte', 'Handel', 'Sicherheit', 'Clan', 'Nachschlagen'];

const esc = s => String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
const slug = s => s.toLowerCase().replace(/ä/g, 'ae').replace(/ö/g, 'oe').replace(/ü/g, 'ue').replace(/ß/g, 'ss').replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');

/* ---------- Markdown ---------- */
function inline(t) {
  const codes = [];
  t = t.replace(/`([^`]+)`/g, (_, c) => { codes.push(c); return `\u0000${codes.length - 1}\u0000`; });
  t = esc(t)
    .replace(/\*\*(.+?)\*\*/g, '<b>$1</b>')
    .replace(/(^|[^*])\*([^*\s][^*]*?)\*/g, '$1<em>$2</em>')
    .replace(/\[([^\]]+)\]\(([^)\s]+)\)/g, (_, text, href) => {
      const extern = /^https?:/.test(href);
      const sicher = /^(https?:|\/|#|mailto:)/.test(href) ? href : '#';
      return `<a href="${sicher}"${extern ? ' target="_blank" rel="noopener"' : ''}>${text}</a>`;
    });
  return t.replace(/\u0000(\d+)\u0000/g, (_, i) => `<code>${esc(codes[i])}</code>`);
}

function markdown(md) {
  const zeilen = md.replace(/\r/g, '').split('\n');
  const out = [], inhalt = [];
  const ids = new Set();
  let i = 0;
  const neueId = text => { let id = slug(text) || 'abschnitt', n = 2; while (ids.has(id)) id = `${slug(text)}-${n++}`; ids.add(id); return id; };

  while (i < zeilen.length) {
    const z = zeilen[i];
    if (!z.trim()) { i++; continue; }

    if (z.startsWith('```')) {
      const block = [];
      i++;
      while (i < zeilen.length && !zeilen[i].startsWith('```')) block.push(zeilen[i++]);
      i++;
      out.push(`<pre><code>${esc(block.join('\n'))}</code></pre>`);
      continue;
    }
    const h = z.match(/^(#{2,3})\s+(.+)$/);
    if (h) {
      const ebene = h[1].length, text = h[2].trim(), id = neueId(text);
      inhalt.push({ ebene, text, id });
      out.push(`<h${ebene} id="${id}"><a class="anker" href="#${id}" aria-hidden="true" tabindex="-1">#</a>${inline(text)}</h${ebene}>`);
      i++; continue;
    }
    if (/^---+\s*$/.test(z)) { out.push('<hr>'); i++; continue; }
    if (z.startsWith('>')) {
      const block = [];
      while (i < zeilen.length && zeilen[i].startsWith('>')) block.push(zeilen[i++].replace(/^>\s?/, ''));
      const m = block[0].match(/^\[!(tipp|achtung|info)\]\s*/i);
      const art = m ? m[1].toLowerCase() : 'info';
      if (m) block[0] = block[0].slice(m[0].length);
      const titel = { tipp: 'Tipp', achtung: 'Achtung', info: 'Gut zu wissen' }[art];
      out.push(`<aside class="box box-${art}"><p class="box-titel">${titel}</p><p>${inline(block.join(' ').trim())}</p></aside>`);
      continue;
    }
    if (/^\|.*\|\s*$/.test(z)) {
      const rows = [];
      while (i < zeilen.length && /^\|.*\|\s*$/.test(zeilen[i])) rows.push(zeilen[i++]);
      const zellen = r => r.trim().replace(/^\||\|$/g, '').split('|').map(c => c.trim());
      const kopf = zellen(rows[0]);
      const body = rows.slice(/^\|[\s:|-]+\|$/.test(rows[1] || '') ? 2 : 1).map(zellen);
      out.push(`<div class="wiki-tabelle"><table><thead><tr>${kopf.map(c => `<th>${inline(c)}</th>`).join('')}</tr></thead><tbody>${body.map(r => `<tr>${r.map(c => `<td>${inline(c)}</td>`).join('')}</tr>`).join('')}</tbody></table></div>`);
      continue;
    }
    if (/^(\s*)([-*]|\d+\.)\s+/.test(z)) {
      const geordnet = /^\s*\d+\./.test(z);
      const punkte = [];
      while (i < zeilen.length && /^\s*([-*]|\d+\.)\s+/.test(zeilen[i])) {
        let p = zeilen[i++].replace(/^\s*([-*]|\d+\.)\s+/, '');
        while (i < zeilen.length && /^\s{2,}\S/.test(zeilen[i]) && !/^\s*([-*]|\d+\.)\s+/.test(zeilen[i])) p += ' ' + zeilen[i++].trim();
        punkte.push(`<li>${inline(p)}</li>`);
      }
      out.push(geordnet ? `<ol class="wiki-schritte">${punkte.join('')}</ol>` : `<ul>${punkte.join('')}</ul>`);
      continue;
    }
    const absatz = [];
    while (i < zeilen.length && zeilen[i].trim() && !/^(#{2,3}\s|```|>|\||---+\s*$|\s*([-*]|\d+\.)\s+)/.test(zeilen[i])) absatz.push(zeilen[i++].trim());
    out.push(`<p>${inline(absatz.join(' '))}</p>`);
  }
  return { html: out.join('\n'), inhalt };
}

/* ---------- Dateien laden ---------- */
function laden(dir) {
  if (!fs.existsSync(dir)) return [];
  const artikel = [];
  for (const datei of fs.readdirSync(dir).filter(f => f.endsWith('.md')).sort()) {
    const roh = fs.readFileSync(path.join(dir, datei), 'utf8');
    const m = roh.match(/^---\r?\n([\s\S]*?)\r?\n---\r?\n?([\s\S]*)$/);
    const kopf = {};
    if (m) m[1].split(/\r?\n/).forEach(z => { const k = z.match(/^(\w+):\s*(.*)$/); if (k) kopf[k[1]] = k[2].trim(); });
    const text = m ? m[2] : roh;
    const { html, inhalt } = markdown(text);
    const name = datei.replace(/\.md$/, '');
    artikel.push({
      slug: slug(name),
      titel: kopf.titel || name,
      beschreibung: kopf.beschreibung || '',
      kategorie: kopf.kategorie || 'Nachschlagen',
      reihenfolge: Number(kopf.reihenfolge) || 99,
      html, inhalt,
      // reiner Text für die Suche
      suchtext: text.replace(/[#*`>|[\]()_-]/g, ' ').replace(/\s+/g, ' ').trim().toLowerCase(),
    });
  }
  const rang = k => { const i = KATEGORIEN.indexOf(k); return i < 0 ? 99 : i; };
  artikel.sort((a, b) => rang(a.kategorie) - rang(b.kategorie) || a.reihenfolge - b.reihenfolge || a.titel.localeCompare(b.titel, 'de'));
  return artikel;
}

function gruppiert(artikel) {
  const g = new Map();
  for (const a of artikel) { if (!g.has(a.kategorie)) g.set(a.kategorie, []); g.get(a.kategorie).push(a); }
  return g;
}

/* ---------- Seiten ---------- */
function seitenleiste(artikel, aktiv) {
  const teile = [];
  for (const [kat, liste] of gruppiert(artikel)) {
    teile.push(`<p class="wiki-kat">${esc(kat)}</p><ul>${liste.map(a => `<li><a href="/wiki/${a.slug}"${a.slug === aktiv ? ' class="aktiv" aria-current="page"' : ''}>${esc(a.titel)}</a></li>`).join('')}</ul>`);
  }
  return `<nav class="wiki-leiste" aria-label="Wiki-Artikel">
      <details class="wiki-leiste-klapp" open><summary>Alle Artikel</summary>
        <div class="wiki-leiste-inhalt"><a class="wiki-start${aktiv ? '' : ' aktiv'}" href="/wiki">Übersicht</a>${teile.join('')}</div>
      </details>
    </nav>`;
}

function suchIndex(artikel) {
  const daten = artikel.map(a => ({ s: a.slug, t: a.titel, b: a.beschreibung, k: a.kategorie, x: a.suchtext }));
  return `<script id="wiki-index" type="application/json">${JSON.stringify(daten).replace(/</g, '\\u003c')}</script>`;
}

function uebersicht(artikel) {
  const karten = [];
  let n = 0;
  for (const [kat, liste] of gruppiert(artikel)) {
    karten.push(`<section class="wiki-gruppe zeigen"><h2>${esc(kat)}</h2><div class="wiki-karten">${liste.map(a =>
      `<a class="wiki-karte" href="/wiki/${a.slug}" style="--i:${n++ % 4}"><h3>${esc(a.titel)}</h3><p>${esc(a.beschreibung)}</p><span class="weg-pfeil" aria-hidden="true">→</span></a>`).join('')}</div></section>`);
  }
  return `
  <section class="seitenkopf">
    <div class="breite">
      <nav class="brotkrumen auftritt" aria-label="Pfad"><a href="/">Start</a><span>Wiki</span></nav>
      <h1 class="auftritt" style="--i:1">CoreMarket <span class="gold">Wiki</span></h1>
      <p class="einleitung auftritt" style="--i:2">Anleitungen, Erklärungen und alles zum Nachschlagen – vom ersten Ticket bis zum Clan-Beitritt.</p>
      <div class="wiki-suche auftritt" style="--i:3">
        <label class="suche suche-gross"><span class="sr">Wiki durchsuchen</span><input type="search" id="wiki-suche" placeholder="Wiki durchsuchen … z. B. Vouch, STOP, verifizieren" autocomplete="off" spellcheck="false"></label>
        <div class="wiki-treffer" id="wiki-treffer" hidden></div>
      </div>
    </div>
  </section>
  <section class="abschnitt kurz-oben">
    <div class="breite">${karten.join('')}</div>
  </section>
  ${suchIndex(artikel)}`;
}

function artikelSeite(artikel, a) {
  const i = artikel.indexOf(a);
  const vor = artikel[i - 1], nach = artikel[i + 1];
  const toc = a.inhalt.filter(x => x.ebene === 2);
  return `
  <section class="seitenkopf wiki-kopf">
    <div class="breite">
      <nav class="brotkrumen auftritt" aria-label="Pfad"><a href="/">Start</a><a href="/wiki">Wiki</a><span>${esc(a.titel)}</span></nav>
      <p class="marker auftritt" style="--i:1">${esc(a.kategorie)}</p>
      <h1 class="auftritt" style="--i:1">${esc(a.titel)}</h1>
      ${a.beschreibung ? `<p class="einleitung auftritt" style="--i:2">${esc(a.beschreibung)}</p>` : ''}
    </div>
  </section>
  <section class="abschnitt kurz-oben">
    <div class="breite wiki-raster">
      ${seitenleiste(artikel, a.slug)}
      <article class="wiki-text auftritt" style="--i:3">
        ${a.html}
        <nav class="wiki-blaettern" aria-label="Weitere Artikel">
          ${vor ? `<a class="zurueck" href="/wiki/${vor.slug}"><small>Zurück</small>${esc(vor.titel)}</a>` : '<span></span>'}
          ${nach ? `<a class="weiter-link" href="/wiki/${nach.slug}"><small>Weiter</small>${esc(nach.titel)}</a>` : ''}
        </nav>
      </article>
      ${toc.length > 1 ? `<aside class="wiki-toc" aria-label="Auf dieser Seite"><p class="wiki-kat">Auf dieser Seite</p><ul>${toc.map(t => `<li><a href="#${t.id}">${esc(t.text.replace(/[*`]/g, ''))}</a></li>`).join('')}</ul></aside>` : '<span></span>'}
    </div>
  </section>`;
}

module.exports = { laden, uebersicht, artikelSeite, markdown };
