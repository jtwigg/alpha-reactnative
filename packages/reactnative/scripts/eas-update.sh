#!/usr/bin/env bash
# Publish a JS/asset OTA update to an EAS Update channel from this Expo app.
# Usage: bash ./scripts/eas-update.sh <preview|production|development> [message...]
set -euo pipefail

channel="${1:?Usage: eas-update.sh <channel> [message]}"
shift
message="${*:-$(git log -1 --pretty=%s)}"

exec eas update --channel "$channel" --non-interactive --message "$message"
