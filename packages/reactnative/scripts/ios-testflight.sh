#!/usr/bin/env bash
# Build a store-signed iOS binary (EAS production profile) and upload it to
# App Store Connect for TestFlight. This does not submit a public App Store listing.
# Usage: bash ./scripts/ios-testflight.sh [extra eas build flags...]
set -euo pipefail

exec eas build --profile production --platform ios --auto-submit "$@"
