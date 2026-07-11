#!/usr/bin/env bash
#
# appstore.sh — build, sign, and package Send to Anytype for the **Mac App
# Store**. Mirrors scripts/release.sh, but instead of a Developer-ID-signed,
# notarized .dmg it produces an App-Store-signed .pkg ready to upload to
# App Store Connect.
#
# This is the "Tier B" pipeline. It is INTENTIONALLY separate from release.sh:
# different certificates, a provisioning profile, and a .pkg (not a .dmg).
# This script automates the archive → App-Store-signed .pkg export. The
# surrounding account setup (App IDs, App Store Connect record, listing) is
# manual; STORE_ASSETS.md holds the listing copy and reviewer notes.
#
# ── One-time setup REQUIRED before this script can succeed ──────────────────
#   §1  Register both App IDs in the developer portal:
#         com.sindhus.sendtoanytype  and  com.sindhus.sendtoanytype.Extension
#   §2  Install BOTH App Store certs (Xcode → Settings → Accounts →
#       Manage Certificates → +):
#         • Apple Distribution              (signs the .app and .appex)
#         • Mac Installer Distribution      (signs the .pkg)
#   Be signed into your Apple ID in Xcode (Settings → Accounts) so automatic
#   signing can create/download the Mac App Store provisioning profiles.
#
# Until §1–§2 are done, the export step will fail with a signing/profile
# error — that is expected, not a bug in this script.
#
# ── Usage ─────────────────────────────────────────────────────────────────
#   DEVELOPMENT_TEAM=A1B2C3D4E5 ./scripts/appstore.sh
#
#   # …and to also upload to App Store Connect in the same run:
#   DEVELOPMENT_TEAM=A1B2C3D4E5 UPLOAD=1 \
#     APPLE_ID="you@example.com" APP_PASSWORD="xxxx-xxxx-xxxx-xxxx" \
#     ./scripts/appstore.sh
#   (APP_PASSWORD = an app-specific password from appleid.apple.com. If you'd
#    rather not use the CLI, skip UPLOAD and drag the .pkg into Transporter.app.)
#
# Optional overrides (env vars):
#   APP_SIGNING_IDENTITY  App/appex identity   (default: "Apple Distribution")
#   PKG_SIGNING_IDENTITY  Installer identity   (default: "Mac Installer Distribution")
#   SCHEME                Xcode scheme         (default: "Send to Anytype (macOS)")
#   CONFIGURATION         Build configuration  (default: "Release")
#   OUTPUT_DIR            Where the .pkg lands  (default: "./dist")
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
APP_SIGNING_IDENTITY="${APP_SIGNING_IDENTITY:-Apple Distribution}"
PKG_SIGNING_IDENTITY="${PKG_SIGNING_IDENTITY:-Mac Installer Distribution}"
OUTPUT_DIR="${OUTPUT_DIR:-${REPO_ROOT}/dist}"
APP_NAME="Send to Anytype"
APP_BUNDLE_ID="com.sindhus.sendtoanytype"

: "${DEVELOPMENT_TEAM:?Set DEVELOPMENT_TEAM to your 10-char Apple team ID (e.g. A1B2C3D4E5)}"

BUILD_DIR="${REPO_ROOT}/build"
ARCHIVE_PATH="${BUILD_DIR}/${APP_NAME}-AppStore.xcarchive"
EXPORT_DIR="${BUILD_DIR}/appstore-export"
EXPORT_PLIST="${BUILD_DIR}/AppStoreExportOptions.plist"

echo "▸ Repo:        ${REPO_ROOT}"
echo "▸ Scheme:      ${SCHEME} (${CONFIGURATION})"
echo "▸ Team:        ${DEVELOPMENT_TEAM}"
echo "▸ App identity:${APP_SIGNING_IDENTITY}"
echo "▸ Pkg identity:${PKG_SIGNING_IDENTITY}"
echo

# ── Preflight: confirm both App Store certs are installed ───────────────────
missing=0
if ! security find-identity -v -p codesigning | grep -q "Apple Distribution"; then
  echo "✗ No 'Apple Distribution' certificate found (signs the .app/.appex)." >&2
  missing=1
fi
# The installer cert shows up under either of these names depending on macOS.
if ! security find-identity -v | grep -Eq "Mac Installer Distribution|3rd Party Mac Developer Installer"; then
  echo "✗ No 'Mac Installer Distribution' certificate found (signs the .pkg)." >&2
  missing=1
fi
if [ "${missing}" -ne 0 ]; then
  echo "  Create the missing cert(s) in Xcode → Settings → Accounts →" >&2
  echo "  Manage Certificates → +." >&2
  exit 1
fi

rm -rf "${BUILD_DIR}"
mkdir -p "${BUILD_DIR}" "${OUTPUT_DIR}"

