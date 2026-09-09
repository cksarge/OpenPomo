// Thin promise-based wrapper around chrome.storage.local for the two top-level
// keys OpenPomo uses. Keeping reads/writes funneled through here means every
// surface (background, popup, options, blocked page) agrees on shape/defaults.

import { DEFAULT_SETTINGS, DEFAULT_TIMER_STATE, STORAGE_KEYS } from "./constants.js";

export async function getSettings() {
  const { [STORAGE_KEYS.SETTINGS]: settings } = await chrome.storage.local.get(
    STORAGE_KEYS.SETTINGS
  );
  return { ...DEFAULT_SETTINGS, ...(settings || {}) };
}

export async function setSettings(settings) {
  await chrome.storage.local.set({ [STORAGE_KEYS.SETTINGS]: settings });
}

export async function getTimerState() {
  const { [STORAGE_KEYS.TIMER_STATE]: timerState } = await chrome.storage.local.get(
    STORAGE_KEYS.TIMER_STATE
  );
  return { ...DEFAULT_TIMER_STATE, ...(timerState || {}) };
}

export async function setTimerState(timerState) {
  await chrome.storage.local.set({ [STORAGE_KEYS.TIMER_STATE]: timerState });
}
