# CoreMarket – Website

Öffentliche Website von CoreMarket, dem Spawner-Clan auf HugoSMP. Läuft als kleiner Node-Server (ohne Abhängigkeiten) auf Render und zeigt live vom CoreMarket-Bot:

- Spawner-Preise mit Staffelpreisen und Preisrechner
- Clan-Mitglieder (CM0/CM1) mit Namenssuche
- Vouches und Bewertungen
- HugoSMP-Spielerzahl
- Auction-Orders: Preis und Preistrend jedes Items aus Auktionshaus und Orders

## Aufbau

```
server.js            Webserver: Seiten bauen, Bot-Daten cachen, /health
seiten/              die einzelnen Seiten (_layout.html = Kopf, Menü, Fuß)
wiki/                Wiki-Artikel als Markdown, eine Datei = ein Artikel
wiki.js              macht aus den Markdown-Dateien die Wiki-Seiten
spieler.js           Spieler-Index: wer verkauft was im Auktionshaus (aus den Item-Daten des Bots)
preise-demo.js       Demo-Preise für /auction-orders, solange der Bot noch keine liefert
public/              CSS, JS, Logo und andere Dateien für den Browser
keepalive/           Script, das die Seite auf Render wach hält
render.yaml          Render-Blueprint
```

Der Server holt die Daten alle 30 Sekunden vom Bot und legt sie direkt in die Seite. Besucher sehen die Preise also sofort, ohne auf den Bot zu warten. Ist der Bot kurz offline, zeigt die Seite die letzten bekannten Daten weiter an.

| Pfad          | Inhalt                                           |
|---------------|--------------------------------------------------|
| `/`           | Startseite                                       |
| `/preise`     | Preisliste und Rechner                           |
| `/ablauf`     | So läuft ein Handel, Schutz vor Scammern         |
| `/clan`       | Mitglieder mit Namenssuche (`/clan?name=Steve`)  |
| `/bewertungen`| Vouches und Händler-Rangliste                    |
| `/auction-orders` | Item suchen: billigster AH-Preis, beste Order, Preistrend (`/auction-orders?item=ancient_debris`) |
| `/abo`        | Login per `/msg`, Abo kaufen, Endertruhe und Inventar ansehen |
| `/fragen`     | Häufige Fragen                                   |
| `/wiki`       | Wiki-Übersicht mit Suche                         |
| `/spieler`    | Spieler nachschlagen, größte Verkäufer im AH     |
| `/spieler/<name>` | jeder HugoSMP-Spieler: AH-Angebote, Orders, Bewertungen; Endertruhe/Inventar über das Abo |
| `/live`, `/merkliste` | Live-Feed und Merkliste                  |

Der Spieler-Index geht im Hintergrund alle 0,7 s ein Item beim Bot durch (eine Runde ≈ 10 Min.) und merkt sich die Verkäufer aus `ahTop`/`orderTop`. Er sieht pro Item nur die günstigsten Angebote. Vollständig wäre es nur mit einem eigenen Bot-Endpunkt wie `/api/public/spieler/<name>`. Namen prüft der Server über die Mojang-API (`api.mojang.com`).
| `/wiki/<name>`| ein Wiki-Artikel, z. B. `/wiki/preisliste-lesen` |
| `/api/daten`  | die Bot-Daten als JSON (gecacht)                 |
| `/api/preise` | Preise aller Items (vom Bot, 45 s gecacht) |
| `/api/preise/<id>` | ein Item mit Verlauf |
| `/api/konto/…`| Abo-Anfragen, werden an den Bot durchgereicht    |
| `/health`     | `{"ok":true,...}` – für Render und das Keep-Alive |

Neue Seite anlegen: Datei in `seiten/` erstellen und in `server.js` bei `SEITEN` eintragen. Menü, Titel und Sitemap kommen dann automatisch.

## Wiki-Artikel schreiben

Jeder Artikel ist eine Datei in `wiki/`. Der Dateiname wird zur Adresse: `wiki/tipps.md` → `/wiki/tipps`. Oben steht ein kurzer Kopf:

```markdown
---
titel: Tipps für Anfänger
beschreibung: Ein Satz, der in der Übersicht und bei Google erscheint.
kategorie: Erste Schritte
reihenfolge: 3
---
Hier beginnt der Text.

## Eine Zwischenüberschrift

- Listenpunkt mit **fett** und `Befehl`
- [Link zu den Preisen](/preise)

> [!tipp] Grüne Box. Gibt es auch als [!achtung] (orange) und [!info] (gold).
```

Kategorien: `Erste Schritte`, `Handel`, `Sicherheit`, `Clan`, `Nachschlagen`. Außerdem gehen Tabellen (`| a | b |`), nummerierte Listen (`1.`), Codeblöcke und `---` als Trennlinie. Nach dem Push baut Render neu, dann ist der Artikel online – mit Eintrag in der Seitenleiste, Suche und Sitemap.

## Lokal starten

Node 18 oder neuer:

```bash
npm start
```

Dann `http://localhost:3000` öffnen. Mit `npm run dev` startet der Server bei jeder Änderung neu.

## Einstellungen (Umgebungsvariablen)

