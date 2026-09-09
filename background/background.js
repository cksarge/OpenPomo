// OpenPomo background service worker (MV3, type: module).
//
// This worker is ephemeral — Chrome can unload it at any time between events.
// Because of that, the timer's source of truth is chrome.storage.local
// (see common/storage.js) plus chrome.alarms for waking the worker back up
// at the right moments. Nothing here relies on setInterval/setTimeout to
// track elapsed time.

import {
  PHASE,
  STATUS,
  BLOCK_MODE,
  DEFAULT_TIMER_STATE,
  ALARM_PHASE_END,
  ALARM_WARNING,
  ALARM_BADGE_TICK,
  PHASE_LABELS,
} from "../common/constants.js";
import { getSettings, setSettings, getTimerState, setTimerState } from "../common/storage.js";
import { isUrlBlocked } from "../common/blocklist.js";
import { getNextPhase } from "../common/phases.js";
import { durationMsForPhase } from "../common/duration.js";

const BLOCKED_URL = chrome.runtime.getURL("blocked/blocked.html");

// Toolbar badge: shows minutes remaining in the current phase (like uBlock's
// blocked-count badge, but counting down instead of up), color-coded to
// match the popup's phase colors so it's readable at a glance without
// opening anything.
const BADGE_COLORS = {
  [PHASE.WORK]: "#e85c41",
  [PHASE.REST]: "#3fa66b",
  [PHASE.LONG_BREAK]: "#3f7fd1",
};
const BADGE_PAUSED_COLOR = "#8a7a6e";

chrome.runtime.onInstalled.addListener(async () => {
  // Reading then writing back through getSettings/getTimerState fills in any
  // missing defaults, so storage always has a complete, well-shaped record.
  await setSettings(await getSettings());
  await setTimerState(await getTimerState());
});

async function refreshBadge() {
  const timerState = await getTimerState();

  let remainingMs;
  if (timerState.status === STATUS.RUNNING && timerState.phaseEndTime) {
    remainingMs = Math.max(0, timerState.phaseEndTime - Date.now());
  } else if (timerState.status === STATUS.PAUSED) {
    remainingMs = Math.max(0, timerState.remainingMsWhenPaused ?? 0);
  } else {
    await chrome.action.setBadgeText({ text: "" });
    return;
  }

  const minutesRemaining = Math.ceil(remainingMs / 60000);
  const color =
    timerState.status === STATUS.PAUSED ? BADGE_PAUSED_COLOR : BADGE_COLORS[timerState.phase] ?? BADGE_COLORS[PHASE.WORK];

  await chrome.action.setBadgeText({ text: String(minutesRemaining) });
  await chrome.action.setBadgeBackgroundColor({ color });
  // Older Chrome versions don't have setBadgeTextColor; badge text defaults
  // to white anyway, but set it explicitly where available for reliability.
  if (chrome.action.setBadgeTextColor) {
    await chrome.action.setBadgeTextColor({ color: "#ffffff" });
  }
}

// Refresh on every service-worker wake-up (message, alarm, install, etc.) so
// the badge is never stale even if a tick alarm was ever missed/delayed.
refreshBadge();

async function clearAlarms() {
  await chrome.alarms.clear(ALARM_PHASE_END);
  await chrome.alarms.clear(ALARM_WARNING);
  await chrome.alarms.clear(ALARM_BADGE_TICK);
}

async function scheduleAlarms(timerState, settings) {
  await clearAlarms();
  if (timerState.status !== STATUS.RUNNING || !timerState.phaseEndTime) return;

  chrome.alarms.create(ALARM_PHASE_END, { when: timerState.phaseEndTime });
  // Chrome clamps alarm periods to a 1-minute minimum, which conveniently
  // matches the badge's minute-level resolution.
  chrome.alarms.create(ALARM_BADGE_TICK, { delayInMinutes: 1, periodInMinutes: 1 });

  if (settings.warningEnabled && settings.warningSeconds > 0) {
    const warnAt = timerState.phaseEndTime - settings.warningSeconds * 1000;
    if (warnAt > Date.now()) {
      chrome.alarms.create(ALARM_WARNING, { when: warnAt });
    }
  }
}

async function playSound(kind) {
  try {
    const hasDoc = await chrome.offscreen.hasDocument();
    if (!hasDoc) {
      await chrome.offscreen.createDocument({
        url: "offscreen/offscreen.html",
        reasons: ["AUDIO_PLAYBACK"],
        justification: "Play a short alert tone for Pomodoro phase changes.",
      });
    }
    chrome.runtime.sendMessage({ type: "openpomo:play-sound", kind }).catch(() => {});
  } catch (err) {
    console.error("OpenPomo: failed to play sound", err);
  }
}

function notify(title, message) {
  chrome.notifications.create({
    type: "basic",
    iconUrl: chrome.runtime.getURL("icons/icon128.png"),
    title,
    message,
    priority: 1,
  });
}

async function sweepTabsForBlocking(settings) {
  if (settings.blockMode === BLOCK_MODE.OFF) return;
  const tabs = await chrome.tabs.query({});
  for (const tab of tabs) {
    if (!tab.id || !tab.url) continue;
    if (isUrlBlocked(tab.url, settings.blockMode, settings.blockList)) {
      chrome.tabs.update(tab.id, { url: BLOCKED_URL });
    }
  }
}

