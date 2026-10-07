// Sound, all synthesised with the Web Audio API (no audio files).
//
// Browsers only allow sound after the player has pressed a key, so soundUnlock() is called from the
// keydown handler and the audio graph is built on the first key press. M mutes and unmutes.
//
// Looping sounds (engine, grass, tyre squeal, rain) are always running and just have their volume and
// pitch steered by soundUpdate() every frame. One-off sounds (beeps, thuds) are made when they happen.

const SOUND_VOLUME = 0.5;
const sound = { ctx: null, master: null, muted: false, unavailable: false, lastThud: -1 };
let soundNodes = null;

function soundUnlock() {
  if (sound.unavailable) return;
  if (sound.ctx) {
    if (sound.ctx.state === 'suspended') sound.ctx.resume();
    return;
  }
  const AudioCtor = window.AudioContext || window.webkitAudioContext;
  if (!AudioCtor) {
    sound.unavailable = true;
    console.warn('Web Audio is not available in this browser, so the game will be silent.');
    return;
  }
  try {
    sound.ctx = new AudioCtor();
    buildSoundGraph();
  } catch (err) {
    sound.unavailable = true;
    sound.ctx = null;
    console.warn('Could not start audio (' + err.message + '), so the game will be silent.');
  }
}

function soundToggle() {
  sound.muted = !sound.muted;
  if (sound.master) sound.master.gain.value = sound.muted ? 0 : SOUND_VOLUME;
}

function buildSoundGraph() {
  const ctx = sound.ctx;
  sound.master = ctx.createGain();
  sound.master.gain.value = sound.muted ? 0 : SOUND_VOLUME;
  sound.master.connect(ctx.destination);

  // two seconds of white noise, looped, is the raw material for grass, squeal, rain and thuds
  const noise = ctx.createBuffer(1, ctx.sampleRate * 2, ctx.sampleRate);
  const data = noise.getChannelData(0);
  for (let i = 0; i < data.length; i++) data[i] = Math.random() * 2 - 1;

  const loopNoise = (filterType, freq, q) => {
    const src = ctx.createBufferSource();
    src.buffer = noise;
    src.loop = true;
    const filter = ctx.createBiquadFilter();
    filter.type = filterType;
    filter.frequency.value = freq;
    filter.Q.value = q;
    const gain = ctx.createGain();
    gain.gain.value = 0;
    src.connect(filter);
    filter.connect(gain);
    gain.connect(sound.master);
    src.start();
    return { filter, gain };
  };

  // engine: a sawtooth and a square an octave down, through a low-pass filter that opens with speed
  const osc1 = ctx.createOscillator();
  osc1.type = 'sawtooth';
  const osc2 = ctx.createOscillator();
  osc2.type = 'square';
  const lower = ctx.createGain();
  lower.gain.value = 0.5;
  const engineFilter = ctx.createBiquadFilter();
  engineFilter.type = 'lowpass';
  engineFilter.frequency.value = 800;
  const engineGain = ctx.createGain();
  engineGain.gain.value = 0;
  osc1.connect(engineFilter);
  osc2.connect(lower);
  lower.connect(engineFilter);
  engineFilter.connect(engineGain);
  engineGain.connect(sound.master);
  osc1.start();
  osc2.start();

  soundNodes = {
    noise,
    osc1, osc2, engineFilter, engineGain,
    grass: loopNoise('lowpass', 420, 0.7),
    squeal: loopNoise('bandpass', 1700, 9),
    rain: loopNoise('highpass', 2600, 0.5),
  };
}