| Variable          | Standard                                   |
|-------------------|--------------------------------------------|
| `COREMARKET_API`  | `https://hugo.vortexpvp.eu/api/public`     |
| `DISCORD_INVITE`  | `https://discord.gg/UT6dYchUB`             |
| `CACHE_SEKUNDEN`  | `30`                                       |
| `PORT`            | wird von Render gesetzt, lokal `3000`      |
| `BOT_URL`         | Adresse des Bots, Standard: aus `COREMARKET_API` (`https://hugo.vortexpvp.eu`) |
| `PREISE_API`      | Preise vom Bot (Preis-Scanner, ab Bot 4.2.0), Standard: `COREMARKET_API` + `/preise` |
| `PREISE_DEMO`     | `auto` (Demo-Daten, bis der Bot echte liefert), `an` oder `aus` |
| `ITEM_BILDER`     | Quelle der Item-Bilder, Standard: `https://assets.mcasset.cloud/1.21.4/assets/minecraft/textures/{art}/{id}.png` |

Eine Einladung, die im Bot eingetragen ist, hat Vorrang vor `DISCORD_INVITE`.

## Auf Render einrichten

Die Seite ist jetzt ein **Web Service**, keine Static Site mehr.

1. Im Bot (Admin-Website): Einstellungen → Öffentliche Website → „Daten freigeben“ anhaken.
2. Render: **New → Blueprint** → dieses Repository wählen. Render übernimmt alles aus `render.yaml`.
   Oder von Hand: **New → Web Service**, Runtime *Node*, Build Command `npm install`, Start Command `node server.js`, Health Check Path `/health`.
3. Die alte Static Site auf Render danach löschen. Soll die Adresse `coremarket.onrender.com` bleiben, die alte Seite zuerst löschen und dann den neuen Dienst mit dem Namen `coremarket` anlegen.
4. Optional: Settings → Custom Domain, z. B. `coremarket.vortexpvp.eu`.

## Marktplatz

Unter `/markt` handeln Spieler Spawner untereinander (auch Spieler außerhalb des Clans):

1. Anmelden mit dem Bot-Login (Code per `/msg` an den Bank-Account, wie beim Abo, ein Abo braucht man nicht).
2. Angebot einstellen: „Ich verkaufe“ oder „Ich suche“, Spawner, Menge, Preis pro Stück, optional VB und Notiz.
3. Ein anderer Spieler drückt „Kaufen“ oder „Verkaufen“ und wählt die Menge. Die Menge ist dann reserviert.
4. Übergabe im Spiel. Danach bewertet **jeder einmal** den anderen mit **Trust, Neutral oder Scam**. Erst wenn beide bewertet haben, ist der Deal abgeschlossen. Vor der ersten Bewertung kann jeder abbrechen.
5. Aus den Bewertungen entsteht der Ruf jedes Spielers (`Trust/Neutral/Scam`), sichtbar bei jedem Angebot und im Profil.

CoreMarket vermittelt nur und haftet nicht. Das steht auf jeder Marktplatz-Seite.

**Speicher:** alles in `daten/markt.json` (oder Pfad aus `MARKT_DATEI`). Auf Render Free geht die Datei bei jedem Neustart verloren, dort zeigt die Seite einen Hinweis „Testbetrieb“. Dauerhaft läuft es auf dem Code-Server:

```bash
cd /app && git clone https://github.com/Lukas3578/CoreMarket.git coremarket-web
```
```bash
cd /app/coremarket-web && PORT=3100 MARKT_DATEI=/app/coremarket-daten/markt.json pm2 start server.js --name coremarket-web
```
```bash
pm2 save
```

Updates holen: `cd /app/coremarket-web && git pull && pm2 restart coremarket-web`. Den Ordner `/app/coremarket-daten` nie löschen, darin liegen alle Angebote, Deals und Bewertungen. Die Website ist dann auf Port 3100 erreichbar und braucht noch eine Domain bzw. einen Tunnel (z. B. wie beim Bot-Panel).

## Keep-Alive

Render (Free) schickt einen Web Service nach etwa 15 Minuten ohne Aufrufe schlafen. Der nächste Besucher wartet dann bis zu einer Minute. `keepalive/keepalive.sh` ruft alle 4 Minuten `/health` auf, damit das nicht passiert. Es braucht nur `bash` und `curl` und läuft auf jedem Linux-Server.

### Schnell testen

```bash
./keepalive/keepalive.sh
```

### Dauerhaft als Dienst (systemd)

```bash
sudo mkdir -p /opt/coremarket
sudo cp keepalive/keepalive.sh /opt/coremarket/
sudo chmod +x /opt/coremarket/keepalive.sh
sudo cp keepalive/coremarket-keepalive.service /etc/systemd/system/
sudo systemctl daemon-reload
sudo systemctl enable --now coremarket-keepalive
```

Läuft es? `systemctl status coremarket-keepalive` – Log live: `journalctl -u coremarket-keepalive -f`.

### Ohne systemd (z. B. in screen oder per Cron)

```bash
screen -dmS keepalive /opt/coremarket/keepalive.sh
```

oder als Cronjob, alle 5 Minuten ein einzelner Aufruf:

```
*/5 * * * * curl -fsS -m 90 https://coremarket.onrender.com/health > /dev/null
```

## Was öffentlich wird – und was nicht

`/api/public` des Bots liefert nur Clan-Name, Mitglieder-Namen mit Clan und „dabei seit“, Preise, Vouch-Statistik mit den neuesten Kommentaren und die Anzahl der Abschlüsse.

**Nie** öffentlich: Geld der Mitglieder, „vertrauenswürdig“, Notizen, Discord-IDs, Bank-Kontostand und Zahlungen.

Die Spielerköpfe kommen von mc-heads.net.
