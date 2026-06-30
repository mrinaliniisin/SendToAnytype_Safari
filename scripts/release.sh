#!/usr/bin/env bash
#
# release.sh — build, sign, notarize, and package Send to Anytype.app into a
# distributable, notarized .dmg for direct (non-App-Store) download.
#
# This is the "Tier A" pipeline: the resulting DMG opens with no Gatekeeper
# warnings and the extension can be enabled in Safari WITHOUT toggling
# "Allow Unsigned Extensions". It requires a paid Apple Developer Program
# membership (for the Developer ID Application certificate + notarization).
#
# ── One-time setup (see RELEASING.md for the full walkthrough) ────────────
#   1. Install a "Developer ID Application" certificate into your keychain
#      (Xcode → Settings → Accounts → Manage Certificates → +).
#   2. Store notarization credentials once under a named profile:
#        xcrun notarytool store-credentials "SendToAnytypeNotary" \
#          --apple-id "you@example.com" \
#          --team-id  "YOURTEAMID" \
#          --password "app-specific-password"   # from appleid.apple.com
#
# ── Usage ─────────────────────────────────────────────────────────────────
#   DEVELOPMENT_TEAM=YOURTEAMID NOTARY_PROFILE=SendToAnytypeNotary ./scripts/release.sh
#
# Optional overrides (env vars):
#   SIGNING_IDENTITY  Code-signing identity   (default: "Developer ID Application")
#   SCHEME            Xcode scheme to build    (default: "Send to Anytype (macOS)")
#   CONFIGURATION     Build configuration      (default: "Release")
#   OUTPUT_DIR        Where artifacts land     (default: "./dist")
#
set -euo pipefail

# ── Resolve paths relative to the repo root (this script lives in scripts/) ─
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "${SCRIPT_DIR}/.." && pwd)"
cd "${REPO_ROOT}"

# ── Config ──────────────────────────────────────────────────────────────────
PROJECT="Send to Anytype.xcodeproj"
SCHEME="${SCHEME:-Send to Anytype (macOS)}"
CONFIGURATION="${CONFIGURATION:-Release}"
SIGNING_IDENTITY="${SIGNING_IDENTITY:-Developer ID Application}"
OUTPUT_DIR="${OUTPUT_DIR:-${REPO_ROOT}/dist}"
APP_NAME="Send to Anytype"

: "${DEVELOPMENT_TEAM:?Set DEVELOPMENT_TEAM to your 10-char Apple team ID (see 'xcrun notarytool ...' or developer.apple.com → Membership)}"
: "${NOTARY_PROFILE:?Set NOTARY_PROFILE to the notarytool keychain profile name you created with 'xcrun notarytool store-credentials'}"

BUILD_DIR="${REPO_ROOT}/build"
ARCHIVE_PATH="${BUILD_DIR}/${APP_NAME}.xcarchive"
EXPORT_DIR="${BUILD_DIR}/export"
EXPORT_PLIST="${BUILD_DIR}/ExportOptions.plist"

echo "▸ Repo:        ${REPO_ROOT}"
echo "▸ Scheme:      ${SCHEME} (${CONFIGURATION})"
echo "▸ Team:        ${DEVELOPMENT_TEAM}"
echo "▸ Identity:    ${SIGNING_IDENTITY}"
echo "▸ Notary:      ${NOTARY_PROFILE}"
echo

# ── Preflight: confirm a Developer ID cert is actually installed ────────────
if ! security find-identity -v -p codesigning | grep -q "Developer ID Application"; then
  echo "✗ No 'Developer ID Application' certificate found in your keychain." >&2
  echo "  Create one in Xcode → Settings → Accounts → Manage Certificates → + ." >&2
  echo "  (See RELEASING.md.)" >&2
  exit 1
fi

rm -rf "${BUILD_DIR}"
mkdir -p "${BUILD_DIR}" "${OUTPUT_DIR}"

