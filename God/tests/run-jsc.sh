#!/bin/bash
# Runs the rules checks without a browser, using macOS jsc, and prints every line.
# Usage: God/tests/run-jsc.sh   (exit code 0 only if every check passes)
JSC=/System/Library/Frameworks/JavaScriptCore.framework/Versions/A/Helpers/jsc
HERE="$(cd "$(dirname "$0")" && pwd)"
J="$HERE/../js"
OUT=$("$JSC" "$J/errors.js" "$J/rng.js" "$J/data.js" "$J/font.js" "$J/terrain.js" "$J/view.js" "$J/raster.js" "$J/world.js" "$J/stones.js" "$J/powers.js" "$J/ai.js" "$J/sprites.js" \
  "$HERE/checks.js" "$HERE/checks-land.js" "$HERE/checks-people.js" "$HERE/checks-rival.js" "$HERE/checks-powers.js" "$HERE/checks-mines.js" "$HERE/checks-stones.js" \
  -e "runAllChecks(print)" 2>&1)
echo "$OUT"
case "$OUT" in *"DONE failures=0 "*) exit 0;; *) exit 1;; esac
