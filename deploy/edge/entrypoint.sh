#!/bin/sh
set -eu
sh /edge/render.sh > /etc/nginx/conf.d/default.conf
nginx -t
nginx -g 'daemon off;' &
master=$!
loop() {
  while :; do
    sleep 21600 &
    wait $! || return
    sh /edge/reload.sh || echo 'edge: certificate reload failed' >&2
  done
}
loop &
reloader=$!
trap 'kill "$reloader" "$master" 2>/dev/null || true' TERM INT
wait "$master" || status=$?
kill "$reloader" 2>/dev/null || true
exit "${status:-0}"
