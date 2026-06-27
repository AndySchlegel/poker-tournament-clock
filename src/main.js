import './style.css';
import {
  STORAGE_KEY,
  addLevel,
  advanceLevel,
  averageStack,
  chipsInPlay,
  createDefaultState,
  currentLevel,
  formatClock,
  formatNumber,
  nextBreak,
  nextPlayableLevel,
  normalizeState,
  previousLevel,
  prizePool,
  removeLevel,
  tick,
  updateLevel,
} from './tournament.js';

let state = loadState();
let adminOpen = true;
let wakeLock = null;
let audioCtx = null;

const app = document.querySelector('#app');

function loadState() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? normalizeState(JSON.parse(raw)) : createDefaultState();
  } catch {
    return createDefaultState();
  }
}

function saveState() {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
}

function setState(next) {
  state = normalizeState(next);
  saveState();
  render();
}

function beep() {
  if (!state.sound) return;
  try {
    audioCtx ||= new AudioContext();
    const osc = audioCtx.createOscillator();
    const gain = audioCtx.createGain();
    osc.type = 'sine';
    osc.frequency.value = 740;
    gain.gain.setValueAtTime(0.001, audioCtx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.22, audioCtx.currentTime + 0.02);
    gain.gain.exponentialRampToValueAtTime(0.001, audioCtx.currentTime + 0.5);
    osc.connect(gain).connect(audioCtx.destination);
    osc.start();
    osc.stop(audioCtx.currentTime + 0.55);
  } catch {}
}

async function requestWakeLock() {
  try {
    wakeLock = await navigator.wakeLock?.request('screen');
  } catch {}
}

function render() {
  const level = currentLevel(state);
  const upcoming = nextPlayableLevel(state);
  const breakLevel = nextBreak(state);
  const progress = Math.max(0, Math.min(100, 100 - (state.secondsLeft / Math.max(1, level.minutes * 60)) * 100));
  const isCritical = state.secondsLeft <= 60 && state.running;

  app.innerHTML = `
    <main class="shell ${adminOpen ? 'admin-open' : ''} ${level.break ? 'is-break' : ''} ${isCritical ? 'is-critical' : ''}">
      <section class="clock-stage" aria-live="polite">
        <div class="felt-orbit"></div>
        <header class="hero-header">
          <div>
            <p class="eyebrow">Poker Tournament Clock</p>
            <h1>${escapeHtml(state.tournamentName)}</h1>
            <p class="venue">${escapeHtml(state.venue)}</p>
          </div>
          <button class="ghost hide-on-tv" data-action="toggle-admin">${adminOpen ? 'Admin ausblenden' : 'Admin öffnen'}</button>
        </header>

        <section class="main-card">
          <div class="level-chip ${level.break ? 'break' : ''}">${level.break ? 'Pause' : `Level ${state.levelIndex + 1}`}</div>
          <div class="timer">${formatClock(state.secondsLeft)}</div>
          <div class="progress"><span style="width:${progress}%"></span></div>
          <div class="blind-row">
            ${level.break ? '<div class="blind big"><span>Next Blinds</span><strong>' + blindLabel(upcoming) + '</strong></div>' : `
              <div class="blind big"><span>Blinds</span><strong>${formatNumber(level.smallBlind)} / ${formatNumber(level.bigBlind)}</strong></div>
              <div class="blind"><span>Ante</span><strong>${formatNumber(level.ante)}</strong></div>
            `}
          </div>
          <div class="controls hide-on-tv">
            <button class="primary" data-action="toggle-run">${state.running ? 'Pause' : 'Start'}</button>
            <button data-action="prev-level">← Level</button>
            <button data-action="next-level">Level →</button>
            <button data-action="reset-level">Level reset</button>
            <button data-action="fullscreen">Fullscreen</button>
          </div>
        </section>

        <section class="stats-grid">
          ${stat('Spieler', `${state.playersLeft}/${state.players}`, 'im Turnier / gestartet')}
          ${stat('Average', formatNumber(averageStack(state)), 'Stack')}
          ${stat('Chips', formatNumber(chipsInPlay(state)), 'im Spiel')}
          ${stat('Preispool', `${formatNumber(prizePool(state))} €`, 'geschätzt')}
          ${stat('Nächste Blinds', blindLabel(upcoming), upcoming?.name || 'Ende')}
          ${stat('Nächste Pause', breakLevel ? breakLevel.name : '—', breakLevel ? `${breakLevel.minutes} min` : 'keine')}
        </section>

        <section class="lower-panel">
          <div class="next-levels">
            <h2>Struktur</h2>
            ${state.levels.slice(state.levelIndex, state.levelIndex + 5).map((l, idx) => `
              <div class="structure-row ${idx === 0 ? 'active' : ''} ${l.break ? 'break' : ''}">
                <span>${escapeHtml(l.name)}</span>
                <strong>${l.break ? 'Pause' : `${formatNumber(l.smallBlind)}/${formatNumber(l.bigBlind)} · A ${formatNumber(l.ante)}`}</strong>
                <em>${l.minutes}m</em>
              </div>`).join('')}
          </div>
          <div class="log">
            <h2>Info</h2>
            ${(state.log || []).slice(0, 5).map((line) => `<p>${escapeHtml(line)}</p>`).join('')}
          </div>
        </section>
      </section>

      <aside class="admin-panel hide-on-tv">
        <div class="admin-head">
          <div>
            <p class="eyebrow">Admin</p>
            <h2>Turnier einstellen</h2>
          </div>
          <button class="ghost" data-action="toggle-admin">×</button>
        </div>
        ${adminHtml()}
      </aside>
    </main>
  `;
}

