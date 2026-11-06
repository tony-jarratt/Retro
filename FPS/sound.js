// SOUND, generated in code with the Web Audio API: no sound files, like the
// textures. Press N to mute.
//
// WEB AUDIO IN ONE PARAGRAPH. You build a little graph of "nodes" and sound
// flows through it to the speakers. Sources make sound: an OscillatorNode is
// a pure repeating wave (sine, square, sawtooth...) at a frequency you set;
// an AudioBufferSourceNode plays a buffer of samples, and we fill one with
// random numbers to get NOISE (hiss, crackle, the body of an explosion).
// Shapers change it: a GainNode is a volume knob, a BiquadFilterNode cuts
// high or low frequencies (a "lowpass" muffles), a StereoPannerNode moves it
// left or right. Every setting can be scheduled ahead: "glide this frequency
// from 880 down to 220 over 80ms" is one call, and the browser does the rest
// sample by sample. So each sound below is a short recipe: which sources,
// which shapers, what glides.
//
// PLACING SOUNDS. Anything that happens somewhere in the level goes through
// placeAt(x, y), which gives it three things, worked out from where you stand:
//   pan       left or right, from the angle to it compared with your facing
//   distance  quieter the further away (and silent beyond HEARING_RANGE)
//   walls     muffled (lowpass) if castRay finds a wall in between, the same
//             line-of-sight test the robots use to see you
//
// THE STYLE: the world is industrial (noise, thumps, hisses); your suit's own
// noises are synth tones, like the electronics they come from.
//
// Browsers only allow sound once you've clicked or pressed something, so the
// audio starts on your first click or key press.

const MASTER_VOLUME = 0.5;
const HEARING_RANGE = 16;      // cells: further than this, you hear nothing
const MUFFLED_CUTOFF = 700;    // Hz: what gets through a wall

const audio = { ctx: null, master: null, noise: null, gun: null, muted: false };

function initAudio() {
  if (audio.ctx) return;
  const AudioCtx = window.AudioContext || window.webkitAudioContext;
  if (!AudioCtx) {
    console.warn('Web Audio is not available in this browser: the game will run silently.');
    audio.ctx = 'unavailable';
    return;
  }
  audio.ctx = new AudioCtx();
  audio.master = audio.ctx.createGain();
  audio.master.gain.value = MASTER_VOLUME;
  audio.master.connect(audio.ctx.destination);
  // One second of white noise, reused by every noisy sound.
  const n = audio.ctx.sampleRate;
  audio.noise = audio.ctx.createBuffer(1, n, n);
  const data = audio.noise.getChannelData(0);
  for (let i = 0; i < n; i++) data[i] = Math.random() * 2 - 1;
  audio.gun = makeGunBus();
}

// YOUR GUN'S OWN CHANNEL, so it can be made bigger than everything else:
//   DISTORTION: a WaveShaperNode bends the waveform through a curve (here
//     tanh, which squashes loud peaks smoothly), adding gritty harmonics.
//   ECHO: a DelayNode feeds a copy back into itself a moment later, quieter
//     and duller each time round: the shot bouncing off the hangar walls.
// Everything the gun plays goes into the returned node.
function makeGunBus() {
  const ctx = audio.ctx;
  const drive = ctx.createWaveShaper();
  const curve = new Float32Array(1024);
  for (let i = 0; i < curve.length; i++) {
    const x = i / (curve.length - 1) * 2 - 1;
    curve[i] = Math.tanh(2.5 * x) / Math.tanh(2.5);
  }
  drive.curve = curve;
  const out = ctx.createGain();
  out.gain.value = 0.9;
  drive.connect(out).connect(audio.master);
  const delay = ctx.createDelay();
  delay.delayTime.value = 0.07;                // ~70ms: a big room's first bounce
  const feedback = ctx.createGain();
  feedback.gain.value = 0.12;                  // each echo 12% of the last: a slap, not a wash
  const dull = ctx.createBiquadFilter();
  dull.type = 'lowpass';
  dull.frequency.value = 900;                  // walls soak up the highs
  out.connect(delay).connect(dull).connect(feedback).connect(delay);
  dull.connect(audio.master);
  return drive;
}
window.addEventListener('pointerdown', initAudio);
window.addEventListener('keydown', initAudio);

function audioReady() {
  return audio.ctx && audio.ctx !== 'unavailable' && !audio.muted;
}

// Paused (pause.js): suspending the audio context freezes every sound
// mid-note, loops and all, and resuming picks them up where they were.
function pauseSound(on) {
  if (!audio.ctx || audio.ctx === 'unavailable') return; // not started yet, or no Web Audio
  if (on) audio.ctx.suspend();
  else audio.ctx.resume();
}

function toggleSound() {
  audio.muted = !audio.muted;
  if (audio.master) audio.master.gain.value = audio.muted ? 0 : MASTER_VOLUME;
}

// Where a sound at (x, y) should go: a chain of filter -> panner -> volume
// into the speakers, set for where it is. Returns the node to plug the
// sound's sources into, or null if it's out of earshot.
function placeAt(x, y) {
  const dx = x - player.x, dy = y - player.y;
  const dist = Math.hypot(dx, dy);
  if (dist > HEARING_RANGE) return null;
  const ctx = audio.ctx;
  const filter = ctx.createBiquadFilter();
  filter.type = 'lowpass';
  const blocked = dist > 0.3 && castRay(player.x, player.y, dx / dist, dy / dist).dist < dist;
  filter.frequency.value = blocked ? MUFFLED_CUTOFF : 20000;
  const pan = ctx.createStereoPanner();
  // sin of the angle from your facing: straight ahead 0, hard right +1, hard left -1.
  pan.pan.value = dist > 0.3 ? Math.sin(Math.atan2(dy, dx) - player.angle) : 0;
  const gain = ctx.createGain();
  gain.gain.value = (blocked ? 0.6 : 1) / (1 + dist * 0.35);
  filter.connect(pan).connect(gain).connect(audio.master);
  return filter;
}

// A one-off tone: a wave of `type` gliding from f0 to f1 Hz over `dur`
// seconds, starting at `vol` and dying away to nothing.
function tone(dest, type, f0, f1, dur, vol, delay = 0) {
  const ctx = audio.ctx, t = ctx.currentTime + delay;
  const osc = ctx.createOscillator();
  osc.type = type;
  osc.frequency.setValueAtTime(f0, t);
  osc.frequency.exponentialRampToValueAtTime(Math.max(1, f1), t + dur);
  const g = ctx.createGain();
  g.gain.setValueAtTime(vol, t);
  g.gain.exponentialRampToValueAtTime(0.001, t + dur);
  osc.connect(g).connect(dest);
  osc.start(t);
  osc.stop(t + dur + 0.02);
}

// A one-off burst of noise through a filter of `kind` ('lowpass',
// 'highpass', 'bandpass') whose cutoff glides from c0 to c1 Hz.
function noiseBurst(dest, kind, c0, c1, dur, vol, delay = 0) {
  const ctx = audio.ctx, t = ctx.currentTime + delay;
  const src = ctx.createBufferSource();
  src.buffer = audio.noise;
  const f = ctx.createBiquadFilter();
  f.type = kind;
  f.frequency.setValueAtTime(c0, t);
  f.frequency.exponentialRampToValueAtTime(Math.max(1, c1), t + dur);
  const g = ctx.createGain();
  g.gain.setValueAtTime(vol, t);
  g.gain.exponentialRampToValueAtTime(0.001, t + dur);
  src.connect(f).connect(g).connect(dest);
  src.start(t, Math.random() * 0.5); // start somewhere different in the noise each time
  src.stop(t + dur + 0.02);
}

