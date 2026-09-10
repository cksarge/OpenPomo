import {
  PHASE,
  STATUS,
  PHASE_LABELS,
  DEFAULT_SETTINGS,
  DEFAULT_TIMER_STATE,
  DEFAULT_STATS,
} from "../common/constants.js";
import { durationMsForPhase, formatTime } from "../common/duration.js";
import { getStats, getTasks, setTasks } from "../common/storage.js";
import { totalFocusMs, formatFocusDuration, STATS_WINDOW_LABELS } from "../common/stats.js";
import { initTheme } from "../common/theme.js";

const RING_RADIUS = 54;
const CIRCUMFERENCE = 2 * Math.PI * RING_RADIUS;

const els = {
  card: document.getElementById("timer-card"),
  phaseLabel: document.getElementById("phase-label"),
  timeDisplay: document.getElementById("time-display"),
  ringProgress: document.getElementById("ring-progress"),
  cycleDots: document.getElementById("cycle-dots"),
  primaryBtn: document.getElementById("primary-btn"),
  skipBtn: document.getElementById("skip-btn"),
  resetBtn: document.getElementById("reset-btn"),
  settingsBtn: document.getElementById("settings-btn"),
  themeToggleBtn: document.getElementById("theme-toggle-btn"),
  restrictNote: document.getElementById("restrict-note"),
  focusStat: document.getElementById("focus-stat"),
  resetConfirm: document.getElementById("reset-confirm"),
  resetConfirmInput: document.getElementById("reset-confirm-input"),
  resetConfirmGo: document.getElementById("reset-confirm-go"),
  resetConfirmCancel: document.getElementById("reset-confirm-cancel"),
  tasks: document.getElementById("tasks"),
  taskList: document.getElementById("task-list"),
  taskToggle: document.getElementById("task-toggle"),
};

const RESET_PHRASE = "Yes, I want to reset the timer.";
const TASKS_PREVIEW = 3; // tasks shown before "Show all"

initTheme(els.themeToggleBtn);

let state = {
  settings: DEFAULT_SETTINGS,
  timerState: DEFAULT_TIMER_STATE,
  stats: DEFAULT_STATS,
  tasks: [],
};
let tasksExpanded = false;

function phaseDataAttr(phase) {
  if (phase === PHASE.REST) return "rest";
  if (phase === PHASE.LONG_BREAK) return "long-break";
  return "work";
}

function render() {
  const { settings, timerState } = state;
  const { phase, status, cycleCount } = timerState;

  els.card.dataset.phase = phaseDataAttr(phase);

  const statusSuffix =
    status === STATUS.PAUSED ? " · Paused" : status === STATUS.IDLE ? " · Ready" : "";
  els.phaseLabel.textContent = PHASE_LABELS[phase] + statusSuffix;

  const totalMs = durationMsForPhase(phase, settings);
  let remainingMs;
  if (status === STATUS.RUNNING && timerState.phaseEndTime) {
    remainingMs = Math.max(0, timerState.phaseEndTime - Date.now());
  } else if (status === STATUS.PAUSED) {
    remainingMs = timerState.remainingMsWhenPaused ?? totalMs;
  } else {
    remainingMs = totalMs;
  }
  els.timeDisplay.textContent = formatTime(remainingMs);

  const fractionRemaining = totalMs > 0 ? remainingMs / totalMs : 0;
  els.ringProgress.style.strokeDasharray = `${CIRCUMFERENCE}`;
  els.ringProgress.style.strokeDashoffset = `${CIRCUMFERENCE * (1 - fractionRemaining)}`;

  els.cycleDots.innerHTML = "";
  for (let i = 0; i < settings.cyclesBeforeLongBreak; i++) {
    const dot = document.createElement("span");
    const filled = phase === PHASE.LONG_BREAK || i < cycleCount;
    const active = phase === PHASE.WORK && i === cycleCount;
    dot.className = "dot" + (filled ? " filled" : "") + (active ? " active" : "");
    els.cycleDots.appendChild(dot);
  }

  if (status === STATUS.RUNNING) {
    els.primaryBtn.textContent = "Pause";
  } else if (status === STATUS.PAUSED) {
    els.primaryBtn.textContent = "Resume";
  } else {
    els.primaryBtn.textContent = "Start";
  }

  const active = status !== STATUS.IDLE;
  const restrictive = !!settings.restrictiveMode;

  // Restrictive mode: no skipping while a session runs; reset only when paused.
  els.skipBtn.disabled = !active || restrictive;
  els.resetBtn.disabled = !active || (restrictive && status !== STATUS.PAUSED);
  els.restrictNote.hidden = !(restrictive && active);

  // Close the type-to-confirm panel if a reset is no longer possible.
  if (!els.resetConfirm.hidden && !(restrictive && status === STATUS.PAUSED)) {
    closeResetConfirm();
  }

  renderFocusStat();
  renderTasks();
}

function openResetConfirm() {
  els.resetConfirmInput.value = "";
  els.resetConfirmGo.disabled = true;
  els.resetConfirm.hidden = false;
  els.resetConfirmInput.focus();
}

function closeResetConfirm() {
  els.resetConfirm.hidden = true;
}

