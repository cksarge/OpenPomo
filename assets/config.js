// Single place to set the Chrome Web Store listing URL once OpenTomato is
// published there. Every "Add to Chrome" button on the site (marked with
// data-store-link) reads from this one value — just paste the URL below and
// both pages update automatically, no need to hunt through the HTML.

window.OPENTOMATO_CHROME_STORE_URL = ""; // e.g. "https://chromewebstore.google.com/detail/xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx"

document.addEventListener("DOMContentLoaded", function () {
  var url = window.OPENTOMATO_CHROME_STORE_URL;
  if (!url) return; // still unset — leave the placeholder buttons as-is

  document.querySelectorAll("[data-store-link]").forEach(function (el) {
    el.href = url;
    el.target = "_blank";
    el.rel = "noopener";
  });
});
