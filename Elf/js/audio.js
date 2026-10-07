'use strict';

// Tiny WebAudio synth. Browsers only allow audio after a user gesture, so init() is
// called from the first keypress.
const Sound = {
  ctx: null,
  muted: false,
  unsupported: false,

  init() {
    if (this.ctx) {
      // Some browsers start the context suspended; a key press is the chance to wake it.
      if (this.ctx.state === 'suspended') this.ctx.resume().catch((err) => console.warn('Could not resume audio:', err));
      return;
    }
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) {
      this.unsupported = true;
      console.warn('Web Audio is not supported in this browser; the game will be silent.');
      return;
    }
    this.ctx = new AC();
  },

  tone(freq, dur, type = 'square', vol = 0.08, when = 0, slideTo = null) {
    if (!this.ctx || this.muted) return;
    const t0 = this.ctx.currentTime + when;
    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();
    osc.type = type;
    osc.frequency.setValueAtTime(freq, t0);
    if (slideTo) osc.frequency.exponentialRampToValueAtTime(slideTo, t0 + dur);
    gain.gain.setValueAtTime(vol, t0);
    gain.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
    osc.connect(gain);
    gain.connect(this.ctx.destination);
    osc.start(t0);
    osc.stop(t0 + dur + 0.02);
  },

  play(name) {
    const fn = SOUNDS[name];
    if (!fn) {
      console.warn(`Unknown sound "${name}"`);
      return;
    }
    fn(this);
  },
};

const NOTE = { C5: 523, D5: 587, E5: 659, F5: 698, G5: 784, A5: 880, B5: 988, C6: 1047 };

const SOUNDS = {
  jump: (s) => s.tone(300, 0.18, 'square', 0.05, 0, 700),
  pickup: (s) => { s.tone(660, 0.08, 'triangle', 0.1); s.tone(990, 0.12, 'triangle', 0.1, 0.07); },
  full: (s) => s.tone(200, 0.12, 'square', 0.05),
  wrap: (s) => [NOTE.C5, NOTE.E5, NOTE.G5, NOTE.C6].forEach((f, i) => s.tone(f, 0.12, 'triangle', 0.1, i * 0.07)),
  deliver: (s) => [NOTE.G5, NOTE.C6, NOTE.E5, NOTE.G5, NOTE.C6].forEach((f, i) => s.tone(f, 0.14, 'triangle', 0.11, i * 0.09)),
  bonk: (s) => { s.tone(220, 0.22, 'square', 0.09, 0, 60); s.tone(110, 0.2, 'triangle', 0.1, 0.05); },
  wake: (s) => s.tone(120, 0.4, 'sawtooth', 0.06, 0, 240),
  caught: (s) => s.tone(500, 0.6, 'sawtooth', 0.08, 0, 70),
  tick: (s) => s.tone(880, 0.05, 'square', 0.04),
  win: (s) => {
    // "We wish you a merry Christmas" (traditional)
    const seq = [[NOTE.G5, 1], [NOTE.C6, 1], [NOTE.C6, 0.5], [NOTE.D5 * 2, 0.5], [NOTE.C6, 0.5], [NOTE.B5, 0.5], [NOTE.A5, 1], [NOTE.A5, 1]];
    let t = 0;
    for (const [f, beats] of seq) { s.tone(f, beats * 0.2, 'triangle', 0.1, t); t += beats * 0.22; }
  },
  gameover: (s) => [NOTE.G5, NOTE.E5, NOTE.C5].forEach((f, i) => s.tone(f / 2, 0.3, 'sawtooth', 0.07, i * 0.25)),
};
