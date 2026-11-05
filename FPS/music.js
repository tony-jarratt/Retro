// MUSIC: 80s synth, generated in code like everything else (sound.js has the
// Web Audio basics). U turns it off and on; N mutes everything.
//
// A STEP SEQUENCER. Music here is a grid: each bar is 16 steps (16th
// notes), and each instrument has a line of 16 characters saying what it
// plays on each step. The tempo (bpm, beats per minute, 4 steps a beat)
// sets how long a step lasts. Every frame, updateMusic looks a fifth of a
// second ahead and books any steps that fall in that window with the audio
// clock, which is sample-accurate; booking ahead like this is what keeps the
// rhythm steady even when a frame comes late.
//
// A TRACK is:
//   bpm       tempo
//   chords    one per bar, looping: [root note, chord shape]. Notes are MIDI
//             numbers (60 is middle C, +12 an octave up).
//   bass      16 steps: x = the chord's root, o = an octave up, 5 = its fifth, . = rest
//   arp       16 steps: a digit n = the chord's nth note (wrapping up an octave), . = rest
//   pad       true: the whole chord held under each bar, soft and slow
//   kick, snare, hat   16 steps: x = hit, . = rest
//   lead      a melody over the loop: [bar, step, note, length in steps]
//   tone      the instruments' colour: arp wave, how detuned the pad is, how
//             much the pad's pitch wavers (wow), the octave the arp plays in
// The instruments are recipes like the sound effects: a saw bass through a
// closing filter, a pad of two detuned saws, a square arp with an echo, a
// drum machine of a sine kick, noise snare and noise hat.

const MUSIC_VOLUME = 0.3;
const MUSIC_LOOKAHEAD = 0.2;   // seconds booked ahead

const CHORDS = {
  M: [0, 4, 7], m: [0, 3, 7], M7: [0, 4, 7, 11], m7: [0, 3, 7, 10], m9: [0, 3, 7, 10, 14],
  dim: [0, 3, 6, 9], sus: [0, 5, 7],
};

const TRACKS = {
  // The title: A minor, heroic and a little sad, a lead over pads and arps.
  title: {
    bpm: 96,
    chords: [[57, 'm'], [53, 'M'], [48, 'M'], [55, 'M']],
    bass:  'x.....x.x.....x.',
    arp:   '0.1.2.1.0.1.2.1.',
    pad: true,
    kick:  'x.......x.......',
    snare: '....x.......x...',
    hat:   '..x...x...x...x.',
    lead: [[0, 0, 76, 6], [0, 6, 74, 2], [0, 8, 72, 4], [0, 12, 71, 4],
           [1, 0, 69, 8], [1, 8, 72, 4], [1, 12, 77, 4],
           [2, 0, 76, 6], [2, 6, 79, 2], [2, 8, 76, 4], [2, 12, 72, 4],
           [3, 0, 74, 8], [3, 8, 71, 8]],
    tone: { arp: 'square', detune: 9, wow: 0, arpOctave: 0 },
  },
  // The industrial sector: E minor, driving, mechanical.
  industrial: {
    bpm: 120,
    chords: [[40, 'm'], [40, 'm'], [36, 'M'], [38, 'M']],
    bass:  'x.x.o.x.x.x.o.x.',
    arp:   '0..2..1..0..2..1',
    pad: false,
    kick:  'x...x...x...x...',
    snare: '....x.......x...',
    hat:   'x.xxx.xxx.xxx.xx',
    tone: { arp: 'square', detune: 6, wow: 0, arpOctave: 12 },
  },
  // The lab: D minor with a diminished turn, slow, cold and glassy. A
  // heartbeat for a kick.
  lab: {
    bpm: 84,
    chords: [[38, 'm'], [34, 'M'], [43, 'm'], [45, 'dim']],
    bass:  'x...............',
    arp:   '0...3...1...2...',
    pad: true,
    kick:  'x..x............',
    snare: '................',
    hat:   '................',
    tone: { arp: 'triangle', detune: 18, wow: 0, arpOctave: 24 },
  },
  // The HQ: lush seventh chords, but the pads waver out of tune: lush and wrong.
  hq: {
    bpm: 100,
    chords: [[41, 'M7'], [40, 'm7'], [38, 'm9'], [36, 'M7']],
    bass:  'x..x..x...x..x..',
    arp:   '0.2.1.3.0.2.1.3.',
    pad: true,
    kick:  'x.....x...x.....',
    snare: '....x.......x...',
    hat:   '..x...x...x...x.',
    tone: { arp: 'triangle', detune: 12, wow: 14, arpOctave: 12 },
  },
  // The lift: soft, jazzy, a bit cheesy. Lift music.
  lift: {
    bpm: 104,
    chords: [[48, 'M7'], [45, 'm7'], [50, 'm7'], [43, 'M']],
    bass:  'x...o...5...o...',
    arp:   '..1...2...3...2.',
    pad: true,
    kick:  '................',
    snare: '................',
    hat:   '..x...x...x...x.',
    tone: { arp: 'triangle', detune: 5, wow: 0, arpOctave: 12 },
  },
  // The finale: C major at last, hopeful, the lead singing over it.
  finale: {
    bpm: 88,
    chords: [[48, 'M'], [43, 'M'], [45, 'm'], [41, 'M']],
    bass:  'x.....x.x...o...',
    arp:   '0.1.2.3.2.1.0.1.',
    pad: true,
    kick:  'x.......x.......',
    snare: '....x.......x...',
    hat:   '..x...x...x...x.',
    lead: [[0, 0, 76, 4], [0, 4, 79, 4], [0, 8, 84, 8],
           [1, 0, 83, 4], [1, 4, 81, 4], [1, 8, 79, 8],
           [2, 0, 81, 4], [2, 4, 84, 4], [2, 8, 88, 6], [2, 14, 86, 2],
           [3, 0, 84, 8], [3, 8, 81, 4], [3, 12, 79, 4]],
    tone: { arp: 'square', detune: 9, wow: 0, arpOctave: 12 },
  },
};