function renderFocusStat() {
  const win = state.settings.statsWindow ?? DEFAULT_SETTINGS.statsWindow;
  const label = STATS_WINDOW_LABELS[win] ?? STATS_WINDOW_LABELS[DEFAULT_SETTINGS.statsWindow];
  const total = formatFocusDuration(totalFocusMs(state.stats, state.timerState, state.settings));
  els.focusStat.textContent = "";
  const strong = document.createElement("strong");
  strong.textContent = total;
  els.focusStat.append(`Focused ${label}: `, strong);

  const tasks = Array.isArray(state.tasks) ? state.tasks : [];
  if (tasks.length) {
    const done = tasks.filter((t) => t.done).length;
    const taskStrong = document.createElement("strong");
    taskStrong.textContent = `${done}/${tasks.length}`;
    els.focusStat.append(" · Tasks complete ", taskStrong);
  }
}

let lastTasksSig = null;

function renderTasks() {
  const tasks = Array.isArray(state.tasks) ? state.tasks : [];
  els.tasks.hidden = tasks.length === 0;
  if (!tasks.length) {
    lastTasksSig = "empty";
    return;
  }

  const showAll = tasksExpanded || tasks.length <= TASKS_PREVIEW;
  const visible = showAll ? tasks : tasks.slice(0, TASKS_PREVIEW);

  // render() runs every 250ms; only rebuild the interactive list when the task
  // data or the expanded state actually changed, so clicks aren't disrupted.
  const sig = JSON.stringify({ showAll, rows: tasks.map((t) => [t.id, t.text, t.done]) });
  if (sig === lastTasksSig) return;
  lastTasksSig = sig;

  els.taskList.innerHTML = "";
  for (const task of visible) {
    const li = document.createElement("li");
    li.className = "task-row" + (task.done ? " done" : "");

    const label = document.createElement("label");
    const check = document.createElement("input");
    check.type = "checkbox";
    check.className = "task-check";
    check.checked = task.done;
    check.addEventListener("change", () => toggleTask(task.id, check.checked));

    const text = document.createElement("span");
    text.className = "task-text";
    text.textContent = task.text;

    label.append(check, text);
    li.appendChild(label);
    els.taskList.appendChild(li);
  }

  const overflow = tasks.length - TASKS_PREVIEW;
  if (overflow > 0) {
    els.taskToggle.hidden = false;
    els.taskToggle.textContent = tasksExpanded ? "Show less" : `Show all (${tasks.length})`;
  } else {
    els.taskToggle.hidden = true;
  }
}

async function toggleTask(id, done) {
  state.tasks = state.tasks.map((t) => (t.id === id ? { ...t, done } : t));
  render();
  await setTasks(state.tasks);
}

els.taskToggle.addEventListener("click", () => {
  tasksExpanded = !tasksExpanded;
  renderTasks();
});

async function sendAction(type) {
  return chrome.runtime.sendMessage({ type });
}

async function loadState() {
  const response = await sendAction("opentomato:get-state");
  const tasks = await getTasks();
  if (response) {
    state = { stats: DEFAULT_STATS, tasks, ...response };
  } else {
    state = { ...state, tasks };
  }
  // Fall back to reading stats straight from storage if the worker response
  // predates the stats field for any reason.
  if (!response || !response.stats) {
    state.stats = await getStats();
  }
  render();
}

els.primaryBtn.addEventListener("click", async () => {
  const { status } = state.timerState;
  let type = "opentomato:start";
  if (status === STATUS.RUNNING) type = "opentomato:pause";
  else if (status === STATUS.PAUSED) type = "opentomato:resume";
  state.timerState = await sendAction(type);
  render();
});

els.skipBtn.addEventListener("click", async () => {
  if (state.timerState.status === STATUS.IDLE) return;
  if (state.settings.restrictiveMode) return; // no skipping in restrictive mode
  state.timerState = await sendAction("opentomato:skip");
  render();
});

els.resetBtn.addEventListener("click", async () => {
  const { status } = state.timerState;
  if (status === STATUS.IDLE) return;

  if (state.settings.restrictiveMode) {
    if (status !== STATUS.PAUSED) return; // can only reset from a paused timer
    openResetConfirm();
    return;
  }

  state.timerState = await sendAction("opentomato:reset");
  render();
});

els.resetConfirmInput.addEventListener("input", () => {
  els.resetConfirmGo.disabled = els.resetConfirmInput.value !== RESET_PHRASE;
});

els.resetConfirmCancel.addEventListener("click", closeResetConfirm);

els.resetConfirmGo.addEventListener("click", async () => {
  if (els.resetConfirmInput.value !== RESET_PHRASE) return;
  closeResetConfirm();
  state.timerState = await chrome.runtime.sendMessage({ type: "opentomato:reset", confirmed: true });
  render();
});

els.settingsBtn.addEventListener("click", () => {
  chrome.runtime.openOptionsPage();
});

chrome.storage.onChanged.addListener((changes, area) => {
  if (area !== "local") return;
  if (changes.timerState) state.timerState = { ...state.timerState, ...changes.timerState.newValue };
  if (changes.settings) state.settings = { ...state.settings, ...changes.settings.newValue };
  if (changes.stats) state.stats = { ...DEFAULT_STATS, ...changes.stats.newValue };
  if (changes.tasks) {
    state.tasks = Array.isArray(changes.tasks.newValue) ? changes.tasks.newValue : [];
  }
  render();
});

setInterval(render, 250);
loadState();