function adminHtml() {
  return `
    <section class="admin-section">
      <h3>Setup</h3>
      <label>Name <input data-field="tournamentName" value="${escapeAttr(state.tournamentName)}"></label>
      <label>Venue <input data-field="venue" value="${escapeAttr(state.venue)}"></label>
      <div class="two-col">
        <label>Spieler <input type="number" data-field="players" min="1" value="${state.players}"></label>
        <label>Übrig <input type="number" data-field="playersLeft" min="1" value="${state.playersLeft}"></label>
        <label>Buy-in € <input type="number" data-field="buyIn" min="0" value="${state.buyIn}"></label>
        <label>Startstack <input type="number" data-field="startingStack" min="1" value="${state.startingStack}"></label>
        <label>Rebuys <input type="number" data-field="rebuys" min="0" value="${state.rebuys}"></label>
        <label>Add-ons <input type="number" data-field="addons" min="0" value="${state.addons}"></label>
      </div>
      <label>Preispool manuell <input type="number" data-field="prizePoolManual" min="0" placeholder="optional" value="${escapeAttr(state.prizePoolManual)}"></label>
    </section>

    <section class="admin-section">
      <div class="section-title"><h3>Blind-Level</h3><button data-action="add-level">+ Level</button></div>
      <div class="levels-editor">
        ${state.levels.map((level, idx) => `
          <article class="level-editor ${idx === state.levelIndex ? 'active' : ''}">
            <input data-level="${idx}" data-level-field="name" value="${escapeAttr(level.name)}" aria-label="Name">
            <input type="number" data-level="${idx}" data-level-field="minutes" min="1" value="${level.minutes}" aria-label="Minuten">
            <input type="number" data-level="${idx}" data-level-field="smallBlind" min="0" value="${level.smallBlind}" aria-label="Small Blind">
            <input type="number" data-level="${idx}" data-level-field="bigBlind" min="0" value="${level.bigBlind}" aria-label="Big Blind">
            <input type="number" data-level="${idx}" data-level-field="ante" min="0" value="${level.ante}" aria-label="Ante">
            <label class="check"><input type="checkbox" data-level="${idx}" data-level-field="break" ${level.break ? 'checked' : ''}> Pause</label>
            <button class="danger" data-action="remove-level" data-index="${idx}">×</button>
          </article>`).join('')}
      </div>
    </section>

    <section class="admin-section actions">
      <button data-action="preset-turbo">Turbo Preset</button>
      <button data-action="preset-deep">Deepstack Preset</button>
      <button data-action="export">Export JSON</button>
      <label class="file-button">Import JSON<input type="file" accept="application/json" data-action="import"></label>
      <button data-action="reset-all" class="danger">Reset alles</button>
      <label class="check"><input type="checkbox" data-field="sound" ${state.sound ? 'checked' : ''}> Sound bei Levelwechsel</label>
    </section>
  `;
}

function stat(label, value, sub) {
  return `<article class="stat"><span>${label}</span><strong>${value}</strong><em>${sub}</em></article>`;
}

