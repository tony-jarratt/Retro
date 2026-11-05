'use strict';

// Checks for the squad code, the balance report and the runner. Loaded last.

const SQUAD_SAMPLES = [
  { name: 'one assault mech', difficulty: 'normal', mechs: [{ chassis: 6, armour: 3, sinks: 0, weapons: [3, 5, 1] }] },
  { name: 'three light mechs', difficulty: 'hard', mechs: [
    { chassis: 2, armour: 1, sinks: 0, weapons: [2, 1, 0] },
    { chassis: 1, armour: 2, sinks: 1, weapons: [1, 0, 6] },
    { chassis: 2, armour: 1, sinks: 0, weapons: [0, 0, 7] }] },
  { name: 'mixed squad, empty slots', difficulty: 'easy', mechs: [
    { chassis: 3, armour: 3, sinks: 1, weapons: [2, 0, 4] },
    { chassis: 4, armour: 2, sinks: 0, weapons: [5, 1, 0] }] },
  { name: 'a medium with smoke rockets', difficulty: 'normal', mechs: [{ chassis: 3, armour: 2, sinks: 1, weapons: [2, 6, 8] }] },
  { name: 'a heavy with an array and a howitzer', difficulty: 'easy', mechs: [{ chassis: 5, armour: 2, sinks: 2, weapons: [9, 10, 0] }] },
  { name: 'every field at its top', difficulty: 'easy', mechs: [{ chassis: 1, armour: 7, sinks: 7, weapons: [8, 8, 8] }] },
  { name: 'every field at its bottom', difficulty: 'easy', mechs: [{ chassis: 1, armour: 0, sinks: 0, weapons: [0, 0, 0] }] },
  { name: 'a heavy with its six slots full', difficulty: 'easy', mechs: [{ chassis: 5, armour: 1, sinks: 0, weapons: [3, 5, 0] }] },
];

// Builds a code from raw fields, so a check can make codes that the encoder would refuse. The checksum is
// worked out for you unless `rawChecksum` is given.
function codeFromBits(fields, rawChecksum) {
  const bits = [];
  for (const [value, count] of fields) pushBits(bits, value, count);
  while (bits.length % 4 !== 0) bits.push(0);
  let digits = '';
  for (let i = 0; i < bits.length; i += 4) digits += (bits[i] * 8 + bits[i + 1] * 4 + bits[i + 2] * 2 + bits[i + 3]).toString(16).toUpperCase();
  const sum = rawChecksum === undefined ? codeChecksum(digits) : rawChecksum;
  return digits + sum.toString(16).toUpperCase().padStart(2, '0');
}

check('code: every sample squad survives encode then decode', () => {
  for (const s of SQUAD_SAMPLES) {
    const code = encodeSquad(s.difficulty, s.mechs);
    eq(decodeSquad(code), { difficulty: s.difficulty, mechs: s.mechs }, s.name);
  }
});

check('code: shape, groups and length', () => {
  const code = encodeSquad('hard', SQUAD_SAMPLES[1].mechs);
  assert(/^([0-9A-F]{4}-)*[0-9A-F]{1,4}$/.test(code), 'groups of four joined by dashes: ' + code);
  eq(code.replace(/-/g, '').length, 22, 'two jackals and a skitter: 78 bits, 2 padding, 20 digits, 2 checksum');
  for (const s of SQUAD_SAMPLES) {
    const n = encodeSquad(s.difficulty, s.mechs).replace(/-/g, '').length;
    assert(n <= 22, `${s.name}: ${n} digits is over 22`);
  }
  eq(encodeSquad('normal', SQUAD_SAMPLES[0].mechs).replace(/-/g, '').length, 11, 'one mech');
});

check('code: lower case, spaces and dashes are accepted when reading', () => {
  const s = SQUAD_SAMPLES[2];
  const code = encodeSquad(s.difficulty, s.mechs);
  const plain = code.replace(/-/g, '');
  const want = { difficulty: s.difficulty, mechs: s.mechs };
  eq(decodeSquad(plain), want);
  eq(decodeSquad(code.toLowerCase()), want);
  eq(decodeSquad('  ' + code.replace(/-/g, ' - ') + ' \n'), want);
  eq(decodeSquad(plain.split('').join(' ')), want);
});

check('code: the encoder refuses bad builds and over-budget squads', () => {
  throwsKind(BuildError, 'budget', () => encodeSquad('hard', [{ chassis: 6, armour: 7, sinks: 7, weapons: [5, 5, 1] }]));
  throwsKind(BuildError, 'count', () => encodeSquad('hard', []));
  throwsKind(BuildError, 'difficulty', () => encodeSquad('mild', SQUAD_SAMPLES[0].mechs));
  throwsKind(BuildError, 'slots', () => encodeSquad('hard', [{ chassis: 1, armour: 0, sinks: 0, weapons: [0] }]));
});

check('code: any one mistyped digit is always caught', () => {
  for (const s of SQUAD_SAMPLES) {
    const plain = encodeSquad(s.difficulty, s.mechs).replace(/-/g, '');
    let tried = 0;
    for (let i = 0; i < plain.length; i++) {
      for (const d of '0123456789ABCDEF') {
        if (d === plain[i]) continue;
        const bad = plain.slice(0, i) + d + plain.slice(i + 1);
        try {
          decodeSquad(bad);
        } catch (e) {
          if (!(e instanceof BuildCodeError) || e.kind !== 'checksum') throw new Error(`${s.name}: digit ${i + 1} -> ${d} gave ${e.name} ${e.kind}: ${e.message}`);
          tried++;
          continue;
        }
        throw new Error(`${s.name}: changing digit ${i + 1} to ${d} was not caught`);
      }
    }
    assert(tried === plain.length * 15, 'tried every change');
  }
});

