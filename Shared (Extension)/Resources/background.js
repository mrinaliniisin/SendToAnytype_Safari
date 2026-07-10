// Send to Anytype — background script (MV3 service worker).
//
// Two responsibilities:
//   1. When the toolbar icon is clicked, inject edit-mode.js into the active
//      tab. The content script handles the page-takeover UI itself; this
//      script just kicks it off.
//   2. Be the sole client of the Anytype Local API. Content scripts run in the
//      host page's origin — on an HTTPS page they can't fetch http://localhost
//      (mixed content) and would hit CORS even if they could. This worker runs
//      in the extension origin with host_permissions for localhost, so its
//      fetches are exempt from both. Every Anytype call (pair, list spaces,
//      list types, create object) is proxied here via runtime messages.
//
// Note: as an MV3 service worker this script is ephemeral — the browser may
// terminate it when idle and restart it on the next event. Durable state (the
// API key + chosen space/type) therefore lives in chrome.storage.local, not in
// module variables. Only the in-flight pairing challenge is kept in memory,
// which is fine: it's only relevant for the ~30s pairing window.

// ── Anytype Local API ─────────────────────────────────────────────────────
// The desktop app exposes its API on 127.0.0.1:31009. We try both spellings of
// localhost so it works regardless of how the loopback resolves. The API is
// date-versioned via the Anytype-Version header; this is the version this
// extension was written against. Older versions stay supported by the app, so
// pinning a known-good date keeps us stable across app updates.
const API_BASES = [
  "http://localhost:31009",
  "http://127.0.0.1:31009",
];
const ANYTYPE_VERSION = "2025-05-20";
const APP_NAME = "Send to Anytype (Safari)";

const SETTINGS_KEY = "anytypeSettings";
const DEFAULT_SETTINGS = {
  apiKey: "",
  spaceId: "",
  spaceName: "",
  typeKey: "page",
  typeName: "Page",
  openAfterSave: false,
};

function getSettings() {
  return new Promise((resolve) => {
    chrome.storage.local.get(SETTINGS_KEY, (got) => {
      resolve({ ...DEFAULT_SETTINGS, ...((got && got[SETTINGS_KEY]) || {}) });
    });
  });
}

function patchSettings(patch) {
  return getSettings().then(
    (cur) =>
      new Promise((resolve) => {
        const next = { ...cur, ...patch };
        chrome.storage.local.set({ [SETTINGS_KEY]: next }, () => resolve(next));
      })
  );
}

// Core fetch helper. Tries each base in turn so a flaky loopback name doesn't
// take us down. `auth` adds the Bearer header; pairing endpoints set it false.
// Returns { ok, status, data, error } — never throws, so callers can branch on
// .ok without try/catch.
async function api(path, { method = "GET", body = null, auth = true } = {}) {
  const settings = await getSettings();
  if (auth && !settings.apiKey) {
    return { ok: false, status: 0, error: "Not paired with Anytype yet." };
  }

  const headers = { "Anytype-Version": ANYTYPE_VERSION };
  if (body) headers["Content-Type"] = "application/json";
  if (auth) headers["Authorization"] = `Bearer ${settings.apiKey}`;

  let lastError = null;
  for (const base of API_BASES) {
    try {
      const r = await fetch(base + path, {
        method,
        headers,
        body: body ? JSON.stringify(body) : undefined,
      });
      const text = await r.text();
      let data;
      try {
        data = text ? JSON.parse(text) : {};
      } catch {
        data = { raw: text };
      }
      if (!r.ok) {
        const msg =
          (data && (data.message || data.error)) || `HTTP ${r.status}`;
        return { ok: false, status: r.status, data, error: msg };
      }
      return { ok: true, status: r.status, data };
    } catch (e) {
      // Network-level failure (app not running, port closed) — try next base.
      lastError = e;
    }
  }
  return {
    ok: false,
    status: 0,
    error:
      "Couldn't reach Anytype. Is the desktop app running? (" +
      ((lastError && lastError.message) || "connection refused") +
      ")",
  };
}

