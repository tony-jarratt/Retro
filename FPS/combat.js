// Combat: your gun, what the crosshair hits, robots charging and firing back
// with distance-based odds, your health, and winning or losing.

const DRY_FIRE_GAP = 0.25;      // seconds between dry clicks while you pull an empty trigger
const GUN_FLASH_TIME = 0.12;    // longest a muzzle flash and recoil show (each weapon's own cooldown is in weapons.js)
const HURT_FLASH_TIME = 0.1;    // seconds a hit robot flashes white
const ROBOT_FIRE_FLASH = 0.15;  // seconds a robot shows its own muzzle flash
// (Each robot type's health, charge time, damage and odds are in ENEMY_TYPES, enemies.js.)
const PLAYER_HURT_FLASH = 0.3;  // seconds the screen flashes red when you're hit

// The whole game's state:
//   state        'playing', then 'dead', or 'clear' once you reach the lift (core.js)
//   hurtFlash    seconds of red flash left
//   pickupFlash  seconds of gold flash left (pickups.js)
//   endTime      seconds since the game ended (for the slow fade)
const game = { state: 'playing', hurtFlash: 0, pickupFlash: 0, endTime: 0 };

// The gun's moment-to-moment state (its fire modes are in weapons.js):
//   cooldown    seconds until you can pull the trigger again
//   flash       seconds of muzzle flash left
//   burstLeft   rounds of this pull still to fire (a burst's 2nd and 3rd)
//   burstTimer  seconds until the next of them
//   burstRound  how many rounds of this pull have gone (for a burst's climb)
//   pullMode    the mode this pull was fired in: it keeps it to the end, even
//               if the ammo drops below that mode's minimum part-way
//   heldTime    seconds the trigger has been held: how far the gun has spun up (weapons.js)
//   lastMode    the mode last frame, to notice it stepping up
const gun = { cooldown: 0, flash: 0, burstLeft: 0, burstTimer: 0, burstRound: 0, pullMode: 'single', heldTime: 0, lastMode: 'single' };

// What does a shot fired at `angle` hit? For a dead-straight shot that's
// whatever is under the crosshair; a round that strays (weapons.js: the
// accuracy cone) flies at an angle a little to one side. Either way the
// question is the same, asked as if we were looking along that angle: a
// `viewer` standing where you are, facing it, so the shot runs through the
// exact centre of ITS screen.
//
// castRay gives the nearest wall along the shot, and the panels on the way:
// the first unbroken window is where the bullet stops instead. (Grates and
// broken windows let it straight through.) Then each sprite is placed on that
// viewer's screen exactly as for drawing (placeOnScreen), and we ask which
// texel of its picture sits on the centre pixel. If that texel is
// see-through the shot passes it by; otherwise it's a candidate, and the
// nearest candidate in front of the wall is what gets hit.
//
// Because the centre is always at eye height (halfway up a wall), it always
// lands on texture row 32: a robot's hull, or the top of a drum. So in
// practice this asks "is the shot on its silhouette?" at hull height. The
// walker's hull is a long box, so it's a slightly wider target side-on than face-on.
//
// Returns a sprite thing, { panel } for a window, { core: true } for the
// security core (core.js), or null for any other wall.
function shotTarget(angle) {
  const viewer = { x: player.x, y: player.y, angle };
  const ray = castRay(player.x, player.y, Math.cos(angle), Math.sin(angle));
  const glass = firstBulletStop(ray.panes, ray.dist); // panels.js
  const stopDist = glass ? glass.dist : ray.dist;
  let best = null;
  for (const thing of spriteThings(player)) {
    if (thing.effect) continue; // a fireball, beam or plume of steam: shots go straight through
    const spot = placeOnScreen(thing, viewer);
    if (!spot || spot.forward > stopDist) continue; // behind us, or behind the wall or window
    const texX = Math.floor((SCREEN_W / 2 - spot.left) / spot.size * TEX_SIZE);
    // Things below eye height (larvae) are tested at their own body row
    // instead: the gun aims down at them, as it can't aim up or down itself.
    const texY = thing.aimRow !== null ? thing.aimRow : Math.floor((SCREEN_H / 2 - spot.top) / spot.size * TEX_SIZE);
    if (texX < 0 || texX >= TEX_SIZE || texY < 0 || texY >= TEX_SIZE) continue; // the shot misses its square
    if (isTransparent(thing.tex, texX, texY)) continue; // over its square, but on a see-through bit
    if (!best || spot.forward < best.forward) best = { thing, forward: spot.forward };
  }
  if (best) return best.thing;
  if (glass) return { panel: glass.panel }; // nothing nearer: the window takes it
  if (ray.cell === CORE_CELL) return { core: true };
  return null;
}

