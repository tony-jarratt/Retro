'use strict';

// Title music, in the same chip style as the other Retro games: written note by note and played live (no audio
// files). A brisk, heroic tune in A minor with a wobbling "theremin" lead (that sound is in every 1950s science
// fiction film), a walking bass and a light beat. It plays on the title and help screens and fades out when the
// game starts. Browsers need a key press before they allow sound, so the title screen asks for one.
const MUSIC_BPM = 132;
const MUSIC_STEP = 60 / MUSIC_BPM / 4; // one sixteenth note, in seconds
const MUSIC_LEVEL = 0.55;

const NOTE_OFFSETS = { C: 0, 'C#': 1, D: 2, 'D#': 3, E: 4, F: 5, 'F#': 6, G: 7, 'G#': 8, A: 9, 'A#': 10, B: 11 };
function noteMidi(name) {
  const m = /^([A-G]#?)(\d)$/.exec(name);
  if (!m) throw new Error(`music: "${name}" is not a note name like E5 or G#5`);
  return 12 * (Number(m[2]) + 1) + NOTE_OFFSETS[m[1]];
}
function midiFreq(midi) { return 440 * Math.pow(2, (midi - 69) / 12); }

const MUSIC_CHORDS = { Am: [57, 60, 64], F: [53, 57, 60], C: [60, 64, 67], G: [55, 59, 62], Dm: [50, 53, 57], E: [52, 56, 59] };
const MUSIC_ROOTS = { Am: 45, F: 41, C: 48, G: 43, Dm: 38, E: 40 };

// Sixteen bars. A lead note is "name steps" (a step is a sixteenth, so 4 steps = a beat); R is a rest.
// Every bar must add up to 16 steps.
const MUSIC_BARS = [
  { chord: 'Am', lead: 'A5 3,A5 1,C6 4,E6 4,D6 2,C6 2' },
  { chord: 'Am', lead: 'B5 3,B5 1,D6 4,C6 4,A5 4' },
  { chord: 'F',  lead: 'A5 3,A5 1,C6 4,F6 4,E6 2,C6 2' },
  { chord: 'G',  lead: 'B5 4,D6 4,G6 4,F6 2,D6 2' },
  { chord: 'Am', lead: 'E6 3,E6 1,C6 4,A5 4,C6 4' },
  { chord: 'C',  lead: 'G5 2,C6 2,E6 4,G6 4,E6 2,C6 2' },
  { chord: 'Dm', lead: 'D6 4,F6 4,A6 4,F6 2,D6 2' },
  { chord: 'E',  lead: 'E6 4,G#5 2,B5 2,E6 4,R 4' },
  { chord: 'F',  lead: 'F6 4,E6 2,C6 2,A5 4,C6 4' },
  { chord: 'G',  lead: 'D6 4,B5 2,G5 2,B5 4,D6 4' },
  { chord: 'Am', lead: 'C6 2,E6 2,A6 4,G6 2,E6 2,C6 4' },
  { chord: 'C',  lead: 'E6 4,G6 4,C7 4,G6 2,E6 2' },
  { chord: 'Dm', lead: 'F6 2,D6 2,A5 2,D6 2,F6 4,A6 4' },
  { chord: 'E',  lead: 'G#5 2,B5 2,E6 2,G#6 2,E6 4,B5 4' },
  { chord: 'Am', lead: 'A5 4,C6 2,E6 2,A6 8' },
  { chord: 'E',  lead: 'G#6 4,E6 2,B5 2,G#5 4,R 4' },
];

const MUSIC_SONG = (() => {
  const song = Array.from({ length: MUSIC_BARS.length * 16 }, () => ({ lead: null, arp: 0, bass: null }));
  MUSIC_BARS.forEach((bar, b) => {
    const chord = MUSIC_CHORDS[bar.chord], root = MUSIC_ROOTS[bar.chord];
    if (!chord) throw new Error(`music: bar ${b + 1} uses an unknown chord "${bar.chord}"`);
    let at = 0;
    for (const item of bar.lead.split(',')) {
      const [name, len] = item.trim().split(' ');
      const length = Number(len);
      if (name !== 'R') song[b * 16 + at].lead = { freq: midiFreq(noteMidi(name)), steps: length };
      at += length;
    }
    if (at !== 16) throw new Error(`music: bar ${b + 1} (${bar.chord}) adds up to ${at} steps, not 16`);
    const walk = [0, 7, 12, 7, 0, 7, 12, 10]; // a walking bass
    for (let s = 0; s < 16; s++) {
      const ev = song[b * 16 + s];
      if (s % 2 === 0) ev.arp = midiFreq([chord[0], chord[1], chord[2], chord[1]][(s / 2) % 4] + 12);
      if (s % 2 === 0) ev.bass = { freq: midiFreq(root + walk[s / 2]), steps: 2 };
    }
  });
  return song;
})();

const musicState = { playing: false, step: 0, nextTime: 0, gain: null, waves: null, noise: null };

function pulseWave(duty) {
  const harmonics = 48, real = new Float32Array(harmonics + 1), imag = new Float32Array(harmonics + 1);
  for (let n = 1; n <= harmonics; n++) {
    real[n] = (2 / (n * Math.PI)) * Math.sin(2 * Math.PI * n * duty);
    imag[n] = (2 / (n * Math.PI)) * (1 - Math.cos(2 * Math.PI * n * duty));
  }
  return Sound.ctx.createPeriodicWave(real, imag);
}

function musicStart() {
  const c = Sound.ctx, t = c.currentTime;
  if (!musicState.gain) {
    musicState.gain = c.createGain();
    musicState.gain.gain.value = 0;
    musicState.gain.connect(c.destination);
    musicState.waves = { arp: pulseWave(0.125) };
    const noise = c.createBuffer(1, c.sampleRate, c.sampleRate);
    const data = noise.getChannelData(0);
    for (let i = 0; i < data.length; i++) data[i] = Math.random() * 2 - 1;
    musicState.noise = noise;
  }
  musicState.gain.gain.setTargetAtTime(MUSIC_LEVEL, t, 0.05);
  musicState.playing = true; musicState.step = 0; musicState.nextTime = t + 0.08;
}

function musicStop() {
  musicState.playing = false;
  musicState.gain.gain.setTargetAtTime(0, Sound.ctx.currentTime, 0.12);
}

// The lead: a sine with a slow wobble, like a theremin.
function musicTheremin(freq, duration, t, volume) {
  const c = Sound.ctx;
  const osc = c.createOscillator(), gain = c.createGain(), lfo = c.createOscillator(), depth = c.createGain();
  osc.type = 'sine';
  osc.frequency.setValueAtTime(freq, t);
  lfo.frequency.setValueAtTime(5.5, t); depth.gain.setValueAtTime(freq * 0.012, t);
  lfo.connect(depth); depth.connect(osc.frequency);
  gain.gain.setValueAtTime(0.0001, t);
  gain.gain.linearRampToValueAtTime(volume, t + 0.05);
  gain.gain.setValueAtTime(volume * 0.85, t + Math.max(0.06, duration - 0.06));
  gain.gain.linearRampToValueAtTime(0.0001, t + duration);
  osc.connect(gain); gain.connect(musicState.gain);
  osc.start(t); lfo.start(t); osc.stop(t + duration + 0.02); lfo.stop(t + duration + 0.02);
}

function musicNote(channel, freq, duration, t, volume) {
  const c = Sound.ctx;
  const osc = c.createOscillator(), gain = c.createGain();
  if (channel === 'bass') osc.type = 'triangle';
  else osc.setPeriodicWave(musicState.waves[channel]);
  osc.frequency.setValueAtTime(freq, t);
  gain.gain.setValueAtTime(0.0001, t);
  gain.gain.linearRampToValueAtTime(volume, t + 0.008);
  gain.gain.setValueAtTime(volume * 0.75, t + Math.min(0.05, duration * 0.4));
  gain.gain.linearRampToValueAtTime(0.0001, t + duration);
  osc.connect(gain); gain.connect(musicState.gain);
  osc.start(t); osc.stop(t + duration + 0.02);
}

function musicKick(t) {
  const c = Sound.ctx, osc = c.createOscillator(), gain = c.createGain();
  osc.type = 'sine';
  osc.frequency.setValueAtTime(150, t); osc.frequency.exponentialRampToValueAtTime(42, t + 0.11);
  gain.gain.setValueAtTime(0.3, t); gain.gain.exponentialRampToValueAtTime(0.001, t + 0.14);
  osc.connect(gain); gain.connect(musicState.gain);
  osc.start(t); osc.stop(t + 0.16);
}

function musicNoise(t, duration, volume, filterType, freq) {
  const c = Sound.ctx;
  const src = c.createBufferSource(), filter = c.createBiquadFilter(), gain = c.createGain();
  src.buffer = musicState.noise; filter.type = filterType; filter.frequency.value = freq;
  gain.gain.setValueAtTime(volume, t); gain.gain.exponentialRampToValueAtTime(0.001, t + duration);
  src.connect(filter); filter.connect(gain); gain.connect(musicState.gain);
  src.start(t, Math.random()); src.stop(t + duration + 0.02);
}

function musicScheduleStep(step, t) {
  const ev = MUSIC_SONG[step], s16 = step % 16;
  if (ev.lead) musicTheremin(ev.lead.freq, ev.lead.steps * MUSIC_STEP * 0.95, t, 0.16);
  if (ev.arp) musicNote('arp', ev.arp, MUSIC_STEP * 1.6, t, 0.026);
  if (ev.bass) musicNote('bass', ev.bass.freq, ev.bass.steps * MUSIC_STEP * 0.85, t, 0.22);
  if (s16 === 0 || s16 === 8 || s16 === 10) musicKick(t);
  if (s16 === 4 || s16 === 12) musicNoise(t, 0.1, 0.1, 'bandpass', 2200);
  if (s16 % 2 === 0) musicNoise(t, 0.04, s16 % 4 === 2 ? 0.045 : 0.022, 'highpass', 7500);
}

function musicUpdate(wanted) {
  if (!Sound.ctx) return;
  const playing = wanted && !Sound.muted;
  if (playing && !musicState.playing) musicStart();
  else if (!playing && musicState.playing) musicStop();
  if (!musicState.playing) return;
  const now = Sound.ctx.currentTime;
  if (musicState.nextTime < now) musicState.nextTime = now + 0.05;
  while (musicState.nextTime < now + 0.2) {
    musicScheduleStep(musicState.step, musicState.nextTime);
    musicState.nextTime += MUSIC_STEP;
    musicState.step = (musicState.step + 1) % MUSIC_SONG.length;
  }
}
