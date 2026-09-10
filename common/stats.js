// Pure helpers for the "total minutes focused" counter. Shared by the popup
// (which shows the number) and the options page (which picks the window and
// resets the total), so both agree on exactly what gets counted.

import { STATS_WINDOW, PHASE, STATUS } from "./constants.js";
import { durationMsForPhase } from "./duration.js";

// Start of the chosen window, as an epoch-ms timestamp. Uses local time so
// "today"/"this week"/"this month" line up with the user's calendar.
export function windowStartMs(window, now = Date.now()) {
  const d = new Date(now);
  switch (window) {
    case STATS_WINDOW.HOUR:
      d.setMinutes(0, 0, 0);
      return d.getTime();
    case STATS_WINDOW.WEEK:
      d.setHours(0, 0, 0, 0);
      d.setDate(d.getDate() - d.getDay()); // back up to Sunday
      return d.getTime();
    case STATS_WINDOW.MONTH:
      d.setHours(0, 0, 0, 0);
      d.setDate(1);
      return d.getTime();
    case STATS_WINDOW.ALL:
      return 0;
    case STATS_WINDOW.DAY:
    default:
      d.setHours(0, 0, 0, 0);
      return d.getTime();
  }
}

// Total focused milliseconds inside the chosen window, never counting anything
// from before the user's last manual reset.
export function focusMsInWindow(stats, window, now = Date.now()) {
  const resetAt = stats?.resetAt || 0;
  const start = Math.max(windowStartMs(window, now), resetAt);
  const log = Array.isArray(stats?.focusLog) ? stats.focusLog : [];
  return log.reduce((sum, entry) => {
    if (!entry || typeof entry.end !== "number" || entry.end < start || entry.end > now) return sum;
    return sum + (Number(entry.ms) || 0);
  }, 0);
}

// How much focus time the *current* session has racked up so far. Only the
// logged entries land in storage (when a session ends), so callers add this on
// top to show a total that ticks up live instead of jumping at session end.
export function inProgressFocusMs(timerState, settings, now = Date.now()) {
  if (!timerState || timerState.phase !== PHASE.WORK) return 0;

  const fullMs = durationMsForPhase(PHASE.WORK, settings);
  let elapsed = 0;
  if (timerState.status === STATUS.RUNNING && timerState.phaseEndTime) {
    elapsed = fullMs - Math.max(0, timerState.phaseEndTime - now);
  } else if (timerState.status === STATUS.PAUSED) {
    elapsed = fullMs - Math.max(0, timerState.remainingMsWhenPaused ?? fullMs);
  } else {
    return 0;
  }
  return Math.max(0, Math.min(fullMs, elapsed));
}

// Logged focus time in the chosen window plus the in-progress session.
export function totalFocusMs(stats, timerState, settings, now = Date.now()) {
  const logged = focusMsInWindow(stats, settings.statsWindow, now);
  let live = inProgressFocusMs(timerState, settings, now);
  const sinceReset = now - (stats?.resetAt || 0);
  if (sinceReset >= 0) live = Math.min(live, sinceReset);
  return logged + live;
}

// "0m", "45m", "1h", "2h 5m"
export function formatFocusDuration(ms) {
  const totalMinutes = Math.max(0, Math.round(ms / 60000));
  if (totalMinutes < 60) return `${totalMinutes}m`;
  const hours = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;
  return minutes ? `${hours}h ${minutes}m` : `${hours}h`;
}

export const STATS_WINDOW_LABELS = {
  [STATS_WINDOW.HOUR]: "this hour",
  [STATS_WINDOW.DAY]: "today",
  [STATS_WINDOW.WEEK]: "this week",
  [STATS_WINDOW.MONTH]: "this month",
  [STATS_WINDOW.ALL]: "since last reset",
};
