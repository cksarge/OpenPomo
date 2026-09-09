// This page lives at chrome-extension://<id>/blocked/blocked.html, so it can
// read extension storage directly (no messaging round-trip needed).

import { PHASE, STATUS } from "../common/constants.js";
import { getSettings, getTimerState } from "../common/storage.js";
import { formatTime } from "../common/duration.js";
import { initTheme } from "../common/theme.js";

const els = {
  card: document.getElementById("card"),
  icon: document.querySelector(".icon"),
  headline: document.getElementById("headline"),
  message: document.getElementById("message"),
  timeValue: document.getElementById("time-value"),
  themeToggleBtn: document.getElementById("theme-toggle-btn"),
};

initTheme(els.themeToggleBtn);

let timerState = null;

function render() {
  if (!timerState) return;
  const isBlocking = timerState.status === STATUS.RUNNING && timerState.phase === PHASE.WORK;

  els.card.classList.toggle("free", !isBlocking);

  if (isBlocking) {
    els.icon.textContent = "⛔";
    els.headline.textContent = "You can't go there!";
    els.message.textContent = "This site is off-limits while you're focusing.";
    const remainingMs = Math.max(0, (timerState.phaseEndTime ?? Date.now()) - Date.now());
    els.timeValue.textContent = formatTime(remainingMs);
  } else {
    els.icon.textContent = "✅";
    els.headline.textContent = "You're free!";
    els.message.textContent = "Your focus session has ended — this page no longer applies.";
    els.timeValue.textContent = "--:--";
  }
}

chrome.storage.onChanged.addListener((changes, area) => {
  if (area !== "local" || !changes.timerState) return;
  timerState = { ...timerState, ...changes.timerState.newValue };
  render();
});

(async function init() {
  await getSettings(); // ensures defaults exist; not otherwise needed here
  timerState = await getTimerState();
  render();
  setInterval(render, 1000);
})();
