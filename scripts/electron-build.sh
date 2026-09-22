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

if [ -n "${APPLE_API_KEY:-}" ] && [ -n "${APPLE_API_KEY_ID:-}" ] && [ -n "${APPLE_API_ISSUER:-}" ]; then
    if [ ! -f "${APPLE_API_KEY}" ]; then
        echo "error: APPLE_API_KEY points at ${APPLE_API_KEY}, which does not exist" >&2
        exit 1
    fi
    echo "Notarization credentials found — building signed and notarized."
    ARGS+=(--config.mac.notarize=true)
    # Pin the identity rather than letting electron-builder choose. Left to
    # itself it picked an unrelated "Apple Development" certificate from
    # another team that happened to be in the keychain — a certificate that
    # cannot be notarized and only runs on registered devices.
    if [ -z "${APPLE_SIGN_IDENTITY:-}" ]; then
        echo "error: APPLE_SIGN_IDENTITY is not set." >&2
        echo "       Expected something like:" >&2
        echo "       Developer ID Application: Mega Creations LLC (${APPLE_TEAM_ID:-TEAMID})" >&2
        exit 1
    fi
    ARGS+=(--config.mac.identity="${APPLE_SIGN_IDENTITY}")
else
    # Not an error: this is the path every build took before signing existed.
    # Discovery is switched off explicitly so a stray certificate in the
    # keychain cannot sign a release with the wrong identity.
    export CSC_IDENTITY_AUTO_DISCOVERY=false
    echo "No notarization credentials — building unsigned."
    echo "  (see scripts/sign-env.sh for what ~/.snapdown/sign-env.sh should set)"
fi

exec electron-builder "${ARGS[@]}"