function blindLabel(level) {
  if (!level) return '—';
  if (level.break) return 'Pause';
  return `${formatNumber(level.smallBlind)} / ${formatNumber(level.bigBlind)}${level.ante ? ` · A ${formatNumber(level.ante)}` : ''}`;
}

function applyField(field, value, checked = false, type = 'text') {
  const numeric = ['players', 'playersLeft', 'buyIn', 'startingStack', 'rebuys', 'addons'].includes(field);
  const next = { ...state, [field]: type === 'checkbox' ? checked : numeric ? Number(value) : value };
  if (field === 'players') next.playersLeft = Math.min(Number(next.playersLeft), Number(next.players));
  setState(next);
}

function applyPreset(kind) {
  const base = createDefaultState();
  if (kind === 'turbo') {
    base.tournamentName = 'Friday Night Turbo';
    base.levels = base.levels.map((l) => ({ ...l, minutes: l.break ? 5 : 10 }));
  }
  if (kind === 'deep') {
    base.tournamentName = 'Deepstack Championship';
    base.startingStack = 50000;
    base.levels = base.levels.map((l) => ({ ...l, minutes: l.break ? 15 : 30, smallBlind: l.smallBlind * 2, bigBlind: l.bigBlind * 2, ante: l.ante * 2 }));
  }
  setState({ ...state, ...base, log: [`${kind === 'turbo' ? 'Turbo' : 'Deepstack'} Preset geladen.`, ...state.log] });
}

app.addEventListener('click', async (event) => {
  const target = event.target.closest('[data-action]');
  if (!target) return;
  const action = target.dataset.action;
  if (action === 'toggle-admin') { adminOpen = !adminOpen; render(); }
  if (action === 'toggle-run') {
    const running = !state.running;
    setState({ ...state, running, startedAt: state.startedAt || Date.now(), log: [running ? 'Clock gestartet.' : 'Clock pausiert.', ...state.log] });
    if (running) requestWakeLock();
  }
  if (action === 'next-level') { beep(); setState(advanceLevel(state)); }
  if (action === 'prev-level') setState(previousLevel(state));
  if (action === 'reset-level') setState({ ...state, running: false, secondsLeft: currentLevel(state).minutes * 60, log: ['Level zurückgesetzt.', ...state.log] });
  if (action === 'fullscreen') document.documentElement.requestFullscreen?.();
  if (action === 'add-level') setState(addLevel(state, state.levels.length - 1));
  if (action === 'remove-level') setState(removeLevel(state, Number(target.dataset.index)));
  if (action === 'preset-turbo') applyPreset('turbo');
  if (action === 'preset-deep') applyPreset('deep');
  if (action === 'reset-all' && confirm('Turnier wirklich zurücksetzen?')) setState(createDefaultState());
  if (action === 'export') {
    const blob = new Blob([JSON.stringify(state, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = 'poker-tournament-clock.json';
    link.click();
    URL.revokeObjectURL(url);
  }
});

app.addEventListener('input', (event) => {
  const fieldTarget = event.target.closest('[data-field]');
  if (fieldTarget) {
    applyField(fieldTarget.dataset.field, fieldTarget.value, fieldTarget.checked, fieldTarget.type);
    return;
  }
  const levelTarget = event.target.closest('[data-level-field]');
  if (levelTarget) {
    const index = Number(levelTarget.dataset.level);
    const field = levelTarget.dataset.levelField;
    const raw = levelTarget.type === 'checkbox' ? levelTarget.checked : levelTarget.value;
    const value = ['minutes', 'smallBlind', 'bigBlind', 'ante'].includes(field) ? Number(raw) : raw;
    setState(updateLevel(state, index, { [field]: value }));
  }
});

app.addEventListener('change', async (event) => {
  if (event.target?.dataset?.action === 'import') {
    const file = event.target.files?.[0];
    if (!file) return;
    const text = await file.text();
    setState({ ...normalizeState(JSON.parse(text)), log: ['Struktur importiert.', ...state.log] });
  }
});

setInterval(() => {
  const before = state;
  const after = tick(state, 1);
  if (after !== before) {
    if (after.levelIndex !== before.levelIndex) beep();
    state = after;
    saveState();
    render();
  }
}, 1000);

function escapeHtml(value) {
  return String(value ?? '').replace(/[&<>"]/g, (char) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[char]));
}

function escapeAttr(value) {
  return escapeHtml(value).replace(/'/g, '&#39;');
}

render();
