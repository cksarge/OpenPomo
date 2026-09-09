// Dark/light theme toggle shared by index.html and privacy.html.
//
// Preference is 'system' (default, follows prefers-color-scheme), 'light',
// or 'dark', stored in localStorage. This file is loaded as a plain,
// render-blocking <script> early in <head> so the theme is applied to <html>
// before first paint — no flash of the wrong theme.

(function () {
  var STORAGE_KEY = "openpomo-theme";
  var ORDER = ["system", "light", "dark"];
  var ICONS = { system: "🖥️", light: "☀️", dark: "🌙" };
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
    btn.textContent = ICONS[theme] || ICONS.system;
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
