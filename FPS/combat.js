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
//   playTime     seconds of play on this level (the controls hint shows at first)
// state is 'playing' until campaign.js sets where the page opens: see there for the rest.
const game = { state: 'playing', hurtFlash: 0, pickupFlash: 0, endTime: 0, playTime: 0 };

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
//   flashType   the ammo type of the last round (ammo.js): its flash's colour and light
const gun = { cooldown: 0, flash: 0, burstLeft: 0, burstTimer: 0, burstRound: 0, pullMode: 'single', heldTime: 0, lastMode: 'single', flashType: 'standard' };

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
// security core (core.js), { bay } for a repair bay (repair.js), or null for
// any other wall.
//
// An ARMOUR-PIERCING round (ammo.js) goes further: through glass (which it
// cracks on the way: the window comes first in the list, but doesn't count),
// and through the first PIERCE_THROUGH - 1 things it hits into the next.
// So shotTargets gives the LIST of what a round hits, nearest first.
function shotTargets(angle, pierce) {
  const viewer = { x: player.x, y: player.y, angle };
  const ray = castRay(player.x, player.y, Math.cos(angle), Math.sin(angle));
  const glass = firstBulletStop(ray.panes, ray.dist); // panels.js
  const stopDist = glass && !pierce ? glass.dist : ray.dist;
  const found = [];
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
    found.push({ thing, forward: spot.forward, texX, texY });
  }
  found.sort((a, b) => a.forward - b.forward);
  // Which texel it hit goes along too (brood.js tests for her belly).
  const hits = found.slice(0, pierce ? PIERCE_THROUGH : 1).map((f) => ({ ...f.thing, texX: f.texX, texY: f.texY }));
  if (!pierce) {
    if (hits.length > 0) return hits;
    if (glass) return [{ panel: glass.panel }]; // nothing nearer: the window takes it
  }
  if (hits.length < (pierce ? PIERCE_THROUGH : 1)) {
    if (ray.cell === CORE_CELL) hits.push({ core: true });
    else if (ray.cell === REPAIR_CELL) hits.push({ bay: bayAt(ray.cellX, ray.cellY) }); // repair.js
  }
  if (pierce && glass) hits.unshift({ panel: glass.panel, passed: true }); // cracked as it goes through
  return hits;
}

// What a plain round fired at `angle` hits first, or null.
function shotTarget(angle) {
  return shotTargets(angle, false)[0] || null;
}

// A pull of the trigger, in the current fire mode (weapons.js). The first
// round goes now; a burst's other rounds follow, `gap` seconds apart, from
// updateCombat. Each round costs one ammo, so a burst can run dry part-way.
function playerFire() {
  if (paused || game.state !== 'playing' || gun.cooldown > 0 || gun.burstLeft > 0) return;
  if (roundsLoaded() === 0) { // ammo.js: of the type loaded
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

// One round, of whatever's loaded (ammo.js). It strays a random amount
// within the mode's cone (wider for each round of a burst, and wider if
// you're walking), then hits whatever shotTargets finds along that line.
function fireRound() {
  const mode = FIRE_MODES[gun.pullMode];
  if (roundsLoaded() === 0) { gun.burstLeft = 0; sfxDryFire(); return; } // ran dry mid-burst: click
  const type = player.loaded;
  spendRound(); // ammo.js: a special type run dry goes back to standard
  gun.flashType = type;
  sfxPlayerShot(gun.pullMode, type); // sound.js
  makeNoise(player.x, player.y, SHOT_NOISE[gun.pullMode]); // the lab's creatures hear it (creatures.js)
  mothsSeeFlash(player.x, player.y, AMMO_TYPES[type].mothReach); // and the HQ's moths see the flash (pollinators.js)
  gun.burstLeft -= 1;
  gun.burstTimer = mode.gap;
  // A fast gun's flash has to be over before its next round, or it'd never flicker.
  gun.flash = Math.min(GUN_FLASH_TIME, mode.cooldown * 0.6, mode.rounds > 1 ? mode.gap * 0.8 : Infinity);
  const cone = mode.cone + mode.climb * gun.burstRound + (player.moving ? MOVING_CONE : 0);
  gun.burstRound += 1;
  const targets = shotTargets(player.angle + (Math.random() * 2 - 1) * cone, type === 'piercing');
  countShot(targets.some(countsAsHit)); // campaign.js: the run's numbers (before the hits, which may kill)
  for (const target of targets) shotHits(target, type);
}

// One round of ammo `type` (ammo.js) arriving at something it hit.
function shotHits(target, type = 'standard') {
  if (target.panel) { hitGlass(target.panel); return; }            // panels.js
  if (target.root) { hitRoot(target.root, type); return; }         // ambush.js: a root up out of the floor
  if (target.core) { damageCore(objectiveHits(type)); return; }   // core.js; ammo.js: what this type is worth on it
  if (target.bay) { damageBay(target.bay, type === 'piercing' ? 2 : 1); return; } // repair.js
  if (target.enemy && target.enemy.state !== 'dead' && target.enemy.type === 'guard' && guardTorchHit(target.enemy, target.texX, target.texY)) {
    breakTorch(target.enemy); // guard.js: a round on its torch puts the light out, and does it no harm
    return;
  }
  if (target.enemy && type === 'incendiary') ignite(target.enemy); // ammo.js: alight, before the hit, so it dies burning
  if (target.enemy && target.enemy.state === 'dead') finishOff(target.enemy); // infected.js: a downed suit, for good
  if (target.enemy && target.enemy.state !== 'dead') {
    // A shot into a robot's back can count for more (the heavy's exposed vents).
    const hits = target.enemy.type === 'brood' ? (broodBellyHit(target.enemy, target.texX, target.texY) ? 2 : 1) // brood.js: the belly
      : isFacingAway(target.enemy) ? ENEMY_TYPES[target.enemy.type].backHits : 1;
    const machine = !ENEMY_TYPES[target.enemy.type].creature;
    damageEnemy(target.enemy, type === 'piercing' && machine ? hits * 2 : hits); // ammo.js: armour-piercing, double on a robot
  }
  if (target.camera) shootCamera(target.camera); // security.js
  if (target.drone) destroyDrone(target.drone);   // drones.js
  if (target.larva) destroyLarva(target.larva);   // larvae.js
  if (target.moth) destroyMoth(target.moth);      // pollinators.js
  if (target.prop && liveTrap(target.prop)) { blowTrap(target.prop); return; } // traps.js: a round in a trapped screen sets it off
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
    const onFire = burning(enemy); // ammo.js: dying alight, it's burnt
    if (!onFire) bloomerDies(enemy); // infected.js: it bursts as it goes (unless it burns)
    managerDies(enemy); // manager.js: the PA dies, its suits reel
    guardDies(enemy);   // guard.js: its ammo, and its torch on the floor
    enemy.state = 'dead';
    enemy.moving = false;
    if (!ENEMY_TYPES[enemy.type].creature) dropSalvage(enemy); // pickups.js: it blows up; a heavy leaves its module
    knockedDown(enemy); // infected.js: a suit is only down
    if (onFire) burnUp(enemy); // ammo.js: ash, and a suit stays down
    return;
  }
  if (enemy.state === 'grab') loseGrip(enemy); // infected.js: shot, it lets go of you
  guardHurt(enemy); // guard.js: hit in cover, it moves
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
  if (type.weapon === 'pistol') sfxPistol(enemy); else sfxRobotShot(enemy); // sound.js
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
