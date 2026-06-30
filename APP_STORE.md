# Releasing Send to Anytype (Mac App Store)

Send to Anytype-specific guide. Ships Send to Anytype as a free Mac App Store app, **in
parallel with** the GitHub notarized-DMG release (see `RELEASING.md`).
Same source, two signing pipelines, two artifacts.

This is **not** the notarization path: no Developer ID cert, no `notarytool
submit`, no `.dmg`. The App Store reintroduces App ID registration,
provisioning profiles, App Store Connect, and `.pkg` upload via Transporter.

> **Heads-up about review:** Send to Anytype only talks to `http://localhost:31009`,
> which the App Store reviewer's VM does not have. Review will likely
> reject "the app does nothing" unless you mitigate explicitly — see §8.
> Plan for at least one rejection cycle (1–3 days each) on first submission.

## 0. Prerequisites
- Enroll in the **Apple Developer Program** ($99/yr). *(Done.)*
- Install **Xcode** and **Transporter** (free, Mac App Store).
- Decide first-release **version** (likely `1.0.0`) and pick a unique
  **app name** for the listing.
- Send to Anytype's bundle IDs are fixed: `com.sindhus.sendtoanytype` (app),
  `com.sindhus.sendtoanytype.Extension` (extension).

## 1. Register both App IDs
[developer.apple.com](https://developer.apple.com/account) →
**Certificates, IDs & Profiles → Identifiers → ＋ → App IDs → App**.
Do this **twice**:

| Description | Bundle ID                       | Type     |
|-------------|---------------------------------|----------|
| Send to Anytype       | `com.sindhus.sendtoanytype`                | Explicit |
| Send to Anytype Ext.  | `com.sindhus.sendtoanytype.Extension`      | Explicit |

For the app's App ID, enable any **capabilities** the build uses
(currently just App Sandbox — already on in the Xcode project; nothing
else to tick). The extension App ID needs no extra capabilities.

## 2. Create the App Store signing certificates (via Xcode)
You need **two** certs for App Store, both from
Xcode → **Settings → Accounts → your team → Manage Certificates… → ＋**:
- **Apple Distribution** — signs the `.app` and `.appex`.
- **Mac Installer Distribution** — signs the `.pkg` installer that wraps them.

Verify both landed:
```sh
security find-identity -v -p codesigning | grep -E "Apple Distribution|Mac Installer Distribution"
# expect two lines, both valid
```
You'll keep these *alongside* your Developer ID Application cert from
`RELEASING.md` — they don't conflict.

## 3. Create the Mac App Store provisioning profile
Portal → **Profiles → ＋ → Mac App Store**:
- App ID: `com.sindhus.sendtoanytype`
- Certificate: your **Apple Distribution** cert from §2
- Name it e.g. `Send to Anytype Mac App Store`
- Download and **double-click to install**. Xcode picks it up automatically.

You do **not** need a separate profile for the extension App ID — the
parent app's profile covers the nested appex.

## 4. Create the App Store Connect app record
[appstoreconnect.apple.com](https://appstoreconnect.apple.com) →
**Apps → ＋ → New App**:
- Platform: **macOS**
- Name: e.g. "Send to Anytype for Anytype" (unique across the entire store)
- Primary Language: English
- Bundle ID: pick **`com.sindhus.sendtoanytype`** from the dropdown (created in §1)
- SKU: anything; conventionally `roger-mac-001`
- Full Access vs Limited Access: Full

Then under **Pricing and Availability** → **Free**.

(Don't add an In-App Purchase. Don't enroll in the Small Business Program
— it's for paid apps.)

## 5. Verify Send to Anytype's signing & entitlements
Same project settings that `RELEASING.md` checks; they already satisfy
both pipelines.

```sh
grep -E "ENABLE_HARDENED_RUNTIME|ENABLE_APP_SANDBOX" Send to Anytype.xcodeproj/project.pbxproj | sort -u
# expect: ENABLE_APP_SANDBOX = YES   and   ENABLE_HARDENED_RUNTIME = YES
```
- **App Sandbox** is *mandatory* for App Store. Already on.
- **Hardened Runtime** is required for notarization (which Apple also runs
  on App Store uploads). Already on.
- No `.entitlements` files to manage — Xcode synthesizes them from the
  build settings.
- The host app doesn't make network calls (the extension does, through
  Safari's process), so no `com.apple.security.network.client` entitlement
  is needed. If a future change makes the *host app* hit the network and
  review/upload fails, add it then.

## 6. Sync the version + bump the build number
Two distinct fields, and App Store Connect requires *both* to advance on
each upload:
- **Marketing Version** (`CFBundleShortVersionString`) — user-visible,
  e.g. `1.0.0`. Set in Xcode → **Send to Anytype (macOS)** target → **General →
  Identity → Version**.
- **Build** (`CFBundleVersion`) — internal, must be a higher integer than
  any previously uploaded build for the same version. Start at `1`, bump
  to `2` on re-upload of the same `1.0.0`, etc.
- Also bump the extension's manifest version to match:
  `Shared (Extension)/Resources/manifest.json` → `"version"`.

(For the first ever submission, set all three to `1.0.0` / `1`.)

## 7. Build, sign, and upload
The pipeline is parallel to `release.sh` but uses the *App Store* signing
identities and exports a `.pkg` instead of a `.dmg`. Run from the repo root:

```sh
TEAM_ID="YOUR_TEAM_ID"
PROFILE_NAME="Send to Anytype Mac App Store"          # from §3

# 1. Archive with App Store config
xcodebuild archive \
  -project Send to Anytype.xcodeproj \
  -scheme "Send to Anytype (macOS)" \
  -configuration Release \
  -archivePath build/Send to Anytype-AppStore.xcarchive \
  CODE_SIGN_STYLE=Manual \
  CODE_SIGN_IDENTITY="Apple Distribution" \
  DEVELOPMENT_TEAM="${TEAM_ID}" \
  PROVISIONING_PROFILE_SPECIFIER="${PROFILE_NAME}"

# 2. Build the ExportOptions plist for App Store
cat > build/AppStoreExportOptions.plist <<PLIST
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>method</key><string>app-store-connect</string>
  <key>teamID</key><string>${TEAM_ID}</string>
  <key>signingStyle</key><string>manual</string>
  <key>installerSigningCertificate</key><string>Mac Installer Distribution</string>
</dict></plist>
PLIST

# 3. Export the signed .pkg
xcodebuild -exportArchive \
  -archivePath build/Send to Anytype-AppStore.xcarchive \
  -exportOptionsPlist build/AppStoreExportOptions.plist \
  -exportPath build/appstore-export

# Result: build/appstore-export/Send to Anytype.pkg
```

**Upload** the `.pkg`:
- **Option A (recommended): Transporter.app** — open it, sign in with your
  Apple ID, drag `Send to Anytype.pkg` in, click **Deliver**. Easiest, surfaces
  validation errors clearly.
- **Option B: command line** —
  ```sh
  xcrun altool --upload-package build/appstore-export/Send to Anytype.pkg \
    --type macos \
    --bundle-id com.sindhus.sendtoanytype \
    --bundle-version 1 \
    --bundle-short-version-string 1.0.0 \
    --apple-id "YOUR_APPLE_ID_EMAIL" \
    --password "@keychain:SendToAnytypeNotary"   # reuses the app-specific password from RELEASING.md §3
  ```

Within ~10 minutes the build appears in App Store Connect under
**TestFlight → macOS** (yes, even for non-beta App Store builds — that's
where uploads land before you select one for review).

## 8. Prepare review materials (the Send to Anytype-specific critical step)
This is where you mitigate the "app does nothing without Anytype" rejection.

### App Review notes (App Store Connect → App Information → App Review Information)
Write something like:

> Send to Anytype is a companion Safari extension for **Anytype**, a self-hosted
> personal-inventory web app the user runs locally at
> `http://localhost:31009`. Send to Anytype lets the user click images and text on
> any product page and send them to their local Anytype instance as a new
> inventory item.
>
> Because Send to Anytype requires a running Anytype server, full end-to-end testing
> on Apple's review VM is not possible. Please refer to the attached
> screen recording, which walks through the full flow on a Mac with Anytype
> running locally. Send to Anytype itself is fully functional in isolation —
> clicking the toolbar icon opens the in-page UI immediately, regardless
> of Anytype's status — and shows a clear "couldn't reach Anytype" message
> when the server is absent, so the app's purpose and UI are
> demonstrable without the backend.

### Demo video (attach as a review attachment, ≤ 5 min)
Record a screen capture showing:
1. Toolbar icon on a real product page (e.g. an Etsy listing).
2. Edit mode activating, selecting an image + text block.
3. Tag picker, then Send to Anytype.
4. The new product appearing in the Anytype UI on `localhost:31009`.

### Listing assets
| Asset | Spec | Where |
|---|---|---|
| App icon (`AppIcon`) | 1024×1024 PNG, no alpha, no rounded corners | Asset catalog in `macOS (App)` |
| Screenshots | 1280×800 or 1440×900 mac screenshots showing the extension in action | App Store Connect |
| Description / keywords | Plain-text description + comma-separated keywords | App Store Connect |
| Privacy policy URL | A live URL describing what Send to Anytype collects (URLs, image refs, text snippets — all sent only to user's localhost) | App Store Connect |
| Support URL | The GitHub repo or `mailto:` link is fine | App Store Connect |
| App Privacy nutrition label | "Data Not Collected" applies — Send to Anytype sends only to user-controlled localhost, nothing to Apple/third parties | App Store Connect |

## 9. Submit for review
1. App Store Connect → your app → **macOS App → ＋ Version** (e.g.
   `1.0.0`) → fill in description, screenshots, etc.
2. **Build** section → select the upload from §7.
3. **App Review Information** → paste the reviewer notes from §8, attach
   the demo video.
4. **Add for Review → Submit**.

Then wait. First-submission review is usually 24–48h; expect at least one
back-and-forth on the localhost-dependency point.

## 10. Gotchas
- **"Invalid signature" on upload** — almost always wrong cert: the `.app`
  must be **Apple Distribution**, the `.pkg` must be **Mac Installer
  Distribution**. Not Developer ID, not Apple Development.
- **"No matching provisioning profile"** — the §3 profile must reference
  the *Apple Distribution* cert from §2, not Apple Development. Re-create
  it in the portal if Xcode can't find a match.
- **Build doesn't appear in App Store Connect** — usually still
  processing; wait 10–15 min, then check **TestFlight → macOS** for an
  email about processing errors.
- **Bump the build number on every re-upload** — App Store Connect
  refuses uploads where `CFBundleVersion` ≤ a previous one for the same
  short version. (§6.)
- **App Sandbox missing on the appex** — both targets must be sandboxed
  for App Store. Already configured.
- **"Guideline 2.1 — App Completeness" rejection** — this is the
  Anytype-dependency rejection. Improve the §8 reviewer notes + demo video;
  worst case, ship a static "demo" empty state.
- **Rename impossible** — the bundle ID locks in at the first accepted
  submission. Send to Anytype's is now `com.sindhus.sendtoanytype`; that's permanent.

> Dependency order that bites people: **App IDs (§1) → certs (§2) →
> provisioning profile (§3) → App Store Connect record (§4) → upload
> (§7) → review materials (§8)**. The App Store path needs *all* of these,
> in this order. The Developer ID/notarization path (RELEASING.md) needs
> *none* of §1, §3, §4, §8 — that's the trade for direct distribution.
