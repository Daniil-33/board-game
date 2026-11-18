#!/bin/sh
# Render into a candidate; the caller validates before replacing/reloading.
set -eu
cert_root=${1:-/etc/letsencrypt}
cat <<'NGINX'
log_format game '$remote_addr [$time_local] "$request_method $uri $server_protocol" $status $body_bytes_sent';
access_log /var/log/nginx/access.log game;
# Error messages can contain the original request including credentials in queries.
error_log /var/log/nginx/error.log crit;
resolver 127.0.0.11 valid=10s ipv6=off;
resolver_timeout 2s;
map $http_upgrade $connection_upgrade { default upgrade; '' close; }
server { listen 80 default_server; server_name _; return 444; }
server {
  listen 80;
  server_name focusima.space api.focusima.space stage.focusima.space stage-api.focusima.space;
  location /.well-known/acme-challenge/ { root /var/www/certbot; }
  location / { return 308 https://$host$request_uri; }
}
NGINX
for env in staging production; do
  case "$env" in
    staging) web=stage.focusima.space; api=stage-api.focusima.space ;;
    production) web=focusima.space; api=api.focusima.space ;;
  esac
  cert="$cert_root/live/$env"
  if [ ! -f "$cert/fullchain.pem" ] || [ ! -f "$cert/privkey.pem" ]; then
    continue
  fi
  cat <<NGINX
server {
  listen 443 ssl;
  http2 on;
  server_name $web;
  ssl_certificate $cert/fullchain.pem;
  ssl_certificate_key $cert/privkey.pem;
  ssl_protocols TLSv1.2 TLSv1.3;
  add_header Strict-Transport-Security "max-age=31536000" always;
  if (\$host != $web) { return 444; }
  location / {
    set \$upstream http://$env-web:80;
    proxy_pass \$upstream;
    proxy_http_version 1.1;
    proxy_set_header Host \$host;
    proxy_set_header X-Forwarded-Proto https;
  }
}
server {
  listen 443 ssl;
  http2 on;
  server_name $api;
  ssl_certificate $cert/fullchain.pem;
  ssl_certificate_key $cert/privkey.pem;
  ssl_protocols TLSv1.2 TLSv1.3;
  add_header Strict-Transport-Security "max-age=31536000" always;
  if (\$host != $api) { return 444; }
  set \$upstream http://$env-server:8787;
  location /api/ {
    proxy_pass \$upstream;
    proxy_set_header Host \$host;
    proxy_set_header X-Forwarded-Proto https;
  }
  location = /ws {
    proxy_pass \$upstream;
    proxy_set_header Host \$host;
    proxy_set_header X-Forwarded-Proto https;
    proxy_http_version 1.1;
    proxy_set_header Upgrade \$http_upgrade;
    proxy_set_header Connection \$connection_upgrade;
    proxy_read_timeout 1h;
    proxy_send_timeout 1h;
    send_timeout 1h;
  }
  location / { return 404; }
}
NGINX
done
