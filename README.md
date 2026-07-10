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

## Keyboard shortcut

Default: <kbd>⌥</kbd> <kbd>⇧</kbd> <kbd>A</kbd>. Change it under
**Safari → Settings → Extensions → Send to Anytype**.
