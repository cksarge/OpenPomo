import { PHASE, STATUS, PHASE_LABELS, DEFAULT_SETTINGS, DEFAULT_TIMER_STATE } from "../common/constants.js";
import { durationMsForPhase, formatTime } from "../common/duration.js";
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
};

initTheme(els.themeToggleBtn);

let state = {
  settings: DEFAULT_SETTINGS,
  timerState: DEFAULT_TIMER_STATE,
};

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

  els.skipBtn.disabled = status === STATUS.IDLE;
  els.resetBtn.disabled = status === STATUS.IDLE;
}

async function sendAction(type) {
  return chrome.runtime.sendMessage({ type });
}

async function loadState() {
  const response = await sendAction("opentomato:get-state");
  if (response) {
    state = response;
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
  state.timerState = await sendAction("opentomato:skip");
  render();
});

els.resetBtn.addEventListener("click", async () => {
  if (state.timerState.status === STATUS.IDLE) return;
  state.timerState = await sendAction("opentomato:reset");
  render();
});

els.settingsBtn.addEventListener("click", () => {
  chrome.runtime.openOptionsPage();
});

chrome.storage.onChanged.addListener((changes, area) => {
  if (area !== "local") return;
  if (changes.timerState) state.timerState = { ...state.timerState, ...changes.timerState.newValue };
  if (changes.settings) state.settings = { ...state.settings, ...changes.settings.newValue };
  render();
});

setInterval(render, 250);
loadState();
