# Privacy Policy

**Effective date:** September 8, 2026

OpenTomato is built around a simple rule: nothing about how you use it ever leaves your device.
This page explains exactly what that means.

## The short version

- OpenTomato does not collect, transmit, sell, or share any data — ever.
- There are no accounts, no sign-ups, and no servers operated by OpenTomato.
- There is no analytics, advertising, or tracking of any kind, from us or from any third party.
- Everything the extension needs to work — your timer settings, your blocked/allowed site lists,
  and your current timer state — is stored locally in your browser using the standard
  `chrome.storage.local` API, and is never sent anywhere.
- OpenTomato is open source. You (or anyone) can read the full source code to verify all of this
  directly: [github.com/cksarge/OpenTomato](https://github.com/cksarge/OpenTomato).

## What information OpenTomato stores, and where

OpenTomato stores the following, only in your browser's local extension storage:

- **Timer settings** — your focus/break durations, how many focus sessions happen before a long
  break, and your sound/notification preferences.
- **Site lists** — the domains you've chosen to blacklist or whitelist during focus sessions.
- **Timer state** — the current phase (focus, short break, long break), whether the timer is
  running, and how much time is left.

None of this is synced to a remote server, included in any analytics payload, or accessible to
anyone but you on your own device. Uninstalling the extension removes this data along with it.

## Permissions OpenTomato requests, and why

Chrome extensions must declare the permissions they use. Here's what OpenTomato requests and what
each one is for:

| Permission | Why OpenTomato needs it |
| --- | --- |
| `storage` | To save your settings and timer state locally on your device. |
| `alarms` | To keep the timer accurate even when the extension's background process is asleep. |
| `webNavigation` | To check, locally, whether a page you're navigating to matches your blacklist/whitelist during a focus session. |
| `tabs` | To redirect a tab to OpenTomato's own "blocked" page when a site is off-limits during a focus session. |
| `notifications` | To show a desktop notification when a session or break ends. |
| `offscreen` | To play a short alert sound, since background service workers can't play audio directly. |
| Host permissions (all sites) | Required by `webNavigation`/`tabs` above, so blocking can be checked against any site you choose to add to your list — no page content is ever read or transmitted. |

None of these permissions are used to read, collect, or transmit the content of the pages you
visit — OpenTomato only ever compares a page's domain against the list you configured yourself, and
that comparison happens entirely on your device.

## Third parties

OpenTomato does not use any third-party services, SDKs, analytics providers, or advertising
networks inside the extension itself. This website (the page you're reading right now) is a
static site and does not set tracking cookies or run analytics either.

## Changes to this policy

If this policy changes, the updated version will be published at this same URL with a new
effective date above.

## Contact

Questions about this policy or the project can be opened as an issue on GitHub: [github.com/cksarge/OpenTomato](https://github.com/cksarge/OpenTomato)
