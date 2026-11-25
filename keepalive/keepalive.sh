#!/usr/bin/env bash
# Hält die CoreMarket-Seite auf Render wach.
# Render (Free) legt einen Web-Service nach ~15 Minuten ohne Aufrufe schlafen.
# Dieses Script ruft die Seite regelmäßig auf, damit das nie passiert.
#
# Start:      ./keepalive.sh
# Anpassen:   URL=https://... INTERVALL=240 ./keepalive.sh

URL="${URL:-https://coremarket.onrender.com/health}"
INTERVALL="${INTERVALL:-240}"   # Sekunden zwischen zwei Aufrufen (4 Minuten)
TIMEOUT="${TIMEOUT:-90}"        # Kaltstart auf Render kann bis zu ~60 s dauern
LOG="${LOG:-}"                  # optional: Pfad zu einer Logdatei

log() {
  local zeile="[$(date '+%Y-%m-%d %H:%M:%S')] $*"
  echo "$zeile"
  [ -n "$LOG" ] && echo "$zeile" >> "$LOG"
}

command -v curl >/dev/null || { echo "curl fehlt: sudo apt install curl"; exit 1; }

trap 'log "Beendet."; exit 0' INT TERM
log "Keep-Alive gestartet: $URL alle ${INTERVALL}s"

fehler=0
while true; do
  start=$(date +%s%N)
  code=$(curl -s -o /dev/null -w '%{http_code}' --max-time "$TIMEOUT" \
    -A 'CoreMarket-KeepAlive/1.0' "$URL" 2>/dev/null)
  ms=$(( ($(date +%s%N) - start) / 1000000 ))

  if [ "$code" = "200" ]; then
    [ "$fehler" -gt 0 ] && log "Wieder erreichbar nach $fehler Fehlversuch(en)."
    fehler=0
    # langsame Antwort = Seite war eingeschlafen und musste neu starten
    if [ "$ms" -gt 10000 ]; then log "OK ($ms ms) – war im Kaltstart"; else log "OK ($ms ms)"; fi
    sleep "$INTERVALL"
  else
    fehler=$((fehler + 1))
    log "Fehler: HTTP ${code:-000} nach $ms ms (Versuch $fehler)"
    # bei Fehlern schneller erneut versuchen, maximal alle 30 s
    sleep 30
  fi
done
