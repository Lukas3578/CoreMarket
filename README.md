# CoreMarket – Website

Öffentliche Website von CoreMarket, dem Spawner-Clan auf HugoSMP. Läuft als kleiner Node-Server (ohne Abhängigkeiten) auf Render und zeigt live vom CoreMarket-Bot:

- Spawner-Preise mit Staffelpreisen und Preisrechner
- Clan-Mitglieder (CM0/CM1) mit Namenssuche
- Vouches und Bewertungen
- HugoSMP-Spielerzahl

## Aufbau

```
server.js            Webserver: Seite ausliefern, Bot-Daten cachen, /health
public/              alles, was der Browser bekommt (HTML, CSS, JS, Logo)
keepalive/           Script, das die Seite auf Render wach hält
render.yaml          Render-Blueprint
```

Der Server holt die Daten alle 30 Sekunden vom Bot und legt sie direkt in die Seite. Besucher sehen die Preise also sofort, ohne auf den Bot zu warten. Ist der Bot kurz offline, zeigt die Seite die letzten bekannten Daten weiter an.

| Pfad          | Inhalt                                           |
|---------------|--------------------------------------------------|
| `/`           | die Seite, mit den aktuellen Daten eingebettet   |
| `/api/daten`  | die Bot-Daten als JSON (gecacht)                 |
| `/health`     | `{"ok":true,...}` – für Render und das Keep-Alive |

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
