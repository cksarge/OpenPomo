import { DEFAULT_SETTINGS, BLOCK_MODE } from "../common/constants.js";
import { getSettings, setSettings } from "../common/storage.js";
import { normalizeEntry } from "../common/blocklist.js";
import { initTheme } from "../common/theme.js";

const els = {
  workMinutes: document.getElementById("workMinutes"),
  restMinutes: document.getElementById("restMinutes"),
  cyclesBeforeLongBreak: document.getElementById("cyclesBeforeLongBreak"),
  longBreakMinutes: document.getElementById("longBreakMinutes"),
  soundOnEnd: document.getElementById("soundOnEnd"),
  warningEnabled: document.getElementById("warningEnabled"),
  warningDetail: document.getElementById("warning-detail"),
  soundOnWarning: document.getElementById("soundOnWarning"),
  warningSeconds: document.getElementById("warningSeconds"),
  modeRadios: Array.from(document.querySelectorAll('input[name="blockMode"]')),
  modeExplainer: document.getElementById("mode-explainer"),
  siteInput: document.getElementById("site-input"),
  addSiteBtn: document.getElementById("add-site-btn"),
  siteList: document.getElementById("site-list"),
  emptyHint: document.getElementById("empty-hint"),
  resetDefaultsBtn: document.getElementById("reset-defaults-btn"),
  savedIndicator: document.getElementById("saved-indicator"),
  themeToggleBtn: document.getElementById("theme-toggle-btn"),
};

initTheme(els.themeToggleBtn);

let settings = { ...DEFAULT_SETTINGS };
let savedIndicatorTimeout = null;

const MODE_EXPLAINERS = {
  [BLOCK_MODE.OFF]: "Site blocking is off — every site is reachable during focus sessions.",
  [BLOCK_MODE.BLACKLIST]: "Sites in the list below are blocked during focus sessions. Everything else is reachable.",
  [BLOCK_MODE.WHITELIST]: "Only sites in the list below are reachable during focus sessions. Everything else is blocked.",
};

function populateForm() {
  els.workMinutes.value = settings.workMinutes;
  els.restMinutes.value = settings.restMinutes;
  els.cyclesBeforeLongBreak.value = settings.cyclesBeforeLongBreak;
  els.longBreakMinutes.value = settings.longBreakMinutes;
  els.soundOnEnd.checked = settings.soundOnEnd;
  els.warningEnabled.checked = settings.warningEnabled;
  els.soundOnWarning.checked = settings.soundOnWarning;
  els.warningSeconds.value = settings.warningSeconds;
  els.modeRadios.forEach((radio) => (radio.checked = radio.value === settings.blockMode));
  els.warningDetail.style.display = settings.warningEnabled ? "grid" : "none";
  els.modeExplainer.textContent = MODE_EXPLAINERS[settings.blockMode] ?? "";
  renderSiteList();
}

function renderSiteList() {
  els.siteList.innerHTML = "";
  els.emptyHint.style.display = settings.blockList.length ? "none" : "block";
  for (const site of settings.blockList) {
    const li = document.createElement("li");
    const label = document.createElement("span");
    label.textContent = site;
    const removeBtn = document.createElement("button");
    removeBtn.type = "button";
    removeBtn.textContent = "Remove";
    removeBtn.addEventListener("click", () => {
      settings.blockList = settings.blockList.filter((entry) => entry !== site);
      renderSiteList();
      persist();
    });
    li.append(label, removeBtn);
    els.siteList.appendChild(li);
  }
}

function readNumberField(el, fallback, { min = 1, max = Infinity } = {}) {
  const value = Number(el.value);
  if (!Number.isFinite(value)) return fallback;
  return Math.min(max, Math.max(min, Math.round(value)));
}

function readFormIntoSettings() {
  settings = {
    ...settings,
    workMinutes: readNumberField(els.workMinutes, settings.workMinutes, { min: 1, max: 180 }),
    restMinutes: readNumberField(els.restMinutes, settings.restMinutes, { min: 1, max: 60 }),
    cyclesBeforeLongBreak: readNumberField(els.cyclesBeforeLongBreak, settings.cyclesBeforeLongBreak, {
      min: 1,
      max: 12,
    }),
    longBreakMinutes: readNumberField(els.longBreakMinutes, settings.longBreakMinutes, { min: 1, max: 120 }),
    soundOnEnd: els.soundOnEnd.checked,
    warningEnabled: els.warningEnabled.checked,
    soundOnWarning: els.soundOnWarning.checked,
    warningSeconds: readNumberField(els.warningSeconds, settings.warningSeconds, { min: 5, max: 120 }),
  };
}

function showSaved() {
  els.savedIndicator.textContent = "Saved";
  els.savedIndicator.classList.add("visible");
  clearTimeout(savedIndicatorTimeout);
  savedIndicatorTimeout = setTimeout(() => els.savedIndicator.classList.remove("visible"), 1200);
}

async function persist() {
  await setSettings(settings);
  // Let the background worker know so it can re-schedule alarms if a timer
  // is currently running (e.g. warning settings changed mid-session).
  chrome.runtime.sendMessage({ type: "opentomato:save-settings", settings }).catch(() => {});
  showSaved();
}

function onFieldChange() {
  readFormIntoSettings();
  els.warningDetail.style.display = settings.warningEnabled ? "grid" : "none";
  persist();
}

[
  els.workMinutes,
  els.restMinutes,
  els.cyclesBeforeLongBreak,
  els.longBreakMinutes,
  els.warningSeconds,
].forEach((el) => el.addEventListener("change", onFieldChange));

[els.soundOnEnd, els.warningEnabled, els.soundOnWarning].forEach((el) =>
  el.addEventListener("change", onFieldChange)
);

els.modeRadios.forEach((radio) =>
  radio.addEventListener("change", () => {
    if (!radio.checked) return;
    settings.blockMode = radio.value;
    els.modeExplainer.textContent = MODE_EXPLAINERS[settings.blockMode] ?? "";
    persist();
  })
);

function addSite() {
  const normalized = normalizeEntry(els.siteInput.value);
  els.siteInput.value = "";
  if (!normalized) return;
  if (settings.blockList.includes(normalized)) return;
  settings.blockList = [...settings.blockList, normalized];
  renderSiteList();
  persist();
}

els.addSiteBtn.addEventListener("click", addSite);
els.siteInput.addEventListener("keydown", (event) => {
  if (event.key === "Enter") {
    event.preventDefault();
    addSite();
  }
});

els.resetDefaultsBtn.addEventListener("click", () => {
  if (!confirm("Reset all OpenTomato settings to their defaults?")) return;
  settings = { ...DEFAULT_SETTINGS, blockList: [] };
  populateForm();
  persist();
});

(async function init() {
  settings = await getSettings();
  populateForm();
})();