// s: { speedPct, gas, engineOn, slip (0..1), offroad, wet (0..1) }
function soundUpdate(s) {
  if (!soundNodes) return;
  const n = soundNodes;
  const t = sound.ctx.currentTime;
  const set = (param, value) => param.setTargetAtTime(value, t, 0.05);

  // Five "gears": the pitch climbs through each one and drops when it changes up.
  const sp = s.speedPct;
  const gear = Math.min(4, Math.floor(sp * 5));
  const rpm = sp * 5 - gear;
  const pitch = 70 + 110 * rpm + 25 * gear;
  set(n.osc1.frequency, pitch);
  set(n.osc2.frequency, pitch / 2);
  set(n.engineFilter.frequency, 500 + 2200 * sp);
  set(n.engineGain.gain, s.engineOn ? 0.05 + 0.07 * sp + (s.gas ? 0.03 : 0) : 0);

  set(n.squeal.gain.gain, Math.max(0, s.slip - 0.45) * 0.3 * Math.min(1, sp * 4));
  set(n.squeal.filter.frequency, 1500 + 900 * s.slip);
  set(n.grass.gain.gain, s.offroad ? 0.18 * Math.min(1, sp * 3) : 0);
  set(n.rain.gain.gain, 0.09 * s.wet);
}

// A short tone. slideTo bends the pitch, delay is seconds from now.
function soundBlip(freq, duration, type, volume, slideTo, delay) {
  if (!soundNodes || sound.muted) return;
  const ctx = sound.ctx;
  const t = ctx.currentTime + (delay || 0);
  const osc = ctx.createOscillator();
  const gain = ctx.createGain();
  osc.type = type || 'sine';
  osc.frequency.setValueAtTime(freq, t);
  if (slideTo) osc.frequency.exponentialRampToValueAtTime(slideTo, t + duration);
  gain.gain.setValueAtTime(volume, t);
  gain.gain.exponentialRampToValueAtTime(0.001, t + duration);
  osc.connect(gain);
  gain.connect(sound.master);
  osc.start(t);
  osc.stop(t + duration + 0.02);
}

// A dull knock made from a burst of low-passed noise. Limited to a few a second.
function soundThud(volume) {
  if (!soundNodes || sound.muted) return;
  const ctx = sound.ctx;
  const t = ctx.currentTime;
  if (t - sound.lastThud < 0.15) return;
  sound.lastThud = t;
  const src = ctx.createBufferSource();
  src.buffer = soundNodes.noise;
  const filter = ctx.createBiquadFilter();
  filter.type = 'lowpass';
  filter.frequency.value = 350;
  const gain = ctx.createGain();
  gain.gain.setValueAtTime(volume, t);
  gain.gain.exponentialRampToValueAtTime(0.001, t + 0.25);
  src.connect(filter);
  filter.connect(gain);
  gain.connect(sound.master);
  src.start(t, Math.random());
  src.stop(t + 0.3);
}

