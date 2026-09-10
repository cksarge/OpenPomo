// OpenTomato browser demo.
//
// A standalone browser version of the extension's Pomodoro timer: same phase
// state machine, same durations, same alert tones, same phase-end banner, and
// the tab title shows the time remaining. It is only a demo — tasks, site
// blocking, Restrictive Mode, and focus stats all live in the extension.
//
// If the OpenTomato extension is installed and new enough to ship the page
// bridge (v1.1.0+), this page links up with it: the timer state mirrors the
// extension's, and Start/Pause/Reset/Skip here drive the extension too (and
// vice-versa). Without the bridge it runs entirely on its own.

(function () {
  "use strict";

  // ---- constants (mirrors extension/common/constants.js) --------------------

  var PHASE = { WORK: "work", REST: "rest", LONG_BREAK: "longBreak" };
  var STATUS = { IDLE: "idle", RUNNING: "running", PAUSED: "paused" };
  var PHASE_LABELS = { work: "Focus", rest: "Short Break", longBreak: "Long Break" };

  var DEFAULT_SETTINGS = {
    workMinutes: 25,
    restMinutes: 5,
    cyclesBeforeLongBreak: 4,
    longBreakMinutes: 15,
    warningEnabled: true,
    warningSeconds: 30,
    soundOnEnd: true,
    soundOnWarning: true,
    // Web-only: desktop notifications need an explicit browser permission, so
    // unlike the extension they're opt-in here.
    notificationsEnabled: false,
  };

  var DEFAULT_STATE = {
    status: STATUS.IDLE,
    phase: PHASE.WORK,
    cycleCount: 0,
    phaseEndTime: null,
    remainingMsWhenPaused: null,
  };

  var LS_STATE = "opentomato:web:timerState";
  var LS_SETTINGS = "opentomato:web:settings";

  // Fields the extension bridge will accept from this page.
  var SYNCED_SETTING_KEYS = [
    "workMinutes",
    "restMinutes",
    "cyclesBeforeLongBreak",
    "longBreakMinutes",
    "warningEnabled",
    "warningSeconds",
    "soundOnEnd",
    "soundOnWarning",
  ];

  // ---- pure helpers (mirrors common/duration.js + common/phases.js) ---------

  function minutesToMs(m) {
    return Math.max(0, Math.round(Number(m) * 60 * 1000));
  }

  function durationMsForPhase(phase, s) {
    if (phase === PHASE.REST) return minutesToMs(s.restMinutes);
    if (phase === PHASE.LONG_BREAK) return minutesToMs(s.longBreakMinutes);
    return minutesToMs(s.workMinutes);
  }

  function formatTime(ms) {
    var total = Math.max(0, Math.ceil(ms / 1000));
    var m = Math.floor(total / 60);
    var sec = total % 60;
    return m + ":" + String(sec).padStart(2, "0");
  }

  function getNextPhase(phase, cycleCount, cyclesBeforeLongBreak) {
    if (phase === PHASE.WORK) {
      var n = cycleCount + 1;
      return n >= cyclesBeforeLongBreak
        ? { phase: PHASE.LONG_BREAK, cycleCount: n }
        : { phase: PHASE.REST, cycleCount: n };
    }
    if (phase === PHASE.REST) return { phase: PHASE.WORK, cycleCount: cycleCount };
    return { phase: PHASE.WORK, cycleCount: 0 };
  }

  // ---- alert tones (mirrors extension/offscreen/offscreen.js) ---------------

  var audioCtx = null;

  function ensureAudio() {
    if (!audioCtx) {
      var Ctx = window.AudioContext || window.webkitAudioContext;
      if (!Ctx) return null;
      audioCtx = new Ctx();
    }
    if (audioCtx.state === "suspended") audioCtx.resume();
    return audioCtx;
  }

  function tone(opts) {
    var ctx = audioCtx;
    if (!ctx) return;
    var gain = opts.gain == null ? 0.2 : opts.gain;
    var osc = ctx.createOscillator();
    var g = ctx.createGain();
    osc.type = "sine";
    osc.frequency.value = opts.frequency;
    var start = ctx.currentTime + opts.startAt;
    var end = start + opts.duration;
    g.gain.setValueAtTime(0, start);
    g.gain.linearRampToValueAtTime(gain, start + 0.02);
    g.gain.linearRampToValueAtTime(0, end);
    osc.connect(g).connect(ctx.destination);
    osc.start(start);
    osc.stop(end + 0.02);
  }

  function playEndChime() {
    if (!ensureAudio()) return;
    tone({ frequency: 587.33, startAt: 0, duration: 0.18 });
    tone({ frequency: 783.99, startAt: 0.16, duration: 0.28 });
  }

  function playWarningBeep() {
    if (!ensureAudio()) return;
    tone({ frequency: 880, startAt: 0, duration: 0.12, gain: 0.15 });
    tone({ frequency: 880, startAt: 0.18, duration: 0.12, gain: 0.15 });
  }

  // ---- desktop notifications ----------------------------------------------

  function notificationsSupported() {
    return typeof window.Notification !== "undefined";
  }

  function requestNotifyPermission() {
    if (!notificationsSupported()) return Promise.resolve("denied");
    try {
      return Promise.resolve(Notification.requestPermission());
    } catch (e) {
      return Promise.resolve("denied");
    }
  }

  function notify(title, body) {
    if (synced) return; // the extension shows its own banners while connected
    if (!settings.notificationsEnabled) return;
    if (!notificationsSupported() || Notification.permission !== "granted") return;
    try {
      new Notification(title, { body: body, icon: "assets/icon128.png", tag: "opentomato" });
    } catch (e) {
      /* some browsers throw for non-persistent notifications; ignore */
    }
  }

  // ---- storage ----------------------------------------------------------

  function loadJSON(key, fallback) {
    try {
      var raw = localStorage.getItem(key);
      if (!raw) return Object.assign({}, fallback);
      return Object.assign({}, fallback, JSON.parse(raw));
    } catch (e) {
      return Object.assign({}, fallback);
    }
  }

  function saveJSON(key, value) {
    try {
      localStorage.setItem(key, JSON.stringify(value));
    } catch (e) {
      /* private mode / storage full — nothing we can do */
    }
  }

  var settings = loadJSON(LS_SETTINGS, DEFAULT_SETTINGS);
  var state = loadJSON(LS_STATE, DEFAULT_STATE);
  var warnedForPhaseEndTime = null;

  function persistState() {
    if (!synced) saveJSON(LS_STATE, state);
  }
  function persistSettings() {
    saveJSON(LS_SETTINGS, settings);
  }

  // ---- standalone timer engine ------------------------------------------

  function now() {
    return Date.now();
  }

  function currentRemainingMs() {
    if (state.status === STATUS.RUNNING && state.phaseEndTime) {
      return Math.max(0, state.phaseEndTime - now());
    }
    if (state.status === STATUS.PAUSED) {
      return Math.max(0, state.remainingMsWhenPaused || 0);
    }
    return durationMsForPhase(state.phase, settings);
  }

  // If the tab was closed mid-session, fast-forward (silently) to where the
  // timer would be now.
  function catchUp() {
    if (state.status !== STATUS.RUNNING || !state.phaseEndTime) return;
    var guard = 0;
    while (state.phaseEndTime <= now() && guard++ < 1000) {
      var next = getNextPhase(state.phase, state.cycleCount, settings.cyclesBeforeLongBreak);
      state.phase = next.phase;
      state.cycleCount = next.cycleCount;
      state.phaseEndTime = state.phaseEndTime + durationMsForPhase(next.phase, settings);
      warnedForPhaseEndTime = null;
    }
    persistState();
  }

  function advance(announce) {
    var finished = state.phase;
    var next = getNextPhase(state.phase, state.cycleCount, settings.cyclesBeforeLongBreak);
    state = {
      status: STATUS.RUNNING,
      phase: next.phase,
      cycleCount: next.cycleCount,
      phaseEndTime: now() + durationMsForPhase(next.phase, settings),
      remainingMsWhenPaused: null,
    };
    warnedForPhaseEndTime = null;
    persistState();
    if (announce) {
      notify("OpenTomato", PHASE_LABELS[finished] + " finished. Starting: " + PHASE_LABELS[next.phase] + ".");
      if (settings.soundOnEnd) playEndChime();
    }
    render();
  }

  function localStart() {
    ensureAudio();
    state = {
      status: STATUS.RUNNING,
      phase: PHASE.WORK,
      cycleCount: 0,
      phaseEndTime: now() + durationMsForPhase(PHASE.WORK, settings),
      remainingMsWhenPaused: null,
    };
    warnedForPhaseEndTime = null;
    persistState();
    render();
  }

  function localPause() {
    if (state.status !== STATUS.RUNNING) return;
    state.remainingMsWhenPaused = Math.max(0, state.phaseEndTime - now());
    state.status = STATUS.PAUSED;
    state.phaseEndTime = null;
    persistState();
    render();
  }

  function localResume() {
    if (state.status !== STATUS.PAUSED) return;
    ensureAudio();
    var remaining = state.remainingMsWhenPaused;
    if (remaining == null) remaining = durationMsForPhase(state.phase, settings);
    state.status = STATUS.RUNNING;
    state.phaseEndTime = now() + remaining;
    state.remainingMsWhenPaused = null;
    persistState();
    render();
  }

  function localReset() {
    state = Object.assign({}, DEFAULT_STATE);
    warnedForPhaseEndTime = null;
    persistState();
    render();
  }

  function localSkip() {
    if (state.status === STATUS.IDLE) return;
    advance(false);
  }

  function tickStandalone() {
    if (state.status === STATUS.RUNNING && state.phaseEndTime) {
      var remaining = state.phaseEndTime - now();
      if (
        settings.warningEnabled &&
        settings.warningSeconds > 0 &&
        warnedForPhaseEndTime !== state.phaseEndTime &&
        remaining > 0 &&
        remaining <= settings.warningSeconds * 1000
      ) {
        warnedForPhaseEndTime = state.phaseEndTime;
        if (settings.soundOnWarning) playWarningBeep();
        notify("OpenTomato", settings.warningSeconds + "s left in " + PHASE_LABELS[state.phase] + ".");
      }
      if (remaining <= 0) advance(true);
    }
  }

  // ---- extension bridge (synced mode) ---------------------------------------

  var synced = false;
  var extVersion = null;
  var lastExtContact = 0;
  var msgId = 0;
  var pending = {};
  var helloTimer = null;
  var pollTimer = null;

  function postToExt(type, extra) {
    var id = ++msgId;
    var m = { source: "opentomato-web", type: type, id: id };
    if (extra) {
      for (var k in extra) if (Object.prototype.hasOwnProperty.call(extra, k)) m[k] = extra[k];
    }
    window.postMessage(m, window.location.origin);
    return id;
  }

  window.addEventListener("message", function (event) {
    if (event.source !== window) return;
    var d = event.data;
    if (!d || d.source !== "opentomato-ext" || typeof d.type !== "string") return;

    if (d.type === "hello") {
      onExtDetected(d.version);
    } else if (d.type === "state") {
      lastExtContact = now();
      if (d.timerState) applyExtState(d.timerState);
      if (d.settings) applyExtSettings(d.settings);
    } else if (d.type === "response") {
      lastExtContact = now();
      var p = d.payload;
      if (p && p.timerState) {
        applyExtState(p.timerState);
        if (p.settings) applyExtSettings(p.settings);
      } else if (p && p.status) {
        applyExtState(p);
      }
    }
  });

  function onExtDetected(version) {
    if (synced && version === extVersion) return;
    synced = true;
    extVersion = version || null;
    lastExtContact = now();
    if (helloTimer) {
      clearInterval(helloTimer);
      helloTimer = null;
    }
    // Pull the extension's current state + settings.
    postToExt("get-state");
    if (!pollTimer) {
      pollTimer = setInterval(function () {
        postToExt("get-state");
        // The bridge went quiet — fall back to running on our own.
        if (now() - lastExtContact > 6000) dropSync();
      }, 1000);
    }
    renderCallout();
    render();
  }

  function dropSync() {
    synced = false;
    extVersion = null;
    if (pollTimer) {
      clearInterval(pollTimer);
      pollTimer = null;
    }
    // Resume standalone from whatever the extension last told us.
    warnedForPhaseEndTime = state.phaseEndTime;
    persistState();
    startHelloProbe();
    renderCallout();
    render();
  }

  function applyExtState(ts) {
    state = {
      status: ts.status || STATUS.IDLE,
      phase: ts.phase || PHASE.WORK,
      cycleCount: ts.cycleCount || 0,
      phaseEndTime: ts.phaseEndTime || null,
      remainingMsWhenPaused: ts.remainingMsWhenPaused == null ? null : ts.remainingMsWhenPaused,
    };
    render();
  }

  function applyExtSettings(s) {
    var changed = false;
    for (var i = 0; i < SYNCED_SETTING_KEYS.length; i++) {
      var k = SYNCED_SETTING_KEYS[i];
      if (s[k] != null && s[k] !== settings[k]) {
        settings[k] = s[k];
        changed = true;
      }
    }
    if (changed) {
      persistSettings();
      syncSettingsForm();
    }
  }

  function startHelloProbe() {
    if (helloTimer) return;
    var tries = 0;
    postToExt("hello");
    helloTimer = setInterval(function () {
      if (synced || tries++ > 6) {
        clearInterval(helloTimer);
        helloTimer = null;
        return;
      }
      postToExt("hello");
    }, 600);
  }

  // ---- unified actions (route to extension when synced) --------------------

  function doPrimary() {
    if (synced) {
      if (state.status === STATUS.RUNNING) postToExt("pause");
      else if (state.status === STATUS.PAUSED) postToExt("resume");
      else postToExt("start");
      return;
    }
    if (state.status === STATUS.RUNNING) localPause();
    else if (state.status === STATUS.PAUSED) localResume();
    else localStart();
  }

  function doSkip() {
    if (state.status === STATUS.IDLE) return;
    if (synced) postToExt("skip");
    else localSkip();
  }

  function doReset() {
    if (state.status === STATUS.IDLE) return;
    if (synced) postToExt("reset");
    else localReset();
  }

  // ---- DOM + rendering ----------------------------------------------------

  var RING_RADIUS = 54;
  var CIRCUMFERENCE = 2 * Math.PI * RING_RADIUS;

  var els = {};

  function phaseAttr(phase) {
    if (phase === PHASE.REST) return "rest";
    if (phase === PHASE.LONG_BREAK) return "long-break";
    return "work";
  }

  function render() {
    if (!els.card) return;
    var phase = state.phase;
    var status = state.status;

    els.card.dataset.phase = phaseAttr(phase);

    var suffix = status === STATUS.PAUSED ? " · Paused" : status === STATUS.IDLE ? " · Ready" : "";
    els.phaseLabel.textContent = PHASE_LABELS[phase] + suffix;

    var totalMs = durationMsForPhase(phase, settings);
    var remainingMs;
    if (status === STATUS.RUNNING && state.phaseEndTime) remainingMs = Math.max(0, state.phaseEndTime - now());
    else if (status === STATUS.PAUSED) remainingMs = state.remainingMsWhenPaused == null ? totalMs : state.remainingMsWhenPaused;
    else remainingMs = totalMs;

    els.time.textContent = formatTime(remainingMs);

    var frac = totalMs > 0 ? remainingMs / totalMs : 0;
    els.ring.style.strokeDasharray = String(CIRCUMFERENCE);
    els.ring.style.strokeDashoffset = String(CIRCUMFERENCE * (1 - frac));

    els.dots.innerHTML = "";
    var cycles = settings.cyclesBeforeLongBreak;
    for (var i = 0; i < cycles; i++) {
      var dot = document.createElement("span");
      var filled = phase === PHASE.LONG_BREAK || i < state.cycleCount;
      var active = phase === PHASE.WORK && i === state.cycleCount;
      dot.className = "dot" + (filled ? " filled" : "") + (active ? " active" : "");
      els.dots.appendChild(dot);
    }

    els.primaryBtn.textContent =
      status === STATUS.RUNNING ? "Pause" : status === STATUS.PAUSED ? "Resume" : "Start";

    var isActive = status !== STATUS.IDLE;
    els.skipBtn.disabled = !isActive;
    els.resetBtn.disabled = !isActive;

    updateTitle(remainingMs);
  }

  function updateTitle(remainingMs) {
    if (state.status === STATUS.RUNNING || state.status === STATUS.PAUSED) {
      var pausedTag = state.status === STATUS.PAUSED ? " (paused)" : "";
      document.title = formatTime(remainingMs) + pausedTag + " · " + PHASE_LABELS[state.phase] + " · OpenTomato";
    } else {
      document.title = "Demo · OpenTomato";
    }
  }

  function renderCallout() {
    if (!els.callout) return;
    if (synced) {
      els.callout.className = "app-callout is-synced";
      els.callout.innerHTML =
        '<strong>Synced with the OpenTomato extension' +
        (extVersion ? " v" + escapeHtml(extVersion) : "") +
        ".</strong> " +
        "Start, pause, skip, and reset from here or the extension — both stay in step. " +
        "Tasks, site blocking, Restrictive Mode, and focus stats are in the extension’s settings.";
    } else {
      els.callout.className = "app-callout";
      els.callout.innerHTML =
        '<p class="app-callout-title"><strong>This is just the demo.</strong> ' +
        "The full version is the free OpenTomato Chrome extension:</p>" +
        '<ul class="app-callout-list">' +
        "<li><strong>Tasks</strong> — a checklist that rides along in the toolbar popup</li>" +
        "<li><strong>Site blocking</strong> — blacklist or whitelist sites during focus sessions</li>" +
        "<li><strong>Restrictive Mode</strong> — lock the timer and your site list for the whole session</li>" +
        "<li><strong>Focus stats</strong> — how much you've actually focused, by hour / day / week / month</li>" +
        "<li><strong>Toolbar countdown</strong> — minutes remaining on the extension icon</li>" +
        "<li><strong>Sync</strong> — drive your real timer from this page</li>" +
        "</ul>" +
        '<a class="btn btn-primary app-callout-link" data-store-link href="https://github.com/cksarge/OpenTomato">Get the extension</a>';
      applyStoreLink();
    }
  }

  function escapeHtml(s) {
    return String(s).replace(/[&<>"']/g, function (c) {
      return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c];
    });
  }

  // config.js only rewrites [data-store-link] elements present at DOMContentLoaded;
  // the callout link is rebuilt later, so re-apply the store URL if it's set.
  function applyStoreLink() {
    var url = window.OPENTOMATO_CHROME_STORE_URL;
    if (!url) return;
    var link = els.callout && els.callout.querySelector("[data-store-link]");
    if (link) {
      link.href = url;
      link.target = "_blank";
      link.rel = "noopener";
    }
  }

  // ---- settings form ---------------------------------------------------

  function clampInt(v, min, max, fallback) {
    var n = Number(v);
    if (!isFinite(n)) return fallback;
    return Math.min(max, Math.max(min, Math.round(n)));
  }

  var FIELD_BOUNDS = {
    workMinutes: [1, 180],
    restMinutes: [1, 60],
    cyclesBeforeLongBreak: [1, 12],
    longBreakMinutes: [1, 120],
    warningSeconds: [5, 120],
  };

  function syncSettingsForm() {
    if (!els.form) return;
    els.f.workMinutes.value = settings.workMinutes;
    els.f.restMinutes.value = settings.restMinutes;
    els.f.cyclesBeforeLongBreak.value = settings.cyclesBeforeLongBreak;
    els.f.longBreakMinutes.value = settings.longBreakMinutes;
    els.f.soundOnEnd.checked = !!settings.soundOnEnd;
    els.f.warningEnabled.checked = !!settings.warningEnabled;
    els.f.soundOnWarning.checked = !!settings.soundOnWarning;
    els.f.warningSeconds.value = settings.warningSeconds;
    els.warningDetail.hidden = !settings.warningEnabled;

    if (els.f.notificationsEnabled) {
      els.f.notificationsEnabled.checked = !!settings.notificationsEnabled && notifyGranted();
    }
    els.notifyRow.hidden = synced || !notificationsSupported();
    els.notifySyncedNote.hidden = !synced;
  }

  function notifyGranted() {
    return notificationsSupported() && Notification.permission === "granted";
  }

  function pushSettings() {
    persistSettings();
    if (synced) {
      var payload = {};
      for (var i = 0; i < SYNCED_SETTING_KEYS.length; i++) {
        payload[SYNCED_SETTING_KEYS[i]] = settings[SYNCED_SETTING_KEYS[i]];
      }
      postToExt("set-settings", { settings: payload });
    }
    render();
    flashSaved();
  }

  var savedTimer = null;
  function flashSaved() {
    if (!els.saved) return;
    els.saved.classList.add("visible");
    clearTimeout(savedTimer);
    savedTimer = setTimeout(function () {
      els.saved.classList.remove("visible");
    }, 1100);
  }

  function readNumberInto(key, inputEl) {
    var b = FIELD_BOUNDS[key];
    settings[key] = clampInt(inputEl.value, b[0], b[1], settings[key]);
    inputEl.value = settings[key];
  }

  function wireForm() {
    ["workMinutes", "restMinutes", "cyclesBeforeLongBreak", "longBreakMinutes", "warningSeconds"].forEach(
      function (key) {
        els.f[key].addEventListener("change", function () {
          readNumberInto(key, els.f[key]);
          pushSettings();
        });
      }
    );

    els.f.soundOnEnd.addEventListener("change", function () {
      settings.soundOnEnd = els.f.soundOnEnd.checked;
      pushSettings();
    });
    els.f.soundOnWarning.addEventListener("change", function () {
      settings.soundOnWarning = els.f.soundOnWarning.checked;
      pushSettings();
    });
    els.f.warningEnabled.addEventListener("change", function () {
      settings.warningEnabled = els.f.warningEnabled.checked;
      els.warningDetail.hidden = !settings.warningEnabled;
      pushSettings();
    });

    if (els.f.notificationsEnabled) {
      els.f.notificationsEnabled.addEventListener("change", function () {
        if (els.f.notificationsEnabled.checked) {
          requestNotifyPermission().then(function (perm) {
            settings.notificationsEnabled = perm === "granted";
            els.f.notificationsEnabled.checked = settings.notificationsEnabled;
            if (perm === "denied") els.notifyHint.hidden = false;
            pushSettings();
          });
        } else {
          settings.notificationsEnabled = false;
          pushSettings();
        }
      });
    }
  }

  // ---- boot ----------------------------------------------------------

  function cacheEls() {
    els.card = document.getElementById("timer-card");
    els.phaseLabel = document.getElementById("phase-label");
    els.time = document.getElementById("time-display");
    els.ring = document.getElementById("ring-progress");
    els.dots = document.getElementById("cycle-dots");
    els.primaryBtn = document.getElementById("primary-btn");
    els.skipBtn = document.getElementById("skip-btn");
    els.resetBtn = document.getElementById("reset-btn");
    els.callout = document.getElementById("ext-callout");
    els.form = document.getElementById("settings-form");
    els.warningDetail = document.getElementById("warning-detail");
    els.saved = document.getElementById("saved-indicator");
    els.notifyRow = document.getElementById("notify-row");
    els.notifyHint = document.getElementById("notify-hint");
    els.notifySyncedNote = document.getElementById("notify-synced-note");
    els.f = {
      workMinutes: document.getElementById("workMinutes"),
      restMinutes: document.getElementById("restMinutes"),
      cyclesBeforeLongBreak: document.getElementById("cyclesBeforeLongBreak"),
      longBreakMinutes: document.getElementById("longBreakMinutes"),
      soundOnEnd: document.getElementById("soundOnEnd"),
      warningEnabled: document.getElementById("warningEnabled"),
      soundOnWarning: document.getElementById("soundOnWarning"),
      warningSeconds: document.getElementById("warningSeconds"),
      notificationsEnabled: document.getElementById("notificationsEnabled"),
    };
  }

  function boot() {
    cacheEls();

    catchUp();
    warnedForPhaseEndTime = state.phaseEndTime;

    els.primaryBtn.addEventListener("click", doPrimary);
    els.skipBtn.addEventListener("click", doSkip);
    els.resetBtn.addEventListener("click", doReset);

    wireForm();
    syncSettingsForm();
    renderCallout();
    render();

    setInterval(function () {
      if (!synced) tickStandalone();
      render();
    }, 250);

    // Look for the extension bridge.
    startHelloProbe();
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", boot);
  } else {
    boot();
  }
})();
