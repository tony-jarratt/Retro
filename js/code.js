'use strict';

// The squad code: a short hex string that carries a squad, so it can be written down or sent to a friend.
// No storage anywhere; this is the only way a squad is saved.
//
// Layout, in bits: version (4), difficulty (4), mech count (4), then for each mech: chassis (4), armour level (3),
// extra heat sinks (3) and 4 bits for each of the mech's three weapon slots (0 = empty). Then zero padding up to a
// whole hex digit, then an 8-bit checksum (two digits). Shown in groups of four digits joined by dashes.
//
// The checksum is each digit times its odd position weight (1, 3, 5...), added up, mod 256. A single wrong digit
// changes the sum by a non-zero amount (an odd weight times 1 to 15 is never a multiple of 256), so it is always caught.

const CODE_VERSION = 3; // 2: weapon ids are 4 bits (there are more than seven weapons now). 3: every mech has exactly three weapon slots

function pushBits(bits, value, count) {
  for (let i = count - 1; i >= 0; i--) bits.push((value >> i) & 1);
}

function codeChecksum(digits) { // digits: a string of hex digits
  let sum = 0;
  for (let i = 0; i < digits.length; i++) sum += parseInt(digits[i], 16) * (2 * i + 1);
  return sum % 256;
}

function encodeSquad(difficultyName, specs) {
  validateSquad(specs, difficultyName); // throws BuildError for a bad build or an over-budget squad
  const bits = [];
  pushBits(bits, CODE_VERSION, 4);
  pushBits(bits, difficultyOf(difficultyName).code, 4);
  pushBits(bits, specs.length, 4);
  for (const spec of specs) {
    pushBits(bits, spec.chassis, 4);
    pushBits(bits, spec.armour, 3);
    pushBits(bits, spec.sinks, 3);
    for (const id of spec.weapons) pushBits(bits, id, 4);
  }
  while (bits.length % 4 !== 0) bits.push(0);
  let digits = '';
  for (let i = 0; i < bits.length; i += 4) {
    digits += (bits[i] * 8 + bits[i + 1] * 4 + bits[i + 2] * 2 + bits[i + 3]).toString(16).toUpperCase();
  }
  digits += codeChecksum(digits).toString(16).toUpperCase().padStart(2, '0');
  return digits.match(/.{1,4}/g).join('-');
}

// Returns { difficulty, mechs: [spec, ...] }. Throws BuildCodeError (with a distinct `kind`) for anything wrong.
function decodeSquad(text) {
  const clean = String(text).replace(/[\s-]+/g, '').toUpperCase();
  if (!clean) throw new BuildCodeError('length', 'The code is empty');
  const bad = clean.search(/[^0-9A-F]/);
  if (bad >= 0) throw new BuildCodeError('chars', `The code has a character that is not 0-9 or A-F: "${clean[bad]}" at position ${bad + 1}`);
  if (clean.length < 5) throw new BuildCodeError('length', `The code is too short (${clean.length} digits)`);

  const body = clean.slice(0, -2);
  if (codeChecksum(body) !== parseInt(clean.slice(-2), 16)) {
    throw new BuildCodeError('checksum', 'The code does not add up: a digit has been mistyped');
  }
  const bits = [];
  for (const ch of body) pushBits(bits, parseInt(ch, 16), 4);
  let at = 0;
  const take = (count, what) => {
    if (at + count > bits.length) throw new BuildCodeError('length', `The code is too short: it ends while reading ${what}`);
    let value = 0;
    for (let i = 0; i < count; i++) value = value * 2 + bits[at++];
    return value;
  };

  const version = take(4, 'the version');
  if (version !== CODE_VERSION) throw new BuildCodeError('version', `This code is version ${version}; this game reads version ${CODE_VERSION}`);
  const codeOfDifficulty = take(4, 'the difficulty');
  const difficulty = Object.keys(DIFFICULTIES).find(k => DIFFICULTIES[k].code === codeOfDifficulty);
  if (!difficulty) throw new BuildCodeError('difficulty', `Unknown difficulty ${codeOfDifficulty} in the code`);
  const count = take(4, 'the mech count');
  if (count < 1 || count > SQUAD_MAX) throw new BuildCodeError('count', `A squad has 1 to ${SQUAD_MAX} mechs; the code says ${count}`);

  const mechs = [];
  for (let m = 1; m <= count; m++) {
    const chassisId = take(4, `mech ${m}'s chassis`);
    const chassis = CHASSIS.find(c => c.id === chassisId);
    if (!chassis) throw new BuildCodeError('chassis', `Mech ${m}: unknown chassis ${chassisId}`);
    const armour = take(3, `mech ${m}'s armour`);
    const sinks = take(3, `mech ${m}'s heat sinks`);
    const weapons = [];
    for (let s = 0; s < MAX_WEAPONS; s++) {
      const id = take(4, `mech ${m}'s weapon slot ${s + 1}`);
      if (id !== 0 && !WEAPONS.some(w => w.id === id)) throw new BuildCodeError('part', `Mech ${m}, slot ${s + 1}: unknown weapon ${id}`);
      weapons.push(id);
    }
    mechs.push({ chassis: chassisId, armour, sinks, weapons });
  }

  const left = bits.length - at;
  if (left >= 4) throw new BuildCodeError('length', `The code is too long: ${Math.floor(left / 4)} extra digit(s) after the last mech`);
  while (at < bits.length) {
    if (bits[at++] !== 0) throw new BuildCodeError('padding', 'The padding at the end of the code is not zero');
  }

  try {
    validateSquad(mechs, difficulty);
  } catch (e) {
    if (e instanceof BuildError) throw new BuildCodeError(e.kind, `The code is valid but the squad is not: ${e.message}`);
    throw e;
  }
  return { difficulty, mechs };
}
