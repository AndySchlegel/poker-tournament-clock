export const STORAGE_KEY = 'ptc-state-v1';

export const defaultLevels = [
  { id: 'L1', name: 'Level 1', minutes: 20, smallBlind: 100, bigBlind: 200, ante: 200, break: false },
  { id: 'L2', name: 'Level 2', minutes: 20, smallBlind: 200, bigBlind: 400, ante: 400, break: false },
  { id: 'L3', name: 'Level 3', minutes: 20, smallBlind: 300, bigBlind: 600, ante: 600, break: false },
  { id: 'B1', name: 'Pause', minutes: 10, smallBlind: 0, bigBlind: 0, ante: 0, break: true },
  { id: 'L4', name: 'Level 4', minutes: 20, smallBlind: 500, bigBlind: 1000, ante: 1000, break: false },
  { id: 'L5', name: 'Level 5', minutes: 20, smallBlind: 1000, bigBlind: 2000, ante: 2000, break: false },
  { id: 'L6', name: 'Level 6', minutes: 20, smallBlind: 1500, bigBlind: 3000, ante: 3000, break: false },
  { id: 'B2', name: 'Dinner Break', minutes: 15, smallBlind: 0, bigBlind: 0, ante: 0, break: true },
  { id: 'L7', name: 'Level 7', minutes: 15, smallBlind: 2000, bigBlind: 4000, ante: 4000, break: false },
  { id: 'L8', name: 'Level 8', minutes: 15, smallBlind: 3000, bigBlind: 6000, ante: 6000, break: false },
];

export function createDefaultState() {
  return {
    tournamentName: 'Poker Tournament Clock',
    venue: 'Setup öffnen und eigenes Turnier einstellen',
    startedAt: null,
    running: false,
    levelIndex: 0,
    secondsLeft: defaultLevels[0].minutes * 60,
    players: 28,
    playersLeft: 28,
    rebuys: 0,
    addons: 0,
    buyIn: 50,
    startingStack: 30000,
    prizePoolManual: '',
    sound: true,
    levels: defaultLevels.map((level) => ({ ...level })),
    log: ['Tournament Clock bereit.'],
  };
}

export function currentLevel(state) {
  return state.levels[state.levelIndex] || state.levels[state.levels.length - 1];
}

export function nextPlayableLevel(state) {
  return state.levels.slice(state.levelIndex + 1).find((level) => !level.break) || null;
}

export function nextBreak(state) {
  return state.levels.slice(state.levelIndex + 1).find((level) => level.break) || null;
}

export function chipsInPlay(state) {
  return Math.max(0, Number(state.players || 0) + Number(state.rebuys || 0) + Number(state.addons || 0)) * Number(state.startingStack || 0);
}

export function averageStack(state) {
  const left = Math.max(1, Number(state.playersLeft || 1));
  return Math.round(chipsInPlay(state) / left);
}

export function prizePool(state) {
  const manual = Number(state.prizePoolManual);
  if (Number.isFinite(manual) && manual > 0) return manual;
  return Math.max(0, Number(state.players || 0) + Number(state.rebuys || 0) + Number(state.addons || 0)) * Number(state.buyIn || 0);
}

export function formatClock(totalSeconds) {
  const safe = Math.max(0, Math.floor(Number(totalSeconds) || 0));
  const h = Math.floor(safe / 3600);
  const m = Math.floor((safe % 3600) / 60);
  const s = safe % 60;
  const parts = h > 0 ? [h, m, s] : [m, s];
  return parts.map((value) => String(value).padStart(2, '0')).join(':');
}

export function formatNumber(value) {
  return new Intl.NumberFormat('de-DE').format(Math.round(Number(value) || 0));
}

export function updateLevel(state, index, patch) {
  const next = structuredCloneSafe(state);
  next.levels[index] = { ...next.levels[index], ...patch };
  if (index === next.levelIndex && patch.minutes) {
    next.secondsLeft = Math.max(1, Number(patch.minutes)) * 60;
  }
  return next;
}

export function addLevel(state, afterIndex = state.levels.length - 1, level = null) {
  const next = structuredCloneSafe(state);
  const previous = next.levels[Math.max(0, afterIndex)] || defaultLevels[0];
  const created = level || {
    id: `L${Date.now()}`,
    name: `Level ${next.levels.filter((l) => !l.break).length + 1}`,
    minutes: previous.minutes || 20,
    smallBlind: previous.break ? 1000 : previous.smallBlind * 2,
    bigBlind: previous.break ? 2000 : previous.bigBlind * 2,
    ante: previous.break ? 2000 : previous.ante * 2,
    break: false,
  };
  next.levels.splice(afterIndex + 1, 0, created);
  return next;
}

export function removeLevel(state, index) {
  const next = structuredCloneSafe(state);
  if (next.levels.length <= 1) return next;
  next.levels.splice(index, 1);
  next.levelIndex = Math.min(next.levelIndex, next.levels.length - 1);
  next.secondsLeft = Math.min(next.secondsLeft, currentLevel(next).minutes * 60);
  return next;
}

export function advanceLevel(state) {
  const next = structuredCloneSafe(state);
  next.levelIndex = Math.min(next.levelIndex + 1, next.levels.length - 1);
  next.secondsLeft = Math.max(1, Number(currentLevel(next).minutes || 1)) * 60;
  next.running = false;
  next.log.unshift(`${currentLevel(next).name} geladen.`);
  return next;
}

export function previousLevel(state) {
  const next = structuredCloneSafe(state);
  next.levelIndex = Math.max(next.levelIndex - 1, 0);
  next.secondsLeft = Math.max(1, Number(currentLevel(next).minutes || 1)) * 60;
  next.running = false;
  next.log.unshift(`${currentLevel(next).name} geladen.`);
  return next;
}

export function tick(state, seconds = 1) {
  if (!state.running) return state;
  let next = structuredCloneSafe(state);
  next.secondsLeft -= seconds;
  while (next.secondsLeft <= 0 && next.levelIndex < next.levels.length - 1) {
    const overshoot = Math.abs(next.secondsLeft);
    next = advanceLevel({ ...next, running: true });
    next.running = true;
    next.secondsLeft -= overshoot;
  }
  if (next.secondsLeft <= 0) {
    next.secondsLeft = 0;
    next.running = false;
    next.log.unshift('Turnierstruktur beendet.');
  }
  return next;
}

export function normalizeState(input) {
  const base = createDefaultState();
  const next = { ...base, ...(input || {}) };
  next.levels = Array.isArray(input?.levels) && input.levels.length ? input.levels.map((level, idx) => ({
    id: String(level.id || `L${idx + 1}`),
    name: String(level.name || `Level ${idx + 1}`),
    minutes: Math.max(1, Number(level.minutes) || 20),
    smallBlind: Math.max(0, Number(level.smallBlind) || 0),
    bigBlind: Math.max(0, Number(level.bigBlind) || 0),
    ante: Math.max(0, Number(level.ante) || 0),
    break: Boolean(level.break),
  })) : base.levels;
  next.levelIndex = Math.min(Math.max(0, Number(next.levelIndex) || 0), next.levels.length - 1);
  next.secondsLeft = Math.min(Math.max(0, Number(next.secondsLeft) || 0), currentLevel(next).minutes * 60);
  return next;
}

function structuredCloneSafe(value) {
  return typeof structuredClone === 'function' ? structuredClone(value) : JSON.parse(JSON.stringify(value));
}
