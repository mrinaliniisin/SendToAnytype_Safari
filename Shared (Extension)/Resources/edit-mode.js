// Send to Anytype — edit-mode content script.
//
// Injected into the active tab when the user clicks the toolbar icon.
// Takes over the page: clicks on images and text blocks toggle their
// selection (with checkmark overlays), and a floating panel lets the user
// pick a target Space + object Type and save everything to Anytype as a new
// object. Clicking the icon again while edit mode is active exits it.
//
// All Anytype network calls go through the background service worker (see
// background.js) — the content script never talks to localhost directly.

(() => {
  // Idempotent toggle: re-injecting while active just exits.
  if (window.__staEditModeActive) {
    window.__staEditModeActive.exit();
    return;
  }

  const NS = "__sta";
  const ZMAX = 2147483647;

  // ── State ──────────────────────────────────────────────────────────────
  const state = {
    images: new Map(), // src → { src, el, overlayEl, repositioner }
    texts: [], // [{ el, snippet, overlayEl, repositioner }]
    paired: false,
    challengeId: null,
  };

  // ── Floating panel (Shadow DOM) ────────────────────────────────────────
  const hostEl = document.createElement("div");
  hostEl.id = `${NS}-host`;
  hostEl.style.cssText = `all: initial; position: fixed; top: 0; left: 0; width: 0; height: 0; z-index: ${ZMAX};`;
  document.documentElement.appendChild(hostEl);
  const shadow = hostEl.attachShadow({ mode: "closed" });

  const PANEL_CSS = `
    *, *::before, *::after { box-sizing: border-box; }
    .panel {
      position: fixed; bottom: 20px; right: 20px; width: 320px;
      max-height: min(80vh, 640px); overflow-y: auto;
      background: rgba(255, 255, 255, 0.72);
      -webkit-backdrop-filter: saturate(1.6) blur(24px);
      backdrop-filter: saturate(1.6) blur(24px);
      border: 1px solid rgba(255, 255, 255, 0.6);
      border-radius: 12px;
      box-shadow: 0 12px 32px rgba(0,0,0,0.25);
      font-family: -apple-system, BlinkMacSystemFont, "SF Pro Text", system-ui, sans-serif;
      font-size: 13px; color: #1d1d1f; padding: 14px 16px;
      pointer-events: auto;
    }
    header { display: flex; align-items: baseline; gap: 8px; margin-bottom: 8px; }
    .title { font-size: 16px; font-weight: 600; }
    .subtitle { font-size: 11px; color: #888; }
    .icon-btn {
      background: transparent; border: 0; cursor: pointer;
      color: #888; padding: 0 4px; line-height: 1;
    }
    .icon-btn:hover { color: #1d1d1f; }
    .gear { margin-left: auto; font-size: 16px; }
    .close { font-size: 22px; }

    .banner {
      display: none;
      border-radius: 7px; padding: 8px 10px; margin-bottom: 10px;
      font-size: 12px; line-height: 1.4;
    }
    .banner.show { display: block; }
    .banner.warn { background: #fff7e0; color: #6b4f00; border: 1px solid #e6c65c; }
    .banner a { color: #0071e3; text-decoration: none; cursor: pointer; }
    .banner a:hover { text-decoration: underline; }

    .settings {
      display: none;
      border: 1px solid #e5e5ea; border-radius: 6px;
      background: rgba(255, 255, 255, 0.5);
      padding: 10px; margin-bottom: 10px; font-size: 12px;
    }
    .settings.open { display: block; }
    .settings label { display: flex; align-items: center; gap: 8px; cursor: pointer; }
    .settings input[type=checkbox] { margin: 0; }
    .settings-title {
      font-size: 11px; font-weight: 600; color: #555;
      text-transform: uppercase; letter-spacing: 0.04em;
      margin-bottom: 6px;
    }
    .settings-note { font-size: 12px; color: #444; line-height: 1.4; }
    .settings-note a { color: #0071e3; text-decoration: none; }
    .settings-note a:hover { text-decoration: underline; }
    .settings-divider { height: 1px; background: #e5e5ea; margin: 10px 0; }

    .conn-state { font-size: 12px; margin-bottom: 8px; }
    .conn-state .dot { display: inline-block; width: 8px; height: 8px; border-radius: 50%; margin-right: 5px; vertical-align: middle; }
    .dot.on { background: #1c7c2e; }
    .dot.off { background: #b3261e; }

    kbd {
      display: inline-block; padding: 1px 5px;
      font: inherit; font-size: 11px;
      background: rgba(0,0,0,0.06);
      border: 1px solid rgba(0,0,0,0.1);
      border-radius: 4px; color: #333;
    }
    .kbd-hint { font-size: 11px; color: #888; text-align: center; margin-top: 8px; }
    .hint { font-size: 11px; color: #777; margin-bottom: 10px; line-height: 1.4; }
    .counts { font-size: 12px; color: #555; margin-bottom: 10px; }
    .field { display: flex; flex-direction: column; gap: 4px; margin-bottom: 10px; }
    .field-label {
      font-size: 11px; font-weight: 600; color: #555;
      text-transform: uppercase; letter-spacing: 0.04em;
    }
    .hint-sm { font-weight: 400; text-transform: none; letter-spacing: 0; color: #999; }
    input[type=text], select {
      font: inherit; padding: 7px 9px;
      border: 1px solid #d2d2d7; border-radius: 6px;
      background: #fff; color: #1d1d1f; width: 100%;
    }
    input[type=text]:focus, select:focus {
      outline: none; border-color: #0071e3;
      box-shadow: 0 0 0 3px rgba(0, 113, 227, 0.15);
    }
    .row { display: flex; gap: 6px; }
    .row > * { flex: 1; }
    button.secondary {
      padding: 7px 10px; background: #fff; color: #0071e3;
      border: 1px solid #0071e3; border-radius: 6px;
      font-size: 12px; font-weight: 500; cursor: pointer;
    }
    button.secondary:disabled { opacity: 0.5; cursor: not-allowed; }
    .actions { margin-top: 4px; }
    button.primary {
      width: 100%; padding: 9px 12px;
      background: #0071e3; color: #fff; border: 0; border-radius: 7px;
      font-size: 14px; font-weight: 500; cursor: pointer;
    }
    button.primary:disabled { opacity: 0.5; cursor: not-allowed; }
    .status { font-size: 12px; min-height: 16px; text-align: center; margin-top: 8px; }
    .status.ok { color: #1c7c2e; }
    .status.warn { color: #8a5a00; line-height: 1.35; }
    .status.err { color: #b3261e; }
    .mini-status { font-size: 11px; color: #777; margin-top: 6px; min-height: 14px; }
    .mini-status.err { color: #b3261e; }
  `;

  shadow.innerHTML = `
    <style>${PANEL_CSS}</style>
    <div class="panel" id="panel">
      <header>
        <span class="title">Send to Anytype</span>
        <span class="subtitle" id="target-sub"></span>
        <button class="icon-btn gear" id="gear" title="Settings" aria-label="Settings">⚙</button>
        <button class="icon-btn close" id="close" title="Cancel" aria-label="Cancel">×</button>
      </header>

      <div class="banner warn" id="banner">
        Not connected to Anytype.
        <a id="banner-pair">Pair now →</a>
      </div>

      <div class="settings" id="settings">
        <div class="settings-title">Connection</div>
        <div class="conn-state" id="conn-state"></div>
        <div id="pair-block">
          <button class="secondary" id="pair-start" style="width:100%;">Pair with Anytype…</button>
          <div id="code-block" style="display:none; margin-top:8px;">
            <div class="settings-note" style="margin-bottom:6px;">
              Anytype is showing a 4-digit code. Type it here:
            </div>
            <div class="row">
              <input type="text" id="pair-code" inputmode="numeric" maxlength="4" placeholder="1234">
              <button class="secondary" id="pair-confirm" style="flex:0 0 auto;">Confirm</button>
            </div>
          </div>
          <div class="mini-status" id="pair-status"></div>
        </div>
        <div id="paired-block" style="display:none;">
          <button class="secondary" id="unpair" style="width:100%;">Unpair</button>
        </div>

        <div class="settings-divider"></div>

        <div class="settings-title">Destination</div>
        <div class="field" style="margin-bottom:8px;">
          <span class="field-label">Space</span>
          <select id="space"><option>Loading…</option></select>
        </div>
        <div class="field" style="margin-bottom:0;">
          <span class="field-label">Object type</span>
          <select id="type"><option>Loading…</option></select>
        </div>

        <div class="settings-divider"></div>

        <div class="settings-title">Behavior</div>
        <label>
          <input type="checkbox" id="opt-open">
          Open the new object in Anytype after saving
        </label>

        <div class="settings-divider"></div>

        <div class="settings-title">Keyboard shortcut</div>
        <div class="settings-note">
          Default: <kbd>⌥</kbd>+<kbd>⇧</kbd>+<kbd>A</kbd>. Change in
          Safari → Settings → Extensions → Send to Anytype.
        </div>

        <div class="settings-divider"></div>

        <div class="settings-title">About</div>
        <div class="settings-note">
          Send to Anytype v<span id="about-version">…</span> — clip selected
          page content into your local Anytype.
        </div>

        <div class="settings-divider"></div>

        <div class="settings-title">Contact &amp; Support</div>
        <div class="settings-note">
          write to <a href="mailto:mrinalini_s@icloud.com">mrinalini_s@icloud.com</a>
        </div>
      </div>

      <div class="hint">
        Click any image or text block on the page to select it.
        Click again to deselect.
      </div>

      <div class="counts">
        <span id="img-count">0 images</span> ·
        <span id="text-count">0 text blocks</span>
      </div>

      <div class="field">
        <span class="field-label">Title <span class="hint-sm">name of the new object</span></span>
        <input type="text" id="obj-title" placeholder="Page title">
      </div>

      <div class="field">
        <span class="field-label">Icon <span class="hint-sm">optional emoji</span></span>
        <input type="text" id="obj-emoji" maxlength="4" placeholder="🔖" style="width:64px;">
      </div>

      <div class="actions">
        <button id="send" class="primary">Send to Anytype</button>
      </div>

      <div id="status" class="status"></div>

      <div class="kbd-hint">
        <kbd>↵</kbd> Send &nbsp;·&nbsp; <kbd>Esc</kbd> Cancel
      </div>
    </div>
  `;

  const $ = (sel) => shadow.getElementById(sel);
  const panelEl = $("panel");
  const sendBtn = $("send");
  const statusEl = $("status");
  const imgCountEl = $("img-count");
  const textCountEl = $("text-count");
  const titleInput = $("obj-title");
  const emojiInput = $("obj-emoji");
  const targetSub = $("target-sub");

  // Populate the About section's version from the manifest so it stays in
  // lockstep with the canonical version field.
  try {
    $("about-version").textContent = chrome.runtime.getManifest().version;
  } catch (_) {
    $("about-version").textContent = "?";
  }

  // Default the title to the page title; the user can override.
  titleInput.value = (document.title || "").slice(0, 256);

  // Stop our own panel inputs from triggering the page-takeover click handler.
  panelEl.addEventListener("click", (e) => e.stopPropagation());

  // ── Messaging helper ─────────────────────────────────────────────────────
  // Promisified runtime.sendMessage so the async flows below read top-to-bottom
  // instead of nesting callbacks. Rejects on a runtime error (e.g. the worker
  // didn't respond) so callers can surface "couldn't reach the extension".
  function send(message) {
    return new Promise((resolve, reject) => {
      try {
        chrome.runtime.sendMessage(message, (resp) => {
          const err = chrome.runtime.lastError;
          if (err) return reject(new Error(err.message));
          resolve(resp || {});
        });
      } catch (e) {
        reject(e);
      }
    });
  }

  // ── Settings panel wiring ────────────────────────────────────────────────
  const settingsEl = $("settings");
  const bannerEl = $("banner");
  const gearBtn = $("gear");
  const connStateEl = $("conn-state");
  const pairBlock = $("pair-block");
  const pairedBlock = $("paired-block");
  const pairStartBtn = $("pair-start");
  const codeBlock = $("code-block");
  const pairCodeInput = $("pair-code");
  const pairConfirmBtn = $("pair-confirm");
  const pairStatusEl = $("pair-status");
  const spaceSelect = $("space");
  const typeSelect = $("type");
  const openInput = $("opt-open");

  function openSettings() {
    settingsEl.classList.add("open");
  }
  gearBtn.addEventListener("click", (ev) => {
    ev.stopPropagation();
    settingsEl.classList.toggle("open");
  });
  $("banner-pair").addEventListener("click", (ev) => {
    ev.stopPropagation();
    openSettings();
    pairStartBtn.click();
  });

  // Keystrokes inside panel inputs must not bubble out and trip the page-level
  // Enter-to-send / Esc-to-cancel shortcuts.
  [titleInput, emojiInput, pairCodeInput].forEach((el) =>
    el.addEventListener("keydown", (ev) => ev.stopPropagation())
  );

  function setPairStatus(msg, isErr = false) {
    pairStatusEl.textContent = msg;
    pairStatusEl.className = `mini-status${isErr ? " err" : ""}`;
  }

  function renderConnection() {
    if (state.paired) {
      connStateEl.innerHTML = `<span class="dot on"></span>Connected to Anytype`;
      pairBlock.style.display = "none";
      pairedBlock.style.display = "block";
      bannerEl.classList.remove("show");
    } else {
      connStateEl.innerHTML = `<span class="dot off"></span>Not connected`;
      pairBlock.style.display = "block";
      pairedBlock.style.display = "none";
      bannerEl.classList.add("show");
    }
  }

  // Pair step 1 — start the challenge. The app pops a dialog with a 4-digit
  // code; we reveal the code input so the user can type it back.
  pairStartBtn.addEventListener("click", async (ev) => {
    ev.stopPropagation();
    pairStartBtn.disabled = true;
    setPairStatus("Asking Anytype for a code…");
    try {
      const r = await send({ type: "sta:pairStart" });
      if (!r.ok) {
        setPairStatus(r.error || "Couldn't start pairing.", true);
        pairStartBtn.disabled = false;
        return;
      }
      state.challengeId = r.challengeId;
      codeBlock.style.display = "block";
      setPairStatus("Enter the 4-digit code shown in Anytype.");
      pairCodeInput.focus();
    } catch (e) {
      setPairStatus("Couldn't reach the extension: " + e.message, true);
      pairStartBtn.disabled = false;
    }
  });

  // Pair step 2 — exchange the code for an API key.
  async function confirmCode() {
    const code = pairCodeInput.value.trim();
    if (!/^\d{4}$/.test(code)) {
      setPairStatus("Enter the 4 digits from the Anytype dialog.", true);
      return;
    }
    pairConfirmBtn.disabled = true;
    setPairStatus("Verifying…");
    try {
      const r = await send({
        type: "sta:pairComplete",
        challengeId: state.challengeId,
        code,
      });
      if (!r.ok) {
        setPairStatus(r.error || "Pairing failed.", true);
        pairConfirmBtn.disabled = false;
        return;
      }
      state.paired = true;
      renderConnection();
      setPairStatus("");
      await loadSpaces();
      refreshSendEnabled();
    } catch (e) {
      setPairStatus("Couldn't reach the extension: " + e.message, true);
      pairConfirmBtn.disabled = false;
    }
  }
  pairConfirmBtn.addEventListener("click", (ev) => {
    ev.stopPropagation();
    confirmCode();
  });
  pairCodeInput.addEventListener("keydown", (ev) => {
    ev.stopPropagation();
    if (ev.key === "Enter") {
      ev.preventDefault();
      confirmCode();
    }
  });

  $("unpair").addEventListener("click", async (ev) => {
    ev.stopPropagation();
    await send({ type: "sta:saveSettings", patch: { apiKey: "" } });
    state.paired = false;
    state.challengeId = null;
    pairStartBtn.disabled = false;
    codeBlock.style.display = "none";
    pairCodeInput.value = "";
    setPairStatus("");
    renderConnection();
    refreshSendEnabled();
  });

  // ── Space / type pickers ─────────────────────────────────────────────────
  function fillSelect(sel, items, valueKey, labelKey, selectedValue) {
    sel.innerHTML = "";
    if (!items.length) {
      const o = document.createElement("option");
      o.textContent = "(none found)";
      o.value = "";
      sel.appendChild(o);
      return;
    }
    items.forEach((it) => {
      const o = document.createElement("option");
      o.value = it[valueKey];
      o.textContent = it[labelKey];
      if (it[valueKey] === selectedValue) o.selected = true;
      sel.appendChild(o);
    });
  }

  async function loadSpaces() {
    spaceSelect.innerHTML = `<option>Loading…</option>`;
    const st = await send({ type: "sta:status" });
    const r = await send({ type: "sta:spaces" });
    if (!r.ok) {
      spaceSelect.innerHTML = `<option value="">${r.error || "couldn't load"}</option>`;
      return;
    }
    let chosen = st.spaceId;
    if (!chosen && r.spaces[0]) {
      // Default to the first space and persist it so the next send has a target.
      chosen = r.spaces[0].id;
      await send({
        type: "sta:saveSettings",
        patch: { spaceId: chosen, spaceName: r.spaces[0].name },
      });
    }
    fillSelect(spaceSelect, r.spaces, "id", "name", chosen);
    await loadTypes(chosen);
    updateTargetSub();
  }

  async function loadTypes(spaceId) {
    if (!spaceId) return;
    typeSelect.innerHTML = `<option>Loading…</option>`;
    const st = await send({ type: "sta:status" });
    const r = await send({ type: "sta:types", spaceId });
    if (!r.ok) {
      typeSelect.innerHTML = `<option value="page">Page</option>`;
      return;
    }
    // Prefer the previously-chosen type; else default to "page" if available.
    let chosen = st.typeKey;
    if (!r.types.some((t) => t.key === chosen)) {
      chosen = r.types.some((t) => t.key === "page") ? "page" : (r.types[0] && r.types[0].key);
    }
    fillSelect(typeSelect, r.types, "key", "name", chosen);
    const sel = r.types.find((t) => t.key === chosen);
    if (sel) {
      await send({
        type: "sta:saveSettings",
        patch: { typeKey: sel.key, typeName: sel.name },
      });
    }
    updateTargetSub();
  }

  spaceSelect.addEventListener("change", async (ev) => {
    ev.stopPropagation();
    const id = spaceSelect.value;
    const name = spaceSelect.selectedOptions[0]?.textContent || "";
    await send({ type: "sta:saveSettings", patch: { spaceId: id, spaceName: name } });
    await loadTypes(id);
    updateTargetSub();
  });
  typeSelect.addEventListener("change", async (ev) => {
    ev.stopPropagation();
    const key = typeSelect.value;
    const name = typeSelect.selectedOptions[0]?.textContent || "";
    await send({ type: "sta:saveSettings", patch: { typeKey: key, typeName: name } });
    updateTargetSub();
  });
  openInput.addEventListener("change", (ev) => {
    ev.stopPropagation();
    send({ type: "sta:saveSettings", patch: { openAfterSave: openInput.checked } });
  });

  function updateTargetSub() {
    const space = spaceSelect.selectedOptions[0]?.textContent;
    const type = typeSelect.selectedOptions[0]?.textContent;
    targetSub.textContent =
      state.paired && space ? `→ ${type || "Page"} in ${space}` : "";
  }

  // ── Page-level visual styles ───────────────────────────────────────────
  const pageStyle = document.createElement("style");
  pageStyle.id = `${NS}-page-style`;
  pageStyle.textContent = `
    .${NS}-selected {
      outline: 3px solid #0071e3 !important;
      outline-offset: 2px;
      box-shadow: 0 0 0 3px rgba(0,113,227,0.3) !important;
    }
    .${NS}-selected-text {
      background: rgba(0, 113, 227, 0.12) !important;
      outline: 2px solid #0071e3 !important;
      outline-offset: 2px;
    }
    .${NS}-overlay {
      position: absolute;
      width: 24px; height: 24px;
      background: #0071e3; color: #fff;
      border-radius: 50%;
      font-family: -apple-system, BlinkMacSystemFont, sans-serif;
      font-size: 16px; font-weight: 700;
      display: flex; align-items: center; justify-content: center;
      box-shadow: 0 2px 6px rgba(0,0,0,0.25);
      pointer-events: none;
      z-index: ${ZMAX - 1};
    }
  `;
  document.documentElement.appendChild(pageStyle);

  // ── Click shield (the bulletproof selection layer) ─────────────────────
  //
  // Some sites install capture-phase click handlers on document that call
  // stopImmediatePropagation, which would silence our own listeners. The fix:
  // a transparent full-viewport div in front of the page. Clicks land on it,
  // not the page — no event race to win. We use elementFromPoint to figure out
  // what was visually under the cursor. Wheel events are forwarded so the page
  // still scrolls while edit mode is active.
  const shieldEl = document.createElement("div");
  shieldEl.id = `${NS}-shield`;
  shieldEl.style.cssText = `
    position: fixed; inset: 0;
    z-index: ${ZMAX - 3};
    background: transparent;
    cursor: crosshair;
  `;
  document.documentElement.appendChild(shieldEl);

  function findUnderShield(x, y) {
    shieldEl.style.pointerEvents = "none";
    const el = document.elementFromPoint(x, y);
    shieldEl.style.pointerEvents = "auto";
    return el;
  }

  function handleSelect(e) {
    e.preventDefault();
    e.stopPropagation();

    // Image detection takes priority: scan the full DOM stack at the click
    // coordinate so we catch images that are siblings of overlay divs.
    const found = findClickedImageAt(e.clientX, e.clientY);
    if (found) {
      toggleImage(found.el, found.src);
      return;
    }

    // Fall back to text-block selection.
    const t = findUnderShield(e.clientX, e.clientY);
    if (!t) return;
    const block = nearestTextBlock(t);
    if (block) toggleText(block);
  }

  // Image detection — uses elementsFromPoint to get the entire layered hit-test
  // stack at (x, y), then scans for an <img> with a real src or any element
  // with a CSS background-image. Covers <img>, background-image divs, and the
  // <img>+overlay-sibling pattern.
  function findClickedImageAt(x, y) {
    shieldEl.style.pointerEvents = "none";
    const stack = document.elementsFromPoint
      ? document.elementsFromPoint(x, y)
      : [document.elementFromPoint(x, y)].filter(Boolean);
    shieldEl.style.pointerEvents = "auto";

    for (const el of stack) {
      if (!el || el.nodeType !== 1) continue;
      if (el === hostEl || (hostEl.contains && hostEl.contains(el))) continue;

      if (el.tagName === "IMG" && (el.currentSrc || el.src)) {
        return { el, src: el.currentSrc || el.src };
      }

      const bg = (window.getComputedStyle(el).backgroundImage || "").trim();
      if (bg && bg !== "none") {
        const m = bg.match(/url\(["']?([^"')]+)["']?\)/);
        if (m && m[1]) {
          try {
            const abs = new URL(m[1], document.baseURI).href;
            if (/^https?:|^data:/i.test(abs)) return { el, src: abs };
          } catch (_) {}
        }
      }
    }

    if (stack[0]) {
      const imgUp = stack[0].closest && stack[0].closest("img");
      if (imgUp && (imgUp.currentSrc || imgUp.src)) {
        return { el: imgUp, src: imgUp.currentSrc || imgUp.src };
      }
      const inner = stack[0].querySelectorAll && stack[0].querySelectorAll("img");
      if (inner) {
        for (const im of inner) {
          const r = im.getBoundingClientRect();
          if (r.width > 40 && r.height > 40 && (im.currentSrc || im.src)) {
            return { el: im, src: im.currentSrc || im.src };
          }
        }
      }
    }

    return null;
  }

  shieldEl.addEventListener("click", handleSelect);
  shieldEl.addEventListener("contextmenu", handleSelect);

  // Keyboard shortcuts while edit mode is active:
  //   Enter  → Send to Anytype
  //   Escape → exit edit mode
  function isTextEntryTarget(t) {
    if (!t) return false;
    if (t === hostEl) return true;
    const tag = (t.tagName || "").toLowerCase();
    if (tag === "input" || tag === "textarea" || tag === "select") return true;
    if (t.isContentEditable) return true;
    return false;
  }
  function onKeyDown(e) {
    if (isTextEntryTarget(e.target)) return;
    if (e.key === "Escape") {
      e.preventDefault();
      e.stopPropagation();
      exit();
    } else if (e.key === "Enter") {
      e.preventDefault();
      e.stopPropagation();
      sendBtn.click();
    }
  }
  document.addEventListener("keydown", onKeyDown, true);

  // Allow scrolling: forward wheel events to the page.
  shieldEl.addEventListener(
    "wheel",
    (e) => {
      e.preventDefault();
      window.scrollBy({ top: e.deltaY, left: e.deltaX, behavior: "auto" });
    },
    { passive: false }
  );

  function nearestTextBlock(el) {
    const TAGS = new Set([
      "p", "h1", "h2", "h3", "h4", "h5", "h6",
      "li", "blockquote", "figcaption",
      "dt", "dd", "td", "th",
      "span", "a", "label",
    ]);
    let cur = el;
    while (cur && cur !== document.body && cur !== document.documentElement) {
      if (cur.nodeType === 1) {
        const tag = cur.tagName.toLowerCase();
        if (TAGS.has(tag)) {
          const txt = (cur.textContent || "").trim();
          if (txt.length >= 2) return cur;
        }
      }
      cur = cur.parentElement;
    }
    return null;
  }

  // ── Selection toggles ──────────────────────────────────────────────────
  function toggleImage(el, src) {
    if (!src) return;
    if (state.images.has(src)) {
      const entry = state.images.get(src);
      cleanupOverlay(entry);
      entry.el.classList.remove(`${NS}-selected`);
      state.images.delete(src);
    } else {
      el.classList.add(`${NS}-selected`);
      const overlayEl = makeCheckmark();
      const repositioner = positionOverlayOver(overlayEl, el);
      document.body.appendChild(overlayEl);
      state.images.set(src, { src, el, overlayEl, repositioner });
    }
    refreshCounts();
    refreshSendEnabled();
  }

  function toggleText(el) {
    const idx = state.texts.findIndex((t) => t.el === el);
    if (idx >= 0) {
      const entry = state.texts[idx];
      cleanupOverlay(entry);
      el.classList.remove(`${NS}-selected-text`);
      state.texts.splice(idx, 1);
    } else {
      el.classList.add(`${NS}-selected-text`);
      const overlayEl = makeCheckmark();
      const repositioner = positionOverlayOver(overlayEl, el);
      document.body.appendChild(overlayEl);
      state.texts.push({
        el,
        snippet: (el.textContent || "").trim(),
        overlayEl,
        repositioner,
      });
    }
    refreshCounts();
    refreshSendEnabled();
  }

  function makeCheckmark() {
    const o = document.createElement("div");
    o.className = `${NS}-overlay`;
    o.textContent = "✓";
    return o;
  }

  function positionOverlayOver(overlay, target) {
    const place = () => {
      const rect = target.getBoundingClientRect();
      overlay.style.left = `${rect.left + window.scrollX + 6}px`;
      overlay.style.top = `${rect.top + window.scrollY + 6}px`;
    };
    place();
    const onScroll = () => place();
    const onResize = () => place();
    window.addEventListener("scroll", onScroll, true);
    window.addEventListener("resize", onResize);
    return () => {
      window.removeEventListener("scroll", onScroll, true);
      window.removeEventListener("resize", onResize);
    };
  }

  function cleanupOverlay(entry) {
    if (entry.repositioner) entry.repositioner();
    if (entry.overlayEl && entry.overlayEl.parentNode) {
      entry.overlayEl.parentNode.removeChild(entry.overlayEl);
    }
  }

  function refreshCounts() {
    imgCountEl.textContent = `${state.images.size} image${state.images.size === 1 ? "" : "s"}`;
    textCountEl.textContent = `${state.texts.length} text block${state.texts.length === 1 ? "" : "s"}`;
  }

  function refreshSendEnabled() {
    const hasSelection = state.images.size > 0 || state.texts.length > 0;
    sendBtn.disabled = !state.paired || !hasSelection;
    sendBtn.textContent = state.paired ? "Send to Anytype" : "Pair with Anytype first";
  }

  // ── Build the Markdown body from the selection ───────────────────────────
  function buildMarkdown() {
    const parts = [];
    const text = state.texts.map((t) => t.snippet).filter(Boolean).join("\n\n");
    if (text) parts.push(text);
    const imgs = Array.from(state.images.keys());
    if (imgs.length) parts.push(imgs.map((src) => `![](${src})`).join("\n\n"));
    parts.push(`---\n\n[Source](${location.href})`);
    return parts.join("\n\n");
  }

  // ── Send ───────────────────────────────────────────────────────────────
  function setStatus(msg, kind = "") {
    statusEl.textContent = msg;
    statusEl.className = `status${kind ? " " + kind : ""}`;
  }

  sendBtn.addEventListener("click", async (ev) => {
    ev.stopPropagation();
    if (!state.paired) {
      setStatus("Pair with Anytype first (open ⚙).", "err");
      openSettings();
      return;
    }
    if (state.images.size === 0 && state.texts.length === 0) {
      setStatus("Pick at least one image or text block first.", "err");
      return;
    }
    sendBtn.disabled = true;
    setStatus("Saving…");

    const firstText = state.texts[0] && state.texts[0].snippet;
    const name = (
      titleInput.value.trim() ||
      firstText ||
      document.title ||
      "Untitled"
    ).slice(0, 256);

    const emoji = (emojiInput.value || "").trim();
    const payload = { name, markdown: buildMarkdown(), emoji: emoji || null };

    try {
      const r = await send({ type: "sta:send", payload });
      if (r && r.ok) {
        // The object saved, but parts of it may have quietly degraded. Say so
        // instead of flashing a clean checkmark over a partial result.
        const notes = [];
        if (r.imagesFailed > 0) {
          notes.push(
            `${r.imagesFailed}/${r.imagesTotal} image${r.imagesTotal === 1 ? "" : "s"} couldn't be downloaded — saved as links`
          );
        }
        if (r.deepLinkFailed) notes.push("couldn't open it in Anytype");

        if (notes.length) {
          setStatus("Saved ✓ — " + notes.join("; "), "warn");
          setTimeout(exit, 3200);
        } else {
          setStatus("Saved to Anytype ✓", "ok");
          setTimeout(exit, 800);
        }
      } else {
        setStatus("Failed: " + ((r && r.error) || "unknown error"), "err");
        refreshSendEnabled();
      }
    } catch (e) {
      setStatus("Couldn't reach the extension: " + e.message, "err");
      refreshSendEnabled();
    }
  });

  // ── Exit ───────────────────────────────────────────────────────────────
  $("close").addEventListener("click", (ev) => {
    ev.stopPropagation();
    exit();
  });

  function exit() {
    document.removeEventListener("keydown", onKeyDown, true);
    state.images.forEach((entry) => {
      cleanupOverlay(entry);
      entry.el.classList.remove(`${NS}-selected`);
    });
    state.texts.forEach((entry) => {
      cleanupOverlay(entry);
      entry.el.classList.remove(`${NS}-selected-text`);
    });
    pageStyle.remove();
    shieldEl.remove();
    hostEl.remove();
    delete window.__staEditModeActive;
  }

  state.exit = exit;
  window.__staEditModeActive = state;

  // ── Boot ───────────────────────────────────────────────────────────────
  refreshCounts();
  refreshSendEnabled();

  // Pull connection state up front. If paired, populate the space/type pickers
  // and pre-check the "open after save" box; otherwise nudge the user to pair.
  (async () => {
    try {
      const st = await send({ type: "sta:status" });
      state.paired = !!st.paired;
      openInput.checked = !!st.openAfterSave;
      renderConnection();
      refreshSendEnabled();
      if (state.paired) {
        await loadSpaces();
      } else {
        openSettings();
      }
    } catch (e) {
      setStatus("Couldn't reach the extension: " + e.message, "err");
    }
  })();
})();
