#!/bin/bash
# Runs the same checks without a browser, using macOS jsc, and prints every line plus the balance report.
# Usage: Mech/tests/run-jsc.sh   (exit code 0 only if every check passes; add "nobalance" to skip the report)
JSC=/System/Library/Frameworks/JavaScriptCore.framework/Versions/A/Helpers/jsc
HERE="$(cd "$(dirname "$0")" && pwd)"
J="$HERE/../js"
WITH=true
[ "$1" = "nobalance" ] && WITH=false
OUT=$("$JSC" "$J/errors.js" "$J/rng.js" "$J/data.js" "$J/map.js" "$J/scenarios.js" "$J/objectives.js" "$J/rules.js" "$J/code.js" "$J/bay.js" "$J/intro.js" "$J/menu.js" "$J/ai.js" "$J/fireplan.js" "$J/volley.js" \
  "$HERE/planner.js" "$HERE/checks.js" "$HERE/checks-fire.js" "$HERE/checks-code.js" "$HERE/checks-play.js" "$HERE/checks-bay.js" "$HERE/checks-intro.js" "$HERE/checks-maps.js" "$HERE/checks-goals.js" "$HERE/checks-forces.js" \
  -e "runAllChecks(print, $WITH)" 2>&1)
echo "$OUT"
case "$OUT" in *"failures=0"*) exit 0;; *) exit 1;; esac
