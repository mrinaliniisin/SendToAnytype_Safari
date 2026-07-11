# Send to Anytype

A Safari Web Extension that lets you click images and text blocks on any
webpage and clip them into your local [Anytype](https://anytype.io) as a new
object via the Anytype Local API (`http://localhost:31009`).

## Flow

1. Click the **Send to Anytype** toolbar icon on any page.
2. The page enters edit mode — cursor turns into a crosshair and a small
   floating panel appears in the bottom-right.
3. Click any image or text block to toggle its selection (a blue ✓ overlays
   selected items). Click again to deselect.
4. First run only: open the gear (⚙) and **Pair with Anytype** — Anytype
   shows a 4-digit code; type it back into the panel to mint an API key.
5. Pick the target **Space** and object **Type** (defaults to *Page*).
6. Click **Send to Anytype**. The selection is saved as a new object whose
   body is the selected text + images as Markdown, with a link back to the
   source page.

## Files

- `manifest.json` — Manifest V3. Uses an `action` toolbar button, a
  `service_worker` background script, `host_permissions` for the two
  localhost endpoints, and the `scripting` permission for on-click injection.
- `background.js` — the sole Anytype Local API client. Listens for the
  toolbar click and injects `edit-mode.js`; proxies every API call (pairing
  challenge + key exchange, list spaces, list types, create object) so the
  content script never has to fetch `http://localhost` itself (which an HTTPS
  page can't, due to mixed-content + CORS). Persists the API key and the
  chosen space/type in `chrome.storage.local`.
- `edit-mode.js` — the in-page UI. Installs a transparent click-shield layer
  over the page so selections never race with the host page's own click
  handlers, mounts a Shadow-DOM panel for the controls, and drives the
  pairing / space / type flow.
- `icons/` — toolbar and app icons (placeholders inherited from the project
  scaffold; replace with an Anytype-appropriate mark, see `BACKLOG.md`).
- `BACKLOG.md` — captured improvements not yet implemented.

## Authentication

The Anytype Local API requires a Bearer API key, obtained via a two-step
pairing handshake:

1. `POST /v1/auth/challenges` `{ "app_name": "..." }` → `{ challenge_id }`.
   Anytype shows a 4-digit code in a desktop dialog.
2. `POST /v1/auth/api_keys` `{ challenge_id, code }` → `{ api_key }`.

All authenticated requests send `Authorization: Bearer <key>` and an
`Anytype-Version` header (date-versioned API).

## Load in Safari (development)

The extension lives inside the `Send to Anytype.xcodeproj` Xcode project at
the repo root.

1. Open `Send to Anytype.xcodeproj`, select the **Send to Anytype (macOS)**
   scheme, press ⌘R.
2. Enable **Safari → Develop → Allow Unsigned Extensions** (resets each
   Safari launch; only needed for local un-notarized builds).
3. Toggle **Send to Anytype** on under **Safari → Settings → Extensions**.

Make sure the Anytype desktop app is running, then click the toolbar icon.
After editing files in this folder, rebuild in Xcode (⌘R) and reload the
page. See the repo-root `README.md` for full build/install docs.
