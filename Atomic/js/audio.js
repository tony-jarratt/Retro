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
  step: (s) => s.tone(260, 0.04, 'triangle', 0.035, 0, 200),
  push: (s) => { s.noise(0.2, 0.09, 'lowpass', 500); s.tone(110, 0.18, 'sawtooth', 0.04, 0, 70); },
  fill: (s) => { s.noise(0.3, 0.14, 'lowpass', 400); s.tone(90, 0.3, 'sine', 0.12, 0, 40); s.tone(660, 0.1, 'triangle', 0.05, 0.12); },
  hop: (s) => s.tone(300, 0.2, 'square', 0.05, 0, 760),
  bump: (s) => s.tone(130, 0.07, 'square', 0.05, 0, 90),
  pickup: (s) => [523, 659, 784, 1047, 1319].forEach((f, i) => s.tone(f, 0.12, 'triangle', 0.09, i * 0.06)),
  full: (s) => { s.tone(220, 0.1, 'square', 0.05); s.tone(180, 0.14, 'square', 0.05, 0.1); },
  deliver: (s) => { [659, 784, 988, 1319].forEach((f, i) => s.tone(f, 0.18, 'triangle', 0.1, i * 0.11)); s.noise(0.4, 0.06, 'highpass', 3000, 0.3); },
  hit: (s) => { s.tone(200, 0.35, 'sawtooth', 0.09, 0, 60); s.noise(0.3, 0.12, 'bandpass', 1500); },
  room: (s) => s.noise(0.22, 0.05, 'highpass', 2500),
  door: (s) => { s.noise(0.25, 0.07, 'highpass', 2000); s.tone(180, 0.25, 'triangle', 0.05, 0, 320); },
  reset: (s) => { s.tone(500, 0.3, 'triangle', 0.07, 0, 150); },
  zap: (s) => { s.noise(0.12, 0.035, 'highpass', 4500); s.tone(2400, 0.12, 'sawtooth', 0.015, 0, 500); },
  beam: (s) => { s.tone(300, 0.25, 'sine', 0.08, 0, 1400); s.noise(0.25, 0.04, 'highpass', 3500); },
  tick: (s) => s.tone(900, 0.04, 'square', 0.04),
  choose: (s) => { s.tone(520, 0.07, 'triangle', 0.1); s.tone(780, 0.1, 'triangle', 0.1, 0.06); },
  alarm: (s) => { for (let i = 0; i < 3; i++) s.tone(880, 0.12, 'square', 0.05, i * 0.3); },
  win: (s) => {
    s.noise(1.6, 0.12, 'lowpass', 900);
    [392, 523, 659, 784, 1047, 1319, 1568].forEach((f, i) => s.tone(f, 0.3, 'triangle', 0.1, 0.15 + i * 0.14));
  },
  lose: (s) => [440, 392, 349, 294, 220].forEach((f, i) => s.tone(f, 0.35, 'sawtooth', 0.06, i * 0.24)),
};
