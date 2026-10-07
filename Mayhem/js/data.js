'use strict';

// ---- board and view ----
const COLS = 15, ROWS = 10, CELL = 56;
const VIEW_W = 1024, VIEW_H = 688;
const BOARD_X = 0, BOARD_Y = 48; // top-left of the board on the canvas (the title bar sits above it)

// ---- game rules ----
const MIN_WIZARDS = 2, MAX_WIZARDS = 6, MAX_HUMANS = 4;
const HAND_SIZE = 14;          // spells dealt to each pupil; each can be cast once
const MAX_ROUNDS = 15;         // the school bell rings after this many rounds
const BLOB_SPREAD_PCT = 35;    // chance each blob square spreads at the end of a round
const BLOB_CAP = 24;           // the blob never covers more than this many squares
const BASE_WIZARD = { atk: 3, def: 4, move: 1 };
const BUFF_BONUS = 3;          // shield adds to defence, wand adds to attack
const INK_ROUNDS = 4;          // spilled ink dries after this many rounds
const INK_SLIDE = 2;           // a walker that steps in ink slides this many more squares
const PASSAGE_ROUNDS = 3;      // a secret passage seals itself after this many rounds (or after one trip, whichever is first)

// ---- creatures (all zany, none scary) ----
// atk and def are added to a six-sided die when two things meet; the higher total wins and the loser is "poofed".
// move: squares per round. flying: passes over things. range: shoots this many squares (0 = touch only).
const CREATURES = {
  guineaPig:   { name: 'Feral Guinea Pig', atk: 2, def: 2, move: 1, flying: false, range: 0 },
  frog:        { name: 'Caffeinated Frog', atk: 3, def: 2, move: 3, flying: false, range: 0 },
  cat:         { name: 'Cat With A Grudge', atk: 5, def: 3, move: 2, flying: false, range: 0 },
  owl:         { name: 'Angry Owl',     atk: 2, def: 1, move: 5, flying: true,  range: 0 },
  pony:        { name: 'Goth Unicorn', atk: 4, def: 4, move: 4, flying: false, range: 0 },
  hamster:     { name: 'Hamster Wrecking Ball', atk: 6, def: 6, move: 1, flying: false, range: 0 },
  mummy:       { name: 'Overdue Mummy', atk: 5, def: 4, move: 2, flying: false, range: 0 },
  dragon:      { name: 'Pizza Dragon',   atk: 7, def: 6, move: 2, flying: true,  range: 4 },
  headteacher: { name: 'The Headteacher', atk: 8, def: 7, move: 1, flying: false, range: 0 },
  fort:        { name: 'Cardboard Fort', atk: 0, def: 6, move: 0, flying: false, range: 0 },
};

