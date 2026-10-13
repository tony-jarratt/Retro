'use strict';

// The games on the menu, in the order they appear.
// To add a game: put its folder (with an index.html inside) next to this file, add a screenshot
// to thumbs/, then add one entry below. Every field is required; the menu shows an error naming
// the entry if one is missing or wrong.
//   id       short unique name (letters and numbers)
//   title    shown on the card
//   folder   the game's folder, ending in "/" (the menu opens its index.html)
//   tag      the genre label on the card (a word or two, shown in capitals)
//   blurb    one or two sentences
//   players  who can play, e.g. '1 PLAYER' or '1-4 PLAYERS'
//   controls what you press, shown on the card
//   accent   the card's highlight colour, as #rrggbb
//   thumb    screenshot path, about 600 pixels wide
//   inspiredBy (optional) the game that inspired it, shown on the card as a credit
const GAMES = [
  {
    id: 'p1',
    title: 'P1 Racer',
    folder: 'P1/',
    tag: 'Racing',
    blurb: 'Overhead retro racing on six circuits. Qualify, pick your tyres, make your pit stops and chase the championship.',
    players: '1 PLAYER',
    controls: 'ARROWS / WASD',
    accent: '#2fd8c8',
    thumb: 'thumbs/p1.jpg',
    inspiredBy: 'Micro Machines',
  },
  {
    id: 'elf',
    title: 'Always Time for a Bow',
    folder: 'Elf/',
    tag: 'Platformer',
    blurb: 'A flip-screen Christmas Eve dash. Collect the wrapping kit, wrap the presents and slip past dogs, cats, children and parents.',
    players: '1 PLAYER',
    controls: 'ARROWS / WASD + SPACE',
    accent: '#ff5a64',
    thumb: 'thumbs/elf.jpg',
    inspiredBy: 'Chuckie Egg',
  },
  {
    id: 'mayhem',
    title: 'Mayhem Academy',
    folder: 'Mayhem/',
    tag: 'Wizard battle',
    blurb: 'Wizard school with zero supervision. Summon feral pets, hurl custard pies and wreck each other. Last pupil standing wins. Up to four players, plus computer pupils.',
    players: '1-4 PLAYERS + COMPUTER',
    controls: 'MOUSE + KEYS',
    accent: '#b57aff',
    thumb: 'thumbs/mayhem.jpg',
    inspiredBy: 'Chaos',
  },
  {
    id: 'mech',
    title: 'Hexfire',
    folder: 'Mech/',
    tag: 'Mech tactics',
    blurb: 'Hex-grid mech battles. Build a squad of up to three, pick a map and a win condition, then outmanoeuvre the enemy force turn by turn.',
    players: '1 PLAYER',
    controls: 'MOUSE + ARROWS / WASD',
    accent: '#4aa8ff',
    thumb: 'thumbs/mech.jpg',
  },
  // Cocoa Cascade is hidden from the menu while it's in development. Uncomment to restore.
  // {
  //   id: 'cocoa',
  //   title: 'Cocoa Cascade',
  //   folder: 'Cocoa/',
  //   tag: 'Puzzle',
  //   blurb: 'A runaway chocolate factory. Place a few helpers, then pour: deflect, pipe, set and melt the flow until the vat fills.',
  //   players: '1 PLAYER',
  //   controls: 'MOUSE + KEYS',
  //   accent: '#c8814a',
  //   thumb: 'thumbs/cocoa.jpg',
  //   inspiredBy: 'Lemmings',
  // },
  {
    id: 'atomic',
    title: 'Atomic Castle',
    folder: 'Atomic/',
    tag: 'Puzzle adventure',
    blurb: 'A 1950s rocket castle in the style of the 1984 Filmation games. Thirty rooms, lifts, crushers and crumbling bridges: find nine missing rocket parts before the saucers land.',
    players: '1 PLAYER',
    controls: 'ARROWS / WASD + SPACE, P PAUSE',
    accent: '#ffa23a',
    thumb: 'thumbs/atomic.jpg',
    inspiredBy: 'Knight Lore',
  },
  // St Ghoulsby's Infirmary is hidden from the menu while its gameplay is redesigned. Uncomment to restore.
  // {
  //   id: 'clinic',
  //   title: 'St Ghoulsby\'s Infirmary',
  //   folder: 'Clinic/',
  //   tag: 'Hospital sim',
  //   blurb: 'A hospital for the unwell undead. Build rooms, hire mad doctors and ghost nurses, and cure sunburnt vampires and unravelling mummies. Rude patients get turned to stone by Medusa on reception.',
  //   players: '1 PLAYER',
  //   controls: 'MOUSE, SPACE PAUSE, 1-3 SPEED',
  //   accent: '#7ad84a',
  //   thumb: 'thumbs/clinic.jpg',
  //   inspiredBy: 'Theme Hospital',
  // },
];