function soundCountdown() { soundBlip(440, 0.18, 'square', 0.12); }
function soundGo() { soundBlip(880, 0.5, 'square', 0.14); }
function soundLap() { soundBlip(1320, 0.1, 'sine', 0.12); }
function soundWall() { soundThud(0.5); soundBlip(110, 0.2, 'sawtooth', 0.12, 55); }
function soundBump() { soundThud(0.25); }
function soundFinish() {
  [523, 659, 784, 1047].forEach((f, i) => soundBlip(f, 0.25, 'triangle', 0.16, null, i * 0.14));
}
// The championship fanfare: gold gets the full "ta-ta-ta-TAAA" with a chord and a bass note; silver and bronze
// get a shorter rising jingle.
function soundFanfare(place) {
  if (place === 0) {
    [[392, 0], [392, 0.14], [392, 0.28]].forEach(([f, d]) => soundBlip(f, 0.11, 'square', 0.1, null, d));
    soundBlip(523, 0.5, 'square', 0.1, null, 0.42);
    soundBlip(262, 0.5, 'triangle', 0.16, null, 0.42);
    [[659, 1.0], [587, 1.14], [659, 1.28]].forEach(([f, d]) => soundBlip(f, 0.12, 'square', 0.1, null, d));
    soundBlip(784, 1.1, 'square', 0.1, null, 1.44);
    soundBlip(523, 1.1, 'triangle', 0.14, null, 1.44);
    soundBlip(131, 1.1, 'sawtooth', 0.05, null, 1.44);
  } else {
    [[523, 0], [659, 0.16]].forEach(([f, d]) => soundBlip(f, 0.15, 'square', 0.1, null, d));
    soundBlip(784, 0.7, 'square', 0.1, null, 0.32);
    soundBlip(392, 0.7, 'triangle', 0.14, null, 0.32);
  }
}
function soundPit(result) {   // result: 'perfect' | 'good' | 'slow'
  if (result === 'perfect') { soundBlip(1046, 0.12, 'sine', 0.16); soundBlip(1568, 0.16, 'sine', 0.16, null, 0.08); }
  else if (result === 'good') soundBlip(740, 0.15, 'triangle', 0.16);
  else soundBlip(150, 0.3, 'sawtooth', 0.14, 90);
}
function soundLimiter() { soundBlip(520, 0.07, 'square', 0.1); soundBlip(780, 0.09, 'square', 0.1, null, 0.08); }   // pit limiter on
function soundGun() { soundBlip(1900, 0.09, 'sawtooth', 0.06, 1500); }   // a wheel gun
function soundPitDone() { soundBlip(660, 0.12, 'square', 0.12); soundBlip(990, 0.25, 'square', 0.12, null, 0.12); }

// ---- Title music ----
// An 8-bit style tune, composed note by note and played live (no audio files) on four "chip" channels:
// a quarter-width square wave for the lead, a thin square wave for a quick arpeggio, a triangle wave
// for the bass, and noise for the drums. It loops while a menu screen is up and fades out afterwards.
// It starts on the first key press, because browsers do not allow sound before that.
const MUSIC_BPM = 150;
const MUSIC_STEP = 60 / MUSIC_BPM / 4;   // one sixteenth note, in seconds
const MUSIC_LEVEL = 0.35;

