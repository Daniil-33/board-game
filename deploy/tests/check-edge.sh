#!/bin/sh
# Exercises a private edge, client nginx and API fixture. It never publishes ports.
set -eu
cd "$(dirname "$0")/../.."
tmp=$(mktemp -d)
suffix="$$"
network="edge-check-$suffix"
edge="edge-check-$suffix"
web="edge-web-check-$suffix"
api="edge-api-check-$suffix"
client="edge-client-check-$suffix"
edge_source=${EDGE_SOURCE_DIR:-"$PWD/deploy/edge"}
cleanup() {
  docker rm -f "$client" "$edge" "$web" "$api" >/dev/null 2>&1 || true
  docker network rm "$network" >/dev/null 2>&1 || true
  rm -rf "$tmp"
}
trap cleanup EXIT INT TERM

mkdir -p "$tmp/certs/live/staging" "$tmp/certs/live/production" \
  "$tmp/challenges/.well-known/acme-challenge" "$tmp/www/assets"
printf 'challenge-ok' > "$tmp/challenges/.well-known/acme-challenge/probe"
python3 - "$tmp/www" <<'PY'
from pathlib import Path
import sys
import struct
import zlib

root = Path(sys.argv[1])
root.joinpath("index.html").write_text("<!doctype html><title>edge fixture</title>" + "h" * 4096)
root.joinpath("assets/check.js").write_text("const fixture = '" + "j" * 4096 + "';")
root.joinpath("assets/check.css").write_text(".fixture { content: '" + "c" * 4096 + "'; }")
root.joinpath("assets/check.svg").write_text('<svg xmlns="http://www.w3.org/2000/svg"><text>' + "s" * 4096 + "</text></svg>")
root.joinpath("assets/check.json").write_text('{"fixture":"' + "q" * 4096 + '"}')
def chunk(name, data):
    return struct.pack('!I', len(data)) + name + data + struct.pack('!I', zlib.crc32(name + data) & 0xffffffff)
width, height = 32, 32
pixels = b''.join(b'\0' + bytes((x * 73 + y * 29 + c * 61) % 256 for x in range(width) for c in range(4)) for y in range(height))
png = b'\x89PNG\r\n\x1a\n' + chunk(b'IHDR', struct.pack('!2I5B', width, height, 8, 6, 0, 0, 0)) + chunk(b'IDAT', zlib.compress(pixels, 0)) + chunk(b'IEND', b'')
root.joinpath("assets/check.png").write_bytes(png)
PY

docker network create "$network" >/dev/null
docker run -d --name "$api" --network "$network" \
  --network-alias server --network-alias staging-server --network-alias production-server \
  -v "$PWD/deploy/tests/edge-upstream.js:/edge-upstream.js:ro" \
  node:22-alpine node /edge-upstream.js >/dev/null
docker run -d --name "$web" --network "$network" \
  --network-alias staging-web --network-alias production-web \
  -v "$PWD/apps/client/nginx.conf:/etc/nginx/conf.d/default.conf:ro" \
  -v "$tmp/www:/usr/share/nginx/html:ro" \
  nginx:1.27-alpine >/dev/null
docker run -d --name "$edge" --network "$network" \
  --network-alias edge-check \
  --network-alias stage.focusima.space --network-alias stage-api.focusima.space \
  --entrypoint /bin/sh \
  -v "$edge_source:/edge:ro" \
  -v "$edge_source/nginx.conf:/etc/nginx/nginx.conf:ro" \
  -v "$tmp/certs:/etc/letsencrypt:ro" \
  -v "$tmp/challenges:/var/www/certbot:ro" \
  nginx:1.27-alpine /edge/entrypoint.sh >/dev/null

for _attempt in 1 2 3 4 5 6 7 8 9 10; do
  if docker exec "$edge" nginx -t >/dev/null 2>&1; then break; fi
  sleep 1
done
docker exec "$edge" nginx -t
test "$(docker exec "$edge" wget -q -O - --header 'Host: stage.focusima.space' \
  http://127.0.0.1/.well-known/acme-challenge/probe)" = challenge-ok
if docker exec "$edge" nginx -T 2>&1 | grep -q 'listen 443'; then
  echo 'bootstrap unexpectedly enables TLS' >&2
  exit 1
fi
for env in staging production; do
  openssl req -x509 -newkey rsa:2048 -nodes -days 1 \
    -subj "/CN=stage.focusima.space" \
    -keyout "$tmp/certs/live/$env/privkey.pem" \
    -out "$tmp/certs/live/$env/fullchain.pem" >/dev/null 2>&1
done
docker exec "$edge" sh /edge/reload.sh
docker exec "$edge" sh -c 'printf "HEAD /path?secret-query=must-not-log HTTP/1.0\r\nHost: stage.focusima.space\r\n\r\n" | nc -w 2 127.0.0.1 80' > "$tmp/http"
grep -q '308 Permanent Redirect' "$tmp/http"
grep -q 'https://stage.focusima.space/path?secret-query=must-not-log' "$tmp/http"
docker exec "$edge" wget -t 1 -T 4 -S --no-check-certificate -O /dev/null \
  --header 'Host: other.invalid' https://127.0.0.1/ > "$tmp/unknown" 2>&1 || true
if grep -q '502 Bad Gateway' "$tmp/unknown"; then
  echo 'unknown host routed' >&2
  exit 1
fi
docker run --rm --name "$client" --network "$network" \
  -v "$PWD/deploy/tests/check-edge-client.js:/check-edge-client.js:ro" \
  node:22-alpine node /check-edge-client.js
docker logs "$edge" > "$tmp/logs" 2>&1
grep -q 'HEAD /path HTTP' "$tmp/logs"
if grep -q 'must-not-log' "$tmp/logs"; then
  echo 'query leaked into edge log' >&2
  exit 1
fi
docker logs "$web" > "$tmp/web-logs" 2>&1
grep -q 'GET /assets/check.js HTTP/1.1' "$tmp/web-logs"
echo 'Edge: bootstrap, challenge, redirect, unknown host, path-only logs, HTTP/2, HTTP/1.1 web upstream, gzip text assets, immutable cache, uncompressed raster, API proxy and WebSocket upgrade verified'