// A sound that keeps going (a whine, a buzz) and is adjusted every frame:
// an oscillator through a filter, panner and volume we can keep changing.
function makeVoice(type) {
  const ctx = audio.ctx;
  const osc = ctx.createOscillator();
  osc.type = type;
  const filter = ctx.createBiquadFilter();
  filter.type = 'lowpass';
  const pan = ctx.createStereoPanner();
  const gain = ctx.createGain();
  gain.gain.value = 0;
  osc.connect(filter).connect(pan).connect(gain).connect(audio.master);
  osc.start();
  return { osc, filter, pan, gain };
}

// Point a voice at (x, y) with base volume `vol` and pitch `freq`, by the
// same rules as placeAt. setTargetAtTime eases to the new values over a few
// milliseconds, so frame-by-frame changes don't click.
function steerVoice(v, x, y, vol, freq) {
  const t = audio.ctx.currentTime;
  const dx = x - player.x, dy = y - player.y;
  const dist = Math.hypot(dx, dy);
  const blocked = dist > 0.3 && castRay(player.x, player.y, dx / dist, dy / dist).dist < dist;
  const level = dist > HEARING_RANGE ? 0 : vol * (blocked ? 0.6 : 1) / (1 + dist * 0.35);
  v.gain.gain.setTargetAtTime(level, t, 0.03);
  v.osc.frequency.setTargetAtTime(freq, t, 0.03);
  v.filter.frequency.setTargetAtTime(blocked ? MUFFLED_CUTOFF : 8000, t, 0.03);
  v.pan.pan.setTargetAtTime(dist > 0.3 ? Math.sin(Math.atan2(dy, dx) - player.angle) : 0, t, 0.03);
}

function stopVoice(v) {
  v.gain.gain.setTargetAtTime(0, audio.ctx.currentTime, 0.02);
  v.osc.stop(audio.ctx.currentTime + 0.1);
}

// A NOISE voice that keeps going (steam, the air in the hangar): the noise
// buffer looping forever through a band-pass filter. It has the same parts as
// an oscillator voice, so steerVoice can drive it too (its `freq` is then the
// filter's centre, not a pitch).
function makeNoiseVoice(centre) {
  const ctx = audio.ctx;
  const src = ctx.createBufferSource();
  src.buffer = audio.noise;
  src.loop = true;
  const band = ctx.createBiquadFilter();
  band.type = 'bandpass';
  band.frequency.value = centre;
  const filter = ctx.createBiquadFilter();
  filter.type = 'lowpass';
  const pan = ctx.createStereoPanner();
  const gain = ctx.createGain();
  gain.gain.value = 0;
  src.connect(band).connect(filter).connect(pan).connect(gain).connect(audio.master);
  src.start();
  return { osc: { frequency: band.frequency, stop: (t) => src.stop(t) }, filter, pan, gain };
}

// THE SOUNDS ----------------------------------------------------------------

// A DRUM-LIKE HIT: a tone whose pitch drops very fast and whose volume dies
// quickly. Speed is everything: a kick drum is a sine falling from ~200Hz to
// ~50Hz in a few tens of milliseconds. Slow the same fall down and you get a
// "wooo" instead of a "dum".
function drumHit(dest, type, f0, f1, drop, dur, vol, delay = 0) {
  const ctx = audio.ctx, t = ctx.currentTime + delay;
  const osc = ctx.createOscillator();
  osc.type = type;
  osc.frequency.setValueAtTime(f0, t);
  osc.frequency.exponentialRampToValueAtTime(f1, t + drop); // the fast pitch drop
  const g = ctx.createGain();
  g.gain.setValueAtTime(vol, t);
  g.gain.exponentialRampToValueAtTime(0.001, t + dur);
  osc.connect(g).connect(dest);
  osc.start(t);
  osc.stop(t + dur + 0.02);
}

// Your gun: built like a drum rather than a whoosh, through its gritty channel.
//   KICK   a sine falling 220 -> 50Hz in 40ms: the punch in your chest
//   BODY   a triangle "tom" underneath: the shell of the drum
//   THUD   30ms of mid noise: the stick hitting, like a snare's attack
//   ZAP    a quick sawtooth chirp on top, so it's still a pulse weapon
//   CRACK  15ms of bright, high noise, with a 4ms click right at the front:
//          the sharp edge of a gunshot. It goes straight to the speakers,
//          skipping the gun channel's distortion, which would round it off.
// Each mode is pitched a little differently, so you can hear what it's
// doing; automatic is shorter still, so rapid fire stays a drum roll.
// The AMMO TYPE (ammo.js) adds its own layer: an incendiary round a low
// whoomph of burning air, an armour-piercing one a hard metallic ring.
function sfxPlayerShot(mode, ammo = 'standard') {
  if (!audioReady()) return;
  const pitch = { single: 1, burst: 0.92, auto: 0.85, overdrive: 0.8 }[mode];
  const len = mode === 'auto' ? 0.7 : mode === 'overdrive' ? 0.5 : 1;
  drumHit(audio.gun, 'sine', 220 * pitch, 50, 0.04, 0.2 * len, 1.0);        // kick
  drumHit(audio.gun, 'triangle', 140 * pitch, 90, 0.06, 0.12 * len, 0.45);  // body
  noiseBurst(audio.gun, 'bandpass', 2600, 1800, 0.03, 0.7);                 // thud
  tone(audio.gun, 'sawtooth', 700 * pitch, 260 * pitch, 0.05, 0.12);        // zap
  noiseBurst(audio.master, 'highpass', 1500, 4000, 0.015, 0.65);            // crack...
  tone(audio.master, 'square', 3000, 2200, 0.004, 0.3);                     // ...and its click
  if (ammo === 'incendiary') {
    noiseBurst(audio.gun, 'lowpass', 900, 300, 0.18, 0.6);                   // whoomph
    tone(audio.gun, 'sawtooth', 160, 60, 0.15, 0.15);
  }
  if (ammo === 'piercing') {
    tone(audio.master, 'sine', 3400, 3300, 0.12, 0.1);                       // ring
    tone(audio.master, 'sine', 5100, 5000, 0.08, 0.06);
  }
}

// Loading another ammo type (ammo.js): the old rounds out, the new ones in.
function sfxLoadAmmo() {
  if (!audioReady()) return;
  metalClack(1700, 0.2, 0);
  metalClack(950, 0.3, 0.12);
}

// A creature catching fire (ammo.js): a soft rush of flame.
function sfxIgnite(enemy) {
  const out = placeAt(enemy.x, enemy.y);
  if (!out) return;
  noiseBurst(out, 'bandpass', 700, 1800, 0.35, 0.5);
  noiseBurst(out, 'lowpass', 400, 200, 0.4, 0.4, 0.05);
}

// Pulling the trigger on an empty gun: the firing pin snapping on nothing
// (a tiny metal tick, then a duller clack as it resets), and the suit's
// faint "nothing loaded" blip.
function sfxDryFire() {
  if (!audioReady()) return;
  metalClack(2400, 0.18, 0);
  metalClack(1300, 0.12, 0.035);
  tone(audio.master, 'square', 300, 300, 0.05, 0.04, 0.06);
}

// A coil locking on as the gun spins up a stage: a bright click.
function sfxCoilLock() {
  if (!audioReady()) return;
  tone(audio.master, 'square', 1800, 1500, 0.04, 0.12);
  tone(audio.master, 'sine', 2400, 2400, 0.08, 0.08, 0.03);
}

// A robot's gun: a crack of band-passed noise and a low thump. Turrets are
// lighter and sharper, the rattle of a volley.
function sfxRobotShot(enemy) {
  if (!audioReady()) return;
  const out = placeAt(enemy.x, enemy.y);
  if (!out) return;
  const light = enemy.type === 'turret' || enemy.type === 'scout';
  noiseBurst(out, 'bandpass', light ? 2500 : 1400, light ? 1200 : 500, light ? 0.07 : 0.14, 0.8);
  tone(out, 'triangle', light ? 220 : 120, 50, light ? 0.06 : 0.12, 0.5);
}

