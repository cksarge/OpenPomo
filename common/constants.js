// Shared constants used across background, popup, and options scripts.
// Imported as an ES module (manifest declares the service worker as type "module",
// and popup/options load this file as a <script type="module">).

export const PHASE = {
  WORK: "work",
  REST: "rest",
  LONG_BREAK: "longBreak",
};

export const STATUS = {
  IDLE: "idle",
  RUNNING: "running",
  PAUSED: "paused",
};

export const BLOCK_MODE = {
  OFF: "off",
  BLACKLIST: "blacklist",
  WHITELIST: "whitelist",
};

export const STORAGE_KEYS = {
  SETTINGS: "settings",
  TIMER_STATE: "timerState",
  THEME: "theme",
};

// 'system' follows the OS/browser preference; 'light'/'dark' are explicit
// manual overrides set via the theme toggle button on each page.
export const THEME_OPTIONS = ["system", "light", "dark"];
export const DEFAULT_THEME = "system";

export const DEFAULT_SETTINGS = {
  workMinutes: 25,
  restMinutes: 5,
  cyclesBeforeLongBreak: 4,
  longBreakMinutes: 15,
  warningEnabled: true,
  warningSeconds: 30,
  soundOnEnd: true,
  soundOnWarning: true,
  blockMode: BLOCK_MODE.OFF,
  blockList: [],
};

export const DEFAULT_TIMER_STATE = {
  status: STATUS.IDLE,
  phase: PHASE.WORK,
  cycleCount: 0, // number of work sessions completed since the last long break
  phaseEndTime: null, // epoch ms; null when idle/paused
  remainingMsWhenPaused: null,
};

export const ALARM_PHASE_END = "openpomo-phase-end";
export const ALARM_WARNING = "openpomo-warning";

export const PHASE_LABELS = {
  [PHASE.WORK]: "Focus",
  [PHASE.REST]: "Short Break",
  [PHASE.LONG_BREAK]: "Long Break",
};
