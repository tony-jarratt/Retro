'use strict';

class MenuError extends Error {
  constructor(message) {
    super(message);
    this.name = 'MenuError';
  }
}

const GAME_FIELDS = ['id', 'title', 'folder', 'tag', 'blurb', 'players', 'controls', 'accent', 'thumb'];

function validateGames(games) {
  if (!Array.isArray(games) || games.length === 0) throw new MenuError('games.js: GAMES must be a list with at least one game');
  const seen = new Set();
  games.forEach((g, i) => {
    const where = `games.js entry ${i + 1} (${g && g.id ? g.id : 'no id'})`;
    for (const field of GAME_FIELDS) {
      if (typeof g[field] !== 'string' || g[field].trim() === '') throw new MenuError(`${where} is missing "${field}"`);
    }
    if (!/^[a-z0-9]+$/i.test(g.id)) throw new MenuError(`${where}: id must be letters and numbers only`);
    if (seen.has(g.id)) throw new MenuError(`${where}: id "${g.id}" is used twice`);
    seen.add(g.id);
    if (!g.folder.endsWith('/')) throw new MenuError(`${where}: folder "${g.folder}" must end with "/"`);
    if ('inspiredBy' in g && (typeof g.inspiredBy !== 'string' || g.inspiredBy.trim() === '')) throw new MenuError(`${where}: inspiredBy must be text`);
    if (!/^#[0-9a-f]{6}$/i.test(g.accent)) throw new MenuError(`${where}: accent "${g.accent}" must look like #2fd8c8`);
  });
}

function el(tag, className, text) {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text !== undefined) node.textContent = text;
  return node;
}

function buildCard(game, number) {
  const card = el('a', 'card');
  card.href = `${game.folder}index.html`; // a folder link would open Finder when the menu is opened from disk
  card.style.setProperty('--accent', game.accent);
  card.dataset.id = game.id;

  const shot = el('div', 'shot');
  const img = document.createElement('img');
  img.src = game.thumb;
  img.alt = `${game.title} screenshot`;
  shot.appendChild(img);

  const head = el('div', 'head');
  head.append(el('span', 'tag', game.tag), el('span', 'num', `#${number}`));

  card.append(
    shot,
    head,
    el('h2', 'title', game.title),
    el('p', 'blurb', game.blurb),
    el('p', 'meta', `${game.players} · ${game.controls}`),
    ...(game.inspiredBy ? [el('p', 'credit', `INSPIRED BY ${game.inspiredBy.toUpperCase()}`)] : []),
    el('p', 'play', 'PRESS START'),
  );
  return card;
}

function showError(root, error) {
  console.error(error);
  root.replaceChildren(el('p', 'error', `${error.name}: ${error.message}`));
}

function setupMenu() {
  const root = document.getElementById('games');
  try {
    validateGames(GAMES);
  } catch (error) {
    showError(root, error);
    throw error;
  }
  GAMES.forEach((game, i) => root.appendChild(buildCard(game, i + 1)));

  const cards = [...root.querySelectorAll('.card')];
  // The selected game is the focused card, so the mouse, the arrow keys and Tab all agree.
  cards.forEach((card) => card.addEventListener('mouseenter', () => card.focus({ preventScroll: true })));
  cards[0].focus({ preventScroll: true });

  document.addEventListener('keydown', (e) => {
    if (e.altKey || e.ctrlKey || e.metaKey) return;
    const at = cards.indexOf(document.activeElement);
    const move = { ArrowRight: 1, ArrowDown: 1, ArrowLeft: -1, ArrowUp: -1 }[e.key];
    if (move !== undefined) {
      e.preventDefault();
      cards[at === -1 ? 0 : (at + move + cards.length) % cards.length].focus();
    } else if ((e.key === ' ' || e.key === 'Enter') && at !== -1) {
      e.preventDefault();
      cards[at].click();
    } else if (/^[1-9]$/.test(e.key) && Number(e.key) <= cards.length) {
      cards[Number(e.key) - 1].focus();
    }
  });
}

setupMenu();
