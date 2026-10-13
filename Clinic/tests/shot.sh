#!/bin/bash
# Saves a screenshot of tests/shot.html, or prints the script error that stopped it.
# Usage: Clinic/tests/shot.sh out.png "query string"
CH="/Applications/Google Chrome.app/Contents/MacOS/Google Chrome"
HERE="$(cd "$(dirname "$0")" && pwd)"
OUT="$1"
PROFILE="$(mktemp -d)"
"$CH" --headless=new --disable-gpu --allow-file-access-from-files --user-data-dir="$PROFILE" --hide-scrollbars \
  --remote-debugging-port=9341 "file://$HERE/shot.html?$2" >/dev/null 2>&1 &
PID=$!
TITLE=""
for i in $(seq 1 20); do
  sleep 1
  TITLE=$(curl -s localhost:9341/json | python3 -c 'import sys, json; print(" ".join(t["title"] for t in json.load(sys.stdin) if t["type"] == "page"))' 2>/dev/null)
  case "$TITLE" in *ready*|*ERROR*) break;; esac
done
kill $PID; wait $PID 2>/dev/null; rm -rf "$PROFILE"
case "$TITLE" in *ready*) ;; *) echo "Page did not render: $TITLE"; exit 1;; esac
rm -f "$OUT"
PROFILE="$(mktemp -d)"
"$CH" --headless=new --disable-gpu --allow-file-access-from-files --user-data-dir="$PROFILE" --hide-scrollbars \
  --window-size=960,600 --screenshot="$OUT" "file://$HERE/shot.html?$2" >/dev/null 2>&1 &
PID=$!
for i in $(seq 1 30); do sleep 1; [ -s "$OUT" ] && break; done
sleep 1; kill $PID 2>/dev/null; wait $PID 2>/dev/null; rm -rf "$PROFILE"
[ -s "$OUT" ] || { echo "No screenshot was written"; exit 1; }