# ── 1. Archive (Release, App Store signing, Hardened Runtime + Sandbox) ──────
# Automatic signing + -allowProvisioningUpdates lets Xcode create/download the
# Mac App Store provisioning profiles for both the app and the nested appex,
# so you don't have to manage two profiles by hand. Requires being signed into
# your Apple ID in Xcode, and both App IDs (com.sindhus.sendtoanytype and
# .Extension) registered in the developer portal.
echo "▸ [1/4] Archiving (App Store)…"
xcodebuild archive \
  -project "${PROJECT}" \
  -scheme "${SCHEME}" \
  -configuration "${CONFIGURATION}" \
  -archivePath "${ARCHIVE_PATH}" \
  -destination "generic/platform=macOS" \
  -allowProvisioningUpdates \
  CODE_SIGN_STYLE=Automatic \
  DEVELOPMENT_TEAM="${DEVELOPMENT_TEAM}" \
  | grep -E "^(=== |\*\* |error:|warning: )" || true

[ -d "${ARCHIVE_PATH}" ] || { echo "✗ Archive failed: ${ARCHIVE_PATH} not found" >&2; exit 1; }

# ── 2. Export an App-Store-signed .pkg ──────────────────────────────────────
echo "▸ [2/4] Exporting App Store .pkg…"
cat > "${EXPORT_PLIST}" <<PLIST
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>method</key>
  <string>app-store-connect</string>
  <key>teamID</key>
  <string>${DEVELOPMENT_TEAM}</string>
  <key>signingStyle</key>
  <string>automatic</string>
  <key>installerSigningCertificate</key>
  <string>${PKG_SIGNING_IDENTITY}</string>
</dict>
</plist>
PLIST

xcodebuild -exportArchive \
  -archivePath "${ARCHIVE_PATH}" \
  -exportOptionsPlist "${EXPORT_PLIST}" \
  -exportPath "${EXPORT_DIR}" \
  -allowProvisioningUpdates \
  | grep -E "^(=== |\*\* |error:|warning: )" || true

# xcodebuild names the pkg after the scheme's product; find it robustly.
PKG_SRC="$(find "${EXPORT_DIR}" -maxdepth 1 -name "*.pkg" | head -1)"
[ -n "${PKG_SRC}" ] || { echo "✗ Export produced no .pkg in ${EXPORT_DIR}" >&2; exit 1; }

# ── 3. Name the .pkg after the app version and stage it in dist/ ────────────
APP_PATH="$(find "${ARCHIVE_PATH}/Products/Applications" -maxdepth 1 -name "*.app" | head -1)"
VERSION="$(/usr/libexec/PlistBuddy -c "Print :CFBundleShortVersionString" "${APP_PATH}/Contents/Info.plist" 2>/dev/null || echo "0.0.0")"
BUILD_NUM="$(/usr/libexec/PlistBuddy -c "Print :CFBundleVersion" "${APP_PATH}/Contents/Info.plist" 2>/dev/null || echo "1")"
PKG_PATH="${OUTPUT_DIR}/${APP_NAME}-${VERSION}.pkg"
cp "${PKG_SRC}" "${PKG_PATH}"
echo "▸ [3/4] Built ${APP_NAME} ${VERSION} (build ${BUILD_NUM})"
echo "        → ${PKG_PATH}"

# ── 4. (Optional) Upload to App Store Connect ───────────────────────────────
# Off by default — producing the .pkg is the deterministic part; the upload
# needs your Apple ID + an app-specific password. Set UPLOAD=1 to do it here,
# or just drag the .pkg into Transporter.app (recommended: clearer errors).
if [ "${UPLOAD:-0}" = "1" ]; then
  : "${APPLE_ID:?Set APPLE_ID to your Apple ID email to upload}"
  : "${APP_PASSWORD:?Set APP_PASSWORD to an app-specific password from appleid.apple.com}"
  echo "▸ [4/4] Uploading to App Store Connect…"
  xcrun altool --upload-package "${PKG_PATH}" \
    --type macos \
    --bundle-id "${APP_BUNDLE_ID}" \
    --bundle-version "${BUILD_NUM}" \
    --bundle-short-version-string "${VERSION}" \
    --apple-id "${APPLE_ID}" \
    --password "${APP_PASSWORD}"
  echo "✓ Uploaded. It appears in App Store Connect → TestFlight → macOS in ~10 min."
else
  echo "▸ [4/4] Skipping upload (set UPLOAD=1 to upload, or drag the .pkg into Transporter.app)."
fi

echo
echo "✓ Done: ${PKG_PATH}"
echo "  Next: App Store Connect → your app → macOS → select this build,"
echo "  fill in the listing (see STORE_ASSETS.md), attach the demo video +"
echo "  reviewer notes (STORE_ASSETS.md), then Submit for Review."