check('code: each way a code can be wrong has its own error', () => {
  const good = encodeSquad('easy', SQUAD_SAMPLES[4].mechs).replace(/-/g, '');
  throwsKind(BuildCodeError, 'length', () => decodeSquad(''));
  throwsKind(BuildCodeError, 'length', () => decodeSquad('  - -  '));
  throwsKind(BuildCodeError, 'chars', () => decodeSquad('12G4-5678'));
  throwsKind(BuildCodeError, 'chars', () => decodeSquad('1234.5678'));
  throwsKind(BuildCodeError, 'length', () => decodeSquad('123'));
  // version 2, difficulty 0, count 1
  throwsKind(BuildCodeError, 'version', () => decodeSquad(codeFromBits([[2, 4], [0, 4], [1, 4], [1, 4], [0, 3], [0, 3], [0, 12]])));
  throwsKind(BuildCodeError, 'difficulty', () => decodeSquad(codeFromBits([[3, 4], [7, 4], [1, 4], [1, 4], [0, 3], [0, 3], [0, 12]])));
  throwsKind(BuildCodeError, 'count', () => decodeSquad(codeFromBits([[3, 4], [0, 4], [0, 4]])));
  throwsKind(BuildCodeError, 'count', () => decodeSquad(codeFromBits([[3, 4], [0, 4], [4, 4], [1, 4], [0, 3], [0, 3], [0, 12]])));
  throwsKind(BuildCodeError, 'chassis', () => decodeSquad(codeFromBits([[3, 4], [0, 4], [1, 4], [15, 4], [0, 3], [0, 3], [0, 12]])));
  throwsKind(BuildCodeError, 'chassis', () => decodeSquad(codeFromBits([[3, 4], [0, 4], [1, 4], [0, 4], [0, 3], [0, 3], [0, 12]])));
  // too short: the header promises a mech and then stops
  throwsKind(BuildCodeError, 'length', () => decodeSquad(codeFromBits([[3, 4], [0, 4], [1, 4], [1, 4]])));
  // too long: a whole extra digit after the last mech
  throwsKind(BuildCodeError, 'length', () => decodeSquad(codeFromBits([[3, 4], [0, 4], [1, 4], [1, 4], [0, 3], [0, 3], [0, 12], [5, 4]])));
  // non-zero padding: a Skitter squad is 12 + 4 + 3 + 3 + 9 = 31 bits, so one padding bit; set it
  throwsKind(BuildCodeError, 'padding', () => decodeSquad(codeFromBits([[3, 4], [0, 4], [1, 4], [1, 4], [0, 3], [0, 3], [0, 12], [1, 1]])));
  // valid code, squad over the budget (a Monolith with everything, on hard)
  const greedy = [[3, 4], [2, 4], [1, 4], [6, 4], [7, 3], [7, 3], [5, 4], [5, 4], [1, 4]];
  throwsKind(BuildCodeError, 'budget', () => decodeSquad(codeFromBits(greedy)));
  throwsKind(BuildCodeError, 'checksum', () => decodeSquad(good.slice(0, -2) + (good.slice(-2) === '00' ? '01' : '00')));
});

// ======================================================================
// the balance report (prints numbers; it does not pass or fail on them)
// ======================================================================
const BALANCE_FIGHTS_PER_SIDE = 25;

function balanceReport() {
  const lines = ['', 'BALANCE: one assault mech vs three light mechs, same budget, scripted planner, ' + (BALANCE_FIGHTS_PER_SIDE * 2) + ' fights each'];
  for (const name of Object.keys(DIFFICULTIES)) {
    const budget = DIFFICULTIES[name].budget;
    const { squads, tally } = balanceRun(budget, BALANCE_FIGHTS_PER_SIDE);
    const decided = tally.super + tally.trio;
    const share = decided ? Math.round(100 * tally.super / decided) : 0;
    lines.push(`  budget ${budget} (${name}): single ${tally.super}, trio ${tally.trio}, draws ${tally.draw}, timeouts ${tally.timeout}; single wins ${share}% of decided fights; average ${(tally.rounds / tally.fights).toFixed(1)} rounds`);
    lines.push(`    single mech costs ${squadCost(squads.super)}, trio costs ${squadCost(squads.trio)}`);
    if (decided && (share < 30 || share > 70)) lines.push('    NOTE: outside 30-70%, the costs or stats probably need tuning');
  }
  lines.push('ENEMY FORCES (credits): ' + Object.keys(ENEMY_FORCES).map(n => `${n} ${ENEMY_FORCES[n].map(f => squadCost(f.mechs)).join('/')} (player budget ${DIFFICULTIES[n].budget})`).join(', '));
  lines.push(...shotReport(20));
  lines.push(...goalReport(5));
  lines.push(...forceReport(6));
  return lines;
}

// ======================================================================
// the runner
// ======================================================================
function runAllChecks(log, withBalance) {
  const lines = [];
  const say = text => { lines.push(text); if (log) log(text); };
  let passed = 0, failed = 0;
  for (const c of CHECKS) {
    try {
      c.fn();
      passed += 1;
      say('ok    ' + c.name);
    } catch (e) {
      failed += 1;
      say('FAIL  ' + c.name);
      say('        ' + (e && e.message ? e.message : e));
    }
  }
  if (withBalance) for (const line of balanceReport()) say(line);
  say(`DONE checks=${CHECKS.length} passed=${passed} failures=${failed}`);
  return { passed, failed, lines };
}