// A pull of the trigger, in the current fire mode (weapons.js). The first
// round goes now; a burst's other rounds follow, `gap` seconds apart, from
// updateCombat. Each round costs one ammo, so a burst can run dry part-way.
function playerFire() {
  if (paused || game.state !== 'playing' || gun.cooldown > 0 || gun.burstLeft > 0) return;
  if (player.ammo === 0) {
    // Empty: a dry click (sound.js) on each pull, with a short pause after it
    // so fast pulls don't pile the clicks on top of each other.
    sfxDryFire();
    gun.cooldown = DRY_FIRE_GAP;
    return;
  }
  gun.pullMode = activeModeId();
  const mode = FIRE_MODES[gun.pullMode];
  gun.cooldown = mode.cooldown + mode.gap * (mode.rounds - 1); // from the pull, so it includes the burst
  gun.burstLeft = mode.rounds;
  gun.burstRound = 0;
  fireRound();
}

// One round. It strays a random amount within the mode's cone (wider for
// each round of a burst, and wider if you're walking), then hits whatever
// shotTarget finds along that line.
function fireRound() {
  const mode = FIRE_MODES[gun.pullMode];
  if (player.ammo === 0) { gun.burstLeft = 0; sfxDryFire(); return; } // ran dry mid-burst: click
  player.ammo -= 1;
  sfxPlayerShot(gun.pullMode); // sound.js
  makeNoise(player.x, player.y, SHOT_NOISE[gun.pullMode]); // the lab's creatures hear it (creatures.js)
  mothsSeeFlash(player.x, player.y);                        // and the HQ's moths see the flash (pollinators.js)
  gun.burstLeft -= 1;
  gun.burstTimer = mode.gap;
  // A fast gun's flash has to be over before its next round, or it'd never flicker.
  gun.flash = Math.min(GUN_FLASH_TIME, mode.cooldown * 0.6, mode.rounds > 1 ? mode.gap * 0.8 : Infinity);
  const cone = mode.cone + mode.climb * gun.burstRound + (player.moving ? MOVING_CONE : 0);
  gun.burstRound += 1;
  const target = shotTarget(player.angle + (Math.random() * 2 - 1) * cone);
  if (target) shotHits(target);
}

// One round arriving at what it hit.
function shotHits(target) {
  if (target.panel) { hitGlass(target.panel); return; } // panels.js
  if (target.core) { damageCore(1); return; }          // core.js
  if (target.enemy && target.enemy.state === 'dead') finishOff(target.enemy); // infected.js: a downed suit, for good
  if (target.enemy && target.enemy.state !== 'dead') {
    // A shot into a robot's back can count for more (the heavy's exposed vents).
    const hits = isFacingAway(target.enemy) ? ENEMY_TYPES[target.enemy.type].backHits : 1;
    damageEnemy(target.enemy, hits);
  }
  if (target.camera) shootCamera(target.camera); // security.js
  if (target.drone) destroyDrone(target.drone);   // drones.js
  if (target.larva) destroyLarva(target.larva);   // larvae.js
  if (target.moth) destroyMoth(target.moth);      // pollinators.js
  // A fuel drum goes up (explosions.js); a strut just soaks up the shot.
  if (target.prop && SPRITE_TYPES[target.prop.type].explosive && target.prop.state !== 'exploded') {
    explodeDrum(target.prop);
  }
}

// Take `hits` off a robot (1 unless given). Unless `byPlayer` is false (it
// walked into steam), it now knows where you are, and TURNS TO FACE YOU
// whatever it was doing (turnTowardsPlayer, enemies.js); a sleeping turret wakes up.
function damageEnemy(enemy, hits = 1, byPlayer = true) {
  enemy.health -= hits;
  enemy.hurtTime = HURT_FLASH_TIME;
  if (enemy.state === 'dormant' && ENEMY_TYPES[enemy.type].creature) wakeCreature(enemy); // shot in its tank (creatures.js)
  if (enemy.health <= 0) {
    bloomerDies(enemy); // infected.js: it bursts as it goes
    enemy.state = 'dead';
    enemy.moving = false;
    if (!ENEMY_TYPES[enemy.type].creature) dropClip(enemy); // creatures leave nothing to pick up
    knockedDown(enemy); // infected.js: a suit is only down
    return;
  }
  if (enemy.state === 'grab') loseGrip(enemy); // infected.js: shot, it lets go of you
  if (!byPlayer) return;
  wakeTurret(enemy);
  turnTowardsPlayer(enemy);
  if (enemy.state === 'idle' || enemy.state === 'search') {
    if (ENEMY_TYPES[enemy.type].mobile) enemy.state = 'chase';
    enemy.lastSeenX = player.x;
    enemy.lastSeenY = player.y;
  }
}

