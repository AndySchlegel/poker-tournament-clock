import { describe, expect, it } from 'vitest';
import {
  addLevel,
  advanceLevel,
  averageStack,
  chipsInPlay,
  createDefaultState,
  currentLevel,
  formatClock,
  nextBreak,
  normalizeState,
  prizePool,
  removeLevel,
  tick,
  updateLevel,
} from '../src/tournament.js';

describe('tournament clock engine', () => {
  it('formats tournament clock values', () => {
    expect(formatClock(0)).toBe('00:00');
    expect(formatClock(8 * 60 + 15)).toBe('08:15');
    expect(formatClock(75 * 60 + 2)).toBe('01:15:02');
  });

  it('calculates chips, average stack, and prize pool', () => {
    const state = { ...createDefaultState(), players: 28, playersLeft: 21, rebuys: 4, addons: 2, startingStack: 30000, buyIn: 50 };
    expect(chipsInPlay(state)).toBe(1020000);
    expect(averageStack(state)).toBe(48571);
    expect(prizePool(state)).toBe(1700);
  });

  it('advances to the next level when time expires', () => {
    const state = { ...createDefaultState(), running: true, secondsLeft: 1 };
    const next = tick(state, 2);
    expect(next.levelIndex).toBe(1);
    expect(currentLevel(next).smallBlind).toBe(200);
    expect(next.running).toBe(true);
  });

  it('allows editing level duration and blinds', () => {
    const state = createDefaultState();
    const next = updateLevel(state, 0, { minutes: 25, smallBlind: 150, bigBlind: 300, ante: 300 });
    expect(currentLevel(next).minutes).toBe(25);
    expect(currentLevel(next).bigBlind).toBe(300);
    expect(next.secondsLeft).toBe(1500);
  });

  it('adds and removes levels safely', () => {
    const state = createDefaultState();
    const added = addLevel(state, 0, { id: 'X', name: 'Custom', minutes: 12, smallBlind: 125, bigBlind: 250, ante: 250, break: false });
    expect(added.levels[1].name).toBe('Custom');
    const removed = removeLevel(added, 1);
    expect(removed.levels.some((level) => level.id === 'X')).toBe(false);
  });

  it('finds upcoming breaks', () => {
    const state = advanceLevel(advanceLevel(createDefaultState()));
    expect(nextBreak(state).name).toBe('Pause');
  });

  it('normalizes imported structure data', () => {
    const imported = normalizeState({ levelIndex: 99, secondsLeft: -4, levels: [{ name: 'Imported', minutes: '15', smallBlind: '100', bigBlind: '200', ante: '0' }] });
    expect(imported.levelIndex).toBe(0);
    expect(imported.secondsLeft).toBe(0);
    expect(imported.levels[0]).toMatchObject({ name: 'Imported', minutes: 15, smallBlind: 100, bigBlind: 200 });
  });
});
