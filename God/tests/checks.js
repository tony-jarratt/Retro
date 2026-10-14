'use strict';

// The checks for the rules. Runs in macOS jsc (run-jsc.sh). runAllChecks(log) logs a line per check and ends with
// "DONE failures=N".

const CHECKS = [];
function check(name, fn) { CHECKS.push({ name, fn }); }

function assert(cond, message) { if (!cond) throw new Error('assertion failed: ' + (message || '')); }
function eq(actual, expected, message) {
  if (JSON.stringify(actual) !== JSON.stringify(expected)) {
    throw new Error(`${message || 'values differ'}: expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`);
  }
}
function throwsKind(Cls, kind, fn) {
  try {
    fn();
  } catch (e) {
    if (!(e instanceof Cls)) throw new Error(`expected ${Cls.name}, got ${e && e.name}: ${e && e.message}`);
    if (e.kind !== kind) throw new Error(`expected kind "${kind}", got "${e.kind}": ${e.message}`);
    return;
  }
  throw new Error(`expected ${Cls.name} (${kind}) but nothing was thrown`);
}

function runAllChecks(log) {
  let failed = 0;
  for (const { name, fn } of CHECKS) {
    try { fn(); log(`ok   ${name}`); } catch (e) { failed++; log(`FAIL ${name}: ${e.message}`); }
  }
  log(`DONE failures=${failed} of ${CHECKS.length}`);
  return failed;
}
