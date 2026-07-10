# Send to Anytype — backlog

Things noted during development to come back to. Not blocking the current
working build.

## Tags / properties

The panel has no tag picker yet. Anytype tags are a per-type **relation
property** (multi-select), not a flat list of names, so attaching them through
the API takes more than passing an array of strings:

- Discover the chosen type's tag-like properties via
  `GET /v1/spaces/{space}/types/{type}` (or `/properties`).
- For each property, list its existing tag options; create missing ones with
  `POST /v1/spaces/{space}/properties/{property}/tags` (endpoint name TBD —
  confirm against the live API version).
- Pass selected option ids in the create-object `properties` array.

Until then the panel intentionally omits a tag picker to stay robust.

## Icons

The current icon (`icons/mark-*.png`, plus the host app's
`AppIcon.appiconset` / `LargeIcon.imageset`) is a simple placeholder: a white
"clip into tray" glyph on a charcoal `#191919` tile, matching the Anytype
logo's colour scheme. It's serviceable but not real artwork — replace it when
proper branding exists.

Note: the icon files are deliberately named `mark-*.png`, not `icon-*.png`.
Safari caches an extension's toolbar icon keyed to the resource *path* and will
not refresh it on toggle/restart/reboot, so a renamed path is the only reliable
way to force a re-render. If you ever change the icon art again, also rename
the files, or users will keep seeing the old icon.

Watch small-size legibility: the 16px toolbar variant must read on both light
and dark Safari toolbars (the white glyph carries it; consider a monochrome
template variant if this ever changes).

## Image fidelity — resolved in 1.0.1

Originally images were embedded as `![](remote-url)`. That silently **did not
work**: Anytype's create-object API never fetches remote URLs, so each image
became an empty, perpetually-spinning block. Verified against the live API —
a body of `![](anything-remote)` and `![](nonsense)` render identically.

What *does* work is a **data URI**: `![](data:image/png;base64,…)` is decoded
and ingested as a real Image object in the space (content-addressed, so
identical bytes dedupe). Anytype then rewrites the stored markdown to point at
its own local gateway, e.g. `![name](http://127.0.0.1:47800/image/<id>)`.
Note that gateway is on the port from `space.gateway_url` (47800), not the API
port (31009).

So `background.js` now downloads each selected image and inlines it as a data
URI (`inlineImages()`). This must run in the service worker — a content
script's cross-origin fetch is CORS-blocked — which is why the manifest needs
`<all_urls>` host permission. Images over 4 MB, or that fail to fetch, degrade
to a plain markdown link rather than an empty block.

There is also `POST /v1/spaces/{space}/files` (multipart, field `file`) which
uploads a file and returns `object_id`. It works, but the returned id cannot be
embedded inline in a body — so it isn't used.

## Open-after-save deep link

`createObject` opens `anytype://object?objectId=…&spaceId=…` when "open after
save" is on. Confirm this deep-link shape against the installed Anytype build;
it's best-effort and silently no-ops if the scheme isn't registered.

## Multiple objects vs. one

Currently all selected images + text become a single object. A future mode
could create one object per selected image (closer to a "save these N images"
workflow).