// ---- spells ----
// kind: summon (puts a creature on an empty square), bolt (a pie at one pupil or creature), area (a 3x3 splat),
// tickle (a creature giggles too much to move), self (a buff for your pupil), blob (spreading slime).
// range is in squares (diagonals count as one). success is the percent chance it works.
// power is the attack value of bolt and area spells. weight is how often it turns up in a hand.
// blurb is the short rules text on the card; flavour is the cheeky caption underneath; note (optional) is extra detail
// shown when the card is highlighted.
const SPELLS = [
  { id: 'guineaPig', flavour: 'Fluffy on the outside. Pure chaos inside.', name: 'Feral Guinea Pig', kind: 'summon', creature: 'guineaPig', range: 2, success: 95, weight: 4, blurb: 'A small, furious fur-ball. Underestimated by everyone.' },
  { id: 'frog', flavour: 'Four energy drinks in. Cannot stop hopping.', name: 'Caffeinated Frog', kind: 'summon', creature: 'frog', range: 2, success: 90, weight: 3, blurb: 'Hops three squares at a time. Do not ask it to calm down.' },
  { id: 'cat', flavour: 'Remembers what you did. Will never forgive.', name: 'Cat With A Grudge', kind: 'summon', creature: 'cat', range: 2, success: 85, weight: 3, blurb: 'Hisses. Scratches. Judges you.' },
  { id: 'owl', flavour: 'Delivers bad news at 200 miles an hour.', name: 'Angry Owl', kind: 'summon', creature: 'owl', range: 4, success: 80, weight: 2, blurb: 'Flies five squares to deliver a pecky parcel.' },
  { id: 'pony', flavour: 'Black mane. Zero chill.', name: 'Goth Unicorn', kind: 'summon', creature: 'pony', range: 3, success: 70, weight: 2, blurb: 'Fast, brooding and far too pleased with itself.' },
  { id: 'hamster', flavour: 'Ball games are now compulsory.', name: 'Hamster Wrecking Ball', kind: 'summon', creature: 'hamster', range: 2, success: 70, weight: 2, blurb: 'Rolls about in a steel ball. Very hard to pop.' },
  { id: 'mummy', flavour: 'Overdue by about four thousand years.', name: 'Overdue Mummy', kind: 'summon', creature: 'mummy', range: 2, success: 75, weight: 2, blurb: 'Wrapped in library fines. Surprisingly pushy.' },
  { id: 'dragon', flavour: 'Extra cheese. Extra fire. No manners.', name: 'Pizza Dragon', kind: 'summon', creature: 'dragon', range: 3, success: 45, weight: 1, blurb: 'Flies, and breathes hot pizza from four squares away.' },
  { id: 'headteacher', flavour: 'Detention. For everyone. Forever.', name: 'The Headteacher', kind: 'summon', creature: 'headteacher', range: 2, success: 35, weight: 1, blurb: 'Nobody argues with the Headteacher.' },
  { id: 'fort', flavour: 'Looks flimsy. Is flimsy. Works anyway.', name: 'Cardboard Fort', kind: 'summon', creature: 'fort', range: 3, success: 90, weight: 2, blurb: 'A big box. Blocks the way and takes ages to flatten.' },
  { id: 'pie', flavour: 'Dessert is served. Aim for the face.', name: 'Custard Pie', kind: 'bolt', power: 5, range: 6, success: 85, weight: 4, blurb: 'Splat! Hits a creature or pupil within six squares.' },
  { id: 'glitter', flavour: 'Still finding it in your hair in 2040.', name: 'Glitter Bomb', kind: 'area', power: 4, range: 5, success: 80, weight: 3, blurb: 'Splats everything in a 3x3 patch. Friends included.' },
  { id: 'tickle', flavour: 'Everybody freezes. Somebody coughs.', name: 'Awkward Silence', kind: 'tickle', range: 5, success: 85, weight: 2, blurb: 'A creature freezes in embarrassment and misses its turn.' },
  { id: 'shield', flavour: 'Previously occupied. Blocks everything.', name: 'Coffin Lid Shield', kind: 'self', buff: 'shield', range: 0, success: 95, weight: 2, blurb: 'Your pupil is harder to hit for the rest of the game.' },
  { id: 'wand', flavour: 'Bought off a bloke. Hits harder.', name: 'Dodgy Wand', kind: 'self', buff: 'wand', range: 0, success: 90, weight: 2, blurb: 'Your pupil hits harder for the rest of the game.' },
  { id: 'wings', flavour: 'Flap now. Regret later.', name: 'Bat Wings', kind: 'self', buff: 'wings', range: 0, success: 80, weight: 1, blurb: 'Your pupil flies three squares a round.' },
  { id: 'ink', flavour: 'Never trust a quill.', name: 'Spilled Ink', kind: 'ink', range: 5, success: 85, weight: 2, blurb: 'Glossy black puddle. Walkers slide two squares further.', note: 'Walkers who step in slide two more squares. Dries after four rounds.' },
  { id: 'passage', flavour: 'Every old school has one. Yours has two.', name: 'Secret Passage', kind: 'passage', range: 5, success: 80, weight: 2, blurb: 'Hidden door here, its twin opposite. In one, out the other.', note: 'Closes after one trip or three rounds. Shut if the far side is occupied.' },
  { id: 'blob', flavour: "Don't ask what it's made of.", name: 'Canteen Slime', kind: 'blob', range: 4, success: 60, weight: 1, blurb: 'Spreads and gums up creatures. Pupils are slime-proof.' },
];
const SPELL_BY_ID = Object.fromEntries(SPELLS.map((s) => [s.id, s]));
const SPELL_KINDS = ['summon', 'bolt', 'area', 'tickle', 'self', 'blob', 'ink', 'passage'];