// What's playing:
//   bus       the music's own volume knob, and its echo, into the master
//   track     the TRACKS entry playing, or null
//   step      steps played since it started
//   nextTime  when (audio clock) the next step falls
//   on        U: music wanted?
const music = { bus: null, echo: null, track: null, name: null, step: 0, nextTime: 0, on: true };

function midiToFreq(n) {
  return 440 * Math.pow(2, (n - 69) / 12);
}

// The music's mixer: a volume knob into the master, and an echo (a delay
// feeding back into itself through a lowpass) for the arp and lead to sing in.
function makeMusicBus() {
  const ctx = audio.ctx;
  music.bus = ctx.createGain();
  music.bus.gain.value = music.on ? MUSIC_VOLUME : 0;
  music.bus.connect(audio.master);
  const delay = ctx.createDelay();
  const feedback = ctx.createGain();
  const dull = ctx.createBiquadFilter();
  delay.delayTime.value = 0.28;
  feedback.gain.value = 0.32;
  dull.type = 'lowpass';
  dull.frequency.value = 2200;
  music.echo = ctx.createGain();
  music.echo.gain.value = 0.5;
  music.echo.connect(delay).connect(dull).connect(feedback).connect(delay);
  dull.connect(music.bus);
}

// Start a track (from its first bar), unless it's already the one playing.
function playTrack(name) {
  if (!TRACKS[name]) throw new Error(`playTrack("${name}"): there's no such track in TRACKS.`);
  if (music.name === name) return;
  music.name = name;
  music.track = TRACKS[name];
  music.step = 0;
  music.nextTime = 0;
}

function stopMusic() {
  music.name = null;
  music.track = null;
}

function toggleMusic() {
  music.on = !music.on;
  if (music.bus) music.bus.gain.setTargetAtTime(music.on ? MUSIC_VOLUME : 0, audio.ctx.currentTime, 0.1);
}

