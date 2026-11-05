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

const audio = { ctx: null, master: null, noise: null, muted: false };

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
}
window.addEventListener('pointerdown', initAudio);
window.addEventListener('keydown', initAudio);

function audioReady() {
  return audio.ctx && audio.ctx !== 'unavailable' && !audio.muted;
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

// THE SOUNDS ----------------------------------------------------------------

// Your gun: a synth "zap" that drops in pitch, with a click of noise. Each
// fire mode is pitched a little differently, so you can hear what it's doing.
function sfxPlayerShot(mode) {
  if (!audioReady()) return;
  const pitch = { single: 1, burst: 0.9, auto: 0.8 }[mode];
  tone(audio.master, 'square', 900 * pitch, 180 * pitch, 0.09, 0.22);
  noiseBurst(audio.master, 'highpass', 4000, 2000, 0.04, 0.25);
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

// THE CONTINUOUS SOUNDS, adjusted every frame ---------------------------------

const robotWhines = new Map();   // robot -> voice, while it's charging a shot
const droneBuzzes = new Map();   // drone -> voice, while it's out and about
let spinWhine = null;            // your gun winding up
let lastLit = 1;                 // coils lit last frame, to hear one lock on
let breachTimer = 0;             // seconds to the next breach beep
let wasDead = false;

function updateSound(dt) {
  if (!audioReady()) return;

  // YOUR GUN SPINNING UP: a whine that climbs while you hold the trigger, if
  // there's a mode to spin up to. Its pitch follows how far through the
  // wind-up you are, and a click marks each coil locking on.
  if (!spinWhine) spinWhine = makeVoice('sawtooth');
  const winding = triggerHeld() && game.state === 'playing' && player.modes.length > 1;
  const wind = Math.min(1, gun.heldTime / SPIN_UP.auto);
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
    if (charging && !v) { v = makeVoice('triangle'); robotWhines.set(e, v); }
    if (!charging && v) { stopVoice(v); robotWhines.delete(e); continue; }
    if (v) {
      const f = e.charge / ROBOT_TYPES[e.type].charge;
      steerVoice(v, e.x, e.y, 0.15, 300 + 900 * f);
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

  // BREACHED: the suit beeps at you twice a second until you find a repair kit.
  if (game.state === 'playing' && player.armour === 0) {
    breachTimer -= dt;
    if (breachTimer <= 0) { sfxBreachBeep(); breachTimer = 0.5; }
  } else {
    breachTimer = 0;
  }

  if (game.state === 'dead' && !wasDead) sfxPowerDown();
  wasDead = game.state === 'dead';
}