// ── Toolbar click → inject the in-page selector ────────────────────────────
chrome.action.onClicked.addListener(async (tab) => {
  if (!tab || !tab.id) return;
  try {
    await chrome.scripting.executeScript({
      target: { tabId: tab.id },
      files: ["edit-mode.js"],
    });
  } catch (e) {
    console.error("Send to Anytype: failed to inject edit-mode.js:", e);
  }
});

// ── Message router ─────────────────────────────────────────────────────────
chrome.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
  if (!msg || !msg.type) return;
  const handlers = {
    "sta:status": () => status(),
    "sta:pairStart": () => pairStart(),
    "sta:pairComplete": () => pairComplete(msg.challengeId, msg.code),
    "sta:spaces": () => listSpaces(),
    "sta:types": () => listTypes(msg.spaceId),
    "sta:saveSettings": () =>
      patchSettings(msg.patch || {}).then(() => ({ ok: true })),
    "sta:send": () => createObject(msg.payload),
  };
  const handler = handlers[msg.type];
  if (!handler) return;
  Promise.resolve(handler())
    .then(sendResponse)
    .catch((e) => sendResponse({ ok: false, error: e && e.message }));
  return true; // keep the message channel open for the async response
});

// Snapshot of what the panel needs to render its connection state up front.
async function status() {
  const s = await getSettings();
  return {
    ok: true,
    paired: !!s.apiKey,
    spaceId: s.spaceId,
    spaceName: s.spaceName,
    typeKey: s.typeKey,
    typeName: s.typeName,
    openAfterSave: s.openAfterSave,
  };
}

// ── Pairing (two-step challenge → API key) ─────────────────────────────────
// Step 1: ask the app to start a challenge. The app pops a dialog showing a
// 4-digit code. We get back a challenge_id to pair with that code.
async function pairStart() {
  const r = await api("/v1/auth/challenges", {
    method: "POST",
    body: { app_name: APP_NAME },
    auth: false,
  });
  if (!r.ok) return r;
  const challengeId = r.data.challenge_id || r.data.challengeId;
  if (!challengeId) {
    return { ok: false, error: "Anytype didn't return a challenge id." };
  }
  return { ok: true, challengeId };
}

// Step 2: exchange the challenge_id + the code the user read off the dialog for
// a durable API key, then persist it.
async function pairComplete(challengeId, code) {
  if (!challengeId || !code) {
    return { ok: false, error: "Missing challenge or code." };
  }
  const r = await api("/v1/auth/api_keys", {
    method: "POST",
    body: { challenge_id: challengeId, code: String(code).trim() },
    auth: false,
  });
  if (!r.ok) return r;
  const apiKey = r.data.api_key || r.data.apiKey;
  if (!apiKey) return { ok: false, error: "Anytype didn't return an API key." };
  await patchSettings({ apiKey });
  return { ok: true };
}

// ── Spaces & types ─────────────────────────────────────────────────────────
async function listSpaces() {
  const r = await api("/v1/spaces");
  if (!r.ok) return r;
  const rows = r.data.data || r.data.spaces || [];
  return {
    ok: true,
    spaces: rows.map((s) => ({ id: s.id, name: s.name || s.id })),
  };
}

async function listTypes(spaceId) {
  if (!spaceId) return { ok: false, error: "Pick a space first." };
  const r = await api(`/v1/spaces/${encodeURIComponent(spaceId)}/types`);
  if (!r.ok) return r;
  const rows = r.data.data || r.data.types || [];
  // Only types we can actually create into need a type_key. Keep the ones that
  // expose a key; the panel defaults its selection to "page" when present.
  const types = rows
    .filter((t) => t.key)
    .map((t) => ({ key: t.key, name: t.name || t.key }));
  return { ok: true, types };
}