// THE GUARD (guard.js). Its pistol: a short, hard crack, higher and drier
// than any robot's gun, with a little slap of echo.
function sfxPistol(enemy) {
  if (!audioReady()) return;
  const out = placeAt(enemy.x, enemy.y);
  if (!out) return;
  noiseBurst(out, 'highpass', 2200, 1200, 0.05, 0.9);
  noiseBurst(out, 'bandpass', 900, 400, 0.12, 0.45, 0.02);
  tone(out, 'square', 420, 120, 0.04, 0.25);
}
// Calling it in: the squelch of a radio opening, three quick pips, and static.
function sfxRadio(enemy) {
  const out = placeAt(enemy.x, enemy.y);
  if (!out) return;
  noiseBurst(out, 'bandpass', 2500, 1800, 0.12, 0.35);
  for (let n = 0; n < 3; n++) tone(out, 'square', 1250, 1250, 0.05, 0.08, 0.15 + n * 0.09);
  noiseBurst(out, 'bandpass', 1800, 2600, 0.5, 0.18, 0.45);
}
// Changing the clip: the empty one dropping out, and (when it's done) the slide racking.
function sfxGuardReload(enemy, time) {
  const out = placeAt(enemy.x, enemy.y);
  if (!out) return;
  tone(out, 'triangle', 900, 700, 0.05, 0.25);
  tone(out, 'triangle', 600, 500, 0.05, 0.2, 0.25);                  // the clip landing on the floor
  noiseBurst(out, 'bandpass', 3000, 2000, 0.05, 0.35, time - 0.35);  // the new one going in...
  noiseBurst(out, 'bandpass', 2400, 1400, 0.09, 0.5, time - 0.12);   // ...and the slide, back and forward
  tone(out, 'square', 1500, 900, 0.03, 0.15, time - 0.05);
}
// A trapped terminal (traps.js) about to go: a shrill alarm, pips rising
// faster and higher over its fuse.
function sfxTrapAlarm(p) {
  if (!audioReady()) return;
  const out = placeAt(p.x, p.y);
  if (!out) return;
  for (let n = 0; n < 8; n++) {
    const t = TRAP_FUSE * (1 - Math.pow(0.78, n + 1)) / (1 - Math.pow(0.78, 8)); // closer together as it goes
    tone(out, 'square', 1400 + n * 160, 1400 + n * 160, 0.05, 0.14, t - 0.05);
  }
}
// Its torch shot out: a tink of glass and a pop.
function sfxTorchBreak(enemy) {
  const out = placeAt(enemy.x, enemy.y);
  if (!out) return;
  tone(out, 'sine', 3400, 3000, 0.12, 0.2);
  noiseBurst(out, 'highpass', 5000, 3000, 0.08, 0.4);
}

// A heavy's rocket leaving the tube: a rising whoosh.
function sfxRocketLaunch(enemy) {
  if (!audioReady()) return;
  const out = placeAt(enemy.x, enemy.y);
  if (!out) return;
  noiseBurst(out, 'bandpass', 400, 2500, 0.45, 0.8);
  tone(out, 'sawtooth', 90, 60, 0.3, 0.2);
}

// An explosion: noise through a lowpass that closes from bright to dull (the
// crack, then the rumble), under a sine "boom" dropping into the sub-bass.
// Bigger blasts are louder and longer.
function sfxExplosion(x, y, radius) {
  if (!audioReady()) return;
  const out = placeAt(x, y);
  if (!out) return;
  const size = Math.min(1, radius / 2);
  noiseBurst(out, 'lowpass', 3000, 150, 0.5 + size * 0.6, 0.6 + size * 0.6);
  tone(out, 'sine', 90, 30, 0.4 + size * 0.5, 0.7 + size * 0.5);
}

// A drone shot down: a small electric pop.
function sfxDronePop(d) {
  if (!audioReady()) return;
  const out = placeAt(d.x, d.y);
  if (!out) return;
  noiseBurst(out, 'highpass', 3000, 1500, 0.08, 0.6);
  tone(out, 'square', 600, 120, 0.08, 0.15);
}

// Your suit taking a hit: a dull thump through the armour, and a crackle of
// static from the display.
function sfxSuitHit() {
  if (!audioReady()) return;
  tone(audio.master, 'sine', 140, 50, 0.18, 0.7);
  noiseBurst(audio.master, 'highpass', 5000, 3000, 0.2, 0.25);
  sfxBreath(true, 0.16, 0.14, 0.05); // your breath catches (atmosphere.js)
}

// ONE BREATH, inside the helmet (atmosphere.js schedules them): noise
// through a band-pass, swelling up and dying away, not the sharp start of
// noiseBurst. An in-breath rises in pitch and is a little brighter; an
// out-breath falls and is longer, softer. Straight to the speakers, unpanned:
// it's you.
function sfxBreath(inhale, dur, vol, delay = 0) {
  if (!audioReady()) return;
  const ctx = audio.ctx, t = ctx.currentTime + delay;
  const src = ctx.createBufferSource();
  src.buffer = audio.noise;
  const f = ctx.createBiquadFilter();
  f.type = 'bandpass';
  f.Q.value = 0.8;
  f.frequency.setValueAtTime(inhale ? 700 : 1000, t);
  f.frequency.linearRampToValueAtTime(inhale ? 1300 : 550, t + dur);
  const g = ctx.createGain();
  g.gain.setValueAtTime(0.0001, t);
  g.gain.linearRampToValueAtTime(vol, t + dur * (inhale ? 0.6 : 0.3)); // the swell
  g.gain.linearRampToValueAtTime(0.0001, t + dur);                      // and away
  src.connect(f).connect(g).connect(audio.master);
  src.start(t, Math.random() * 0.5);
  src.stop(t + dur + 0.02);
}

// THE SCANNER (scanner.js): a blip up as it comes on, down as it goes off,
// and while it's on, a soft tick each sweep (and its hum: updateWorldLoops).
function sfxScanToggle(on) {
  if (!audioReady()) return;
  tone(audio.master, 'sine', on ? 600 : 1400, on ? 1400 : 600, 0.12, 0.1);
  tone(audio.master, 'square', on ? 2100 : 900, on ? 2100 : 900, 0.04, 0.04, 0.1);
}
function sfxScanTick() {
  if (!audioReady()) return;
  tone(audio.master, 'sine', 2600, 2400, 0.03, 0.035);
}

// A BULKHEAD slamming shut (lockdown.js): a huge low boom, the steel ringing, a hiss of air.
function sfxBulkheadSlam(door) {
  if (!audioReady()) return; // called from the game, not the watcher: the sound may not be on yet
  const out = placeAt(door.x + 0.5, door.y + 0.5);
  if (!out) return;
  drumHit(out, 'sine', 120, 35, 0.12, 0.9, 1.0);
  tone(out, 'triangle', 220, 205, 1.2, 0.18, 0.02);
  noiseBurst(out, 'lowpass', 900, 120, 0.6, 0.6);
  noiseBurst(out, 'highpass', 3000, 6000, 0.5, 0.12, 0.15);
}

