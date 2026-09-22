# Signing and notarization credentials for a release build.
#
# Sourced by scripts/release.sh; never committed with values in it. Apple's
# team id is not a secret (it ships inside every signed binary) but the API
# key absolutely is, which is why this file only ever names variables.
#
#   APPLE_TEAM_ID       DD5AWPLT2V
#   APPLE_API_KEY       absolute path to the AuthKey_XXXXXXXXXX.p8
#   APPLE_API_KEY_ID    the key id, e.g. XXXXXXXXXX
#   APPLE_API_ISSUER    the issuer uuid from App Store Connect
#
# Put the real values in ~/.snapdown/sign-env.sh (0600), alongside the release
# signing key, and this script will pick them up.
#
#   APPLE_SIGN_IDENTITY  "Developer ID Application: Mega Creations LLC (DD5AWPLT2V)"
#
# Exactly as `security find-identity -v -p codesigning` prints it.
