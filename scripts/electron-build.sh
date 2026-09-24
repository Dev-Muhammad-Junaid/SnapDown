#!/usr/bin/env bash
#
# Builds the macOS app, signing and notarizing it when the credentials exist.
#
# Signing must not be a precondition for building. Until a Developer ID
# certificate is installed, or on any machine that does not have one, this
# still produces a working unsigned app — the same one we shipped before —
# rather than failing the release path outright.
set -euo pipefail

CREDS="$HOME/.snapdown/sign-env.sh"
[ -f "$CREDS" ] && . "$CREDS"

ARGS=(--mac)

# Signing and notarization are separate steps, and separating them here matters:
# signing is the part that tends to need fixing (a nested binary that will not
# take the hardened runtime), and it can be proved on its own in a couple of
# minutes without ever contacting Apple.
if [ -n "${APPLE_SIGN_IDENTITY:-}" ]; then
    # electron-builder rejects the full certificate name and wants only the
    # part after the type: "Mega Creations LLC (DD5AWPLT2V)", not
    # "Developer ID Application: Mega Creations LLC (DD5AWPLT2V)". Accept
    # either, since the full form is what `security find-identity` prints and
    # therefore what anyone will paste in here.
    SIGN_NAME="${APPLE_SIGN_IDENTITY#Developer ID Application: }"
    echo "Signing as: ${SIGN_NAME}"
    ARGS+=(--config.mac.identity="${SIGN_NAME}")

    if [ -n "${APPLE_API_KEY:-}" ] && [ -n "${APPLE_API_KEY_ID:-}" ] && [ -n "${APPLE_API_ISSUER:-}" ]; then
        if [ ! -f "${APPLE_API_KEY}" ]; then
            echo "error: APPLE_API_KEY points at ${APPLE_API_KEY}, which does not exist" >&2
            exit 1
        fi
        echo "Notarization credentials found — will notarize and staple."
        ARGS+=(--config.mac.notarize=true)
    else
        echo "No notarization credentials — signing only, not notarizing."
        echo "  (a signed but un-notarized app still warns on other people's Macs)"
    fi
else
    # Not an error: this is the path every build took before signing existed.
    # Discovery is switched off explicitly so a stray certificate in the
    # keychain cannot sign a release with the wrong identity.
    export CSC_IDENTITY_AUTO_DISCOVERY=false
    echo "No signing identity — building unsigned."
    echo "  (see scripts/sign-env.sh for what ~/.snapdown/sign-env.sh should set)"
fi

electron-builder "${ARGS[@]}"

# Notarize the .dmg as well as the app inside it.
#
# electron-builder's notarize step covers the .app and staples a ticket to it,
# then wraps that app in a disk image it leaves untouched. The app is therefore
# perfect and the thing people actually download is not: macOS quarantines the
# .dmg on download and checks the .dmg itself on open, so an unsigned wrapper
# greets a new user with "Apple could not verify this is free of malware"
# before they ever reach the app whose signature is fine.
#
# Verified after 0.5.1 built clean and the .dmg came out `rejected — no usable
# signature` while the .app inside it came out `accepted — Notarized Developer
# ID`.
if [ -n "${APPLE_SIGN_IDENTITY:-}" ] && [ -n "${APPLE_API_KEY:-}" ]; then
    VERSION="$(node -p "require('./package.json').version")"
    DMG="dist/SnapDown-${VERSION}-arm64.dmg"

    if [ ! -f "$DMG" ]; then
        echo "error: expected $DMG to exist after the build" >&2
        exit 1
    fi

    echo "Signing ${DMG}..."
    codesign --sign "$APPLE_SIGN_IDENTITY" --timestamp --force "$DMG"

    echo "Notarizing ${DMG} (this waits on Apple)..."
    xcrun notarytool submit "$DMG" \
        --key "$APPLE_API_KEY" \
        --key-id "$APPLE_API_KEY_ID" \
        --issuer "$APPLE_API_ISSUER" \
        --wait

    echo "Stapling ${DMG}..."
    xcrun stapler staple "$DMG"

    # The release script checks this too, but failing here means a bad disk
    # image never reaches the step that would offer to publish it anyway.
    if ! spctl -a -t open --context context:primary-signature "$DMG" >/dev/null 2>&1; then
        echo "error: ${DMG} is still not accepted by Gatekeeper" >&2
        exit 1
    fi
    echo "  accepted by Gatekeeper"
fi