const NOTE_OFFSETS = { C: 0, 'C#': 1, D: 2, 'D#': 3, E: 4, F: 5, 'F#': 6, G: 7, 'G#': 8, A: 9, 'A#': 10, B: 11 };
function noteMidi(name) {
  const m = /^([A-G]#?)(\d)$/.exec(name);
  if (!m) throw new Error('music: "' + name + '" is not a note name like E5 or G#5');
  return 12 * (Number(m[2]) + 1) + NOTE_OFFSETS[m[1]];
}
function midiFreq(midi) { return 440 * Math.pow(2, (midi - 69) / 12); }

// Chords as MIDI notes (for the arpeggio) and their bass roots.
const MUSIC_CHORDS = { Am: [57, 60, 64], F: [53, 57, 60], C: [60, 64, 67], G: [55, 59, 62], E: [52, 56, 59], Em: [52, 55, 59] };
const MUSIC_ROOTS = { Am: 45, F: 41, C: 48, G: 43, E: 40, Em: 40 };

// Sixteen bars in A minor. A lead note is "name steps" (a step is a sixteenth, so 4 steps = a beat);
// R is a rest. Every bar must add up to 16 steps.
const MUSIC_BARS = [
  { chord: 'Am', lead: 'E5 2,E5 2,A5 2,G5 2,E5 2,C5 2,E5 4' },
  { chord: 'F',  lead: 'F5 2,F5 2,A5 2,C6 2,A5 2,F5 2,A5 4' },
  { chord: 'C',  lead: 'G5 2,G5 2,C6 2,B5 2,G5 2,E5 2,G5 4' },
  { chord: 'G',  lead: 'D5 2,D5 2,G5 2,B5 2,D6 4,B5 2,G5 2' },
  { chord: 'Am', lead: 'A5 4,C6 2,B5 2,A5 2,E5 2,A5 4' },
  { chord: 'F',  lead: 'C6 4,A5 2,F5 2,A5 2,C6 2,F6 2,R 2' },
  { chord: 'G',  lead: 'B5 2,D6 2,G6 4,D6 2,B5 2,G5 4' },
  { chord: 'E',  lead: 'E5 2,G#5 2,B5 2,E6 4,D6 2,B5 2,G#5 2' },
  { chord: 'F',  lead: 'A5 4,A5 2,C6 2,A5 4,F5 4' },
  { chord: 'G',  lead: 'B5 4,B5 2,D6 2,B5 4,G5 4' },
  { chord: 'Em', lead: 'G5 4,G5 2,B5 2,E6 8' },
  { chord: 'Am', lead: 'E6 4,C6 2,A5 2,C6 4,E6 4' },
  { chord: 'F',  lead: 'F6 4,E6 2,D6 2,C6 4,A5 4' },
  { chord: 'G',  lead: 'D6 4,C6 2,B5 2,G5 4,B5 4' },
  { chord: 'C',  lead: 'C6 4,E6 2,G6 2,E6 4,C6 4' },
  { chord: 'E',  lead: 'B5 2,G#5 2,B5 2,E6 2,D6 2,B5 2,G#5 2,E5 2' },
];

// Turn the bars into one event list per sixteenth step: { lead, arp, bass }.
const MUSIC_SONG = (() => {
  const steps = MUSIC_BARS.length * 16;
  const song = Array.from({ length: steps }, () => ({ lead: null, arp: 0, bass: null }));
  MUSIC_BARS.forEach((bar, b) => {
    const chord = MUSIC_CHORDS[bar.chord], root = MUSIC_ROOTS[bar.chord];
    if (!chord) throw new Error('music: bar ' + (b + 1) + ' uses an unknown chord "' + bar.chord + '"');
    let at = 0;
    for (const item of bar.lead.split(',')) {
      const [name, len] = item.trim().split(' ');
      const length = Number(len);
      if (name !== 'R') song[b * 16 + at].lead = { freq: midiFreq(noteMidi(name)), steps: length };
      at += length;
    }
    if (at !== 16) throw new Error('music: bar ' + (b + 1) + ' (' + bar.chord + ') adds up to ' + at + ' steps, not 16');
    for (let s = 0; s < 16; s++) {
      const ev = song[b * 16 + s];
      ev.arp = midiFreq([chord[0], chord[1], chord[2], chord[1]][s % 4] + 12);      // chord tones, quickly, an octave up
      if (s % 2 === 0) ev.bass = { freq: midiFreq(root + ([0, 0, 12, 0, 0, 0, 12, 0][s / 2])), steps: 2 };   // driving eighth notes
    }
  });
  return song;
})();

const music = { playing: false, step: 0, nextTime: 0, gain: null, waves: null };

// A square wave with the given duty cycle (0.5 is an ordinary square; thinner ones sound reedier).
function pulseWave(duty) {
  const harmonics = 48, real = new Float32Array(harmonics + 1), imag = new Float32Array(harmonics + 1);
  for (let n = 1; n <= harmonics; n++) {
    real[n] = (2 / (n * Math.PI)) * Math.sin(2 * Math.PI * n * duty);
    imag[n] = (2 / (n * Math.PI)) * (1 - Math.cos(2 * Math.PI * n * duty));
  }
  return sound.ctx.createPeriodicWave(real, imag);
}

function musicStart() {
  const ctx = sound.ctx, t = ctx.currentTime;
  if (!music.gain) {
    music.gain = ctx.createGain();
    music.gain.gain.value = 0;
    music.gain.connect(sound.master);
    music.waves = { lead: pulseWave(0.25), arp: pulseWave(0.125) };
  }
  music.gain.gain.setTargetAtTime(MUSIC_LEVEL, t, 0.05);
  music.playing = true;
  music.step = 0;
  music.nextTime = t + 0.08;
}

function musicStop() {
  music.playing = false;
  music.gain.gain.setTargetAtTime(0, sound.ctx.currentTime, 0.12);   // fade out; notes already queued are quiet
}

// One tone on a chip channel: 'lead' and 'arp' are pulse waves, 'bass' is a triangle.
function musicNote(channel, freq, duration, t, volume) {
  const ctx = sound.ctx;
  const osc = ctx.createOscillator(), gain = ctx.createGain();
  if (channel === 'bass') osc.type = 'triangle';
  else osc.setPeriodicWave(music.waves[channel]);
  osc.frequency.setValueAtTime(freq, t);
  gain.gain.setValueAtTime(0.0001, t);
  gain.gain.linearRampToValueAtTime(volume, t + 0.006);
  gain.gain.setValueAtTime(volume * 0.75, t + Math.min(0.05, duration * 0.4));
  gain.gain.linearRampToValueAtTime(0.0001, t + duration);
  osc.connect(gain);
  gain.connect(music.gain);
  osc.start(t);
  osc.stop(t + duration + 0.02);
}

function musicKick(t) {
  const ctx = sound.ctx, osc = ctx.createOscillator(), gain = ctx.createGain();
  osc.type = 'sine';
  osc.frequency.setValueAtTime(150, t);
  osc.frequency.exponentialRampToValueAtTime(42, t + 0.11);
  gain.gain.setValueAtTime(0.5, t);
  gain.gain.exponentialRampToValueAtTime(0.001, t + 0.14);
  osc.connect(gain);
  gain.connect(music.gain);
  osc.start(t);
  osc.stop(t + 0.16);
}

// A burst of noise: the snare is longer and lower, the hi-hat short and bright.
function musicNoise(t, duration, volume, filterType, freq) {
  const ctx = sound.ctx, src = ctx.createBufferSource(), filter = ctx.createBiquadFilter(), gain = ctx.createGain();
  src.buffer = soundNodes.noise;
  filter.type = filterType;
  filter.frequency.value = freq;
  gain.gain.setValueAtTime(volume, t);
  gain.gain.exponentialRampToValueAtTime(0.001, t + duration);
  src.connect(filter);
  filter.connect(gain);
  gain.connect(music.gain);
  src.start(t, Math.random());
  src.stop(t + duration + 0.02);
}

function musicScheduleStep(step, t) {
  const ev = MUSIC_SONG[step], s16 = step % 16;
  if (ev.lead) musicNote('lead', ev.lead.freq, ev.lead.steps * MUSIC_STEP * 0.92, t, 0.19);
  musicNote('arp', ev.arp, MUSIC_STEP * 0.85, t, 0.05);
  if (ev.bass) musicNote('bass', ev.bass.freq, ev.bass.steps * MUSIC_STEP * 0.9, t, 0.32);
  if (s16 === 0 || s16 === 8 || s16 === 10) musicKick(t);
  if (s16 === 4 || s16 === 12) musicNoise(t, 0.13, 0.22, 'bandpass', 2000);
  if (s16 % 2 === 0) musicNoise(t, 0.04, s16 % 4 === 2 ? 0.07 : 0.04, 'highpass', 7000);
}

// Called every frame: start or stop the music, and queue the next few notes ahead of the clock.
function musicUpdate(wanted) {
  if (!soundNodes) return;   // sound has not been unlocked yet (no key pressed)
  if (wanted && !music.playing) musicStart();
  else if (!wanted && music.playing) musicStop();
  if (!music.playing) return;
  const now = sound.ctx.currentTime;
  if (music.nextTime < now) music.nextTime = now + 0.05;   // after a pause, carry on from here
  while (music.nextTime < now + 0.2) {
    musicScheduleStep(music.step, music.nextTime);
    music.nextTime += MUSIC_STEP;
    music.step = (music.step + 1) % MUSIC_SONG.length;
  }
}
