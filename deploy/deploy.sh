#!/bin/sh
set -eu
if [ "$#" -ne 2 ]; then
  echo 'deploy: expected environment and full SHA' >&2; exit 2
fi
case "$1" in staging|production) ;; *) echo 'deploy: invalid environment' >&2; exit 2 ;; esac
if ! printf '%s\n' "$2" | LC_ALL=C grep -Eq '^[0-9a-f]{40}$'; then
  echo 'deploy: invalid SHA' >&2; exit 2
fi
env=$1
export GIT_SHA="$2"
export DEPLOY_ENV="$env"
root=/srv/game
file="$root/$env/env"
cd "$(dirname "$0")/.."
# Never source the env file as shell code or print its contents.
if ! python3 - "$file" <<'PY'
import os, stat, sys
try:
    info = os.lstat(sys.argv[1])
    assert stat.S_ISREG(info.st_mode)
    assert info.st_uid == os.getuid() and stat.S_IMODE(info.st_mode) == 0o600
except (OSError, AssertionError):
    sys.exit(1)
PY
then
  echo 'deploy: env file must be an owned regular file with mode 600' >&2; exit 1
fi
compose() {
  docker compose -p "game-$env" --env-file "$file" -f deploy/app/compose.yml "$@"
}
fail() {
  echo "deploy: $1 failed; recent server logs follow" >&2
  compose logs --no-color --tail 80 server >&2 || true
  exit 1
}
compose build || fail build
compose up -d --wait --wait-timeout 180 --remove-orphans || fail startup
python3 deploy/health.py "$env" "$GIT_SHA" || fail 'public health verification'
printf '%s %s\n' "$(date -u +%Y-%m-%dT%H:%M:%SZ)" "$GIT_SHA" >> "$root/$env/deployed.log"
echo "deploy: $env $GIT_SHA verified"
