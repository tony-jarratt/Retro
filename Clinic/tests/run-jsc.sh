#!/bin/bash
# Runs the rules checks without a browser, using macOS jsc.
# Usage: Clinic/tests/run-jsc.sh   (exit code 0 only if every check passes)
JSC=/System/Library/Frameworks/JavaScriptCore.framework/Versions/A/Helpers/jsc
HERE="$(cd "$(dirname "$0")" && pwd)"
OUT=$("$JSC" "$HERE/../js/sim.js" "$HERE/checks.js" -e "runAllChecks(print)" 2>&1)
echo "$OUT"
case "$OUT" in *"failures=0"*) exit 0;; *) exit 1;; esac