// Every frame (main.js): book the steps that fall in the next MUSIC_LOOKAHEAD seconds.
function updateMusic() {
  if (!audioReady() || !music.track) return;
  if (!music.bus) makeMusicBus();
  const now = audio.ctx.currentTime;
  if (music.nextTime < now) music.nextTime = now + 0.05; // starting, or we fell behind (a paused tab): pick up from now
  const stepTime = 60 / music.track.bpm / 4;
  while (music.nextTime < now + MUSIC_LOOKAHEAD) {
    playStep(music.track, music.step, music.nextTime, stepTime);
    music.step += 1;
    music.nextTime += stepTime;
  }
}

function playStep(track, step, t, stepTime) {
  const bar = Math.floor(step / 16) % track.chords.length;
  const s = step % 16;
  const [root, shape] = track.chords[bar];
  const notes = CHORDS[shape].map((i) => root + i);
  const tone = track.tone;

  if (s === 0 && track.pad) musicPad(t, notes.map((n) => n + 12), stepTime * 16, tone);
  const b = track.bass[s];
  if (b !== '.') musicBass(t, root - 12 + (b === 'o' ? 12 : b === '5' ? 7 : 0), stepTime * 1.8);
  const a = track.arp[s];
  if (a !== '.') {
    const i = Number(a);
    musicArp(t, notes[i % notes.length] + 12 * Math.floor(i / notes.length) + 12 + tone.arpOctave, stepTime * 1.5, tone.arp);
  }
  if (track.kick[s] === 'x') musicKick(t);
  if (track.snare[s] === 'x') musicSnare(t);
  if (track.hat[s] === 'x') musicHat(t);
  if (track.lead) {
    const loopBar = Math.floor(step / 16) % 4;
    for (const [lb, ls, note, len] of track.lead) if (lb === loopBar && ls === s) musicLead(t, note, stepTime * len);
  }
}

// THE INSTRUMENTS. Each schedules one note at audio time t.

function envelope(gain, t, attack, peak, hold, release) {
  gain.gain.setValueAtTime(0, t);
  gain.gain.linearRampToValueAtTime(peak, t + attack);
  gain.gain.setValueAtTime(peak, t + attack + hold);
  gain.gain.exponentialRampToValueAtTime(0.0001, t + attack + hold + release);
}

function musicBass(t, note, dur) {
  const ctx = audio.ctx;
  const osc = ctx.createOscillator();
  osc.type = 'sawtooth';
  osc.frequency.value = midiToFreq(note);
  const filter = ctx.createBiquadFilter();
  filter.type = 'lowpass';
  filter.Q.value = 6;                                         // a little resonant: the 80s "squelch"
  filter.frequency.setValueAtTime(1600, t);
  filter.frequency.exponentialRampToValueAtTime(220, t + dur); // the filter closing as it plays
  const g = ctx.createGain();
  envelope(g, t, 0.005, 0.35, dur * 0.6, dur * 0.4);
  osc.connect(filter).connect(g).connect(music.bus);
  osc.start(t);
  osc.stop(t + dur + 0.05);
}

// Two sawtooths per note, a few cents apart, so they beat against each
// other: the thick, shimmering 80s pad. `wow` makes the pitch waver.
function musicPad(t, notes, dur, tone) {
  const ctx = audio.ctx;
  const filter = ctx.createBiquadFilter();
  filter.type = 'lowpass';
  filter.frequency.value = 1300;
  const g = ctx.createGain();
  envelope(g, t, 0.5, 0.05, dur - 0.9, 0.8);
  filter.connect(g).connect(music.bus);
  let lfo = null;
  if (tone.wow) {
    lfo = ctx.createOscillator();
    lfo.frequency.value = 0.7;
    const depth = ctx.createGain();
    depth.gain.value = tone.wow;                              // cents
    lfo.connect(depth);
    lfo.start(t);
    lfo.stop(t + dur + 0.1);
    lfo.depth = depth;
  }
  for (const n of notes) {
    for (const cents of [-tone.detune, tone.detune]) {
      const osc = ctx.createOscillator();
      osc.type = 'sawtooth';
      osc.frequency.value = midiToFreq(n);
      osc.detune.value = cents;
      if (lfo) lfo.depth.connect(osc.detune);
      osc.connect(filter);
      osc.start(t);
      osc.stop(t + dur + 0.1);
    }
  }
}

