#!/bin/sh
# Disposable nginx only: no public ports, no production networks/volumes/CA.
set -eu
cd "$(dirname "$0")/../.."
tmp=$(mktemp -d)
container="dep-stack-check-$$"
cleanup() {
  docker rm -f "$container" >/dev/null 2>&1 || true
  rm -rf "$tmp"
}
trap cleanup EXIT INT TERM
mkdir -p "$tmp/certs/live/staging" "$tmp/certs/live/production" "$tmp/challenges/.well-known/acme-challenge"
printf 'challenge-ok' > "$tmp/challenges/.well-known/acme-challenge/probe"
sh deploy/edge/render.sh /test-certs > "$tmp/default.conf"
docker run --rm -v "$PWD/deploy/edge/nginx.conf:/etc/nginx/nginx.conf:ro" -v "$tmp/default.conf:/etc/nginx/conf.d/default.conf:ro" nginx:1.27-alpine nginx -t
for env in staging production; do
  openssl req -x509 -newkey rsa:2048 -nodes -days 1 -subj /CN=stage.focusima.space \
    -keyout "$tmp/certs/live/$env/privkey.pem" -out "$tmp/certs/live/$env/fullchain.pem" >/dev/null 2>&1
done
# Render against a host fixture path, then substitute the container mount path.
sh deploy/edge/render.sh "$tmp/certs" | sed "s|$tmp/certs|/test-certs|g" > "$tmp/default.conf"
docker run -d --name "$container" \
  -v "$PWD/deploy/edge/nginx.conf:/etc/nginx/nginx.conf:ro" \
  -v "$tmp/default.conf:/etc/nginx/conf.d/default.conf:ro" \
  -v "$tmp/certs:/test-certs:ro" -v "$tmp/challenges:/var/www/certbot:ro" \
  nginx:1.27-alpine >/dev/null
docker exec "$container" nginx -t
# Execute requests from inside the container, so no published or assumed host ports.
for _attempt in 1 2 3 4 5; do
  if docker exec "$container" wget -t 1 -T 10 -q -O - --header 'Host: stage.focusima.space' \
      http://127.0.0.1/.well-known/acme-challenge/probe > "$tmp/response"; then break; fi
  sleep 1
done
test "$(cat "$tmp/response")" = challenge-ok
# Missing apps must return 502 while TLS stays available. Test-only self-signed CA.
docker exec "$container" wget -t 1 -T 10 -S --no-check-certificate -O /dev/null \
  --header 'Host: stage.focusima.space' 'https://127.0.0.1/path?secret-query=must-not-log' > "$tmp/https" 2>&1 || true
grep -q '502 Bad Gateway' "$tmp/https"
docker exec "$container" sh -c 'printf "HEAD /path HTTP/1.0\r\nHost: api.focusima.space\r\n\r\n" | nc -w 2 127.0.0.1 80' > "$tmp/http"
grep -q '308 Permanent Redirect' "$tmp/http"
grep -q 'https://api.focusima.space/path' "$tmp/http"
docker exec "$container" wget -t 1 -T 10 -S --no-check-certificate -O /dev/null \
  --header 'Host: other.invalid' https://127.0.0.1/ > "$tmp/unknown" 2>&1 || true
if grep -q '502 Bad Gateway' "$tmp/unknown"; then echo 'unknown host routed' >&2; exit 1; fi
docker logs "$container" > "$tmp/logs" 2>&1
grep -q 'GET /path HTTP' "$tmp/logs"
if grep -q 'must-not-log' "$tmp/logs"; then echo 'query leaked into log' >&2; cat "$tmp/logs" >&2; exit 1; fi
echo 'Edge: HTTP bootstrap, TLS with absent apps, redirect, unknown host and path-only logs verified'
