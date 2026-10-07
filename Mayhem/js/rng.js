'use strict';

// A small seeded random number generator (mulberry32), so a game, and any test, can be replayed from its seed.
class Rng {
  constructor(seed) {
    this.s = seed >>> 0;
  }

  next() { // 0 up to (not including) 1
    this.s = (this.s + 0x6D2B79F5) >>> 0;
    let t = this.s;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  }

  int(n) { return Math.floor(this.next() * n); } // 0 to n-1
  range(a, b) { return a + this.int(b - a + 1); } // a to b, both included
  chance(percent) { return this.next() * 100 < percent; }

  pick(list) {
    if (!list.length) throw new Error('Rng.pick: the list is empty');
    return list[this.int(list.length)];
  }

  shuffle(list) { // returns a new shuffled copy
    const out = list.slice();
    for (let i = out.length - 1; i > 0; i--) {
      const j = this.int(i + 1);
      [out[i], out[j]] = [out[j], out[i]];
    }
    return out;
  }
}
