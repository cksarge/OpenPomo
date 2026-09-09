// Shared dark/light theme handling for the popup, options, and blocked pages.
//
// Preference is one of THEME_OPTIONS ('system' | 'light' | 'dark'), stored in
// chrome.storage.local so all three pages agree. 'system' means "no
// data-theme attribute" — the page's CSS then falls back to a
// prefers-color-scheme media query. An explicit 'light'/'dark' sets
// data-theme on <html>, which every page's CSS gives priority over the media
// query (see the :root[data-theme="..."] blocks in each stylesheet).

import { THEME_OPTIONS } from "./constants.js";
import { getTheme, setTheme } from "./storage.js";

const THEME_ICONS = { system: "🖥️", light: "☀️", dark: "🌙" };
const THEME_LABELS = { system: "Matching system", light: "Light", dark: "Dark" };

function applyThemeAttribute(theme) {
  const root = document.documentElement;
  if (theme === "light" || theme === "dark") {
    root.setAttribute("data-theme", theme);
  } else {
    root.removeAttribute("data-theme");
  }
}

function updateToggleButton(buttonEl, theme) {
  if (!buttonEl) return;
  buttonEl.textContent = THEME_ICONS[theme] ?? THEME_ICONS.system;
  const label = `Theme: ${THEME_LABELS[theme] ?? THEME_LABELS.system} (click to change)`;
  buttonEl.title = label;
  buttonEl.setAttribute("aria-label", label);
}

/**
 * Applies the stored theme to this page and, if given, wires up a toggle
 * button that cycles system -> light -> dark -> system on click. Also keeps
 * this page's theme in sync if it's changed from another OpenPomo page
 * (popup/options/blocked can all be open at once).
 */
export async function initTheme(buttonEl) {
  const theme = await getTheme();
  applyThemeAttribute(theme);
  updateToggleButton(buttonEl, theme);

  if (buttonEl) {
    buttonEl.addEventListener("click", async () => {
      const current = await getTheme();
      const next = THEME_OPTIONS[(THEME_OPTIONS.indexOf(current) + 1) % THEME_OPTIONS.length];
      await setTheme(next);
      applyThemeAttribute(next);
      updateToggleButton(buttonEl, next);
    });
  }

  chrome.storage.onChanged.addListener((changes, area) => {
    if (area !== "local" || !changes.theme) return;
    applyThemeAttribute(changes.theme.newValue);
    updateToggleButton(buttonEl, changes.theme.newValue);
  });

  return theme;
}