// ── Inline images ──────────────────────────────────────────────────────────
// Anytype's create-object API cannot fetch remote images. A body containing
// `![](https://…)` yields an empty, perpetually-spinning image block — the
// bytes never arrive. It DOES decode data URIs, ingesting them as real Image
// objects in the space. So we download each selected image here and swap the
// remote URL for an inline data URI.
//
// This has to happen in the service worker, not the content script: a content
// script's cross-origin fetch is blocked by CORS, whereas the worker can read
// the response because the manifest grants <all_urls> host permission.
//
// Failures are non-fatal. An image we can't fetch degrades to a plain markdown
// link (so the clip still records where it lived) instead of an empty block,
// and the rest of the object saves normally.
const IMG_MD_RE = /!\[([^\]]*)\]\((https?:\/\/[^)\s]+)\)/g;
const MAX_IMAGE_BYTES = 4 * 1024 * 1024;
const IMAGE_FETCH_TIMEOUT_MS = 15_000;

// btoa() on a multi-megabyte string overflows the call stack, so chunk it.
async function blobToDataUrl(blob) {
  const bytes = new Uint8Array(await blob.arrayBuffer());
  let binary = "";
  const CHUNK = 0x8000;
  for (let i = 0; i < bytes.length; i += CHUNK) {
    binary += String.fromCharCode.apply(null, bytes.subarray(i, i + CHUNK));
  }
  return `data:${blob.type || "image/png"};base64,${btoa(binary)}`;
}

async function fetchImageAsDataUrl(url) {
  const ctl = new AbortController();
  const timer = setTimeout(() => ctl.abort(), IMAGE_FETCH_TIMEOUT_MS);
  try {
    // credentials:"omit" — never send the user's cookies to an image host.
    const r = await fetch(url, { signal: ctl.signal, credentials: "omit" });
    if (!r.ok) throw new Error(`HTTP ${r.status}`);
    const blob = await r.blob();
    if (!/^image\//.test(blob.type)) throw new Error(`not an image (${blob.type})`);
    if (blob.size > MAX_IMAGE_BYTES) throw new Error(`too large (${blob.size}B)`);
    return await blobToDataUrl(blob);
  } finally {
    clearTimeout(timer);
  }
}

async function inlineImages(markdown) {
  if (!markdown) return markdown;
  const urls = [...new Set(Array.from(markdown.matchAll(IMG_MD_RE), (m) => m[2]))];
  if (!urls.length) return markdown;

  const resolved = new Map();
  await Promise.all(
    urls.map(async (url) => {
      try {
        resolved.set(url, await fetchImageAsDataUrl(url));
      } catch (e) {
        console.warn("Send to Anytype: couldn't inline image", url, e.message);
      }
    })
  );

  return markdown.replace(IMG_MD_RE, (_whole, alt, url) => {
    const dataUrl = resolved.get(url);
    return dataUrl ? `![${alt}](${dataUrl})` : `[${alt || "image"}](${url})`;
  });
}

// ── Create object ──────────────────────────────────────────────────────────
async function createObject(payload) {
  const s = await getSettings();
  if (!s.apiKey) return { ok: false, error: "Not paired with Anytype yet." };
  if (!s.spaceId)
    return { ok: false, error: "No target space selected. Open settings (⚙)." };

  const body = {
    name: payload.name,
    type_key: s.typeKey || "page",
    body: await inlineImages(payload.markdown),
  };
  if (payload.emoji) body.icon = { format: "emoji", emoji: payload.emoji };

  const r = await api(`/v1/spaces/${encodeURIComponent(s.spaceId)}/objects`, {
    method: "POST",
    body,
  });
  if (!r.ok) return r;

  const obj = r.data.object || r.data.data || r.data;
  const objectId = obj && (obj.id || obj.object_id);

  if (objectId && s.openAfterSave) {
    try {
      // Best-effort deep link back into the desktop app. If the scheme isn't
      // registered this just no-ops; we don't treat it as a save failure.
      chrome.tabs.create({
        url: `anytype://object?objectId=${encodeURIComponent(objectId)}&spaceId=${encodeURIComponent(s.spaceId)}`,
        active: false,
      });
    } catch (e) {
      console.error("Send to Anytype: couldn't open object deep link:", e);
    }
  }

  return { ok: true, objectId, data: r.data };
}
