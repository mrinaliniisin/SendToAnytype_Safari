# Privacy Policy — Send to Anytype

_Last updated: 2026-07-09_

**Send to Anytype does not collect, store, transmit, or share any personal
data with the developer or any third party.** There are no analytics, no
tracking, no advertising, and no accounts.

## What the extension does with your data

Send to Anytype is a Safari extension that clips content from web pages into
**your own local [Anytype](https://anytype.io) app**. When you clip a page:

- The content you select — the page URL, page title, the text you pick, and
  the URLs of the images you pick — is sent **only** to the Anytype app
  running locally on your own device at `http://localhost:31009`.
- Nothing is sent to the developer, to Apple beyond the standard App Store
  mechanics, or to any external server. All traffic stays on your machine
  (the loopback address `localhost`).

## Why the extension asks for access to all websites

Safari asks you to grant Send to Anytype access to the websites you use. It
needs this for one reason: **to download the images you select.** Images are
usually served from a different host than the page you're reading (a CDN), so
the permission cannot be narrowed to just the site you're on.

The extension does nothing until you click its toolbar button. It does not run
in the background on pages you are merely browsing, does not read pages you
haven't chosen to clip, and never sends page content anywhere except your own
local Anytype. Image downloads are made **without cookies or credentials**, so
they cannot carry your logged-in identity to the image's host.

## The pairing key

To talk to your local Anytype, the extension performs a one-time pairing in
which Anytype shows a 4-digit code you enter into the extension. This yields
an API key that is stored **locally on your device** in the browser
extension's own storage (`chrome.storage.local`). The key never leaves your
device and is used solely to authenticate to your local Anytype. You can
remove it at any time with **Unpair** in the extension's settings.

## Data collection summary (App Store “nutrition label”)

**Data Not Collected.** The developer does not collect any data from this app.

## Contact

Questions about this policy: **mrinalini_s@icloud.com**

Source code: https://github.com/mrinaliniisin/SendToAnytype_Safari
