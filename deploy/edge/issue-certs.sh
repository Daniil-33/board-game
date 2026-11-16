#!/bin/sh
# Always test against the staging CA in disposable state before live issuance.
set -eu
case "${1:-}" in
  staging) web=stage.focusima.space; api=stage-api.focusima.space ;;
  production) web=focusima.space; api=api.focusima.space ;;
  *) echo 'usage: issue-certs.sh staging|production' >&2; exit 2 ;;
esac
cd "$(dirname "$0")"
# tmpfs state is destroyed with --rm; the live certificate volume is never used
# for staging accounts, renewal configuration or untrusted certificates.
docker compose -p edge -f compose.yml run --rm --no-deps \
  --entrypoint certbot certbot certonly \
  --staging --config-dir /dry-run/config --work-dir /dry-run/work --logs-dir /dry-run/logs \
  --webroot -w /var/www/certbot --non-interactive --agree-tos \
  --register-unsafely-without-email --cert-name "$1" -d "$web" -d "$api"
docker compose -p edge -f compose.yml run --rm --no-deps \
  --entrypoint certbot certbot certonly --webroot -w /var/www/certbot \
  --non-interactive --agree-tos --register-unsafely-without-email \
  --keep-until-expiring --cert-name "$1" -d "$web" -d "$api"
docker compose -p edge -f compose.yml exec -T nginx sh /edge/reload.sh