# ── 1. Archive (Release, Developer ID signing, Hardened Runtime) ────────────
echo "▸ [1/5] Archiving…"
xcodebuild archive \
  -project "${PROJECT}" \
  -scheme "${SCHEME}" \
  -configuration "${CONFIGURATION}" \
  -archivePath "${ARCHIVE_PATH}" \
  -destination "generic/platform=macOS" \
  CODE_SIGN_STYLE=Manual \
  CODE_SIGN_IDENTITY="${SIGNING_IDENTITY}" \
  DEVELOPMENT_TEAM="${DEVELOPMENT_TEAM}" \
  OTHER_CODE_SIGN_FLAGS="--timestamp --options=runtime" \
  | grep -E "^(=== |\*\* |error:|warning: )" || true

# ── 2. Export the archive as a Developer ID app ─────────────────────────────
echo "▸ [2/5] Exporting Developer ID app…"
cat > "${EXPORT_PLIST}" <<PLIST
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>method</key>
  <string>developer-id</string>
  <key>teamID</key>
  <string>${DEVELOPMENT_TEAM}</string>
  <key>signingStyle</key>
  <string>manual</string>
</dict>
</plist>
PLIST

xcodebuild -exportArchive \
  -archivePath "${ARCHIVE_PATH}" \
  -exportOptionsPlist "${EXPORT_PLIST}" \
  -exportPath "${EXPORT_DIR}" \
  | grep -E "^(=== |\*\* |error:|warning: )" || true

APP_PATH="${EXPORT_DIR}/${APP_NAME}.app"
[ -d "${APP_PATH}" ] || { echo "✗ Export failed: ${APP_PATH} not found" >&2; exit 1; }

# Derive the version from the built app so the DMG filename matches the release.
VERSION="$(/usr/libexec/PlistBuddy -c "Print :CFBundleShortVersionString" "${APP_PATH}/Contents/Info.plist" 2>/dev/null || echo "0.0.0")"
DMG_PATH="${OUTPUT_DIR}/${APP_NAME}-${VERSION}.dmg"
echo "▸ Built ${APP_NAME} ${VERSION}"

# ── 3. Package into a drag-to-Applications DMG ──────────────────────────────
echo "▸ [3/5] Building DMG…"
rm -f "${DMG_PATH}"
if command -v create-dmg >/dev/null 2>&1; then
  # Prettier DMG (background, icon layout) if the user has `brew install create-dmg`.
  create-dmg \
    --volname "${APP_NAME} ${VERSION}" \
    --app-drop-link 450 180 \
    --icon "${APP_NAME}.app" 150 180 \
    --window-size 600 380 \
    "${DMG_PATH}" "${APP_PATH}" >/dev/null
else
  # Dependency-free fallback: stage the app + an /Applications symlink so the
  # user can drag-install, then compress with hdiutil.
  STAGING="${BUILD_DIR}/dmg-staging"
  rm -rf "${STAGING}"; mkdir -p "${STAGING}"
  cp -R "${APP_PATH}" "${STAGING}/"
  ln -s /Applications "${STAGING}/Applications"
  hdiutil create \
    -volname "${APP_NAME} ${VERSION}" \
    -srcfolder "${STAGING}" \
    -ov -format UDZO \
    "${DMG_PATH}" >/dev/null
fi

# ── 4. Notarize the DMG and wait for the verdict ────────────────────────────
echo "▸ [4/5] Notarizing (this can take a few minutes)…"
xcrun notarytool submit "${DMG_PATH}" \
  --keychain-profile "${NOTARY_PROFILE}" \
  --wait

# ── 5. Staple the ticket so it works offline ────────────────────────────────
echo "▸ [5/5] Stapling notarization ticket…"
xcrun stapler staple "${DMG_PATH}"
xcrun stapler validate "${DMG_PATH}"

echo
echo "✓ Done: ${DMG_PATH}"
echo "  Verify Gatekeeper acceptance with:"
echo "    spctl -a -vvv -t install \"${DMG_PATH}\""
echo "  Then attach this DMG to your GitHub release."
