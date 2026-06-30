# Send to Anytype — backlog

Things noted during development to come back to. Not blocking the current
working build.

## Tags / properties

Roger (the project this was forked from) let you attach tags. Anytype tags are
a per-type **relation property** (multi-select), not a flat list, so attaching
them through the API is more involved than Theo's auto-created `tag_names`:

- Discover the chosen type's tag-like properties via
  `GET /v1/spaces/{space}/types/{type}` (or `/properties`).
- For each property, list its existing tag options; create missing ones with
  `POST /v1/spaces/{space}/properties/{property}/tags` (endpoint name TBD —
  confirm against the live API version).
- Pass selected option ids in the create-object `properties` array.

Until then the panel intentionally omits a tag picker to stay robust.

## Icons

The icon set is inherited from the Roger scaffold (a Scottish Deerhound photo)
and is a placeholder. Replace `icons/*` and the host app's
`AppIcon.appiconset` / `LargeIcon.imageset` with an Anytype-appropriate mark.
Watch small-size legibility: the 16px toolbar variant should read on both
light and dark Safari toolbars (consider a monochrome template variant).

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
