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

  makeNoiseBuffer() { // a second of white noise, made the first time it is needed
    if (this.noiseBuffer) return;
    const buf = this.ctx.createBuffer(1, this.ctx.sampleRate, this.ctx.sampleRate);
    const data = buf.getChannelData(0);
    for (let i = 0; i < data.length; i++) data[i] = Math.random() * 2 - 1;
    this.noiseBuffer = buf;
  },

  noise(dur, vol = 0.1, filterType = 'lowpass', freq = 1200, when = 0) {
    if (!this.ctx || this.muted) return;
    this.makeNoiseBuffer();
    const t0 = this.ctx.currentTime + when;
    const src = this.ctx.createBufferSource(), filter = this.ctx.createBiquadFilter(), gain = this.ctx.createGain();
    src.buffer = this.noiseBuffer; filter.type = filterType; filter.frequency.value = freq;
    gain.gain.setValueAtTime(vol, t0); gain.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
    src.connect(filter); filter.connect(gain); gain.connect(this.ctx.destination);
    src.start(t0, Math.random()); src.stop(t0 + dur + 0.02);
  },

  // A soft swell of filtered noise that rises and falls: surf on a shore.
  swell(dur, vol, filterType = 'lowpass', freq = 600, when = 0) {
    if (!this.ctx || this.muted) return;
    this.makeNoiseBuffer();
    const t0 = this.ctx.currentTime + when;
    const src = this.ctx.createBufferSource(), filter = this.ctx.createBiquadFilter(), gain = this.ctx.createGain();
    src.buffer = this.noiseBuffer; src.loop = true; filter.type = filterType; filter.frequency.value = freq;
    gain.gain.setValueAtTime(0.0001, t0);
    gain.gain.linearRampToValueAtTime(vol, t0 + dur * 0.45);
    gain.gain.linearRampToValueAtTime(0.0001, t0 + dur);
    src.connect(filter); filter.connect(gain); gain.connect(this.ctx.destination);
    src.start(t0, Math.random()); src.stop(t0 + dur + 0.05);
  },

  play(name) {
    const fn = SOUNDS[name];
    if (!fn) { console.warn(`Unknown sound "${name}"`); return; }
    fn(this);
  },
};

const SOUNDS = {
  raise: (s) => { s.tone(180, 0.12, 'triangle', 0.07, 0, 360); s.noise(0.1, 0.04, 'lowpass', 700); },
  lower: (s) => { s.tone(300, 0.12, 'triangle', 0.07, 0, 140); s.noise(0.1, 0.04, 'lowpass', 500); },
  buzz: (s) => s.tone(110, 0.15, 'square', 0.05, 0, 90),
  settle: (s) => { s.tone(660, 0.1, 'triangle', 0.05); s.tone(880, 0.14, 'triangle', 0.05, 0.08); },
  grew: (s) => [523, 659, 784].forEach((f, i) => s.tone(f, 0.12, 'triangle', 0.05, i * 0.07)),
  drown: (s) => { s.noise(0.35, 0.08, 'lowpass', 900); s.tone(400, 0.3, 'sine', 0.05, 0, 120); },
  fight: (s) => { s.noise(0.15, 0.09, 'bandpass', 1800); s.tone(220, 0.1, 'square', 0.04, 0.05, 160); },
  mine: (s) => { s.tone(900, 0.05, 'square', 0.04); s.tone(700, 0.05, 'square', 0.04, 0.12); s.tone(900, 0.05, 'square', 0.04, 0.24); },
  armed: (s) => [330, 440, 554, 659].forEach((f, i) => s.tone(f, 0.18, 'square', 0.05, i * 0.1)),
  baa: (s) => { for (let i = 0; i < 5; i++) s.tone(420 - i * 12, 0.07, 'sawtooth', 0.03, i * 0.065, 390 - i * 12); }, // a wobbly bleat
  chime: (s) => { s.tone(196, 0.9, 'sine', 0.08); s.tone(294, 0.9, 'sine', 0.05, 0.02); s.tone(392, 0.7, 'triangle', 0.03, 0.04); }, // a stone raised
  horn: (s) => { s.tone(147, 0.5, 'sawtooth', 0.05, 0, 165); s.tone(220, 0.7, 'sawtooth', 0.04, 0.35, 233); },          // pilgrims set out
  crash: (s) => { s.noise(0.6, 0.14, 'lowpass', 500); s.tone(90, 0.5, 'square', 0.05, 0, 45); },                       // a stone falls
  call: (s) => { s.tone(110, 1.6, 'sawtooth', 0.06, 0, 220); s.tone(165, 1.6, 'sawtooth', 0.05, 0.2, 330); s.noise(1.5, 0.08, 'lowpass', 300); },
  surf: (s) => s.swell(2.4, 0.035, 'lowpass', 500 + Math.random() * 300),
  birds: (s) => { const f = 2200 + Math.random() * 900; for (let i = 0; i < 3; i++) s.tone(f + i * 120, 0.06, 'sine', 0.012, i * 0.11, f + 700); },
  rumble: (s) => s.noise(0.5, 0.06, 'lowpass', 250),
  sink: (s) => { s.tone(300, 0.4, 'sine', 0.06, 0, 80); s.noise(0.3, 0.05, 'lowpass', 300); },
  swamp: (s) => { for (let i = 0; i < 4; i++) s.tone(160 + i * 30, 0.12, 'sine', 0.05, i * 0.08, 90); },
  quake: (s) => { s.noise(1.2, 0.16, 'lowpass', 180); s.tone(60, 1.0, 'sawtooth', 0.06, 0, 40); },
  volcano: (s) => { s.noise(1.5, 0.18, 'lowpass', 300); s.tone(90, 0.6, 'sawtooth', 0.08, 0, 300); s.noise(0.8, 0.08, 'highpass', 2500, 0.4); },
  flood: (s) => { s.noise(2.0, 0.12, 'lowpass', 600); s.tone(200, 1.6, 'sine', 0.05, 0, 90); },
  win: (s) => [392, 523, 659, 784, 1047].forEach((f, i) => s.tone(f, 0.3, 'triangle', 0.08, i * 0.14)),
  lose: (s) => [440, 392, 349, 294, 220].forEach((f, i) => s.tone(f, 0.35, 'sawtooth', 0.05, i * 0.24)),
  broken: (s) => { s.noise(0.3, 0.1, 'lowpass', 400); s.tone(150, 0.25, 'sawtooth', 0.04, 0, 70); },
};
