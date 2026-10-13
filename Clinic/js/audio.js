'use strict';

// Tiny WebAudio synth for the sound effects. Browsers only allow audio after a key press or click, so init()
// is called from the first one.
const Sound = {
  ctx: null, muted: false, unsupported: false, noiseBuffer: null,

  init() {
    if (this.ctx) {
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
    const osc = this.ctx.createOscillator(), gain = this.ctx.createGain();
    osc.type = type;
    osc.frequency.setValueAtTime(freq, t0);
    if (slideTo) osc.frequency.exponentialRampToValueAtTime(slideTo, t0 + dur);
    gain.gain.setValueAtTime(vol, t0);
    gain.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
    osc.connect(gain); gain.connect(this.ctx.destination);
    osc.start(t0); osc.stop(t0 + dur + 0.02);
  },

  noise(dur, vol = 0.1, filterType = 'lowpass', freq = 1200, when = 0) {
    if (!this.ctx || this.muted) return;
    if (!this.noiseBuffer) {
      const buf = this.ctx.createBuffer(1, this.ctx.sampleRate, this.ctx.sampleRate);
      const data = buf.getChannelData(0);
      for (let i = 0; i < data.length; i++) data[i] = Math.random() * 2 - 1;
      this.noiseBuffer = buf;
    }
    const t0 = this.ctx.currentTime + when;
    const src = this.ctx.createBufferSource(), filter = this.ctx.createBiquadFilter(), gain = this.ctx.createGain();
    src.buffer = this.noiseBuffer; filter.type = filterType; filter.frequency.value = freq;
    gain.gain.setValueAtTime(vol, t0); gain.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
    src.connect(filter); filter.connect(gain); gain.connect(this.ctx.destination);
    src.start(t0, Math.random()); src.stop(t0 + dur + 0.02);
  },

  play(name) {
    const fn = SOUNDS[name];
    if (!fn) { console.warn(`Unknown sound "${name}"`); return; }
    fn(this);
  },
};

const SOUNDS = {
  cash: (s) => { s.tone(1320, 0.08, 'square', 0.04); s.tone(1760, 0.16, 'square', 0.04, 0.07); },
  build: (s) => { s.noise(0.25, 0.12, 'lowpass', 600); for (let i = 0; i < 3; i++) s.tone(140, 0.06, 'square', 0.06, 0.08 + i * 0.1, 90); },
  demolish: (s) => { s.noise(0.6, 0.16, 'lowpass', 400); s.tone(90, 0.5, 'sawtooth', 0.06, 0, 40); },
  hire: (s) => [659, 523, 784].forEach((f, i) => s.tone(f, 0.18, 'triangle', 0.07, i * 0.12)),
  fire: (s) => s.tone(400, 0.3, 'sawtooth', 0.05, 0, 120),
  cured: (s) => [523, 659, 784, 1047].forEach((f, i) => s.tone(f, 0.14, 'triangle', 0.07, i * 0.07)),
  storm: (s) => { s.tone(160, 0.25, 'sawtooth', 0.07, 0, 110); s.tone(130, 0.3, 'sawtooth', 0.07, 0.2, 80); s.noise(0.2, 0.06, 'lowpass', 300, 0.45); },
  sad: (s) => [392, 370, 349, 294].forEach((f, i) => s.tone(f, i === 3 ? 0.5 : 0.22, 'sawtooth', 0.04, i * 0.22)),
  ding: (s) => s.tone(1568, 0.25, 'sine', 0.035),
  creak: (s) => s.tone(180, 0.35, 'sawtooth', 0.02, 0, 260),
  payday: (s) => { for (let i = 0; i < 4; i++) s.tone(1200 + i * 120, 0.06, 'square', 0.03, i * 0.05); },
  stone: (s) => { s.tone(1800, 0.25, 'sawtooth', 0.03, 0, 600); s.noise(0.35, 0.14, 'lowpass', 700, 0.12); s.tone(70, 0.3, 'square', 0.07, 0.12, 45); },
  click: (s) => s.tone(700, 0.04, 'square', 0.04),
  nope: (s) => { s.tone(150, 0.12, 'square', 0.05); s.tone(120, 0.16, 'square', 0.05, 0.1); },
  win: (s) => {
    s.noise(1.6, 0.1, 'lowpass', 900);
    [392, 523, 659, 784, 1047, 1319, 1568].forEach((f, i) => s.tone(f, 0.3, 'triangle', 0.1, 0.15 + i * 0.14));
  },
  lose: (s) => [440, 392, 349, 294, 220].forEach((f, i) => s.tone(f, 0.35, 'sawtooth', 0.06, i * 0.24)),
};
