// Combat: your gun, what the crosshair hits, robots charging and firing back
// with distance-based odds, your health, and winning or losing.

const GUN_FLASH_TIME = 0.12;    // longest a muzzle flash and recoil show (each weapon's own cooldown is in weapons.js)
const HURT_FLASH_TIME = 0.1;    // seconds a hit robot flashes white
const ROBOT_FIRE_FLASH = 0.15;  // seconds a robot shows its own muzzle flash
// (Each robot type's health, charge time, damage and odds are in ROBOT_TYPES, enemies.js.)
const PLAYER_HURT_FLASH = 0.3;  // seconds the screen flashes red when you're hit

// The whole game's state:
//   state        'playing', then 'dead' or 'clear'
//   hurtFlash    seconds of red flash left
//   pickupFlash  seconds of gold flash left (pickups.js)
//   endTime      seconds since the game ended (for the slow fade)
const game = { state: 'playing', hurtFlash: 0, pickupFlash: 0, endTime: 0 };

// cooldown: seconds until you can fire again; flash: seconds of muzzle flash left.
const gun = { cooldown: 0, flash: 0 };

// What does a shot fired at `angle` hit? For the straight-ahead shot that's
// whatever is under the crosshair; the scatter cannon's pellets and the
// autocannon's wobble fire at angles a little to either side. Either way the
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
// Returns { target, dist }: target is a sprite thing, { panel } for a window,
// or null for a wall; dist is how far away it is (for the scatter's range).
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
    const texY = Math.floor((SCREEN_H / 2 - spot.top) / spot.size * TEX_SIZE);
    if (texX < 0 || texX >= TEX_SIZE || texY < 0 || texY >= TEX_SIZE) continue; // the shot misses its square
    if (isTransparent(thing.tex, texX, texY)) continue; // over its square, but on a see-through bit
    if (!best || spot.forward < best.forward) best = { thing, forward: spot.forward };
  }
  if (best) return { target: best.thing, dist: best.forward };
  if (glass) return { target: { panel: glass.panel }, dist: glass.dist }; // nothing nearer: the window takes it
  return { target: null, dist: ray.dist };
}

// Fire the weapon in your hands (weapons.js): pay its ammo, then send each of
// its pellets out at its own angle. A scatter cannon's five pellets are
// fanned evenly across its spread; the autocannon's one round wobbles by a
// random amount up to its jitter. Each pellet hits whatever shotTarget finds,
// if that's within the weapon's range.
function playerFire() {
  if (game.state !== 'playing' || gun.cooldown > 0) return;
  const weapon = currentWeapon();
  if (player.ammo < weapon.cost) return; // not enough: nothing happens (the HUD shows the count in red)
  player.ammo -= weapon.cost;
  gun.cooldown = weapon.cooldown;
  gun.flash = Math.min(GUN_FLASH_TIME, weapon.cooldown * 0.6); // a fast gun's flash has to end before its next shot
  for (let n = 0; n < weapon.pellets; n++) {
    const fan = weapon.pellets === 1 ? 0 : -weapon.spread / 2 + weapon.spread * n / (weapon.pellets - 1);
    const wobble = (Math.random() * 2 - 1) * weapon.jitter;
    const shot = shotTarget(player.angle + fan + wobble);
    if (shot.target && shot.dist <= weapon.range) shotHits(shot.target);
  }
}

// One bullet (or pellet) arriving at what it hit.
function shotHits(target) {
  if (target.panel) { hitGlass(target.panel); return; } // panels.js
  if (target.enemy && target.enemy.state !== 'dead') {
    // A shot into a robot's back can count for more (the heavy's exposed vents).
    const hits = isFacingAway(target.enemy) ? ROBOT_TYPES[target.enemy.type].backHits : 1;
    damageEnemy(target.enemy, hits);
  }
  if (target.camera) shootCamera(target.camera); // security.js
  // A fuel drum goes up (explosions.js); a strut just soaks up the shot.
  if (target.prop && SPRITE_TYPES[target.prop.type].explosive && target.prop.state !== 'exploded') {
    explodeDrum(target.prop);
  }
}

// Take `hits` off a robot (1 unless given). Shot from somewhere it wasn't
// watching, it now knows where you are; a sleeping turret wakes up.
function damageEnemy(enemy, hits = 1) {
  enemy.health -= hits;
  enemy.hurtTime = HURT_FLASH_TIME;
  if (enemy.health <= 0) {
    enemy.state = 'dead';
    enemy.moving = false;
    dropClip(enemy);
    return;
  }
  wakeTurret(enemy);
  if (enemy.state === 'idle' || enemy.state === 'search') {
    if (ROBOT_TYPES[enemy.type].mobile) enemy.state = 'chase';
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
  const type = ROBOT_TYPES[enemy.type];
  enemy.firedTime = ROBOT_FIRE_FLASH;
  if (type.weapon === 'rocket') { launchRocket(enemy); return; } // explosions.js
  const glass = glassInTheWay(enemy.x, enemy.y, player.x, player.y); // panels.js
  if (glass) hitGlass(glass);
  else if (Math.random() < robotHitChance(type, dist)) damagePlayer(type.damage);
}

function damagePlayer(amount) {
  if (game.state !== 'playing') return;
  player.health = Math.max(0, player.health - amount);
  game.hurtFlash = PLAYER_HURT_FLASH;
  if (player.health === 0) game.state = 'dead';
}

function updateCombat(dt) {
  gun.cooldown = Math.max(0, gun.cooldown - dt);
  // An automatic weapon keeps firing while the trigger is held; playerFire's
  // cooldown check spaces the shots out.
  if (currentWeapon().auto && triggerHeld()) playerFire();
  gun.flash = Math.max(0, gun.flash - dt);
  game.hurtFlash = Math.max(0, game.hurtFlash - dt);
  game.pickupFlash = Math.max(0, game.pickupFlash - dt);
  if (game.state === 'playing' && enemies.every((e) => e.state === 'dead')) game.state = 'clear';
  if (game.state !== 'playing') game.endTime += dt;
}

// R after the game ends. Reloading the page puts every piece of state back to
// its start: simpler, and harder to get subtly wrong, than resetting by hand.
function restartGame() {
  if (game.state !== 'playing') location.reload();
}
