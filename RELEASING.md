# Releasing Send to Anytype (notarized DMG, direct download)

Send to Anytype-specific guide. Ships Send to Anytype as a **Developer ID-signed, notarized
`.dmg`** that users download from GitHub Releases — *not* the App Store.
Users get no Gatekeeper warnings and never touch "Allow Unsigned Extensions".

This is a different channel from the Mac App Store: **no App ID registration,
no device registration, no provisioning profile, no App Store Connect, no
`.pkg`.** Just a cert, notarization, and a DMG.

## 0. Prerequisites
- Enroll in the **Apple Developer Program** ($99/yr). *(Done.)*
- Install **Xcode** (used to create the cert and build the app).
- Send to Anytype's bundle IDs are already set: `com.sindhus.sendtoanytype` (app) and
  `com.sindhus.sendtoanytype.Extension` (extension). No IAP, no extra IDs.
- Optional, for a prettier DMG: `brew install create-dmg` (the release
  script falls back to `hdiutil` if absent).

## 1. Create the **Developer ID Application** certificate (via Xcode)
This is the cert that authorizes distribution *outside* the App Store — NOT
"Apple Distribution" (that's App-Store-only).
- Xcode → **Settings → Accounts** → add/select your Apple ID → your team →
  **Manage Certificates… → ＋ → Developer ID Application**.
- Verify it's installed and valid:
  ```sh
  security find-identity -v -p codesigning | grep "Developer ID Application"
  ```
  Expect exactly one line. If you see **"0 valid identities"** even though the
  cert exists, install the current WWDR intermediate:
  ```sh
  curl -fsSL -o /tmp/wwdr.cer https://www.apple.com/certificateauthority/AppleWWDRCAG3.cer
  security import /tmp/wwdr.cer -k ~/Library/Keychains/login.keychain-db
  ```

## 2. Find your Team ID
- [developer.apple.com/account](https://developer.apple.com/account) →
  **Membership details → Team ID** (10 chars, e.g. `A1B2C3D4E5`).
- It also appears in the parentheses of the `find-identity` output from step 1.
- You'll pass it as `DEVELOPMENT_TEAM`. It is **not** a secret.

## 3. Create an app-specific password + store notary credentials
- [appleid.apple.com](https://appleid.apple.com) → **Sign-In & Security →
  App-Specific Passwords → ＋** → label it "notarytool".
- Cache it in the keychain once under a named profile (so the script and you
  never handle it in plaintext again):
  ```sh
  xcrun notarytool store-credentials "SendToAnytypeNotary" \
    --apple-id "YOUR_APPLE_ID_EMAIL" \
    --team-id  "YOUR_TEAM_ID" \
    --password "xxxx-xxxx-xxxx-xxxx"   # the app-specific password
  ```
  `SendToAnytypeNotary` is the name you'll pass as `NOTARY_PROFILE`.

## 4. Confirm Send to Anytype's signing settings (already correct — just verify)
Send to Anytype needs the **Hardened Runtime** (a notarization requirement). It's
already enabled in the project, and there are no entitlements files to edit:
```sh
grep -E "ENABLE_HARDENED_RUNTIME|ENABLE_APP_SANDBOX" Send to Anytype.xcodeproj/project.pbxproj | sort -u
# expect: ENABLE_APP_SANDBOX = YES   and   ENABLE_HARDENED_RUNTIME = YES
```
- `CODE_SIGN_STYLE = Automatic` in the project is fine — `release.sh`
  overrides to Manual + Developer ID at build time without changing the project.
- The app is sandboxed, but the **extension** does its network calls through
  Safari's networking, so localhost access works without a `network.client`
  entitlement. (If a future change makes the *host app itself* hit the network
  and it fails under notarization, that's the entitlement to add.)

## 5. Sync the version number
The DMG is named from the app's `CFBundleShortVersionString`
(= the macOS target's **Marketing Version**), which must match the
extension's manifest version. They are currently aligned at **0.3.0**.

On each release, bump both in lockstep:
- Xcode → **Send to Anytype (macOS)** target → **General → Identity → Version**
  (also updates `MARKETING_VERSION` in the pbxproj).
- `Shared (Extension)/Resources/manifest.json` → `"version"`.

The `CFBundleVersion` / build number (currently `1`) only needs to
advance when uploading to the App Store, not for notarized DMG releases.

## 6. Build + sign + notarize + package
One command does archive → Developer ID export (Hardened Runtime) →
DMG → notarize-and-wait → staple:
```sh
DEVELOPMENT_TEAM=YOUR_TEAM_ID NOTARY_PROFILE=SendToAnytypeNotary ./scripts/release.sh
```
Output: `dist/Send to Anytype-<version>.dmg`.

<details>
<summary>What the script runs under the hood (for reference / debugging)</summary>

```sh
# archive (Release, Developer ID, Hardened Runtime via --options=runtime)
xcodebuild archive -project Send to Anytype.xcodeproj -scheme "Send to Anytype (macOS)" \
  -configuration Release -archivePath build/Send to Anytype.xcarchive \
  CODE_SIGN_STYLE=Manual CODE_SIGN_IDENTITY="Developer ID Application" \
  DEVELOPMENT_TEAM=YOUR_TEAM_ID OTHER_CODE_SIGN_FLAGS="--timestamp --options=runtime"

# export a Developer ID app (signs the nested .appex too)
xcodebuild -exportArchive -archivePath build/Send to Anytype.xcarchive \
  -exportOptionsPlist build/ExportOptions.plist -exportPath build/export

# notarize the dmg and wait, then staple
xcrun notarytool submit dist/Send to Anytype-<v>.dmg --keychain-profile "SendToAnytypeNotary" --wait
xcrun stapler staple dist/Send to Anytype-<v>.dmg
```
</details>

## 7. Verify the DMG before uploading
```sh
xcrun stapler validate dist/Send to Anytype-*.dmg          # "The validate action worked"
# Assess the DMG as a *download* — use -t open, NOT -t install (that's for .pkg
# installers and will say "no usable signature" on a perfectly good DMG):
spctl -a -vvv -t open --context context:primary-signature dist/Send to Anytype-*.dmg
# expect: accepted + "source=Developer ID"
```
Both must pass. If `spctl` says rejected, the build wasn't signed/notarized/
stapled — re-run step 6, don't upload.

To check the *app inside* (the verdict a user's Mac gives at launch), mount the
DMG and run `spctl -a -vvvv "/Volumes/…/Send to Anytype.app"` — expect
`accepted` + `source=Notarized Developer ID`. `release.sh` strips stray
`com.apple.FinderInfo` xattrs before packaging so `codesign --verify --strict`
stays clean; if you ever see "resource fork … detritus not allowed", that strip
is what prevents it.

## 8. Publish the GitHub release
```sh
gh release create v0.3.0 dist/Send to Anytype-0.3.0.dmg \
  --title "Send to Anytype 0.3.0" \
  --notes "What changed…"
```
The root `README.md` install section links to `../../releases`, so the latest
DMG is always one click away for users.

## 9. Gotchas
- **Wrong cert type** — "Apple Distribution" is App-Store-only and will *not*
  notarize for direct download. You need **Developer ID Application**.
- **"0 valid identities"** despite the cert existing → missing WWDR
  intermediate; run the `curl … AppleWWDRCAG3.cer` import from step 1.
- **Notarization comes back `Invalid`** → read the log to find which nested
  binary failed (almost always Hardened Runtime missing on the appex):
  ```sh
  xcrun notarytool log <submission-id> --keychain-profile "SendToAnytypeNotary"
  ```
- **Users still hit "Allow Unsigned Extensions"** → the DMG you shipped wasn't
  stapled. `stapler validate` must pass *before* upload.
- **DMG filename version looks wrong** → it comes from the app's Marketing
  Version, not `manifest.json`. See step 5.
- **First codesign of a session** may pop a Keychain prompt → **Always Allow**.

> Dependency order that bites people: **certificate (step 1) → notary
> credentials (step 3) → build (step 6)**. Everything the App Store path needs
> — App ID, device registration, provisioning profiles, App Store Connect — is
> deliberately absent here; notarization doesn't use any of it.
