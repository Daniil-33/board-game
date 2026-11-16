#!/bin/sh
set -eu
trap 'exit 0' TERM INT
while :; do
  certbot renew --webroot -w /var/www/certbot --non-interactive || echo 'edge: certificate renewal failed' >&2
  sleep 43200 &
  wait $! || true
done