// THE ODDS, for robots with guns. A straight line from the type's hitNear at
// 1 cell to its hitFar at its aimRange, held flat outside that range. Getting
// close to finish a robot off is quicker for you but riskier, which is the point.
function robotHitChance(type, dist) {
  const t = Math.min(1, Math.max(0, (dist - 1) / (type.aimRange - 1)));
  return type.hitNear + (type.hitFar - type.hitNear) * t;
}

// Called by a robot when its charge completes (enemies.js). Guns are instant
// with a chance to hit; the heavy's rocket is a real projectile you can dodge.
// A robot can SEE you through a window (castRay looks through glass), so it
// fires: the window takes every shot, hit or miss, until it gives way.
function robotFires(enemy, dist) {
  const type = ENEMY_TYPES[enemy.type];
  enemy.firedTime = type.volley > 1 ? ROBOT_FIRE_FLASH / 2 : ROBOT_FIRE_FLASH; // a volley flickers
  if (type.weapon === 'rocket') { launchRocket(enemy); sfxRocketLaunch(enemy); return; } // explosions.js, sound.js
  if (type.weapon === 'lob') { lobAcid(enemy, player.x, player.y); return; }              // a spitter (acid.js)
  sfxRobotShot(enemy);
  const glass = glassInTheWay(enemy.x, enemy.y, player.x, player.y); // panels.js
  if (glass) hitGlass(glass);
  else if (Math.random() < robotHitChance(type, dist)) damagePlayer(type.damage);
}

// A hit on you. While the suit has armour, the armour takes it, however big
// the hit: the one that empties it leaves you alive but BREACHED. A hit on a
// breached suit is fatal.
function damagePlayer(amount) {
  if (game.state !== 'playing') return;
  if (player.armour === 0) { killPlayer(); return; }
  game.hurtFlash = PLAYER_HURT_FLASH;
  sfxSuitHit(); // sound.js
  player.armour = Math.max(0, player.armour - amount);
  if (player.armour === 0) showSecurityMessage('SUIT BREACH'); // security.js's red centre message
}

// Dead, whatever your armour: a breached suit taking any hit, or standing
// on top of the demolition charge as it goes off (charge.js).
function killPlayer() {
  if (game.state !== 'playing') return;
  game.hurtFlash = PLAYER_HURT_FLASH;
  sfxSuitHit(); // sound.js
  game.state = 'dead';
}

function updateCombat(dt) {
  gun.cooldown = Math.max(0, gun.cooldown - dt);
  // The rest of a burst, one round each time its gap runs out.
  if (gun.burstLeft > 0 && game.state === 'playing') {
    gun.burstTimer -= dt;
    if (gun.burstTimer <= 0) fireRound();
  }
  // SPIN-UP (weapons.js): holding the trigger winds the gun up; letting go
  // drops it back to single at once. Pressing fires a single shot by itself
  // (setupInput calls playerFire); once it has spun up to burst or automatic,
  // it keeps firing for as long as you hold, playerFire's cooldown check
  // spacing the shots out.
  if (triggerHeld() && game.state === 'playing') gun.heldTime += dt;
  else gun.heldTime = 0;
  // Stepping up mustn't mean waiting out the slower mode's cooldown: the
  // new, faster mode takes over at once.
  const mode = activeModeId();
  if (mode !== gun.lastMode) gun.cooldown = Math.min(gun.cooldown, FIRE_MODES[mode].cooldown);
  gun.lastMode = mode;
  if (triggerHeld() && mode !== 'single') playerFire();
  gun.flash = Math.max(0, gun.flash - dt);
  game.hurtFlash = Math.max(0, game.hurtFlash - dt);
  game.pickupFlash = Math.max(0, game.pickupFlash - dt);
  if (game.state !== 'playing') game.endTime += dt;
}

// R after the game ends. Reloading the page puts every piece of state back to
// its start: simpler, and harder to get subtly wrong, than resetting by hand.
function restartGame() {
  if (game.state !== 'playing') location.reload();
}
