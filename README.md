# Send to Anytype

**Send to Anytype** is a Safari extension that lets you click images and text on any web page and clip them straight into your local [Anytype](https://anytype.io) as a new object.

Click the toolbar icon on any page, the page enters a crosshair "edit mode", you click the images and text you want, pick the target Space and object type, and hit **Send to Anytype**. The selection becomes a new object whose body is your chosen text and images, with a link back to the source page.

## Demo

![Send to Anytype walkthrough: click the toolbar icon, select images and text, pick a Space and object type, and send the clip to your local Anytype.](docs/demo.gif)

*Illustrated walkthrough — not a screen recording.*

## About Anytype

[Anytype](https://anytype.io) is a local-first, end-to-end-encrypted, open-source workspace for notes, documents, and personal knowledge — a private, offline-first alternative to Notion, where your data lives on your own device instead of someone else's server. Send to Anytype is a companion, not a replacement: it simply gives Anytype a "clip from the web" button. Anytype is free — grab the desktop app for macOS, Windows, or Linux from the [Anytype downloads page](https://download.anytype.io/), and keep it running for the extension to have somewhere to send clips.

## How it works

- **Install** the app (below), launch it once so Safari registers the extension, then enable **Send to Anytype** under Safari → Settings → Extensions.
- **Pair** once: click the toolbar icon, open the gear (⚙), and enter the 4-digit code Anytype shows.
- **Clip**: click the icon on any page, select images and text, choose your Space and object type, and hit Send. Everything stays on your machine — the extension talks only to Anytype's local API on your own device, never to an outside server.

## Privacy

Send to Anytype keeps your data on your own machine.

- **Your clips go only to your local Anytype.** The extension talks to the Anytype Local API at `http://localhost:31009` — a loopback address on your own computer. The text, images, and source link you clip are written into your local Anytype and sent nowhere else: not to me, not to Apple, not to any third-party server. No analytics, no tracking, no account.
- **It doesn't read your notes.** To fill the Space and object-type pickers it lists your Spaces and types *by name*; it never reads the contents of your existing objects. It only ever **creates** new ones.
- **The pairing key stays local.** Pairing produces an API key stored on your device and used only to reach your local Anytype. It never leaves your machine — remove it any time with **Unpair**.
- **The only data that ever leaves** is when the extension downloads an image you selected, fetched without cookies or credentials — so it carries nothing about you.

Full policy: [PRIVACY.md](https://github.com/mrinaliniisin/SendToAnytype_Safari/blob/main/PRIVACY.md).

## Downloads

[Download for Safari](https://github.com/mrinaliniisin/SendToAnytype_Safari/releases)  
A Chrome version is coming soon.
