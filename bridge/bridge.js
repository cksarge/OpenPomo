// Presence beacon for the OpenTomato demo page
// (https://cksarge.github.io/OpenTomato/). Its ONLY job is to tell that page
// the extension is installed, and its version, so the page can point the user
// at the extension's own settings.
//
// It does not read or write any data, does not touch the timer or settings,
// and runs on no other site (scoped by the content_scripts match in
// manifest.json). If the demo page is never opened, it does nothing.

(function () {
  "use strict";

  var ORIGIN = window.location.origin;

  function version() {
    try {
      return chrome.runtime.getManifest().version;
    } catch (e) {
      return null;
    }
  }

  function announce() {
    try {
      window.postMessage({ source: "opentomato-ext", type: "hello", version: version() }, ORIGIN);
    } catch (e) {
      /* page went away */
    }
  }

  // Announce on load, and again whenever the page asks (it may have missed the
  // first one before its listener was attached).
  announce();

  window.addEventListener("message", function (event) {
    if (event.source !== window) return;
    var d = event.data;
    if (d && d.source === "opentomato-web" && d.type === "hello") announce();
  });
})();
