#!/bin/sh
set -eu
sh /edge/render.sh > /etc/nginx/conf.d/candidate.conf.tmp
# nginx includes *.conf only. Validate candidate through a standalone main config.
printf 'events {}\nhttp { include /etc/nginx/conf.d/candidate.conf.tmp; }\n' > /tmp/nginx-candidate.conf
nginx -t -c /tmp/nginx-candidate.conf
mv /etc/nginx/conf.d/candidate.conf.tmp /etc/nginx/conf.d/default.conf
nginx -s reload
