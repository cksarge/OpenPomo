// Dark/light theme toggle shared by index.html and privacy.html.
//
// Preference is 'system' (default, follows prefers-color-scheme), 'light',
// or 'dark', stored in localStorage. This file is loaded as a plain,
// render-blocking <script> early in <head> so the theme is applied to <html>
// before first paint — no flash of the wrong theme.

(function () {
  var STORAGE_KEY = "openpomo-theme";
  var ORDER = ["system", "light", "dark"];
  // Small solid-fill icons instead of emoji, so the toggle looks consistent
  // across platforms/fonts.
  var ICONS = {
    system:
      '<svg viewBox="0 0 24 24" width="16" height="16" aria-hidden="true">' +
      '<rect x="2" y="4" width="20" height="13" rx="2" fill="currentColor" />' +
      '<rect x="9.5" y="19" width="5" height="1.6" rx="0.8" fill="currentColor" />' +
      "</svg>",
    light:
      '<svg viewBox="0 0 24 24" width="16" height="16" aria-hidden="true">' +
      '<circle cx="12" cy="12" r="4.5" fill="currentColor" />' +
      '<g fill="currentColor">' +
      '<rect x="11" y="1" width="2" height="4" rx="1" />' +
      '<rect x="11" y="19" width="2" height="4" rx="1" />' +
      '<rect x="1" y="11" width="4" height="2" rx="1" />' +
      '<rect x="19" y="11" width="4" height="2" rx="1" />' +
      '<rect x="4.2" y="4.2" width="2" height="4" rx="1" transform="rotate(-45 5.2 6.2)" />' +
      '<rect x="17.8" y="4.2" width="2" height="4" rx="1" transform="rotate(45 18.8 6.2)" />' +
      '<rect x="4.2" y="15.8" width="2" height="4" rx="1" transform="rotate(45 5.2 17.8)" />' +
      '<rect x="17.8" y="15.8" width="2" height="4" rx="1" transform="rotate(-45 18.8 17.8)" />' +
      "</g>" +
      "</svg>",
    dark:
      '<svg viewBox="0 0 24 24" width="16" height="16" aria-hidden="true">' +
      '<path fill="currentColor" d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79Z" />' +
      "</svg>",
  };
  var LABELS = { system: "Matching system", light: "Light", dark: "Dark" };

  function getStored() {
    try {
      return localStorage.getItem(STORAGE_KEY) || "system";
    } catch (err) {
      return "system"; // private browsing / storage disabled
    }
  }

  function setStored(value) {
    try {
      localStorage.setItem(STORAGE_KEY, value);
    } catch (err) {
      /* ignore — nothing we can do if storage is unavailable */
    }
  }

  function apply(theme) {
    var root = document.documentElement;
    if (theme === "light" || theme === "dark") {
      root.setAttribute("data-theme", theme);
    } else {
      root.removeAttribute("data-theme");
    }
  }

  function updateButton(btn, theme) {
    if (!btn) return;
    btn.innerHTML = ICONS[theme] || ICONS.system;
    var label = "Theme: " + (LABELS[theme] || LABELS.system) + " (click to change)";
    btn.title = label;
    btn.setAttribute("aria-label", label);
  }

  function wireToggle() {
    var btn = document.getElementById("theme-toggle-btn");
    var theme = getStored();
    updateButton(btn, theme);
    if (!btn) return;
    btn.addEventListener("click", function () {
      var current = getStored();
      var next = ORDER[(ORDER.indexOf(current) + 1) % ORDER.length];
      setStored(next);
      apply(next);
      updateButton(btn, next);
    });
  }

  // Apply immediately so the page never paints in the wrong theme.
  apply(getStored());

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", wireToggle);
  } else {
    wireToggle();
  }
})();
