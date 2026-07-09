# App Store listing assets — Send to Anytype

Copy-paste-ready copy for the App Store Connect listing (macOS). Character
limits are Apple's; drafts here are within them. Pair this with the build from
`scripts/appstore.sh` and the reviewer notes below.

---

## App name (max 30 chars — must be unique across the store)
Primary choice:

> **Send to Anytype** (15)

If taken, fallbacks:
> Send to Anytype – Web Clipper (29)
> Anytype Web Clipper (19)

## Subtitle (max 30 chars)
> Clip the web into Anytype (25)

## Promotional text (max 170 chars — editable anytime without review)
> Clip images and text from any web page straight into your local Anytype —
> pick the Space and type, and it's saved with a link back to the source.

## Description
> Send to Anytype is a Safari extension that clips content from any web page
> into your own local Anytype app.
>
> Click the toolbar button on any page and it enters a crosshair "edit mode":
> click the images and text blocks you want, pick which Anytype Space and
> object type to save into, and hit Send. The selection becomes a new object
> whose body is the text and images you chose, with a link back to the source
> page.
>
> Everything stays on your device. Send to Anytype talks only to the Anytype
> app running locally on your Mac — nothing is sent to any external server,
> and there is no tracking, no analytics, and no account.
>
> REQUIREMENTS
> • The Anytype desktop app (free — anytype.io) installed and running.
> • A one-time pairing: Anytype shows a 4-digit code you enter once to
>   authorize local access.
>
> HOW IT WORKS
> • Click the toolbar icon on any page to start clipping.
> • Select any mix of images and text blocks.
> • Choose the target Space and object type (e.g. Page).
> • Send — the new object opens in Anytype.
>
> Send to Anytype is open source: https://github.com/mrinaliniisin/SendToAnytype_Safari

## Keywords (max 100 chars, comma-separated, no spaces)
> anytype,web clipper,clipper,save,bookmark,notes,research,knowledge,local-first,safari extension

## URLs
- **Support URL:** https://github.com/mrinaliniisin/SendToAnytype_Safari
- **Marketing URL** (optional): https://anytype.io
- **Privacy Policy URL:** host `PRIVACY.md` and use its public URL. Easiest:
  push it to the repo and use
  `https://github.com/mrinaliniisin/SendToAnytype_Safari/blob/main/PRIVACY.md`
  (a rendered GitHub page is accepted). For a cleaner page, enable GitHub
  Pages and link the rendered file.

## Category
- Primary: **Productivity** (matches `LSApplicationCategoryType` in the build)
- Secondary: (optional) Utilities

## Age rating
- **4+** (no objectionable content)

## Copyright
> © 2026 Sindhu S

---

## App Privacy ("nutrition label") answers
When App Store Connect asks about data collection, select:

- **Data Not Collected** — the app collects no data.

Rationale (for your own reference): everything the user clips is sent only to
their own `localhost` Anytype instance; the pairing key is stored locally; the
developer receives nothing. See `PRIVACY.md`.

---

## App Review notes — paste into App Store Connect → App Review Information
(This is the critical mitigation for the "app requires external software"
rejection. Also attach the demo video described in APP_STORE.md §8.)

> Send to Anytype is a companion Safari extension for Anytype
> (https://anytype.io), a local-first notes and knowledge app the user runs on
> their own Mac. Anytype exposes a local API at http://localhost:31009.
> Send to Anytype lets the user click images and text on any web page and clip
> them into their local Anytype as a new object (e.g. a Page), with a link
> back to the source page.
>
> Two things make full end-to-end testing on Apple's review VM impossible:
> (1) it requires the Anytype desktop app to be running locally, and (2) a
> one-time pairing in which Anytype displays a 4-digit code the user types
> into the extension to authorize local API access. Please refer to the
> attached screen recording, which walks through the full flow on a Mac with
> Anytype running and paired.
>
> The extension itself is fully functional in isolation: clicking the toolbar
> icon opens the in-page selection UI immediately regardless of Anytype's
> status, and it shows a clear "can't reach Anytype — pair first" state when
> the server is absent or unpaired. So the app's purpose and UI are
> demonstrable without the backend.
>
> The app does not collect any data. All clipped content is sent only to the
> user's own localhost Anytype instance; nothing is transmitted to us or any
> third party.

---

## Screenshots to capture (macOS: 1280×800 or 1440×900, 1–10 images)
1. Toolbar button + the in-page selection panel open on a normal web page.
2. Several images/text blocks selected (checkmark overlays visible).
3. The Space / object-type picker in the panel.
4. The resulting object open in the Anytype desktop app.
5. (Optional) The pairing panel with the 4-digit code prompt.
