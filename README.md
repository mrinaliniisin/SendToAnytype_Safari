# Send to Anytype

A Safari Web Extension that lets you click images and text blocks on any
webpage and clip them into your local [Anytype](https://anytype.io) as a new
object.

Click the toolbar icon on any page, the page enters a crosshair "edit mode",
you click the images and text you want, pick the target Space and object type,
and hit **Send to Anytype**. The selection is saved as a new object whose body
is the selected text plus images (as Markdown), with a link back to the source
page.

> Send to Anytype only talks to the Anytype Local API on
> `http://localhost:31009`, so it does nothing unless the Anytype desktop app
> is running locally.

---

## First run — pair with Anytype

The Anytype Local API requires a one-time pairing to mint an API key:

1. Click the **Send to Anytype** toolbar icon, then the gear (⚙) in the panel.
2. Click **Pair with Anytype…**. The Anytype desktop app pops a dialog with a
   **4-digit code**.
3. Type that code back into the panel and hit **Confirm**.

The key is stored locally (`chrome.storage.local`) and survives restarts. You
can **Unpair** any time from the same panel. After pairing, pick your target
**Space** and object **Type** (defaults to *Page*).

---

## Install (no Xcode required)

Send to Anytype is distributed two ways. Both yield the same extension; pick
whichever fits how you usually install software.

### Option A — Mac App Store *(coming soon)*
One-click install from the App Store once the listing is live.

### Option B — Direct download (notarized DMG)
1. Download the latest **`Send to Anytype-x.y.z.dmg`** from the
   [Releases](../../releases) page.
2. Open the DMG and drag **Send to Anytype.app** into your **Applications**
   folder.
3. Launch **Send to Anytype.app** once. (It's a small host app whose only job
   is to register the extension with Safari — you can quit it right after.)
4. Open **Safari → Settings → Extensions** and tick **Send to Anytype** to
   enable it. Grant it permission on the sites you want (e.g. "Always Allow on
   Every Website").
5. Make sure the Anytype desktop app is running, then click the Send to
   Anytype icon in Safari's toolbar on any page and pair (see above).

Because the DMG is signed with a Developer ID and notarized by Apple, you will
**not** need to enable "Allow Unsigned Extensions" — it just works.

### Keyboard shortcut

Default: <kbd>⌥</kbd> <kbd>⇧</kbd> <kbd>A</kbd>. Change it under
**Safari → Settings → Extensions → Send to Anytype**.

---

## How it works

| Component | Role |
|---|---|
| **Host app** (`Send to Anytype.app`) | Tiny macOS app that registers the extension with Safari. Required by Safari's extension model — there's no "load unpacked" for users. |
| `background.js` | MV3 service worker and the sole Anytype Local API client. Injects the content script on icon click and proxies all network calls — pairing, list spaces, list types, create object — to Anytype. Running the `fetch` from the extension origin avoids the mixed-content + CORS blocking that would stop an HTTPS page from reaching `http://localhost`. |
| `edit-mode.js` | The in-page UI. Installs a transparent click-shield over the page so selections never race with the host site's own click handlers, mounts a Shadow-DOM control panel, and drives the pair / space / type flow. |

The selected text becomes the new object's Markdown body, selected images are
embedded as `![](url)`, the page title becomes the object name (editable in the
panel), and a `[Source](url)` link is appended.

---

## Build it yourself (developers)

Requires Xcode and a running Anytype desktop app.

```sh
git clone <this-repo>
cd "Send to Anytype"
open "Send to Anytype.xcodeproj"
```

1. Select the **Send to Anytype (macOS)** scheme.
2. **Product → Run** (⌘R). This builds the host app + extension and launches
   the app once so Safari registers it.
3. **Safari → Develop → Allow Unsigned Extensions** (resets every Safari
   launch — only needed for locally-built, un-notarized builds).
4. **Safari → Settings → Extensions** → enable **Send to Anytype**.

Editing the web sources under `Shared (Extension)/Resources/` only needs a
rebuild (⌘R) + page reload. Changing `manifest.json` or Swift code may need a
Safari relaunch so it re-reads the manifest.

The web extension is **Manifest V3**.

### Bundle identifiers

The scaffold ships with placeholder bundle IDs under `com.sindhus.*`:

- App: `com.sindhus.sendtoanytype`
- Extension: `com.sindhus.sendtoanytype.Extension`

If you change them, update `extensionBundleIdentifier` in
`Shared (App)/ViewController.swift` to match the extension's ID exactly, or the
host app won't be able to register/query the extension.

---

## Releasing

Send to Anytype ships through two parallel channels — same source tree, two
signing pipelines:

- **[RELEASING.md](RELEASING.md)** — cut a notarized DMG for direct download
  via GitHub Releases. Uses the *Developer ID Application* certificate and
  `scripts/release.sh`.
- **[APP_STORE.md](APP_STORE.md)** — submit to the Mac App Store. Uses the
  *Apple Distribution* + *Mac Installer Distribution* certificates and the
  Transporter upload flow.

You can do either, both, or one before the other — they don't interfere.

---

## Status / known gaps

- **Tags** aren't attached yet — Anytype tags are a per-type relation property,
  which is more plumbing than a flat tag list. Tracked in
  `Shared (Extension)/Resources/BACKLOG.md`.
- **Icons** are placeholders inherited from the project scaffold.
- **Images** are embedded by URL, not uploaded into Anytype's file store.

See `BACKLOG.md` for the full list.
