// Combat: your gun, what the crosshair hits, robots charging and firing back
// with distance-based odds, your health, and winning or losing.

const FIRE_COOLDOWN = 0.35;     // seconds between your shots
const GUN_FLASH_TIME = 0.12;    // seconds the gun shows its muzzle flash and recoil
const ROBOT_HEALTH = 3;         // hits to destroy a robot
const HURT_FLASH_TIME = 0.1;    // seconds a hit robot flashes white
const ROBOT_CHARGE_TIME = 1.0;  // seconds a robot charges (eye brightening) before firing
const ROBOT_FIRE_FLASH = 0.15;  // seconds a robot shows its own muzzle flash
const ROBOT_DAMAGE = 15;        // health you lose per robot hit
const HIT_CHANCE_NEAR = 0.8;    // a robot's chance to hit you at 1 cell or closer...
const HIT_CHANCE_FAR = 0.3;     // ...falling in a straight line to this at AIM_RANGE
const PLAYER_HURT_FLASH = 0.3;  // seconds the screen flashes red when you're hit

// The whole game's state:
//   state        'playing', then 'dead' or 'clear'
//   hurtFlash    seconds of red flash left
//   pickupFlash  seconds of gold flash left (pickups.js)
//   endTime      seconds since the game ended (for the slow fade)
const game = { state: 'playing', hurtFlash: 0, pickupFlash: 0, endTime: 0 };

// cooldown: seconds until you can fire again; flash: seconds of muzzle flash left.
const gun = { cooldown: 0, flash: 0 };

// What's under the crosshair, the exact centre of the screen? The shot is one
// ray straight ahead. castRay gives the nearest wall along it; then each
// sprite is placed on screen exactly as for drawing (placeOnScreen), and we
// ask which texel of its current picture sits under the centre pixel. If that
// texel is see-through the shot passes it by; otherwise it's a candidate, and
// the nearest candidate in front of the wall is what gets hit.
//
// Because the crosshair is always at eye height (halfway up a wall), it
// always lands on texture row 32: a robot's chest, or the top of a barrel.
// So in practice this asks "is the crosshair on its silhouette?", and side-on
// robots are thinner and harder to hit than ones facing you.
function thingUnderCrosshair() {
  const wall = castRay(player.x, player.y, Math.cos(player.angle), Math.sin(player.angle));
  let best = null;
  for (const thing of spriteThings(player)) {
    const spot = placeOnScreen(thing, player);
    if (!spot || spot.forward > wall.dist) continue; // behind us, or behind the wall
    const texX = Math.floor((SCREEN_W / 2 - spot.left) / spot.size * TEX_SIZE);
    const texY = Math.floor((SCREEN_H / 2 - spot.top) / spot.size * TEX_SIZE);
    if (texX < 0 || texX >= TEX_SIZE || texY < 0 || texY >= TEX_SIZE) continue; // crosshair is outside its square
    if (isTransparent(thing.tex, texX, texY)) continue; // over its square, but on a see-through bit
    if (!best || spot.forward < best.forward) best = { thing, forward: spot.forward };
  }
  return best ? best.thing : null;
}

function playerFire() {
  if (game.state !== 'playing' || gun.cooldown > 0) return;
  if (player.ammo === 0) return; // empty: nothing happens (the HUD shows the count in red)
  player.ammo -= 1;
  gun.cooldown = FIRE_COOLDOWN;
  gun.flash = GUN_FLASH_TIME;
  const target = thingUnderCrosshair();
  // A barrel or column in the way soaks up the shot: only robots take damage.
  if (target && target.enemy && target.enemy.state !== 'dead') damageEnemy(target.enemy);
}

function damageEnemy(enemy) {
  enemy.health -= 1;
  enemy.hurtTime = HURT_FLASH_TIME;
  if (enemy.health <= 0) {
    enemy.state = 'dead';
    enemy.moving = false;
    dropClip(enemy);
  } else if (enemy.state === 'idle' || enemy.state === 'search') {
    // Shot from somewhere it wasn't watching: it now knows where you are.
    enemy.state = 'chase';
    enemy.lastSeenX = player.x;
    enemy.lastSeenY = player.y;
  }
}

// THE ODDS. A straight line from HIT_CHANCE_NEAR at 1 cell to HIT_CHANCE_FAR
// at AIM_RANGE, held flat outside that range. Getting close to finish a robot
// off is quicker for you but riskier, which is the point.
function robotHitChance(dist) {
  const t = Math.min(1, Math.max(0, (dist - 1) / (AIM_RANGE - 1)));
  return HIT_CHANCE_NEAR + (HIT_CHANCE_FAR - HIT_CHANCE_NEAR) * t;
}

// Called by a robot when its charge completes (enemies.js).
function robotFires(enemy, dist) {
  enemy.firedTime = ROBOT_FIRE_FLASH;
  if (Math.random() < robotHitChance(dist)) damagePlayer(ROBOT_DAMAGE);
}

function damagePlayer(amount) {
  if (game.state !== 'playing') return;
  player.health = Math.max(0, player.health - amount);
  game.hurtFlash = PLAYER_HURT_FLASH;
  if (player.health === 0) game.state = 'dead';
}

function updateCombat(dt) {
  gun.cooldown = Math.max(0, gun.cooldown - dt);
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
