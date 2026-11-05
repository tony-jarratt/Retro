#!/bin/bash
# Runs tests/check.html in headless Chrome and prints the result the page puts in its title.
# Usage: Hexfire/tests/run-checks.sh   (exit code 0 only if every check passes)
# To read the full list of checks and the balance report, open tests/check.html in a browser,
# or run tests/run-jsc.sh, which prints everything.
CH="/Applications/Google Chrome.app/Contents/MacOS/Google Chrome"
PORT=9337
HERE="$(cd "$(dirname "$0")" && pwd)"
PROFILE="$(mktemp -d)"
"$CH" --headless=new --disable-gpu --allow-file-access-from-files --user-data-dir="$PROFILE" \
  --remote-debugging-port=$PORT "file://$HERE/check.html?nobalance" >/dev/null 2>&1 &
PID=$!
TITLE=""
for i in $(seq 1 120); do
  TITLE=$(curl -s localhost:$PORT/json | python3 -c 'import sys, json; print(" ".join(t.get("title", "") for t in json.load(sys.stdin) if t.get("title", "").startswith("DONE")))' 2>/dev/null)
  case "$TITLE" in
    *DONE*) kill $PID; rm -rf "$PROFILE" 2>/dev/null; echo "$TITLE"; case "$TITLE" in *"failures=0"*) exit 0;; *) exit 1;; esac;;
  esac
  sleep 1
done
kill $PID; rm -rf "$PROFILE" 2>/dev/null
echo "Checks did not finish within 120 seconds. Last page title: $TITLE"
exit 1