// THE BUILDING MOVING ROUND YOU (atmosphere.js): one sound from behind a
// wall at (x, y), muffled by it. `kind`: 'machine' (robots about),
// 'creature' (the lab's), 'infected' (the HQ's).
function sfxBuilding(kind, x, y) {
  if (!audioReady()) return; // called from the game, not the watcher: the sound may not be on yet
  const out = placeAt(x, y);
  if (!out) return;
  const pick = Math.floor(Math.random() * 3);
  if (kind === 'machine') {
    if (pick === 0) { tone(out, 'sawtooth', 180, 420, 0.6, 0.08); tone(out, 'sawtooth', 420, 160, 0.5, 0.06, 0.65); }  // a servo, there and back
    else if (pick === 1) { for (const [f, d] of [[380, 0], [300, 0.5]]) { tone(out, 'sine', f, f * 0.97, 0.3, 0.3, d); tone(out, 'sine', f * 1.58, f * 1.5, 0.2, 0.15, d); } } // something heavy set down
    else { noiseBurst(out, 'bandpass', 1500, 600, 0.9, 0.25); drumHit(out, 'sine', 90, 40, 0.1, 0.5, 0.4, 0.8); }   // hydraulics, a door cycling
  } else if (kind === 'creature') {
    if (pick === 0) { for (let i = 0; i < 4; i++) noiseBurst(out, 'bandpass', 2400, 1800, 0.08, 0.2, i * 0.13); }     // claws on tile
    else if (pick === 1) { noiseBurst(out, 'lowpass', 500, 200, 1.4, 0.35); }                                         // something wet, dragged
    else { tone(out, 'sawtooth', 95, 70, 0.7, 0.07); tone(out, 'square', 1400, 900, 0.05, 0.05, 0.3); }               // a low chitter
  } else {
    if (pick === 0) { for (let i = 0; i < 3; i++) noiseBurst(out, 'lowpass', 600, 300, 0.12, 0.3, i * 0.55); }        // shuffling steps
    else if (pick === 1) { drumHit(out, 'sine', 110, 60, 0.04, 0.2, 0.5); drumHit(out, 'sine', 110, 60, 0.04, 0.2, 0.45, 0.4); } // a knock on the wall
    else { tone(out, 'sine', 140, 110, 1.4, 0.08); tone(out, 'sine', 210, 160, 1.2, 0.04, 0.1); }                     // a moan
  }
}

// The suit's breach alarm: a short synth beep (repeated by updateSound).
function sfxBreachBeep() {
  if (!audioReady()) return;
  tone(audio.master, 'square', 1250, 1250, 0.09, 0.12);
}

// Death: the display powering down, a whine falling away to nothing.
function sfxPowerDown() {
  if (!audioReady()) return;
  tone(audio.master, 'sawtooth', 900, 30, 1.3, 0.3);
  noiseBurst(audio.master, 'lowpass', 6000, 100, 1.0, 0.2);
}

// SECOND PASS: the world, robots' bodies, pickups, security -------------------

// A blast door: a hydraulic hiss as it moves; a heavy clunk as it hits home.
function sfxDoorMove(door) {
  const out = placeAt(door.x + 0.5, door.y + 0.5);
  if (!out) return;
  noiseBurst(out, 'bandpass', 900, 500, 0.9, 0.35);
  tone(out, 'sawtooth', 70, 55, 0.9, 0.08);
}
function sfxDoorClunk(door) {
  const out = placeAt(door.x + 0.5, door.y + 0.5);
  if (!out) return;
  drumHit(out, 'sine', 120, 45, 0.05, 0.25, 0.7);
  noiseBurst(out, 'lowpass', 1200, 200, 0.12, 0.4);
}
// A locked door refusing you: a flat buzz from its panel.
function sfxDenied(door) {
  const out = placeAt(door.x + 0.5, door.y + 0.5);
  if (!out) return;
  tone(out, 'square', 130, 120, 0.22, 0.2);
  tone(out, 'square', 98, 95, 0.22, 0.12);
}

// METAL: struck metal rings at several pitches that AREN'T simple multiples
// of each other (inharmonic), which is what makes it a clang and not a note.
function clang(dest, base, dur, vol) {
  for (const [mult, v] of [[1, 1], [1.58, 0.6], [2.43, 0.4], [3.71, 0.25]]) {
    tone(dest, 'sine', base * mult, base * mult * 0.98, dur, vol * v);
  }
}
// A round hitting a robot: a bright clang. Bigger robots ring lower.
function sfxRobotHit(enemy) {
  const out = placeAt(enemy.x, enemy.y);
  if (!out) return;
  const base = { walker: 520, scout: 760, heavy: 340, turret: 600 }[enemy.type];
  clang(out, base, 0.18, 0.35);
  noiseBurst(out, 'highpass', 3000, 2000, 0.03, 0.3);
}
// A robot destroyed: a crunch of breaking metal and a low clang.
function sfxRobotDown(enemy) {
  const out = placeAt(enemy.x, enemy.y);
  if (!out) return;
  noiseBurst(out, 'lowpass', 2500, 150, 0.6, 0.8);
  clang(out, 160, 0.7, 0.4);
  drumHit(out, 'sine', 100, 35, 0.08, 0.4, 0.8);
}
// Footsteps. A walker's foot is a heavy servo thud; a scout's a light tick;
// a heavy's a deep stomp. Yours, in the suit, are a soft thud with a whirr.
function sfxRobotStep(enemy) {
  const out = placeAt(enemy.x, enemy.y);
  if (!out) return;
  if (enemy.type === 'scout') {
    noiseBurst(out, 'bandpass', 2200, 1500, 0.04, 0.25);
  } else {
    const heavy = enemy.type === 'heavy';
    drumHit(out, 'sine', heavy ? 90 : 130, heavy ? 30 : 45, 0.04, heavy ? 0.25 : 0.15, heavy ? 0.7 : 0.45);
    noiseBurst(out, 'lowpass', 600, 150, 0.08, 0.3);
  }
}

