'use strict';

// Title music, in the same chip style as the other Retro games: written note by note and played live (no audio
// files) on a few channels: a thin, buzzy pulse lead, a quiet arpeggio, a triangle bass and a low pad, a heartbeat
// kick, a snare, hi-hats and a dark glassy bell. A menacing tune in D minor (with the A major chord that makes
// minor keys sound dramatic). It plays on the title and setup screens and fades out when a game starts.
// Browsers need a key press before they allow sound, so the title screen asks for one.
const MUSIC_BPM = 118;
const MUSIC_STEP = 60 / MUSIC_BPM / 4; // one sixteenth note, in seconds
const MUSIC_LEVEL = 0.55;

const NOTE_OFFSETS = { C: 0, 'C#': 1, D: 2, 'D#': 3, E: 4, F: 5, 'F#': 6, G: 7, 'G#': 8, A: 9, 'A#': 10, B: 11 };
function noteMidi(name) {
  const m = /^([A-G]#?)(\d)$/.exec(name);
  if (!m) throw new Error(`music: "${name}" is not a note name like E5 or G#5 (flats are written as sharps, so B flat is A#)`);
  return 12 * (Number(m[2]) + 1) + NOTE_OFFSETS[m[1]];
}
function midiFreq(midi) { return 440 * Math.pow(2, (midi - 69) / 12); }

// Chords as MIDI notes (for the arpeggio and pad) and their bass roots.
const MUSIC_CHORDS = { Dm: [62, 65, 69], Bb: [58, 62, 65], Gm: [55, 58, 62], A: [57, 61, 64], C: [60, 64, 67], F: [53, 57, 60] };
const MUSIC_ROOTS = { Dm: 38, Bb: 46, Gm: 43, A: 45, C: 48, F: 41 };

// Sixteen bars. A lead note is "name steps" (a step is a sixteenth, so 4 steps = a beat); R is a rest.
// Every bar must add up to 16 steps.
const MUSIC_BARS = [
  { chord: 'Dm', lead: 'D5 3,D5 1,F5 4,A5 2,G5 2,F5 4' },
  { chord: 'Dm', lead: 'E5 3,E5 1,G5 4,A5 4,R 2,D5 2' },
  { chord: 'Bb', lead: 'F5 3,F5 1,A5 4,A#5 2,A5 2,F5 4' },
  { chord: 'A',  lead: 'E5 2,A5 2,C#6 4,E6 2,D6 2,C#6 2,A5 2' },
  { chord: 'Dm', lead: 'D6 3,D6 1,A5 4,F5 2,A5 2,D6 4' },
  { chord: 'Gm', lead: 'D6 3,C6 1,A#5 4,G5 2,A#5 2,D6 4' },
  { chord: 'Bb', lead: 'F6 4,D6 2,A#5 2,D6 2,F6 2,A5 4' },
  { chord: 'A',  lead: 'C#6 2,E6 2,A6 4,G6 2,E6 2,C#6 4' },
  { chord: 'F',  lead: 'A5 3,A5 1,C6 4,F6 4,E6 2,C6 2' },
  { chord: 'C',  lead: 'G5 3,G5 1,C6 4,E6 4,D6 2,C6 2' },
  { chord: 'Gm', lead: 'D6 4,A#5 2,G5 2,A#5 4,D6 4' },
  { chord: 'A',  lead: 'E6 2,D6 2,C#6 2,A5 2,C#6 2,E6 2,A6 4' },
  { chord: 'Bb', lead: 'D6 2,F6 2,A#5 2,D6 2,F6 4,D6 4' },
  { chord: 'A',  lead: 'C#6 2,E6 2,C#6 2,A5 2,E5 4,A5 4' },
  { chord: 'Dm', lead: 'D6 4,F6 2,A5 2,D6 4,F5 2,A5 2' },
  { chord: 'A',  lead: 'E6 2,C#6 2,A5 2,C#6 2,E6 4,R 4' },
];

// Turn the bars into one event list per sixteenth step: { lead, arp, bass, pad, bell }.
const MUSIC_SONG = (() => {
  const song = Array.from({ length: MUSIC_BARS.length * 16 }, () => ({ lead: null, arp: 0, bass: null, pad: null, bell: 0 }));
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
    const bassPattern = [0, 0, 12, 0, 0, 0, 12, 7]; // driving eighth notes
    for (let s = 0; s < 16; s++) {
      const ev = song[b * 16 + s];
      if (s % 2 === 0) ev.arp = midiFreq([chord[0], chord[1], chord[2], chord[1]][(s / 2) % 4] + 12);
      if (s % 2 === 0) ev.bass = { freq: midiFreq(root + bassPattern[s / 2]), steps: 2 };
      if (s === 0) { ev.pad = [midiFreq(chord[0] + 12), midiFreq(chord[2] + 12)]; ev.bell = midiFreq(chord[1] + 24); }
      if (s === 8) ev.bell = midiFreq(chord[2] + 24);
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
    musicState.waves = { lead: pulseWave(0.125), arp: pulseWave(0.25) }; // a thin pulse is buzzier and meaner than a fat one
    const noise = c.createBuffer(1, c.sampleRate, c.sampleRate);
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

// One tone on a chip channel: 'lead' and 'arp' are pulse waves, 'bass' and 'pad' are triangles.
function musicNote(channel, freq, duration, t, volume) {
  const c = Sound.ctx;
  const osc = c.createOscillator(), gain = c.createGain();
  if (channel === 'bass' || channel === 'pad') osc.type = 'triangle';
  else osc.setPeriodicWave(musicState.waves[channel]);
  osc.frequency.setValueAtTime(freq, t);
  gain.gain.setValueAtTime(0.0001, t);
  gain.gain.linearRampToValueAtTime(volume, t + (channel === 'pad' ? 0.25 : 0.008));
  gain.gain.setValueAtTime(volume * 0.75, t + Math.min(0.05, duration * 0.4));
  gain.gain.linearRampToValueAtTime(0.0001, t + duration);
  osc.connect(gain);
  gain.connect(musicState.gain);
  osc.start(t);
  osc.stop(t + duration + 0.02);
}

// A dark glassy bell: two slightly out-of-tune sines that ring on, so it sounds cold and a little wrong.
function musicBell(freq, t) {
  const c = Sound.ctx;
  for (const [mult, vol] of [[1, 0.05], [1.0075, 0.035]]) {
    const osc = c.createOscillator(), gain = c.createGain();
    osc.type = 'sine';
    osc.frequency.setValueAtTime(freq * mult, t);
    gain.gain.setValueAtTime(0.0001, t);
    gain.gain.linearRampToValueAtTime(vol, t + 0.004);
    gain.gain.exponentialRampToValueAtTime(0.0001, t + 1.3);
    osc.connect(gain);
    gain.connect(musicState.gain);
    osc.start(t);
    osc.stop(t + 1.32);
  }
}

function musicKick(t) {
  const c = Sound.ctx, osc = c.createOscillator(), gain = c.createGain();
  osc.type = 'sine';
  osc.frequency.setValueAtTime(140, t);
  osc.frequency.exponentialRampToValueAtTime(40, t + 0.12);
  gain.gain.setValueAtTime(0.4, t);
  gain.gain.exponentialRampToValueAtTime(0.001, t + 0.16);
  osc.connect(gain);
  gain.connect(musicState.gain);
  osc.start(t);
  osc.stop(t + 0.18);
}

function musicNoise(t, duration, volume, filterType, freq) {
  const c = Sound.ctx;
  const src = c.createBufferSource(), filter = c.createBiquadFilter(), gain = c.createGain();
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
  if (ev.lead) musicNote('lead', ev.lead.freq, ev.lead.steps * MUSIC_STEP * 0.92, t, 0.13);
  if (ev.arp) musicNote('arp', ev.arp, MUSIC_STEP * 1.6, t, 0.022);
  if (ev.bass) musicNote('bass', ev.bass.freq, ev.bass.steps * MUSIC_STEP * 0.85, t, 0.22);
  if (ev.pad) for (const f of ev.pad) musicNote('pad', f, 16 * MUSIC_STEP, t, 0.04);
  if (ev.bell) musicBell(ev.bell, t);
  if (s16 % 4 === 0) musicKick(t);                                         // a steady heartbeat
  if (s16 === 14) musicKick(t);                                            // plus a stumble before the bar line
  if (s16 === 4 || s16 === 12) musicNoise(t, 0.12, 0.14, 'bandpass', 1900); // snare
  if (s16 % 2 === 0) musicNoise(t, 0.04, s16 % 4 === 2 ? 0.045 : 0.022, 'highpass', 7500);
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
