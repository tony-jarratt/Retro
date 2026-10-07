'use strict';

// Tiny WebAudio synth for the sound effects. Browsers only allow audio after a key press or click, so init()
// is called from the first one.
const Sound = {
  ctx: null,
  muted: false,
  unsupported: false,
  noiseBuffer: null,

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

  // A burst of filtered noise (splats, puffs, squelches).
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
    src.buffer = this.noiseBuffer;
    filter.type = filterType;
    filter.frequency.value = freq;
    gain.gain.setValueAtTime(vol, t0);
    gain.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
    src.connect(filter);
    filter.connect(gain);
    gain.connect(this.ctx.destination);
    src.start(t0, Math.random());
    src.stop(t0 + dur + 0.02);
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

const SOUNDS = {
  tick: (s) => s.tone(900, 0.04, 'square', 0.04),
  choose: (s) => { s.tone(520, 0.07, 'triangle', 0.1); s.tone(780, 0.1, 'triangle', 0.1, 0.06); },
  step: (s) => s.tone(300, 0.05, 'triangle', 0.05, 0, 200),
  cast: (s) => [523, 659, 784, 1047, 1319].forEach((f, i) => s.tone(f, 0.1, 'triangle', 0.08, i * 0.05)),
  fizzle: (s) => [392, 370, 349, 311].forEach((f, i) => s.tone(f, 0.22, 'sawtooth', 0.05, i * 0.17, f * 0.93)),
  summon: (s) => { s.tone(250, 0.14, 'square', 0.07, 0, 900); s.tone(1175, 0.12, 'triangle', 0.08, 0.1); s.tone(1568, 0.14, 'triangle', 0.08, 0.17); },
  hit: (s) => { s.noise(0.18, 0.2, 'lowpass', 1400); s.tone(180, 0.2, 'sine', 0.14, 0, 60); },
  miss: (s) => s.tone(300, 0.28, 'sine', 0.12, 0, 800),
  poof: (s) => { s.noise(0.3, 0.12, 'highpass', 2500); [880, 660, 520].forEach((f, i) => s.tone(f, 0.1, 'triangle', 0.06, 0.04 * i)); },
  throw: (s) => s.tone(400, 0.25, 'triangle', 0.06, 0, 1100),
  tickle: (s) => { s.tone(262, 0.28, 'sawtooth', 0.06, 0, 247); s.tone(233, 0.5, 'sawtooth', 0.06, 0.3, 175); }, // womp womp
  buff: (s) => [880, 1175, 1568].forEach((f, i) => s.tone(f, 0.16, 'triangle', 0.09, i * 0.1)),
  blob: (s) => { s.tone(120, 0.3, 'sawtooth', 0.06, 0, 70); s.noise(0.25, 0.08, 'lowpass', 500); },
  ink: (s) => { s.tone(220, 0.18, 'sine', 0.09, 0, 90); s.noise(0.18, 0.06, 'lowpass', 600); },
  passage: (s) => { s.tone(90, 0.5, 'sawtooth', 0.05, 0, 170); s.tone(660, 0.3, 'triangle', 0.05, 0.3, 880); },
  slide: (s) => { s.noise(0.3, 0.07, 'highpass', 3000); s.tone(520, 0.3, 'sine', 0.05, 0, 200); },
  teleport: (s) => { s.tone(330, 0.14, 'triangle', 0.08, 0, 990); s.tone(990, 0.2, 'triangle', 0.07, 0.12, 330); },
  out: (s) => [330, 311, 294, 262].forEach((f, i) => s.tone(f, 0.28, 'sawtooth', 0.06, i * 0.22)),
  bell: (s) => { for (let i = 0; i < 4; i++) { s.tone(1568, 0.3, 'triangle', 0.08, i * 0.16); s.tone(2093, 0.3, 'sine', 0.04, i * 0.16); } },
  round: (s) => { s.tone(659, 0.12, 'triangle', 0.08); s.tone(880, 0.18, 'triangle', 0.08, 0.1); },
  win: (s) => {
    const seq = [[523, 0.12], [523, 0.12], [523, 0.12], [698, 0.4], [587, 0.14], [587, 0.14], [587, 0.14], [784, 0.5]];
    let t = 0;
    for (const [f, d] of seq) { s.tone(f, d * 1.3, 'triangle', 0.1, t); s.tone(f * 2, d, 'square', 0.02, t); t += d * 1.15; }
  },
};
