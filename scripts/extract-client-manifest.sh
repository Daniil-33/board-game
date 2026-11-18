#!/usr/bin/env bash
set -euo pipefail

container_id=${1:?usage: extract-client-manifest.sh WEB_CONTAINER_ID}
manifest_tmp=$(mktemp)
trap 'rm -f "$manifest_tmp"' EXIT
docker cp "${container_id}:/tmp/vite-manifest.json" "$manifest_tmp"
mkdir -p apps/client/dist/.vite
install -m 0644 "$manifest_tmp" apps/client/dist/.vite/manifest.json
node -e "JSON.parse(require('node:fs').readFileSync('apps/client/dist/.vite/manifest.json', 'utf8'))"
