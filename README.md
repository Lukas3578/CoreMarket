# CoreMarket – öffentliche Website

Statische Website (HTML/CSS/JS, keine Abhängigkeiten) für Render. Die Seite holt sich **live** vom CoreMarket-Bot:
- Spawner-Preise mit Staffelpreisen,
- Clan-Mitglieder (CM0/CM1),
- Vouches und Bewertungen,
- HugoSMP-Spielerzahl.

Ändert ihr etwas auf der Admin-Website, ist es nach spätestens einer Minute auch hier zu sehen.

## Einrichten

1. **Im Bot (Admin-Website):** Einstellungen → 🌐 Öffentliche Website
   - „Daten freigeben“ anhaken.
   - Die Discord-Einladung eintragen (`https://discord.gg/…`).
   - Optional: einen eigenen Text „Über uns“ schreiben und Spieler ausblenden, die nicht gezeigt werden wollen.
2. **`config.js`:** Bei `api` die Adresse eures Bots eintragen (Discord-Link ist schon drin), z. B. `https://hugo.vortexpvp.eu/api/public`.
3. **GitHub:** Diesen Ordner in ein Repository hochladen, z. B. `coremarket-website`.
4. **Render:** New → **Static Site** → das Repository wählen.
   - Build Command: leer lassen.
   - Publish Directory: `.`
   - Alternativ: New → **Blueprint**. Dann übernimmt Render alles aus `render.yaml`.
5. Optional: Unter Settings → Custom Domain eine eigene Domain eintragen, z. B. `coremarket.vortexpvp.eu`.

## Was öffentlich wird – und was nicht

`/api/public` liefert nur:
- Clan-Name;
- Mitglieder-Namen mit Clan und „dabei seit“;
- Preise;
- Vouch-Statistik und die neuesten Kommentare;
- Anzahl der Abschlüsse.

**Nie** öffentlich werden: Geld der Mitglieder, „vertrauenswürdig“, Notizen, Discord-IDs, Bank-Kontostand und Zahlungen.

Die Köpfe der Spieler kommen von mc-heads.net.
