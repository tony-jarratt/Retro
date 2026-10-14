'use strict';

// The pictures, as rows of characters. Each sprite is made once per tribe: c and d are the tribe's colour and its
// dark shade, so the good god's people wear blue and the dark god's wear red. A black outline is added round each.
//   . see-through   k black   s skin   w white   y sand   b brown   e dark earth   g grey   c tribe   d tribe dark

const TRIBE_COLOURS = [{ c: C.glint, d: C.deep }, { c: C.red, d: C.earth }];
const SPRITE_KEY = { k: C.black, s: C.skin, w: C.snow, y: C.sand, b: C.rock, e: C.earth, g: C.grey, G: C.grassDark, M: C.grass, L: C.grassLit, t: C.rock };

const WALKER_ART = [
  ['.sss.', '.sss.', '.ccc.', 'scccs', '.ccc.', '.d.d.', '.d.d.', 'dd.dd'],
  ['.sss.', '.sss.', '.ccc.', 'scccs', '.ccc.', '..d..', '.d.d.', 'd...d'],
];
// Tent, hut, cottage, house, castle. Each stands with its bottom row on the middle of its tile.
const HOUSE_ART = [
  ['.....c.....', '....ccd....', '...cccdd...', '..ccccddd..', '.cccckdddd.', 'ccccckkdddd', 'cccckkkdddd'],
  ['.....yyy.....', '....yyyyy....', '...yyyyyyy...', '..yyyyyyyyy..', '.yyyyyyyyyyy.', 'yyyyyyyyyyyyy',
    '.bbbbbbbbbbb.', '.bbbbbkkbbbb.', '.bbbbbkkbbbb.', '.bbbbbkkbbbb.'],
  ['.......c.......', '......ccd......', '.....cccdd.....', '....ccccddd....', '...cccccdddd...', '..ccccccddddd..',
    '.cccccccdddddd.', '..wwwwwwwwwww..', '..wkkwwwwwkkw..', '..wkkwwwwwkkw..', '..wwwwwkwwwww..', '..wwwwkkkwwww..',
    '..wwwwkkkwwww..'],
  ['........c........', '.......ccd.......', '......cccdd......', '.....ccccddd.....', '....cccccdddd....',
    '...ccccccddddd...', '..cccccccdddddd..', '.ccccccccddddddd.', '..wwwwwwwwwwwww..', '..wkkwwkkwwkkww..',
    '..wkkwwkkwwkkww..', '..wwwwwwwwwwwww..', '..wkkwwwkwwwkkw..', '..wkkwwkkkwwkkw..', '..wwwwwkkkwwwww..',
    '..wwwwwkkkwwwww..'],
  ['..c..............c...', '..cc.............cc..', '..g..............g...', 'g.g.g...........g.g.g', 'ggggg...........ggggg',
    'gkgkg.g.g.g.g.g.gkgkg', 'ggggggggggggggggggggg', 'ggkgggggggggggggggkgg', 'ggggggggggcgggggggggg', 'ggggggggggggggggggggg',
    'ggkggggggkkkggggggkgg', 'ggggggggkkkkkgggggggg', 'ggggggggkkkkkgggggggg', 'ggggggggkkkkkgggggggg'],
];

// Adds a one-pixel black outline round the solid pixels, so a sprite stands out from the land.
function outlinedArt(rows) {
  const h = rows.length + 2, w = rows[0].length + 2;
  const grid = Array.from({ length: h }, (_, y) => Array.from({ length: w }, (_, x) => (rows[y - 1] && rows[y - 1][x - 1]) || '.'));
  const out = grid.map((r) => r.slice());
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    if (grid[y][x] !== '.') continue;
    if ([[1, 0], [-1, 0], [0, 1], [0, -1]].some(([dx, dy]) => grid[y + dy] && grid[y + dy][x + dx] && grid[y + dy][x + dx] !== '.')) out[y][x] = 'k';
  }
  return out.map((r) => r.join(''));
}
function tribeSprite(rows, tribe) { return makeSprite(outlinedArt(rows), { ...SPRITE_KEY, ...TRIBE_COLOURS[tribe] }); }

const SPRITES = [0, 1].map((tribe) => ({
  walker: WALKER_ART.map((rows) => tribeSprite(rows, tribe)),
  house: HOUSE_ART.map((rows) => tribeSprite(rows, tribe)),
}));