async function applyState(timerState, settings, { sweep = false } = {}) {
  await setTimerState(timerState);
  await scheduleAlarms(timerState, settings);
  await refreshBadge();
  if (sweep && timerState.status === STATUS.RUNNING && timerState.phase === PHASE.WORK) {
    await sweepTabsForBlocking(settings);
  }
}

async function startTimer() {
  const settings = await getSettings();
  const timerState = {
    status: STATUS.RUNNING,
    phase: PHASE.WORK,
    cycleCount: 0,
    phaseEndTime: Date.now() + durationMsForPhase(PHASE.WORK, settings),
    remainingMsWhenPaused: null,
  };
  await applyState(timerState, settings, { sweep: true });
  return timerState;
}

async function pauseTimer() {
  const settings = await getSettings();
  const timerState = await getTimerState();
  if (timerState.status !== STATUS.RUNNING) return timerState;

  const remaining = Math.max(0, timerState.phaseEndTime - Date.now());
  const next = {
    ...timerState,
    status: STATUS.PAUSED,
    remainingMsWhenPaused: remaining,
    phaseEndTime: null,
  };
  await applyState(next, settings);
  return next;
}

async function resumeTimer() {
  const settings = await getSettings();
  const timerState = await getTimerState();
  if (timerState.status !== STATUS.PAUSED) return timerState;

  const remaining = timerState.remainingMsWhenPaused ?? durationMsForPhase(timerState.phase, settings);
  const next = {
    ...timerState,
    status: STATUS.RUNNING,
    phaseEndTime: Date.now() + remaining,
    remainingMsWhenPaused: null,
  };
  await applyState(next, settings, { sweep: true });
  return next;
}

async function resetTimer() {
  const settings = await getSettings();
  const next = { ...DEFAULT_TIMER_STATE };
  await applyState(next, settings);
  return next;
}

async function advancePhase({ announce }) {
  const settings = await getSettings();
  const timerState = await getTimerState();
  const finishedPhase = timerState.phase;
  const { phase: nextPhase, cycleCount } = getNextPhase(
    finishedPhase,
    timerState.cycleCount,
    settings.cyclesBeforeLongBreak
  );

  const next = {
    status: STATUS.RUNNING,
    phase: nextPhase,
    cycleCount,
    phaseEndTime: Date.now() + durationMsForPhase(nextPhase, settings),
    remainingMsWhenPaused: null,
  };
  await applyState(next, settings, { sweep: true });

  if (announce) {
    notify("OpenPomo", `${PHASE_LABELS[finishedPhase]} finished. Starting: ${PHASE_LABELS[nextPhase]}.`);
    if (settings.soundOnEnd) await playSound("end");
  }
  return next;
}

async function skipPhase() {
  return advancePhase({ announce: false });
}

chrome.alarms.onAlarm.addListener(async (alarm) => {
  if (alarm.name === ALARM_PHASE_END) {
    await advancePhase({ announce: true });
  } else if (alarm.name === ALARM_WARNING) {
    const settings = await getSettings();
    const timerState = await getTimerState();
    if (settings.soundOnWarning) await playSound("warning");
    notify("OpenPomo", `${settings.warningSeconds}s left in ${PHASE_LABELS[timerState.phase]}.`);
    await refreshBadge();
  } else if (alarm.name === ALARM_BADGE_TICK) {
    await refreshBadge();
  }
});

chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  if (!message || typeof message.type !== "string" || !message.type.startsWith("openpomo:")) {
    return false; // not for us (e.g. offscreen-targeted messages) — let others handle it
  }

  (async () => {
    switch (message.type) {
      case "openpomo:start":
        sendResponse(await startTimer());
        break;
      case "openpomo:pause":
        sendResponse(await pauseTimer());
        break;
      case "openpomo:resume":
        sendResponse(await resumeTimer());
        break;
      case "openpomo:reset":
        sendResponse(await resetTimer());
        break;
      case "openpomo:skip":
        sendResponse(await skipPhase());
        break;
      case "openpomo:get-state":
        sendResponse({ timerState: await getTimerState(), settings: await getSettings() });
        break;
      case "openpomo:save-settings":
        await setSettings(message.settings);
        // Re-schedule alarms in case warning/duration settings changed mid-run.
        await scheduleAlarms(await getTimerState(), message.settings);
        await refreshBadge();
        sendResponse({ ok: true });
        break;
      default:
        sendResponse(null);
    }
  })();

  return true; // keep the message channel open for the async sendResponse above
});

chrome.webNavigation.onBeforeNavigate.addListener(async (details) => {
  if (details.frameId !== 0) return; // main-frame navigations only

  const settings = await getSettings();
  if (settings.blockMode === BLOCK_MODE.OFF) return;

  const timerState = await getTimerState();
  if (timerState.status !== STATUS.RUNNING || timerState.phase !== PHASE.WORK) return;

  if (isUrlBlocked(details.url, settings.blockMode, settings.blockList)) {
    chrome.tabs.update(details.tabId, { url: BLOCKED_URL });
  }
});
