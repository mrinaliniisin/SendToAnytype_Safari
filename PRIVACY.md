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
