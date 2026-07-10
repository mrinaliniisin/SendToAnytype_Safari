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

## Image fidelity

Images are embedded into the Markdown body as `![](remote-url)`. Anytype
renders these by URL; it does not pull the bytes into the object's file store.
A future option: download each image in the background worker and upload it
via `POST /v1/spaces/{space}/objects` file upload so clips survive the source
going offline.

## Open-after-save deep link

`createObject` opens `anytype://object?objectId=…&spaceId=…` when "open after
save" is on. Confirm this deep-link shape against the installed Anytype build;
it's best-effort and silently no-ops if the scheme isn't registered.

## Multiple objects vs. one

Currently all selected images + text become a single object. A future mode
could create one object per selected image (closer to a "save these N images"
workflow).