// THE LAB'S CREATURES: flesh, not metal. Hits are wet slaps, not clangs.
// A pair of lurchers spotting you: two snarls a fifth apart, the second
// answering the first, so you know there are two.
function sfxPairCall(enemy) {
  const out = placeAt(enemy.x, enemy.y);
  if (!out) return;
  tone(out, 'sawtooth', 110, 80, 0.5, 0.14);
  tone(out, 'sawtooth', 165, 120, 0.5, 0.12, 0.35);
  noiseBurst(out, 'bandpass', 600, 300, 0.8, 0.25);
}
// Feeding: a wet tear, low and short.
function sfxFeeding(enemy) {
  const out = placeAt(enemy.x, enemy.y);
  if (!out) return;
  noiseBurst(out, 'lowpass', 900 + Math.random() * 400, 200, 0.18, 0.45);
  drumHit(out, 'sine', 120, 60, 0.04, 0.08, 0.2);
}
// The stalker: no snarl as it comes, only a sharp hiss as it strikes, and
// the blades whistling through.
function sfxStalkerSlash(enemy) {
  const out = placeAt(enemy.x, enemy.y);
  if (!out) return;
  noiseBurst(out, 'highpass', 4000, 2500, 0.22, 0.4);
  noiseBurst(out, 'bandpass', 2500, 900, 0.12, 0.35, 0.22);
}
// The brood mother. Waking: a deep, slow groan. Labour: a wet groan that
// rises as her belly swells. Birth: a heavy wet split and splatter.
function sfxBroodWake(enemy) {
  const out = placeAt(enemy.x, enemy.y);
  if (!out) return;
  tone(out, 'sawtooth', 55, 45, 1.4, 0.18);
  noiseBurst(out, 'lowpass', 400, 120, 1.2, 0.3);
}
function sfxBroodLabour(enemy) {
  const out = placeAt(enemy.x, enemy.y);
  if (!out) return;
  tone(out, 'sawtooth', 60, 140, 1.2, 0.16);
  tone(out, 'sawtooth', 63, 146, 1.2, 0.1);
  noiseBurst(out, 'bandpass', 300, 900, 1.2, 0.25);
}
function sfxBroodBirth(enemy) {
  const out = placeAt(enemy.x, enemy.y);
  if (!out) return;
  noiseBurst(out, 'lowpass', 1800, 150, 0.5, 0.8);
  drumHit(out, 'sine', 90, 40, 0.06, 0.3, 0.6);
}
// THE PA (manager.js): the building's own chime, two notes down, then the
// voice: a flat, clipped buzz for each word, like a cheap speaker.
function sfxPA(text) {
  tone(audio.master, 'sine', 659, 659, 0.35, 0.12);
  tone(audio.master, 'sine', 523, 523, 0.5, 0.12, 0.3);
  text.split(' ').filter((w) => /[A-Z]/.test(w)).forEach((word, n) => {
    const t = 0.85 + n * 0.2;
    const f = 140 + 25 * noise(n, word.length, 470);
    tone(audio.master, 'square', f, f * 0.94, Math.min(0.17, 0.05 + word.length * 0.02), 0.035, t);
    noiseBurst(audio.master, 'bandpass', 1400, 900, 0.06, 0.05, t);
  });
}
// A manager killed: the PA howls with feedback, then cuts out.
function sfxPAFeedback() {
  tone(audio.master, 'sine', 1800, 2600, 0.9, 0.08);
  noiseBurst(audio.master, 'bandpass', 2000, 400, 0.9, 0.2);
}
function sfxCreatureHit(enemy) {
  const out = placeAt(enemy.x, enemy.y);
  if (!out) return;
  noiseBurst(out, 'lowpass', 1100, 250, 0.12, 0.6);
  drumHit(out, 'sine', 170, 70, 0.05, 0.12, 0.35);
}
// Dying: a long, sinking gurgle.
function sfxCreatureDown(enemy) {
  const out = placeAt(enemy.x, enemy.y);
  if (!out) return;
  tone(out, 'sawtooth', 150, 45, 0.9, 0.12);
  tone(out, 'sawtooth', 153, 47, 0.9, 0.08); // a fraction apart, so the two beat: a rattle
  noiseBurst(out, 'lowpass', 700, 90, 0.8, 0.5);
  drumHit(out, 'sine', 80, 30, 0.1, 0.4, 0.6, 0.35); // it hits the floor
}
// A heavy, dragging step: bare feet on vinyl.
function sfxCreatureStep(enemy) {
  const out = placeAt(enemy.x, enemy.y);
  if (!out) return;
  drumHit(out, 'sine', 75, 35, 0.03, 0.12, 0.35);
  noiseBurst(out, 'lowpass', 450, 120, 0.14, 0.25);
}
// Spotting you: a low growl, two saws beating against each other.
function sfxLurcherSnarl(enemy) {
  const out = placeAt(enemy.x, enemy.y);
  if (!out) return;
  tone(out, 'sawtooth', 95, 70, 0.7, 0.14);
  tone(out, 'sawtooth', 99, 73, 0.7, 0.1);
  noiseBurst(out, 'bandpass', 500, 300, 0.6, 0.25);
}
// Rearing up to strike: a rising screech. The sound to back off at.
function sfxLurcherRear(enemy) {
  const out = placeAt(enemy.x, enemy.y);
  if (!out) return;
  tone(out, 'sawtooth', 260, 820, LURCHER_WINDUP, 0.1);
  noiseBurst(out, 'bandpass', 1400, 3200, LURCHER_WINDUP, 0.3);
}
// The lunge: a whoosh of claws.
function sfxLurcherSwipe(enemy) {
  const out = placeAt(enemy.x, enemy.y);
  if (!out) return;
  noiseBurst(out, 'bandpass', 600, 2800, 0.2, 0.6);
}

// THE HQ'S SUITS. Spotting you: a long, hollow moan, two voices a fraction
// apart. Taking hold: a wet grunt and cloth tearing. Getting up: a slow,
// creaking groan rising. Finished off: a soft pop, and spores hissing out.
function sfxSuitMoan(enemy) {
  const out = placeAt(enemy.x, enemy.y);
  if (!out) return;
  tone(out, 'triangle', 140, 105, 1.1, 0.16);
  tone(out, 'triangle', 143, 101, 1.1, 0.11);
  noiseBurst(out, 'bandpass', 380, 260, 0.9, 0.18);
}
function sfxSuitGrab(enemy) {
  const out = placeAt(enemy.x, enemy.y);
  if (!out) return;
  tone(out, 'sawtooth', 120, 80, 0.25, 0.12);
  noiseBurst(out, 'highpass', 1800, 3500, 0.18, 0.4, 0.05);
}
function sfxSuitRise(enemy) {
  const out = placeAt(enemy.x, enemy.y);
  if (!out) return;
  tone(out, 'sawtooth', 70, 150, SUIT_RISE_TIME, 0.1);
  tone(out, 'sawtooth', 72, 147, SUIT_RISE_TIME, 0.07);
}
function sfxSuitFinished(enemy) {
  const out = placeAt(enemy.x, enemy.y);
  if (!out) return;
  drumHit(out, 'sine', 160, 60, 0.04, 0.1, 0.4);
  noiseBurst(out, 'highpass', 3000, 1500, 0.6, 0.3, 0.04);
}

// THE BLOOMER swelling: a creak of stretching plant, rising, wet.
function sfxBloomerSwell(enemy) {
  const out = placeAt(enemy.x, enemy.y);
  if (!out) return;
  tone(out, 'triangle', 90, 260, ENEMY_TYPES.bloomer.charge, 0.12);
  noiseBurst(out, 'bandpass', 600, 1800, ENEMY_TYPES.bloomer.charge, 0.18);
}
// A spore cloud bursting (spores.js): a soft, deep whump and a long breathy hiss.
function sfxSporeBurst(x, y) {
  if (!audioReady()) return;
  const out = placeAt(x, y);
  if (!out) return;
  drumHit(out, 'sine', 110, 40, 0.08, 0.3, 0.5);
  noiseBurst(out, 'lowpass', 2500, 500, 1.2, 0.4, 0.03);
}
// The fire system going off (sprinklers.js): an electric bell, ringing hard.
function sfxFireBell(x, y) {
  if (!audioReady()) return;
  const out = placeAt(x, y);
  if (!out) return;
  for (let i = 0; i < 24; i++) tone(out, 'square', 2100, 2050, 0.06, 0.09, i * 0.075);
}
// A running sprinkler: a hiss of spray, renewed while it runs.
function sfxSprinklerHiss(x, y) {
  if (!audioReady()) return;
  const out = placeAt(x, y);
  if (!out) return;
  noiseBurst(out, 'highpass', 4000, 5000, 0.5, 0.15);
}

// THE MOTHS (pollinators.js). A sting: a sharp little stab of noise. Shot:
// a dry, papery crunch.
function sfxMothSting(m) {
  if (!audioReady()) return;
  const out = placeAt(m.x, m.y);
  if (!out) return;
  noiseBurst(out, 'highpass', 5000, 2500, 0.06, 0.35);
  tone(out, 'sawtooth', 900, 500, 0.06, 0.06);
}
function sfxMothSplat(m) {
  if (!audioReady()) return;
  const out = placeAt(m.x, m.y);
  if (!out) return;
  noiseBurst(out, 'bandpass', 3000, 1200, 0.08, 0.4);
}

