#!/bin/bash
# Plays the real game in headless Chrome with synthetic mouse and key events (tests/play.html) and prints the report.
# Usage: Cocoa/tests/run-play.sh   (exit code 0 only if every step passes; takes a minute or two because it plays in real time)
CH="/Applications/Google Chrome.app/Contents/MacOS/Google Chrome"
PORT=9338
HERE="$(cd "$(dirname "$0")" && pwd)"
PROFILE="$(mktemp -d)"
"$CH" --headless=new --disable-gpu --allow-file-access-from-files --user-data-dir="$PROFILE" \
  --remote-debugging-port=$PORT --window-size=960,600 "file://$HERE/play.html" >/dev/null 2>&1 &
PID=$!
TITLE=""
for i in $(seq 1 280); do
  TITLE=$(curl -s localhost:$PORT/json | python3 -c 'import sys, json; print(" ".join(t.get("title", "") for t in json.load(sys.stdin) if t.get("title", "").startswith("DONE")))' 2>/dev/null)
  case "$TITLE" in *DONE*) break;; esac
  sleep 1
done
kill $PID; rm -rf "${PROFILE:?}" 2>/dev/null
if [ -z "$TITLE" ]; then echo "The play test did not finish within 280 seconds."; exit 1; fi
echo "$TITLE" | tr '|' '\n'
case "$TITLE" in *"failures=0"*) exit 0;; *) exit 1;; esac