function musicArp(t, note, dur, type) {
  const ctx = audio.ctx;
  const osc = ctx.createOscillator();
  osc.type = type;
  osc.frequency.value = midiToFreq(note);
  const filter = ctx.createBiquadFilter();
  filter.type = 'lowpass';
  filter.frequency.value = 3000;
  const g = ctx.createGain();
  envelope(g, t, 0.003, 0.07, 0.02, dur);
  osc.connect(filter).connect(g);
  g.connect(music.bus);
  g.connect(music.echo);
  osc.start(t);
  osc.stop(t + dur + 0.1);
}

// The lead: a square and a saw an octave apart, with a slow vibrato.
function musicLead(t, note, dur) {
  const ctx = audio.ctx;
  const g = ctx.createGain();
  envelope(g, t, 0.03, 0.06, Math.max(0, dur - 0.15), 0.25);
  const filter = ctx.createBiquadFilter();
  filter.type = 'lowpass';
  filter.frequency.value = 2600;
  filter.connect(g);
  g.connect(music.bus);
  g.connect(music.echo);
  const vibrato = ctx.createOscillator();
  vibrato.frequency.value = 5.5;
  const depth = ctx.createGain();
  depth.gain.value = 9; // cents
  vibrato.connect(depth);
  vibrato.start(t);
  vibrato.stop(t + dur + 0.3);
  for (const [type, shift] of [['square', 0], ['sawtooth', -12]]) {
    const osc = ctx.createOscillator();
    osc.type = type;
    osc.frequency.value = midiToFreq(note + shift);
    depth.connect(osc.detune);
    osc.connect(filter);
    osc.start(t);
    osc.stop(t + dur + 0.3);
  }
}

function musicKick(t) {
  const ctx = audio.ctx;
  const osc = ctx.createOscillator();
  osc.frequency.setValueAtTime(150, t);
  osc.frequency.exponentialRampToValueAtTime(45, t + 0.12);
  const g = ctx.createGain();
  envelope(g, t, 0.002, 0.7, 0.02, 0.22);
  osc.connect(g).connect(music.bus);
  osc.start(t);
  osc.stop(t + 0.3);
}

function musicNoise(t, kind, freq, vol, decay) {
  const ctx = audio.ctx;
  const src = ctx.createBufferSource();
  src.buffer = audio.noise;
  const filter = ctx.createBiquadFilter();
  filter.type = kind;
  filter.frequency.value = freq;
  const g = ctx.createGain();
  envelope(g, t, 0.001, vol, 0, decay);
  src.connect(filter).connect(g).connect(music.bus);
  src.start(t, Math.random() * 0.5);
  src.stop(t + decay + 0.05);
}

function musicSnare(t) {
  musicNoise(t, 'bandpass', 1800, 0.35, 0.16);
  const ctx = audio.ctx;
  const osc = ctx.createOscillator();
  osc.type = 'triangle';
  osc.frequency.setValueAtTime(220, t);
  osc.frequency.exponentialRampToValueAtTime(120, t + 0.08);
  const g = ctx.createGain();
  envelope(g, t, 0.001, 0.2, 0, 0.09);
  osc.connect(g).connect(music.bus);
  osc.start(t);
  osc.stop(t + 0.15);
}

function musicHat(t) {
  musicNoise(t, 'highpass', 7500, 0.1, 0.04);
}

// A one-off rising flourish (LEVEL COMPLETE): the arp up a major chord.
function musicSting() {
  if (!audioReady()) return;
  if (!music.bus) makeMusicBus();
  const t = audio.ctx.currentTime + 0.05;
  [60, 64, 67, 72, 76, 79, 84].forEach((n, i) => musicArp(t + i * 0.09, n, 0.5, 'square'));
  musicPad(t, [60, 64, 67, 72], 2.2, { detune: 9, wow: 0 });
}