// The spitter spotting you: a wet, rattling hiss.
function sfxSpitterHiss(enemy) {
  const out = placeAt(enemy.x, enemy.y);
  if (!out) return;
  noiseBurst(out, 'highpass', 2500, 4000, 0.5, 0.35);
  tone(out, 'sawtooth', 180, 140, 0.4, 0.06);
}
// A glob leaving its mouth: a thick hawk, then a wet whoosh.
function sfxSpit(enemy) {
  if (!audioReady()) return; // called from the game, not from watchTheGame
  const out = placeAt(enemy.x, enemy.y);
  if (!out) return;
  noiseBurst(out, 'lowpass', 900, 300, 0.1, 0.6);
  noiseBurst(out, 'bandpass', 1500, 600, 0.3, 0.4, 0.06);
}
// It lands: a splat, and a sizzle as the acid eats into the floor.
function sfxAcidSplash(x, y) {
  if (!audioReady()) return; // called from the game, not from watchTheGame
  const out = placeAt(x, y);
  if (!out) return;
  noiseBurst(out, 'lowpass', 1200, 200, 0.15, 0.7);
  noiseBurst(out, 'highpass', 5000, 3500, 1.2, 0.25, 0.05);
}
// Larvae: a dry chitter as a pack wakes, a snap as one bites, and a squish as one bursts.
function sfxLarvaChitter(l) {
  if (!audioReady()) return; // called from the game, not from watchTheGame
  const out = placeAt(l.x, l.y);
  if (!out) return;
  for (let i = 0; i < 6; i++) noiseBurst(out, 'bandpass', 3200, 2600, 0.02, 0.3, i * 0.045);
}
function sfxLarvaBite(l) {
  if (!audioReady()) return; // called from the game, not from watchTheGame
  const out = placeAt(l.x, l.y);
  if (!out) return;
  noiseBurst(out, 'bandpass', 2400, 1200, 0.05, 0.6);
  tone(out, 'square', 700, 300, 0.05, 0.08);
}
function sfxLarvaSquish(l) {
  if (!audioReady()) return; // called from the game, not from watchTheGame
  const out = placeAt(l.x, l.y);
  if (!out) return;
  noiseBurst(out, 'lowpass', 1600, 300, 0.12, 0.5);
  drumHit(out, 'sine', 220, 90, 0.04, 0.08, 0.2);
}
// A pod spilling a larva: a wet tearing pop.
function sfxPodBurst(pod) {
  if (!audioReady()) return; // called from the game, not from watchTheGame
  const out = placeAt(pod.outX, pod.outY);
  if (!out) return;
  noiseBurst(out, 'bandpass', 700, 1800, 0.15, 0.5);
  drumHit(out, 'sine', 140, 60, 0.04, 0.15, 0.3);
}

function sfxPlayerStep() {
  drumHit(audio.master, 'sine', 110, 40, 0.04, 0.12, 0.25);
  tone(audio.master, 'sawtooth', 240, 320, 0.08, 0.03); // servo whirr
}

// Glass: the first hit cracks it (a sharp tick and a hiss); the second sends
// it in a shower: dozens of tiny high tinkles at random times and pitches.
function sfxGlassCrack(panel) {
  const out = placeAt(panel.x + 0.5, panel.y + 0.5);
  if (!out) return;
  tone(out, 'square', 4200, 3000, 0.02, 0.25);
  noiseBurst(out, 'highpass', 5000, 3000, 0.15, 0.3);
}
function sfxGlassShatter(panel) {
  const out = placeAt(panel.x + 0.5, panel.y + 0.5);
  if (!out) return;
  noiseBurst(out, 'highpass', 6000, 2500, 0.35, 0.6);
  for (let i = 0; i < 24; i++) {
    const f = 2500 + Math.random() * 5000;
    tone(out, 'sine', f, f, 0.04 + Math.random() * 0.08, 0.12, Math.random() * 0.45);
  }
}

// Ammo: metal, not synth. A magazine slapped home: a clack (a short clang
// with a click of noise), then a second, lower and heavier as it seats.
// A clip is a single, lighter clack.
function metalClack(base, vol, delay) {
  for (const [mult, v] of [[1, 1], [1.58, 0.6], [2.43, 0.4], [3.71, 0.25]]) {
    tone(audio.master, 'sine', base * mult, base * mult * 0.97, 0.07, vol * v, delay);
  }
  noiseBurst(audio.master, 'bandpass', 3500, 2000, 0.025, vol * 1.2, delay);
}

// Pickups: synth chirps from the suit, a little tune for each kind (ammo clacks).
function sfxPickup(type) {
  if (type === 'ammo') { metalClack(1300, 0.3, 0); metalClack(820, 0.4, 0.09); return; }
  if (type === 'ammocrate') { metalClack(1100, 0.35, 0); metalClack(700, 0.4, 0.08); metalClack(900, 0.35, 0.17); return; }
  if (type === 'clip') { metalClack(1500, 0.25, 0); return; }
  if (type === 'incendiary' || type === 'piercing') { metalClack(1900, 0.25, 0); metalClack(1200, 0.3, 0.07); metalClack(1600, 0.25, 0.14); return; } // ammo.js
  const notes = {
    repair: [440, 554, 660, 880],
    redkey: [988, 1319, 1976], bluekey: [988, 1319, 1976],
    burstmod: [523, 659, 784, 1047, 1319], automod: [523, 659, 784, 1047, 1319], overdrivemod: [523, 659, 784, 1047, 1319, 1568],
    plating: [330, 440, 554, 660], scannerup: [392, 523, 784, 1047, 1319],
    scanner: [392, 523, 784, 1047, 784, 1047],
    charge: [330, 330, 494],
    liftkey: [784, 988, 1175, 1568],
  }[type] || [880];
  notes.forEach((f, i) => tone(audio.master, 'square', f, f, 0.08, 0.1, i * 0.06));
}

// Security. A tripwire waking turrets: a rising pair of tones. A terminal
// shutting a zone down: a falling run, the system powering off. A hive
// releasing a drone: a short mechanical rattle.
function sfxTurretsOnline() {
  [440, 660, 440, 660].forEach((f, i) => tone(audio.master, 'square', f, f, 0.1, 0.1, i * 0.12));
}
function sfxSecurityOffline() {
  [1047, 784, 523, 392].forEach((f, i) => tone(audio.master, 'triangle', f, f * 0.98, 0.12, 0.18, i * 0.1));
}
// The core: a shot on it is a deep, heavy clang with a fizz of sparks. The
// moment it dies, the lift's lamp turns green with a two-note chime.
function sfxCoreHit() {
  const c = core.cells.reduce((a, b) => Math.hypot(a.front.x - player.x, a.front.y - player.y) < Math.hypot(b.front.x - player.x, b.front.y - player.y) ? a : b);
  const out = placeAt(c.front.x, c.front.y);
  if (!out) return;
  clang(out, 210, 0.35, 0.4);
  noiseBurst(out, 'highpass', 6000, 3000, 0.15, 0.35);
}
// REPAIR BAYS (repair.js). A robot breaking off for repair: a falling
// two-note warble from its beacon, so you hear it going. Welding: short
// crackles of bright noise. A bay hit: a hollow clang.
function sfxRobotRetreat(enemy) {
  const out = placeAt(enemy.x, enemy.y);
  if (!out) return;
  tone(out, 'square', 880, 860, 0.12, 0.12);
  tone(out, 'square', 587, 570, 0.18, 0.12, 0.13);
}
function sfxWeld(bay) {
  const out = placeAt(bay.dock.x, bay.dock.y);
  if (!out) return;
  noiseBurst(out, 'highpass', 5000 + Math.random() * 3000, 2500, 0.03 + Math.random() * 0.05, 0.25);
}
function sfxBayHit(bay) {
  const out = placeAt(bay.dock.x, bay.dock.y);
  if (!out) return;
  clang(out, 300, 0.25, 0.35);
  noiseBurst(out, 'highpass', 6000, 3000, 0.1, 0.3);
}
// The demolition charge (charge.js). Set: a magnetic clunk onto the core and
// a rising arming chirp. Its fuse: a hard little beep from where it is,
// coming faster and faster (charge.js decides when).
function sfxChargeSet(x, y) {
  if (!audioReady()) return;
  const out = placeAt(x, y);
  if (!out) return;
  clang(out, 320, 0.2, 0.35);
  [660, 880, 1320].forEach((f, i) => tone(out, 'square', f, f, 0.07, 0.12, 0.15 + i * 0.07));
}
function sfxChargeBeep(x, y) {
  if (!audioReady()) return;
  const out = placeAt(x, y);
  if (!out) return;
  tone(out, 'square', 1800, 1800, 0.05, 0.16);
}
// THE LIFT RIDE (lift.js). A floor going by, or the gate: a heavy steel
// clunk. Arriving: a two-note chime.
function sfxLiftClunk() {
  if (!audioReady()) return;
  drumHit(audio.master, 'sine', 90, 40, 0.06, 0.25, 0.45);
  noiseBurst(audio.master, 'lowpass', 900, 200, 0.15, 0.3);
}
function sfxLiftChime() {
  if (!audioReady()) return;
  tone(audio.master, 'sine', 1319, 1319, 0.9, 0.18);
  tone(audio.master, 'sine', 1047, 1047, 1.2, 0.18, 0.35);
}
function sfxLiftOpen() {
  tone(audio.master, 'sine', 784, 784, 0.25, 0.2);
  tone(audio.master, 'sine', 1175, 1175, 0.4, 0.2, 0.2);
}