// Trees, pines and boulders: the same for everyone. Each stands with its bottom row on the middle of its tile.
const FEATURE_ART = {
  [FEATURE.tree]: ['.....LLL.....', '...LLLMMMM...', '..LLMMMMMMG..', '.LLMMMMMMMGG.', '.LMMMMMMMGGG.', 'LLMMMMMMMGGGG',
    'LMMMMMMMGGGGG', '.MMMMMMGGGGG.', '.MMMMMGGGGGG.', '..MMGGGGGGG..', '...GGGGGGG...', '......t......', '......t......',
    '.....ttt.....'],
  [FEATURE.pine]: ['.....G.....', '....LGG....', '...LMGGG...', '....MGG....', '...LMGGG...', '..LMMGGGG..', '....MGG....',
    '...LMGGGG..', '..LMMGGGGG.', '.LMMMGGGGGG', '...LMGGG...', '..LMMGGGGG.', '.LMMMGGGGGG', 'LMMMMGGGGGG', '.....t.....',
    '.....t.....'],
  [FEATURE.swamp]: ['.G...G.', '.G.G.G.', 'GMG.GMG'], // reeds; the bog itself is painted on the tile
  [FEATURE.mine]: ['....bbb....', '...b.b.b...', '...bbbbb...', '...b...b...', '..gb...bg..', '.gggkkkggge', 'ggggkkkggee',
    'gwgggggggee', '.ggggggeee.'], // a pithead: a winding wheel over a shaft in the rock
  [FEATURE.ruin]: ['.g.....g...', '.gg...ggg..', '.gge.bgge..', 'ggggbbgggee', '.bbbbbbbbe.'], // rubble of a razed house
  [FEATURE.fallenHead]: ['....gggggggg..', '..gggggggggge.', '.gkggwwggggee.', 'ggggggggggeee.', '.eeeeeeeeeee..'], // a toppled head
  [FEATURE.fallenArch]: ['..ggggg........', '.gggggge..ggg..', 'gggggge..ggggg.', '.eeeee..gggggge', '........eeeeee.'], // a broken arch
  [FEATURE.rock]: ['....gggg.....', '..ggwwgggg...', '.gwwwgggggge.', 'gwwgggggggeee', 'ggggggggggeee', 'gggggggggeeee',
    '.gggggggeeee.', '..eeeeeeeee..'],
};
const FEATURE_SPRITES = Object.fromEntries(Object.entries(FEATURE_ART).map(([f, rows]) => [f, makeSprite(outlinedArt(rows), SPRITE_KEY)]));

// A sheep: walking (head up, two steps) and grazing (head down). Faces right; flipped to walk left.
const SHEEP_ART = [
  ['..wwww....', '.wwwwwwkk.', 'wwwwwwwkkk', 'wwwwwwgkk.', '.wwggggg..', '.k.k..k.k.', '.k.k..k.k.'],
  ['..wwww....', '.wwwwwwkk.', 'wwwwwwwkkk', 'wwwwwwgkk.', '.wwggggg..', '.kk...kk..', '.kk...kk..'],
  ['..wwww....', '.wwwwww...', 'wwwwwwwk..', 'wwwwwwgkk.', '.wwgggggkk', '.k.k..k.k.', '.k.k..k.k.'],
];
const SHEEP_SPRITES = SHEEP_ART.map((rows) => makeSprite(outlinedArt(rows), SPRITE_KEY));

// Ley stones: an Easter Island head for the good god, a Stonehenge arch (one trilithon) for the dark god. The c in each
// is its god's colour: the head's topknot, the glow in the arch.
const STONE_ART = [
  ['..ccccc..', '.ggggggg.', 'gkkgggkke', 'gggggggee', 'ggggwggee', 'ggggwggee', 'gggggggee', '.gkkkkge.', '.gggggge.',
    '.gggggee.', '.gggggee.', '..gggee..', '..gggee..', '.eeeeeee.'],
  ['.ggggggggggggg.', 'gggggggggggggge', 'eeeeeeeeeeeeeee', '.gge.......gge.', '.gge..ccc..gge.', '.gge.ccccc.gge.',
    '.gge.ccccc.gge.', '.gge..ccc..gge.', '.gge.......gge.', '.gge.......gge.', '.gge.......gge.', '.gge.......gge.',
    'eeeee.....eeeee'],
];
const STONE_SPRITES = STONE_ART.map((rows, tribe) => tribeSprite(rows, tribe));

// The trees by season: turning brown and orange in autumn, snow on their branches in winter.
const AUTUMN_KEY = { ...SPRITE_KEY, L: C.gold, M: C.rockLit, G: C.rock };
const WINTER_KEY = { ...SPRITE_KEY, L: C.snow, M: C.grey, G: C.grassDark };
const AUTUMN_SPRITES = { [FEATURE.tree]: makeSprite(outlinedArt(FEATURE_ART[FEATURE.tree]), AUTUMN_KEY) };
const WINTER_SPRITES = { [FEATURE.tree]: makeSprite(outlinedArt(FEATURE_ART[FEATURE.tree]), WINTER_KEY),
  [FEATURE.pine]: makeSprite(outlinedArt(FEATURE_ART[FEATURE.pine]), WINTER_KEY) };
