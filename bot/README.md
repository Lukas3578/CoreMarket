# Preis-Tracker für den CoreMarket-Bot

`preistracker.js` gehört **in den Bot** (nicht auf Render). Es scannt jede Nacht das Auktionshaus und die Orders und liefert die Daten für die Seite [/auction-orders](https://coremarket.onrender.com/auction-orders).

## Was es macht

| Wann | Was |
|---|---|
| jede Nacht um **0:00** (Europe/Berlin) | **großer Scan**: jedes Item mit `/ah <item>` und `/orders <item>` suchen, 2 Seiten durchblättern |
| alle **2 Std.** | **schneller Scan** der beliebtesten ~30 Items (für den 24-Std.-Graphen) |
| immer, wenn der Live-Leser das AH liest | `liveAh(items)` setzt den billigsten Preis sofort |

Pro Item wird gespeichert:

- **AH:** billigster Preis pro Stück, Ø der 10 billigsten (Ausreißer raus), Anzahl Angebote, die 8 billigsten Angebote
- **Orders:** höchster Preis pro Stück, Ø der 10 besten, Anzahl, die 8 besten Orders

Verlauf: Nacht-Scans 400 Tage, Schnell-Scans und Live-Punkte 3 Tage. Alles in `daten/preise.json`.
War der Bot um 0 Uhr offline, holt er den Scan bis 6 Uhr nach. Bricht ein Scan ab, macht er an der Stelle weiter.
Items, die 3 Nächte lang kein Angebot und keine Order hatten, werden nur jeden 3. Tag gescannt.

Dauer: rund 1.100 Items × 2 Suchen. Mit den Standard-Pausen sind das etwa 2 bis 2,5 Stunden. Schneller geht es mit kleinerem `pauseMs` (Achtung Spam-Kick) oder `seiten: 1`.

## Einbauen

```js
const { PreisTracker } = require('./preistracker');

const preise = new PreisTracker(bot, {
  datei: './daten/preise.json',
  // Falls der Bot schon eine Warteschlange für Fenster hat (Endertruhe ansehen, Live-AH …), hier rein,
  // damit sich nichts überschneidet:
  // exklusiv: fn => fensterWarteschlange.hinzufuegen(fn),
});
bot.once('spawn', () => preise.starten());

// Webserver des Bots – Express:
app.use(preise.middleware());            // GET /api/public/preise und /api/public/preise/<id>
// … oder node:http:
// if (preise.middleware()(req, res)) return;

// Im Live-Leser vom Auktionshaus, nach jedem Lesen (gleiche Items wie /api/kunde/markt):
preise.liveAh(markt.items);

// Von Hand starten, z. B. aus dem Admin-Panel:
// preise.vollerScan({ grund: 'manuell' });
```

Die Website holt sich die Daten von `<BOT_URL>/api/public/preise`. Sobald dort echte Daten kommen, verschwinden die Demo-Daten auf der Seite von selbst.

## Was ihr für HugoSMP prüfen müsst

Der Code kennt das genaue Aussehen der HugoSMP-Menüs nicht. Drei Sachen kurz im Spiel nachschauen:

1. **Befehle:** Sucht `/ah Ancient Debris` wirklich nach dem Item? Und `/orders Ancient Debris`? Sonst anpassen:
   ```js
   befehle: { ah: b => `/ah search ${b}`, orders: b => `/orders search ${b}` },
   ```
2. **Lore-Texte:** In welcher Zeile steht der Preis, der Verkäufer, bei Orders der Preis pro Stück? Die Muster stehen in `mineflayerLeser` (`preisZeile`, `stueckZeile`, `verkaeuferZeile`, `mengeZeile`) und lassen sich über `leserEinstellungen` ändern.
3. **Nächste Seite:** Der Leser sucht einen Knopf mit „Nächste“, „Weiter“, „Next“ oder einem Pfeil im Namen (`weiter`).

**Am einfachsten:** Der Bot liest das Auktionshaus ja schon für die Live-Seite. Diesen Leser einfach weiterverwenden:

```js
const preise = new PreisTracker(bot, {
  leser: {
    // muss eine Liste liefern: [{ id, name, menge, preis, proStueck, verkaeufer, echt }]
    ah: (begriff, item) => euerAhLeser.suchen(begriff, { seiten: 2 }),
    orders: (begriff, item) => euerOrderLeser.suchen(begriff, { seiten: 2 }),
  },
});
```

Alle Preise in **Millionen**, wie überall im Bot (`1` = 1M, `0.018` = 18K).

## Alle Einstellungen

Siehe `STANDARD` oben in `preistracker.js`: `scanUm`, `zeitzone`, `seiten`, `schnittAnzahl`, `pauseMs`, `schnellAlleMin`, `schnellAnzahl`, `immer` (Items, die immer im schnellen Scan sind), `items` (eigene Liste statt aller Items), `weglassen` (Items, die nie gescannt werden).

## Testen ohne Server

```bash
node --test bot/preistracker.test.js
```

Die Tests spielen einen Bot mit falschem `/ah`- und `/orders`-Menü durch (Blättern, Fakes, Stacks, Live-Preise, Speichern, API, Zeitplan mit Sommer- und Winterzeit).