function sfxHiveRelease(hive) {
  const out = placeAt(hive.outX, hive.outY);
  if (!out) return;
  for (let i = 0; i < 4; i++) noiseBurst(out, 'bandpass', 1800, 900, 0.03, 0.4, i * 0.04);
}

// THE CONTINUOUS SOUNDS, adjusted every frame ---------------------------------

const robotWhines = new Map();   // robot -> voice, while it's charging a shot
const droneBuzzes = new Map();   // drone -> voice, while it's out and about
const mothBuzzes = new Map();    // moth -> voice, while it's swarming
let spinWhine = null;            // your gun winding up
let breachHiss = null;           // air escaping a breached suit
let scanHum = null;              // the scanner, running
let lastLit = 1;                 // coils lit last frame, to hear one lock on
let breachTimer = 0;             // seconds to the next breach beep
let gameOver = false;             // set once the game has ended and the loops have faded (R reloads the page)
const ventHisses = new Map();    // vent -> noise voice, while it's sputtering or bursting
let siren = null;                // the alarm, while any zone's is going
let ambience = null;             // the hangar's hum and air, always there

// WATCHING THE GAME. Most second-pass sounds aren't called from the game code:
// each frame we compare things with how they were last frame, and a change
// is a sound. A door's state flipping, a pickup gone from the list, a robot's
// health dropping. It keeps the sound out of the game's logic.
const last = {
  doors: new Map(), panels: new Map(), enemies: new Map(), pickups: new Set(),
  hives: new Map(), terminals: new Map(), bays: new Map(), lockedHint: null, playerStep: 0, messageTime: 0,
  coreHealth: CORE_HEALTH, coreState: 'online', ready: false,
};

function updateSound(dt) {
  if (!audioReady()) return;
  if (game.state === 'title' || game.state === 'briefing') return; // campaign.js: nothing in the world is moving yet

  // GAME OVER (dead or cleared): everything is frozen, so any whine or buzz
  // would hang on as one flat, endless tone. Instead, fade every ongoing
  // sound out over a couple of seconds, once, and play nothing new.
  if (game.state !== 'playing') {
    if (game.state === 'dead' && !gameOver) sfxPowerDown();
    if (!gameOver) fadeOutLoops();
    gameOver = true;
    return;
  }
  if (!last.ready) rememberState(); // the first frame we can play: start from what's there now
  watchTheGame();
  updateWorldLoops();

  // YOUR GUN SPINNING UP: a whine that climbs while you hold the trigger, if
  // there's a mode to spin up to. Its pitch follows how far through the
  // wind-up you are, and a click marks each coil locking on.
  if (!spinWhine) spinWhine = makeVoice('sawtooth');
  const winding = triggerHeld() && game.state === 'playing' && player.modes.length > 1;
  // How far through the wind-up, to the last mode you've got (with only single
  // shot there's nothing to wind up to, and its spin-up time is 0: no whine).
  const top = SPIN_UP[player.modes[player.modes.length - 1]];
  const wind = top > 0 ? Math.min(1, gun.heldTime / top) : 0;
  spinWhine.gain.gain.setTargetAtTime(winding ? 0.05 + 0.05 * wind : 0, audio.ctx.currentTime, 0.05);
  spinWhine.osc.frequency.setTargetAtTime(110 + 520 * wind, audio.ctx.currentTime, 0.05);
  spinWhine.filter.frequency.setTargetAtTime(1200 + 2500 * wind, audio.ctx.currentTime, 0.05);
  const lit = MODE_ORDER.indexOf(activeModeId()) + 1;
  if (lit > lastLit) sfxCoilLock();
  lastLit = lit;

  // ROBOTS CHARGING: a whine that rises as the charge builds, the sound of
  // the visor brightening. You can hear one about to fire behind you.
  for (const e of enemies) {
    const charging = e.state === 'aim' && e.charge > 0;
    let v = robotWhines.get(e);
    const creature = ENEMY_TYPES[e.type].creature;
    if (charging && !v) { v = makeVoice(creature ? 'sawtooth' : 'triangle'); robotWhines.set(e, v); }
    if (!charging && v) { stopVoice(v); robotWhines.delete(e); continue; }
    if (v) {
      const f = e.charge / chargeTime(e); // enemies.js: a walker's follow-up shots charge quicker
      // A spitter's sac swelling is a rising gurgle, lower and rougher than a robot's whine.
      if (creature) steerVoice(v, e.x, e.y, 0.1, 80 + 220 * f + 25 * Math.sin(animTime * 40));
      else steerVoice(v, e.x, e.y, 0.15, 300 + 900 * f);
    }
  }

  // DRONES: each buzzes at its own pitch, warbling as it weaves, so a pack
  // sounds like a cloud rather than one note.
  for (const d of drones) {
    const alive = d.state === 'swarm';
    let v = droneBuzzes.get(d);
    if (alive && !v) { v = makeVoice('sawtooth'); droneBuzzes.set(d, v); }
    if (!alive && v) { stopVoice(v); droneBuzzes.delete(d); continue; }
    if (v) steerVoice(v, d.x, d.y, 0.06, 170 + 40 * Math.sin(d.phase) + 15 * Math.sin(animTime * 9 + d.phase));
  }

  // MOTHS: a low, soft flutter each, wavering fast with the wingbeat.
  for (const m of moths) {
    const alive = m.state === 'swarm' || m.state === 'recoil';
    let v = mothBuzzes.get(m);
    if (alive && !v) { v = makeVoice('triangle'); mothBuzzes.set(m, v); }
    if (!alive && v) { stopVoice(v); mothBuzzes.delete(m); continue; }
    if (v) steerVoice(v, m.x, m.y, 0.07, 75 + 12 * Math.sin(m.phase) + 25 * Math.sin(animTime * 70 + m.phase));
  }

  // BREACHED: the suit beeps at you twice a second until you find a repair kit.
  if (game.state === 'playing' && player.armour === 0) {
    breachTimer -= dt;
    if (breachTimer <= 0) { sfxBreachBeep(); breachTimer = 0.5; }
  } else {
    breachTimer = 0;
  }

}

// Fade out and stop every sound that keeps going. setTargetAtTime with a
// time constant of 0.6s is an exponential fade: about two-thirds gone after
// 0.6s, all but silent after 2s.
const LOOP_FADE = 0.6;
function fadeOutLoops() {
  const t = audio.ctx.currentTime;
  const all = [...robotWhines.values(), ...droneBuzzes.values(), ...mothBuzzes.values(), ...ventHisses.values(), spinWhine, breachHiss, scanHum, siren, ...(ambience || [])];
  for (const v of all) {
    if (!v) continue;
    v.gain.gain.cancelScheduledValues(t);
    v.gain.gain.setTargetAtTime(0, t, LOOP_FADE);
    v.osc.stop(t + LOOP_FADE * 5);
  }
  robotWhines.clear();
  droneBuzzes.clear();
  mothBuzzes.clear();
  ventHisses.clear();
  spinWhine = breachHiss = scanHum = siren = ambience = null;
}

