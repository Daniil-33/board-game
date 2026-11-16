#!/bin/sh
# Initial provisioning only. Temporarily trust our own one-day test certificate
# to verify direct VPS -> its public-IP TLS routing before contacting live ACME.
set -eu
cd "$(dirname "$0")"
compose() { docker compose -p edge -f compose.yml "$@"; }
if ! compose exec -T nginx sh -c 'test ! -e /etc/letsencrypt/live/staging/fullchain.pem && test ! -e /etc/letsencrypt/live/production/fullchain.pem'; then
  echo 'hairpin: only run before live certificates exist' >&2; exit 2
fi
tmp=$(mktemp -d)
cleanup() {
  status=$?
  trap - EXIT INT TERM
  if ! compose exec -T nginx sh /edge/reload.sh; then
    echo 'hairpin: failed to restore edge config; escalate' >&2
    status=1
  fi
  compose exec -T nginx rm -rf /tmp/hairpin || true
  rm -rf "$tmp"
  exit "$status"
}
trap cleanup EXIT
trap 'exit 130' INT TERM
mkdir -p "$tmp/certs/live/staging"
openssl req -x509 -newkey rsa:2048 -nodes -days 1 -subj /CN=stage.focusima.space \
  -addext subjectAltName=DNS:stage.focusima.space \
  -keyout "$tmp/certs/live/staging/privkey.pem" \
  -out "$tmp/certs/live/staging/fullchain.pem" >/dev/null 2>&1
compose exec -T nginx mkdir -p /tmp/hairpin
compose cp "$tmp/certs/." nginx:/tmp/hairpin
compose exec -T nginx sh -c 'sh /edge/render.sh /tmp/hairpin > /etc/nginx/conf.d/default.conf && nginx -t && nginx -s reload'
# Allow graceful reload to replace old workers; use a new connection each time.
attempt=0
until curl --noproxy '*' --connect-timeout 5 --max-time 10 --silent --show-error \
  --cacert "$tmp/certs/live/staging/fullchain.pem" \
  --resolve stage.focusima.space:443:149.5.209.208 -I https://stage.focusima.space/; do
  attempt=$((attempt + 1))
  if [ "$attempt" -ge 3 ]; then
    echo 'hairpin: public-IP HTTPS failed; stop and escalate to Team Lead' >&2
    exit 1
  fi
  sleep 1
done
echo 'hairpin: direct public-IP HTTPS verified with temporary trusted certificate'
