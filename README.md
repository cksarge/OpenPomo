# OpenPomo website

A simple, static 2-page site: a homepage (`index.html`) and a privacy policy page
(`privacy.html`) that renders `privacy-policy.md` client-side.

## Editing the privacy policy

Edit `privacy-policy.md` directly — it's plain Markdown. `privacy.html` fetches and renders it
automatically, so there's no build step.

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