// Note how everything is now, to compare against next frame.
function rememberState() {
  for (const d of DOORS) last.doors.set(d, d.state);
  for (const p of PANELS) last.panels.set(p, p.state);
  for (const e of enemies) last.enemies.set(e, { health: e.health, state: e.state, step: Math.floor(e.walkTime * WALK_FPS), downTime: e.downTime, pairCaller: e.pairCaller, radioCalls: e.radioCalls, torchBroken: e.torchBroken, burn: e.burn });
  last.pickups = new Set(pickups);
  for (const h of hives) last.hives.set(h, h.left);
  for (const t of terminals) last.terminals.set(t, t.state);
  for (const b of bays) last.bays.set(b, b.health);
  last.lockedHint = lockedDoorHint;
  last.sealedHint = sealedDoorHint;
  last.messageTime = securityMessageTime;
  last.coreHealth = core.health;
  last.coreState = core.state;
  last.playerStep = Math.floor(player.walkTime * 6 / Math.PI); // the gun bob's cycle: one step per half-turn of cos
  last.ready = true;
}

function watchTheGame() {
  for (const d of DOORS) {
    const was = last.doors.get(d);
    if (d.state !== was) {
      if (d.state === 'opening' || d.state === 'closing') sfxDoorMove(d);
      if (d.state === 'open' || d.state === 'closed') sfxDoorClunk(d);
    }
  }
  if (paNew) { paNew = false; sfxPA(paMessage); }                 // manager.js: an announcement
  if (paFeedback) { paFeedback = false; sfxPAFeedback(); }        // ...or the PA dying with it
  if (sealedDoorHint && !last.sealedHint) {
    const door = DOORS.find((d) => d.sealed > 0 && playerNearDoor(d));
    if (door) sfxDenied(door);
  }
  if (lockedDoorHint && lockedDoorHint !== last.lockedHint) {
    const door = DOORS.find((d) => d.lock === lockedDoorHint && playerNearDoor(d));
    if (door) sfxDenied(door);
  }
  for (const p of PANELS) {
    const was = last.panels.get(p);
    if (p.state !== was) p.state === 'shattered' ? sfxGlassShatter(p) : sfxGlassCrack(p);
  }
  for (const e of enemies) {
    const was = last.enemies.get(e);
    const step = Math.floor(e.walkTime * WALK_FPS);
    const creature = ENEMY_TYPES[e.type].creature;
    if (e.health < was.health) {
      if (creature) e.state === 'dead' ? sfxCreatureDown(e) : sfxCreatureHit(e);
      else e.state === 'dead' ? sfxRobotDown(e) : sfxRobotHit(e);
    }
    if (e.state === 'dead' && was.downTime > 0 && e.downTime === 0) sfxSuitFinished(e); // infected.js
    if (e.state !== 'dead' && e.moving && step !== was.step) creature ? sfxCreatureStep(e) : sfxRobotStep(e);
    if (e.state === 'retreat' && was.state !== 'retreat') sfxRobotRetreat(e);
    if (e.state === 'feed' && Math.random() < 0.05) sfxFeeding(e); // feeding.js: tearing, now and then
    if (e.pairCaller && !was.pairCaller) sfxPairCall(e);           // creatures.js: a pair has seen you
    if (e.radioCalls > was.radioCalls) sfxRadio(e);                // guard.js: calling it in
    if (e.torchBroken && !was.torchBroken) sfxTorchBreak(e);       // ...its torch shot out
    if (e.burn > was.burn) sfxIgnite(e);                           // ammo.js: set alight (or alight again)
    if (e.state === 'reload' && was.state !== 'reload') sfxGuardReload(e, GUARD_RELOAD);
    if (creature && e.state !== was.state) {
      if (e.state === 'chase' && (was.state === 'idle' || was.state === 'search')) {
        if (e.type === 'spitter') sfxSpitterHiss(e);
        else if (e.type === 'suit') sfxSuitMoan(e);
        else if (e.type !== 'stalker' && e.type !== 'guard') sfxLurcherSnarl(e); // the stalker comes silently; a guard radios instead
      }
      if (e.state === 'grab') sfxSuitGrab(e);
      if (e.state === 'swell') sfxBloomerSwell(e);
      if (e.state === 'rising') sfxSuitRise(e);
      if (e.state === 'windup') sfxLurcherRear(e);
      if (e.state === 'lunge') sfxLurcherSwipe(e);
      if (e.state === 'slash') sfxStalkerSlash(e);
      if (e.state === 'labour') sfxBroodLabour(e);
      if (e.state === 'awake' && was.state === 'labour') sfxBroodBirth(e);
      if (e.state === 'awake' && was.state === 'idle') sfxBroodWake(e);
    }
  }
  // A pickup that was in the list last frame and isn't now has been collected.
  for (const p of last.pickups) if (!pickups.includes(p)) sfxPickup(p.type);
  for (const h of hives) if (h.left < last.hives.get(h)) sfxHiveRelease(h);
  for (const t of terminals) if (t.state === 'safe' && last.terminals.get(t) !== 'safe') sfxSecurityOffline();
  if (core.health < last.coreHealth) sfxCoreHit();
  for (const b of bays) {
    if (b.health < last.bays.get(b)) sfxBayHit(b);
    if (bayWelding(b) && Math.random() < 0.25) sfxWeld(b); // a crackle every few frames
  }
  if (core.state === 'destroyed' && last.coreState !== 'destroyed') { sfxSecurityOffline(); sfxLiftOpen(); }
  // A security message that has just appeared (its timer jumped back up).
  if (securityMessage === 'TURRETS ONLINE' && securityMessageTime > last.messageTime) sfxTurretsOnline();
  const step = Math.floor(player.walkTime * 6 / Math.PI);
  if (step !== last.playerStep && game.state === 'playing') sfxPlayerStep();
  rememberState();
}

// Steam, the alarm and the hangar's ambience: sounds that last.
function updateWorldLoops() {
  const t = audio.ctx.currentTime;
  // STEAM: each vent hisses while it's active, quietly while sputtering.
  for (const v of vents) {
    const active = v.state !== 'idle';
    let voice = ventHisses.get(v);
    if (active && !voice) { voice = makeNoiseVoice(3000); ventHisses.set(v, voice); }
    if (!active && voice) { stopVoice(voice); ventHisses.delete(v); continue; }
    if (voice) steerVoice(voice, v.x, v.y, v.state === 'burst' ? 0.5 : 0.15, v.state === 'burst' ? 3500 : 2000);
  }
  // THE SCANNER's hum, while it's on (scanner.js).
  if (!scanHum) { scanHum = makeVoice('sine'); scanHum.osc.frequency.value = 96; scanHum.filter.frequency.value = 600; }
  scanHum.gain.gain.setTargetAtTime(player.scanning && game.state === 'playing' ? 0.03 : 0, t, 0.1);
  // A BREACHED SUIT: a thin hiss of air, all the time it's open.
  if (!breachHiss) breachHiss = makeNoiseVoice(6500);
  breachHiss.gain.gain.setTargetAtTime(game.state === 'playing' && player.armour === 0 ? 0.03 : 0, t, 0.2);
  // THE ALARM: a two-tone wail while any zone's alarm is going.
  const alarmOn = game.state === 'playing' && Object.values(alarms).some((a) => a > 0);
  if (!siren) siren = makeVoice('square');
  siren.gain.gain.setTargetAtTime(alarmOn ? 0.035 : 0, t, 0.1);
  siren.osc.frequency.setTargetAtTime(Math.floor(animTime * 2) % 2 === 0 ? 660 : 520, t, 0.02);
  siren.filter.frequency.value = 2000;
  // AMBIENCE: two low saws a fraction of a hertz apart (they "beat", the hum
  // slowly swelling and fading), plus a little air. Always on, very quiet.
  if (!ambience) {
    ambience = [makeVoice('sawtooth'), makeVoice('sawtooth'), makeNoiseVoice(400)];
    ambience[0].osc.frequency.value = 55;
    ambience[1].osc.frequency.value = 55.6;
    for (const v of ambience) { v.filter.frequency.value = 220; v.gain.gain.setTargetAtTime(0.02, t, 1); }
  }
}
