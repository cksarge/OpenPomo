// Phase-duration math shared by the background worker (to schedule alarms)
// and the popup (to render the countdown ring) so both agree exactly.

import { PHASE } from "./constants.js";

export function minutesToMs(minutes) {
  return Math.max(0, Math.round(Number(minutes) * 60 * 1000));
}

export function durationMsForPhase(phase, settings) {
  switch (phase) {
    case PHASE.WORK:
      return minutesToMs(settings.workMinutes);
    case PHASE.REST:
      return minutesToMs(settings.restMinutes);
    case PHASE.LONG_BREAK:
      return minutesToMs(settings.longBreakMinutes);
    default:
      return minutesToMs(settings.workMinutes);
  }
}

export function formatTime(ms) {
  const totalSeconds = Math.max(0, Math.ceil(ms / 1000));
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${minutes}:${String(seconds).padStart(2, "0")}`;
}
