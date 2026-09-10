// Hostname normalization + blacklist/whitelist matching logic.
// Shared by the background script (both for live navigation checks and for
// sweeping already-open tabs when a work phase begins).

import { BLOCK_MODE } from "./constants.js";

// Schemes we should never intercept — internal browser pages, the extension's
// own pages, etc. Blocking these would risk breaking the browser itself.
const IGNORED_SCHEMES = [
  "chrome:",
  "chrome-extension:",
  "about:",
  "edge:",
  "devtools:",
  "view-source:",
  "file:",
];

export function shouldIgnoreUrl(url) {
  try {
    const { protocol } = new URL(url);
    return IGNORED_SCHEMES.includes(protocol);
  } catch {
    return true;
  }
}

// Normalize a user-entered list item ("https://www.Youtube.com/" -> "youtube.com").
export function normalizeEntry(raw) {
  let value = String(raw || "").trim().toLowerCase();
  if (!value) return "";
  // Allow entries pasted with a scheme.
  if (!/^[a-z]+:\/\//.test(value)) {
    value = "https://" + value;
  }
  try {
    let hostname = new URL(value).hostname;
    if (hostname.startsWith("www.")) hostname = hostname.slice(4);
    return hostname;
  } catch {
    return "";
  }
}

// True if `hostname` matches `entry` (exact match or subdomain of it).
function hostnameMatches(hostname, entry) {
  return hostname === entry || hostname.endsWith("." + entry);
}

export function matchesList(hostname, list) {
  return list.some((entry) => entry && hostnameMatches(hostname, entry));
}

// The site list that applies to the current mode. Blacklist and whitelist are
// stored separately, so only one of them is ever in effect at a time.
export function activeBlockList(settings) {
  if (settings.blockMode === BLOCK_MODE.BLACKLIST) return settings.blacklist || [];
  if (settings.blockMode === BLOCK_MODE.WHITELIST) return settings.whitelist || [];
  return [];
}

// Decide whether navigating to `url` should be blocked, given the current
// block mode and list. Only ever call this while phase === 'work'.
export function isUrlBlocked(url, blockMode, blockList) {
  if (blockMode === BLOCK_MODE.OFF) return false;
  if (shouldIgnoreUrl(url)) return false;

  let hostname;
  try {
    hostname = new URL(url).hostname.toLowerCase().replace(/^www\./, "");
  } catch {
    return false;
  }

  const isListed = matchesList(hostname, blockList);
  if (blockMode === BLOCK_MODE.BLACKLIST) return isListed;
  if (blockMode === BLOCK_MODE.WHITELIST) return !isListed;
  return false;
}
