// Saving: the chosen difficulty and the best lap on each circuit, kept in the browser's localStorage
// (one JSON string under SAVE_KEY). It lives in this browser only. Anything that goes wrong is logged
// with console.warn and the game carries on with the defaults, so a broken save never stops a race.

const SAVE_KEY = 'f1-save';
const SAVE_VERSION = 1;

function emptySave() {
  return { version: SAVE_VERSION, difficulty: 1, bestLaps: {} };   // bestLaps: circuit name -> seconds
}

function loadSave() {
  let text;
  try {
    text = localStorage.getItem(SAVE_KEY);
  } catch (e) {
    console.warn('Saving is unavailable (could not read ' + SAVE_KEY + '), so nothing will be remembered: ' + e);
    return emptySave();
  }
  if (text === null) return emptySave();   // first visit
  let data;
  try {
    data = JSON.parse(text);
  } catch (e) {
    console.warn(SAVE_KEY + ' is not valid JSON (' + text.length + ' characters), starting fresh and replacing it at the next save: ' + e);
    return emptySave();
  }
  if (!data || data.version !== SAVE_VERSION || typeof data.bestLaps !== 'object' || data.bestLaps === null || !Number.isInteger(data.difficulty) || data.difficulty < 0) {
    console.warn(SAVE_KEY + ' has an unexpected shape or version (' + JSON.stringify(data && data.version) + '), starting fresh and replacing it at the next save');
    return emptySave();
  }
  const save = emptySave();
  save.difficulty = data.difficulty;
  for (const name of Object.keys(data.bestLaps)) {
    const t = data.bestLaps[name];
    if (Number.isFinite(t) && t > 0) save.bestLaps[name] = t;
    else console.warn('Ignoring the saved best lap for ' + name + ': ' + JSON.stringify(t) + ' is not a lap time');
  }
  return save;
}

function writeSave() {
  try {
    localStorage.setItem(SAVE_KEY, JSON.stringify(saveData));
  } catch (e) {
    console.warn('Could not write ' + SAVE_KEY + ' (progress will not be remembered): ' + e);
  }
}

const saveData = loadSave();
