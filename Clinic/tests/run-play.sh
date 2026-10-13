#!/bin/bash
# Clicks through the game in headless Chrome (tests/play.html) and prints the result.
# Usage: Clinic/tests/run-play.sh   (exit code 0 only if every check passes)
CH="/Applications/Google Chrome.app/Contents/MacOS/Google Chrome"
HERE="$(cd "$(dirname "$0")" && pwd)"
PROFILE="$(mktemp -d)"
"$CH" --headless=new --disable-gpu --allow-file-access-from-files --user-data-dir="$PROFILE" --window-size=960,600 \
  --remote-debugging-port=9342 "file://$HERE/play.html" >/dev/null 2>&1 &
PID=$!
TITLE=""
for i in $(seq 1 30); do
  sleep 1
  TITLE=$(curl -s localhost:9342/json | python3 -c 'import sys, json; print(" ".join(t["title"] for t in json.load(sys.stdin) if t["type"] == "page"))' 2>/dev/null)
  case "$TITLE" in *DONE*|*ERROR*) break;; esac
done
kill $PID; wait $PID 2>/dev/null; rm -rf "$PROFILE"
echo "$TITLE"
case "$TITLE" in *"failures=0"*) exit 0;; *) exit 1;; esac
