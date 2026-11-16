#!/bin/sh
set -eu

# Only this whitelist reaches JavaScript. It excludes all JS/HTML metacharacters.
api_origin=${API_ORIGIN-}
if [ -n "$api_origin" ] && ! printf '%s\n' "$api_origin" | LC_ALL=C grep -Eq '^https?://[a-z0-9.-]+(:[0-9]{1,5})?$'; then
  echo 'API_ORIGIN must be empty or an HTTP(S) origin without a path' >&2
  exit 1
fi
# grep checks lines independently, so explicitly reject embedded line breaks too.
case "$api_origin" in
  *'
'*) echo 'API_ORIGIN must not contain newlines' >&2; exit 1 ;;
esac
printf 'window.__GAME_CONFIG__ = {"API_ORIGIN":"%s"};\n' "$api_origin" > /usr/share/nginx/html/config.js
