#!/bin/sh
# Always test against the staging CA in disposable state before live issuance.
set -eu
name=${1:-}
case "$name" in
  staging) set -- -d stage.focusima.space -d stage-api.focusima.space ;;
  production) set -- -d focusima.space -d api.focusima.space ;;
  ops) set -- -d ops.focusima.space ;;
  *) echo 'usage: issue-certs.sh staging|production|ops' >&2; exit 2 ;;
esac
cd "$(dirname "$0")"
# tmpfs state is destroyed with --rm; the live certificate volume is never used
# for staging accounts, renewal configuration or untrusted certificates.
docker compose -p edge -f compose.yml run --rm --no-deps \
  --entrypoint certbot certbot certonly \
  --staging --config-dir /dry-run/config --work-dir /dry-run/work --logs-dir /dry-run/logs \
  --webroot -w /var/www/certbot --non-interactive --agree-tos \
  --register-unsafely-without-email --cert-name "$name" "$@"
docker compose -p edge -f compose.yml run --rm --no-deps \
  --entrypoint certbot certbot certonly --webroot -w /var/www/certbot \
  --non-interactive --agree-tos --register-unsafely-without-email \
  --keep-until-expiring --cert-name "$name" "$@"
docker compose -p edge -f compose.yml exec -T nginx sh /edge/reload.sh
