'use strict';

// Light festive title music, in the same chip style as the P1 title tune: written note by note and
// played live (no audio files) on a few channels: a quarter-width square lead, a thin square arpeggio,
// a triangle bass, sine "glockenspiel" pings, and soft noise for sleigh bells and a brush. No kick drum,
// so it stays light. It loops on the title screen and fades out when the game starts.
// Browsers need a key press before they allow sound, so the title screen asks for one.
const MUSIC_BPM = 120;
const MUSIC_STEP = 60 / MUSIC_BPM / 4; // one sixteenth note, in seconds
const MUSIC_LEVEL = 0.6;

const NOTE_OFFSETS = { C: 0, 'C#': 1, D: 2, 'D#': 3, E: 4, F: 5, 'F#': 6, G: 7, 'G#': 8, A: 9, 'A#': 10, B: 11 };
function noteMidi(name) {
  const m = /^([A-G]#?)(\d)$/.exec(name);
  if (!m) throw new Error(`music: "${name}" is not a note name like E5 or G#5`);
  return 12 * (Number(m[2]) + 1) + NOTE_OFFSETS[m[1]];
}
function midiFreq(midi) { return 440 * Math.pow(2, (midi - 69) / 12); }

// Chords as MIDI notes (for the arpeggio and pings) and their bass roots.
const MUSIC_CHORDS = { C: [60, 64, 67], F: [53, 57, 60], G: [55, 59, 62], Am: [57, 60, 64], Dm: [50, 53, 57] };
const MUSIC_ROOTS = { C: 48, F: 41, G: 43, Am: 45, Dm: 38 };

// Sixteen bars in C major. A lead note is "name steps" (a step is a sixteenth, so 4 steps = a beat);
// R is a rest. Every bar must add up to 16 steps.
const MUSIC_BARS = [
  { chord: 'C',  lead: 'E5 2,G5 2,C6 4,G5 2,E5 2,G5 4' },
  { chord: 'F',  lead: 'F5 2,A5 2,C6 4,A5 2,F5 2,A5 4' },
  { chord: 'G',  lead: 'G5 2,B5 2,D6 4,B5 2,G5 2,B5 4' },
  { chord: 'C',  lead: 'C6 4,G5 2,E5 2,G5 4,C5 4' },
  { chord: 'C',  lead: 'E5 2,G5 2,C6 4,E6 2,D6 2,C6 4' },
  { chord: 'F',  lead: 'A5 2,C6 2,F6 4,E6 2,D6 2,C6 4' },
  { chord: 'G',  lead: 'D6 4,B5 2,G5 2,B5 2,D6 2,G5 4' },
  { chord: 'C',  lead: 'C6 8,R 4,G5 2,C6 2' },
  { chord: 'Am', lead: 'A5 4,C6 2,E6 2,D6 4,C6 4' },
  { chord: 'Dm', lead: 'D6 4,F6 2,A5 2,C6 4,D6 4' },
  { chord: 'G',  lead: 'B5 2,D6 2,G6 4,F6 2,D6 2,B5 4' },
  { chord: 'C',  lead: 'C6 4,E6 4,G6 4,E6 2,C6 2' },
  { chord: 'F',  lead: 'A5 2,C6 2,A5 2,F5 2,A5 2,C6 2,F6 4' },
  { chord: 'G',  lead: 'G5 2,B5 2,D6 2,G6 2,F6 2,D6 2,B5 4' },
  { chord: 'C',  lead: 'E6 2,D6 2,C6 2,G5 2,E5 2,G5 2,C6 4' },
  { chord: 'G',  lead: 'D6 2,B5 2,G5 2,B5 2,D6 4,R 4' },
];

// Turn the bars into one event list per sixteenth step: { lead, arp, bass, bell }.
const MUSIC_SONG = (() => {
  const song = Array.from({ length: MUSIC_BARS.length * 16 }, () => ({ lead: null, arp: 0, bass: null, bell: 0 }));
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
    for (let s = 0; s < 16; s++) {
      const ev = song[b * 16 + s];
      if (s % 2 === 0) ev.arp = midiFreq([chord[0], chord[1], chord[2], chord[1]][(s / 2) % 4] + 12); // chord tones, gently, an octave up
      if (s % 4 === 0) ev.bass = { freq: midiFreq(root + (s % 8 === 4 ? 7 : 0)), steps: 4 };          // root, fifth, root, fifth
      if (s === 0 || s === 8) ev.bell = midiFreq(chord[2] + 24);                                       // a soft ping on beats 1 and 3
    }
  });
  return song;
})();

const musicState = { playing: false, step: 0, nextTime: 0, gain: null, waves: null, noise: null };

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
    musicState.waves = { lead: pulseWave(0.25), arp: pulseWave(0.125) };
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

// One tone on a chip channel: 'lead' and 'arp' are pulse waves, 'bass' is a triangle.
function musicNote(channel, freq, duration, t, volume) {
  const ctx = Sound.ctx;
  const osc = ctx.createOscillator(), gain = ctx.createGain();
  if (channel === 'bass') osc.type = 'triangle';
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

// A soft glockenspiel ping: a sine that dies away.
function musicBell(freq, t) {
  const ctx = Sound.ctx;
  const osc = ctx.createOscillator(), gain = ctx.createGain();
  osc.type = 'sine';
  osc.frequency.setValueAtTime(freq, t);
  gain.gain.setValueAtTime(0.0001, t);
  gain.gain.linearRampToValueAtTime(0.06, t + 0.004);
  gain.gain.exponentialRampToValueAtTime(0.0001, t + 0.7);
  osc.connect(gain);
  gain.connect(musicState.gain);
  osc.start(t);
  osc.stop(t + 0.72);
}

// A burst of filtered noise: highpass is the sleigh bell, bandpass the soft brush.
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
  const ev = MUSIC_SONG[step], s16 = step % 16;
  if (ev.lead) musicNote('lead', ev.lead.freq, ev.lead.steps * MUSIC_STEP * 0.92, t, 0.15);
  if (ev.arp) musicNote('arp', ev.arp, MUSIC_STEP * 1.6, t, 0.03);
  if (ev.bass) musicNote('bass', ev.bass.freq, ev.bass.steps * MUSIC_STEP * 0.85, t, 0.22);
  if (ev.bell) musicBell(ev.bell, t);
  if (s16 % 2 === 0) musicNoise(t, 0.05, s16 % 4 === 2 ? 0.05 : 0.025, 'highpass', 7000); // sleigh bells
  if (s16 === 4 || s16 === 12) musicNoise(t, 0.09, 0.06, 'bandpass', 2500);                 // soft brush
}

// Called every frame: start or stop the music, and queue the next few notes ahead of the clock.
function musicUpdate(wanted) {
  if (!Sound.ctx) return; // sound has not been unlocked yet (no key pressed)
  const playing = wanted && !Sound.muted;
  if (playing && !musicState.playing) musicStart();
  else if (!playing && musicState.playing) musicStop();
  if (!musicState.playing) return;
  const now = Sound.ctx.currentTime;
  if (musicState.nextTime < now) musicState.nextTime = now + 0.05; // after a pause, carry on from here
  while (musicState.nextTime < now + 0.2) {
    musicScheduleStep(musicState.step, musicState.nextTime);
    musicState.nextTime += MUSIC_STEP;
    musicState.step = (musicState.step + 1) % MUSIC_SONG.length;
  }
}
