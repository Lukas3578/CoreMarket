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
preise-demo.js       Demo-Preise für /auction-orders, solange der Bot noch keine liefert
bot/                 Preis-Tracker zum Einbauen in den Bot (siehe bot/README.md)
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
| `PREISE_API`      | Preise vom Bot, Standard: `COREMARKET_API` + `/preise` |
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
