# OpenTomato website

A simple, static site: a homepage (`index.html`), a browser demo (`app.html`), and a privacy
policy page (`privacy.html`) that renders one of the versioned `privacy-policy-X-Y-Z.md` files
client-side.

## Adding the Chrome Web Store link

Once OpenTomato is published, open `assets/config.js` and paste the listing URL into
`OPENTOMATO_CHROME_STORE_URL` — that one line drives every "Add to Chrome" button on the site.
Until it's set, those buttons stay inert placeholders (`href="#"`).

## Editing the privacy policy

Each extension version has its own file: `privacy-policy-1-0-0.md`, `privacy-policy-1-1-0.md`,
etc. (dots become dashes in the filename). `privacy.html` renders one of them as plain Markdown,
no build step:

- **`privacy.html`** (no fragment) renders whichever version `OPENTOMATO_PRIVACY_VERSION` in
  `assets/config.js` names — i.e. whatever's actually live on the Chrome Web Store right now.
- **`privacy.html#1.1.0`** always renders that exact version's file, regardless of what's
  currently live. This is what makes it safe to put a not-yet-published version's privacy policy
  in front of Google while it's pending review (paste that `#version` URL into the Chrome Web
  Store's privacy policy field) without changing what current users see at the plain
  `privacy.html` URL — and once it does go live, older versions stay reachable forever at their
  own `#version` URL.

To publish a new version: add its `privacy-policy-X-Y-Z.md`, then once that version actually ships,
bump `OPENTOMATO_PRIVACY_VERSION` in `assets/config.js` to match. Nothing else needs to change.

## Previewing locally

`privacy.html` uses `fetch()` to load the Markdown file, which browsers block for pages opened
directly from disk (`file://`). Serve the folder over http instead:

```sh
cd website
python3 -m http.server 8000
```

Then open <http://localhost:8000>.

## Deploying

Any static host works (GitHub Pages, Netlify, Vercel, etc.) — just point it at this folder. No
build step is required.
