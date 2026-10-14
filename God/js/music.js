'use strict';

// Background music while you play, in the same chip style as the other Retro games: written note by note and played
// live (no audio files). Three tunes that loop; each game picks one at random, and M turns the music off and on. Each has a pulse-wave
// lead, a harp-like broken chord (triangle), a triangle bass and a soft drum. The engine is adapted from
// Elf/js/music.js.
const MUSIC_LEVEL = 0.35;

const NOTE_OFFSETS = { C: 0, 'C#': 1, D: 2, 'D#': 3, E: 4, F: 5, 'F#': 6, G: 7, 'G#': 8, A: 9, 'A#': 10, B: 11 };
function noteMidi(name) {
  const m = /^([A-G]#?)(\d)$/.exec(name);
  if (!m) throw new Error(`music: "${name}" is not a note name like E5 or F#5`);
  return 12 * (Number(m[2]) + 1) + NOTE_OFFSETS[m[1]];
}
function midiFreq(midi) { return 440 * Math.pow(2, (midi - 69) / 12); }

// Chords as MIDI notes (for the harp) and their bass roots.
const MUSIC_CHORDS = { D: [62, 66, 69], Dm: [62, 65, 69], G: [55, 59, 62], Bm: [59, 62, 66], A: [57, 61, 64], Am: [57, 60, 64],
  Em: [52, 55, 59], C: [60, 64, 67], F: [53, 57, 60] };
const MUSIC_ROOTS = { D: 50, Dm: 50, G: 43, Bm: 47, A: 45, Am: 45, Em: 40, C: 48, F: 41 };

// A lead note is "name steps" (a step is a sixteenth, so 4 steps = a beat); R is a rest. Every bar adds up to 16.
//   bass:  'half' plays the root then the fifth, a half note each; 'beat' bounces root, fifth, root, fifth
//   drum:  'march' is a thump on beat 1 and a rim tap on beat 3; 'skip' adds taps on the off-beats
//   leadLevel, harpSteps: how loud the lead is and how long each harp note rings
const TUNES = [
  { name: 'OLD STONES', bpm: 84, bass: 'half', drum: 'march', leadLevel: 0.08, harpSteps: 4, bars: [
    ['Dm', 'D5 6,E5 2,F5 4,A5 4'], ['C', 'G5 6,F5 2,E5 8'], ['Dm', 'F5 4,G5 4,A5 4,C6 4'], ['Am', 'C6 4,B5 4,A5 8'],
    ['F', 'A5 4,C6 4,F5 8'], ['C', 'E5 4,G5 4,C6 6,B5 2'], ['G', 'B5 4,D6 4,G5 4,B5 4'], ['Dm', 'A5 12,R 4'],
    ['Dm', 'D6 6,C6 2,A5 4,F5 4'], ['C', 'E5 4,G5 2,C6 2,E6 8'], ['Am', 'E6 4,D6 4,C6 4,A5 4'], ['G', 'B5 6,A5 2,G5 8'],
    ['F', 'A5 4,F5 4,C6 6,A5 2'], ['C', 'G5 4,E5 4,G5 4,C6 4'], ['G', 'D6 4,B5 4,G5 4,B5 4'], ['Dm', 'D6 12,R 4'],
  ] },
  { name: 'MARKET DAY', bpm: 116, bass: 'beat', drum: 'skip', leadLevel: 0.07, harpSteps: 2, bars: [
    ['G', 'G5 2,B5 2,D6 2,B5 2,G5 2,B5 2,D6 4'], ['C', 'E6 2,D6 2,C6 2,B5 2,C6 4,G5 4'],
    ['D', 'F#5 2,A5 2,D6 2,A5 2,F#5 2,A5 2,D6 4'], ['G', 'B5 4,G5 2,A5 2,B5 4,R 4'],
    ['Em', 'E5 2,G5 2,B5 2,G5 2,E6 4,D6 4'], ['C', 'C6 2,B5 2,A5 2,G5 2,E5 4,G5 4'],
    ['Am', 'A5 2,C6 2,E6 2,C6 2,A5 4,B5 4'], ['D', 'D6 8,R 4,D5 4'],
    ['G', 'G5 4,G5 2,A5 2,B5 4,D6 4'], ['C', 'E6 4,E6 2,D6 2,C6 4,E6 4'],
    ['D', 'D6 2,C6 2,B5 2,A5 2,F#5 4,A5 4'], ['G', 'G5 4,B5 4,D6 8'],
    ['Em', 'E6 2,D6 2,B5 2,G5 2,B5 4,E6 4'], ['Am', 'C6 2,B5 2,A5 2,E5 2,A5 4,C6 4'],
    ['D', 'D6 2,F#6 2,A6 2,F#6 2,D6 4,C6 4'], ['G', 'B5 4,G5 4,G5 4,R 4'],
  ] },
  { name: 'GREEN HILLS', bpm: 96, bass: 'half', drum: 'march', leadLevel: 0.09, harpSteps: 3, bars: [
    ['D', 'F#5 4,A5 4,D6 6,C#6 2'], ['G', 'B5 4,A5 2,G5 2,D5 8'], ['Bm', 'F#5 4,G5 2,A5 2,B5 6,A5 2'], ['A', 'E5 8,R 4,C#5 2,E5 2'],
    ['D', 'F#5 4,A5 4,D6 4,E6 4'], ['G', 'F#6 4,E6 2,D6 2,B5 8'], ['Em', 'G5 4,B5 2,E6 2,D6 4,B5 4'], ['A', 'A5 12,R 4'],
    ['Bm', 'D6 4,C#6 2,B5 2,F#5 8'], ['G', 'G5 4,A5 2,B5 2,D6 6,B5 2'], ['D', 'A5 4,F#5 2,A5 2,D6 8'], ['A', 'C#6 4,B5 2,A5 2,E5 8'],
    ['Bm', 'B5 4,D6 4,F#6 6,E6 2'], ['Em', 'E6 4,D6 2,B5 2,G5 8'], ['G', 'B5 4,D6 2,G6 2,F#6 4,D6 4'], ['A', 'E6 6,C#6 2,A5 4,R 4'],
  ] },
];

// Turn a tune's bars into one event list per sixteenth step: { lead, harp, bass, drum }.
function buildSong(tune) {
  const song = Array.from({ length: tune.bars.length * 16 }, () => ({ lead: null, harp: 0, bass: null, drum: null }));
  tune.bars.forEach(([chordName, lead], b) => {
    const chord = MUSIC_CHORDS[chordName], root = MUSIC_ROOTS[chordName];
    if (!chord) throw new Error(`music: ${tune.name} bar ${b + 1} uses an unknown chord "${chordName}"`);
    let at = 0;
    for (const item of lead.split(',')) {
      const [name, len] = item.trim().split(' ');
      const length = Number(len);
      if (name !== 'R') song[b * 16 + at].lead = { freq: midiFreq(noteMidi(name)), steps: length };
      at += length;
    }
    if (at !== 16) throw new Error(`music: ${tune.name} bar ${b + 1} (${chordName}) adds up to ${at} steps, not 16`);
    const broken = [chord[0], chord[1], chord[2], chord[0] + 12, chord[2], chord[1], chord[0] + 12, chord[2]]; // up and down
    for (let s = 0; s < 16; s++) {
      const ev = song[b * 16 + s];
      if (s % 2 === 0) ev.harp = midiFreq(broken[s / 2]);
      if (tune.bass === 'half' && s % 8 === 0) ev.bass = { freq: midiFreq(root + (s === 8 ? 7 : 0)), steps: 7 };
      if (tune.bass === 'beat' && s % 4 === 0) ev.bass = { freq: midiFreq(root + (s % 8 === 4 ? 7 : 0)), steps: 3 };
      if (s === 0) ev.drum = 'thump';
      else if (s === 8) ev.drum = 'rim';
      else if (tune.drum === 'skip' && s % 4 === 2) ev.drum = 'tap';
    }
  });
  return song;
}
const SONGS = TUNES.map(buildSong);

const musicState = { playing: false, tune: 0, step: 0, nextTime: 0, gain: null, waves: null, noise: null };
const musicStepSeconds = () => 60 / TUNES[musicState.tune].bpm / 4; // one sixteenth note

// A square wave with the given duty cycle (0.5 is an ordinary square; thinner ones sound reedier).
function pulseWave(duty) {
  const harmonics = 48, real = new Float32Array(harmonics + 1), imag = new Float32Array(harmonics + 1);
  for (let n = 1; n <= harmonics; n++) {
    real[n] = (2 / (n * Math.PI)) * Math.sin(2 * Math.PI * n * duty);
    imag[n] = (2 / (n * Math.PI)) * (1 - Math.cos(2 * Math.PI * n * duty));
  }
  return Sound.ctx.createPeriodicWave(real, imag);
}

function musicStart() {
  const ctx = Sound.ctx, t = ctx.currentTime;
  if (!musicState.gain) {
    musicState.gain = ctx.createGain();
    musicState.gain.gain.value = 0;
    musicState.gain.connect(ctx.destination);
    musicState.waves = { lead: pulseWave(0.25) };
    const noise = ctx.createBuffer(1, ctx.sampleRate, ctx.sampleRate);
    const data = noise.getChannelData(0);
    for (let i = 0; i < data.length; i++) data[i] = Math.random() * 2 - 1;
    musicState.noise = noise;
  }
  musicState.gain.gain.setTargetAtTime(MUSIC_LEVEL, t, 0.05);
  musicState.playing = true;
  musicState.step = 0;
  musicState.nextTime = t + 0.08;
}

function musicStop() {
  musicState.playing = false;
  musicState.gain.gain.setTargetAtTime(0, Sound.ctx.currentTime, 0.12); // fade out; notes already queued are quiet
}

// One tone on a chip channel: 'lead' is a pulse wave, 'bass' and 'harp' are triangles.
function musicNote(channel, freq, duration, t, volume) {
  const ctx = Sound.ctx;
  const osc = ctx.createOscillator(), gain = ctx.createGain();
  if (channel === 'bass' || channel === 'harp') osc.type = 'triangle';
  else osc.setPeriodicWave(musicState.waves[channel]);
  osc.frequency.setValueAtTime(freq, t);
  gain.gain.setValueAtTime(0.0001, t);
  gain.gain.linearRampToValueAtTime(volume, t + 0.008);
  gain.gain.setValueAtTime(volume * 0.75, t + Math.min(0.05, duration * 0.4));
  gain.gain.linearRampToValueAtTime(0.0001, t + duration);
  osc.connect(gain);
  gain.connect(musicState.gain);
  osc.start(t);
  osc.stop(t + duration + 0.02);
}

// A low drum: a sine that drops in pitch as it dies away.
function musicThump(t) {
  const ctx = Sound.ctx;
  const osc = ctx.createOscillator(), gain = ctx.createGain();
  osc.type = 'sine';
  osc.frequency.setValueAtTime(110, t);
  osc.frequency.exponentialRampToValueAtTime(45, t + 0.18);
  gain.gain.setValueAtTime(0.0001, t);
  gain.gain.linearRampToValueAtTime(0.18, t + 0.005);
  gain.gain.exponentialRampToValueAtTime(0.0001, t + 0.25);
  osc.connect(gain);
  gain.connect(musicState.gain);
  osc.start(t);
  osc.stop(t + 0.27);
}

// A burst of filtered noise: the rim tap, or the lighter off-beat tap.
function musicNoise(t, duration, volume, filterType, freq) {
  const ctx = Sound.ctx;
  const src = ctx.createBufferSource(), filter = ctx.createBiquadFilter(), gain = ctx.createGain();
  src.buffer = musicState.noise;
  filter.type = filterType;
  filter.frequency.value = freq;
  gain.gain.setValueAtTime(volume, t);
  gain.gain.exponentialRampToValueAtTime(0.001, t + duration);
  src.connect(filter);
  filter.connect(gain);
  gain.connect(musicState.gain);
  src.start(t, Math.random());
  src.stop(t + duration + 0.02);
}

function musicScheduleStep(step, t) {
  const tune = TUNES[musicState.tune], ev = SONGS[musicState.tune][step], dt = musicStepSeconds();
  if (ev.lead) musicNote('lead', ev.lead.freq, ev.lead.steps * dt * 0.92, t, tune.leadLevel);
  if (ev.harp) musicNote('harp', ev.harp, dt * tune.harpSteps, t, 0.05);
  if (ev.bass) musicNote('bass', ev.bass.freq, ev.bass.steps * dt * 0.9, t, 0.2);
  if (ev.drum === 'thump') musicThump(t);
  if (ev.drum === 'rim') musicNoise(t, 0.06, 0.05, 'bandpass', 1800);
  if (ev.drum === 'tap') musicNoise(t, 0.03, 0.025, 'highpass', 5000);
}

// A tune picked at random for a new game, from its first bar. Returns its name.
function musicRandomTune() {
  musicState.tune = Math.floor(Math.random() * TUNES.length);
  musicState.step = 0;
  return TUNES[musicState.tune].name;
}

// Called every frame: start or stop the music, and queue the next few notes ahead of the clock.
function musicUpdate(wanted) {
  if (!Sound.ctx) return; // sound has not been unlocked yet (no key or click yet)
  const playing = wanted && !Sound.muted;
  if (playing && !musicState.playing) musicStart();
  else if (!playing && musicState.playing) musicStop();
  if (!musicState.playing) return;
  const now = Sound.ctx.currentTime;
  if (musicState.nextTime < now) musicState.nextTime = now + 0.05; // after a pause, carry on from here
  while (musicState.nextTime < now + 0.2) {
    musicScheduleStep(musicState.step, musicState.nextTime);
    musicState.nextTime += musicStepSeconds();
    musicState.step = (musicState.step + 1) % SONGS[musicState.tune].length;
  }
}
