// Content-script bridge between the OpenTomato Web Timer page
// (https://cksarge.github.io/OpenTomato/) and the extension's background
// timer. It relays a small, fixed set of timer control messages between
// window.postMessage (the page) and the background service worker, and
// pushes timer-state changes back to the page so the web timer stays in
// lockstep with the extension.
//
// It deliberately does NOT expose site blocking, Restrictive Mode, or the
// "Continue anyway" bypass — only the timer's start/pause/resume/reset/skip
// and duration/notification settings.
//
// Scope is limited to the OpenTomato site by the content_scripts match in
// manifest.json. For local testing, temporarily add your dev origin (e.g.
// "http://localhost:8000/*") to that match list.

(function () {
  "use strict";

  var PAGE = "opentomato-web"; // messages coming FROM the page
  var EXT = "opentomato-ext"; // messages this bridge sends
  var ORIGIN = window.location.origin;

  // Control actions the page may forward to the background worker.
  var ALLOWED_ACTIONS = ["get-state", "start", "pause", "resume", "reset", "skip"];

  // Settings the page may change. Blocking / restrictive-mode / bypass fields
  // are never written from here.
  var SETTING_KEYS = [
    "workMinutes",
    "restMinutes",
    "cyclesBeforeLongBreak",
    "longBreakMinutes",
    "warningEnabled",
    "warningSeconds",
    "soundOnEnd",
    "soundOnWarning",
    "badgeCountdown",
  ];

  function postToPage(msg) {
    msg.source = EXT;
    try {
      window.postMessage(msg, ORIGIN);
    } catch (e) {
      /* page went away */
    }
  }

  function manifestVersion() {
    try {
      return chrome.runtime.getManifest().version;
    } catch (e) {
      return null;
    }
  }

  // Announce the bridge. The page also probes with its own "hello", so it's
  // fine if this fires before the page's listener is attached.
  postToPage({ type: "hello", version: manifestVersion() });

  window.addEventListener("message", function (event) {
    if (event.source !== window) return;
    var data = event.data;
    if (!data || data.source !== PAGE || typeof data.type !== "string") return;

    if (data.type === "hello") {
      postToPage({ type: "hello", version: manifestVersion() });
      return;
    }

    if (data.type === "set-settings" && data.settings && typeof data.settings === "object") {
      chrome.storage.local.get("settings", function (cur) {
        var next = Object.assign({}, cur && cur.settings ? cur.settings : {});
        for (var i = 0; i < SETTING_KEYS.length; i++) {
          var k = SETTING_KEYS[i];
          if (Object.prototype.hasOwnProperty.call(data.settings, k)) next[k] = data.settings[k];
        }
        chrome.runtime.sendMessage({ type: "opentomato:save-settings", settings: next }, function (res) {
          void chrome.runtime.lastError;
          postToPage({ type: "response", id: data.id, payload: { ok: !!(res && res.ok) } });
        });
      });
      return;
    }

    if (ALLOWED_ACTIONS.indexOf(data.type) !== -1) {
      chrome.runtime.sendMessage({ type: "opentomato:" + data.type }, function (res) {
        void chrome.runtime.lastError;
        postToPage({ type: "response", id: data.id, payload: res });
      });
    }
  });

  // Push live timer state to the page whenever the background updates storage
  // (phase change, start/pause/reset from the popup, settings edits, etc.).
  chrome.storage.onChanged.addListener(function (changes, area) {
    if (area !== "local") return;
    if (!changes.timerState && !changes.settings) return;
    chrome.storage.local.get(["timerState", "settings"], function (all) {
      postToPage({
        type: "state",
        timerState: all.timerState || null,
        settings: all.settings || null,
      });
    });
  });
})();