// Check the tables once at load, so a typo fails loudly here instead of during a game.
(function checkData() {
  const ids = new Set();
  for (const sp of SPELLS) {
    if (ids.has(sp.id)) throw new Error(`data: spell id "${sp.id}" is used twice`);
    ids.add(sp.id);
    if (!SPELL_KINDS.includes(sp.kind)) throw new Error(`data: spell "${sp.id}" has an unknown kind "${sp.kind}"`);
    if (sp.kind === 'summon' && !CREATURES[sp.creature]) throw new Error(`data: spell "${sp.id}" summons an unknown creature "${sp.creature}"`);
    if (!(sp.success >= 1 && sp.success <= 100)) throw new Error(`data: spell "${sp.id}" has a bad success chance`);
    if (typeof sp.flavour !== 'string' || !sp.flavour) throw new Error(`data: spell "${sp.id}" needs a flavour caption`);
    if (!(sp.weight > 0)) throw new Error(`data: spell "${sp.id}" needs a weight above zero`);
    if (sp.kind === 'self' && !['shield', 'wand', 'wings'].includes(sp.buff)) throw new Error(`data: spell "${sp.id}" has an unknown buff`);
    if ((sp.kind === 'bolt' || sp.kind === 'area') && !(sp.power > 0)) throw new Error(`data: spell "${sp.id}" needs a power`);
  }
})();

// ---- looks and names ----
const ROBE_COLORS = [ // a gothic palette: moody, but bright enough to read against the dark hall
  { name: 'Ruby', hex: '#d1264f' },
  { name: 'Deep Purple', hex: '#9448d8' },
  { name: 'Olive', hex: '#93a02c' },
  { name: 'Poison Teal', hex: '#1fb0a6' },
  { name: 'Bone', hex: '#d9d2c0' },
  { name: 'Burnt Pumpkin', hex: '#e8711c' },
];
const HATS = ['pointy', 'wonky', 'star', 'top'];
const FAMILIARS = ['cat', 'owl', 'frog', 'hamster']; // tiny pets that tag along beside a pupil (just for show)

const AI_NAMES = [
  'Gary the Great', 'Chaos Chloe', 'Big Terry', 'Mystic Mo', 'Dusk Delaney',
  'Raven Rue', 'Nana Nightmare', 'Mortimer Grim', 'Hex Harriet', 'Brian (Unqualified)',
];
const DEFAULT_HUMAN_NAMES = ['Player 1', 'Player 2', 'Player 3', 'Player 4'];
const NAME_MAX = 14;

const FIZZLES = [
  'Your hat turned into a fish. Again.',
  'The spell died with a polite cough.',
  'You forgot the words. Mortifying.',
  'Autocorrect changed your spell to something useless.',
  'A raven stole it. Typical.',
  'Wrong spell. Wrong page. Wrong day.',
  'The spell has decided against it.',
  'You said the magic word. Just not the right one.',
];
const HIT_WORDS = ['SPLAT!', 'POOF!', 'Ouch.', 'Ruthless.', 'Delightful.', 'Tragic.', 'KABLAM!'];
const MISS_WORDS = ['Missed.', 'How embarrassing.', 'Pathetic.', 'Not today.'];
