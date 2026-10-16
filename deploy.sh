#!/usr/bin/env bash
# Deploys Kaboom Arena to the author's server: image built on the host (no registry), behind a shared kamal-proxy.
#   ./deploy.sh
# DNS for kaboom.philament.club must ALREADY point at the server (ACME HTTP-01).
set -euo pipefail

SERVER="${SERVER:-root@philament.club}"
REMOTE=/opt/kaboom
HOST=kaboom.philament.club

ssh "$SERVER" "mkdir -p $REMOTE"
rsync -az --delete --exclude=.git --exclude=/log --exclude=/tmp --exclude=/config/master.key \
  --exclude=/vendor/bundle "$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)/" "$SERVER:$REMOTE/"

ssh "$SERVER" bash -s <<REMOTE_SCRIPT
set -euo pipefail
[[ -f /opt/kaboom.env ]] || { umask 077; echo "SECRET_KEY_BASE=\$(openssl rand -hex 64)" > /opt/kaboom.env; }
docker build -q -t kaboom:latest $REMOTE

docker rm -f kaboom-web >/dev/null 2>&1 || true
# No volume: nothing is persisted (rooms live in memory).
# ActionCable "async" = a single Puma process, never set WEB_CONCURRENCY > 1.
docker run -d --name kaboom-web --restart unless-stopped --network kamal \
  --env-file /opt/kaboom.env -e HOME=/tmp \
  --read-only --tmpfs /tmp:mode=1777 --tmpfs /app/tmp:uid=1000,gid=1000 \
  --cap-drop ALL --memory 384m --cpus 0.5 --pids-limit 200 \
  --log-driver journald --log-opt tag=kaboom kaboom:latest

docker exec kamal-proxy kamal-proxy deploy kaboom \
  --target kaboom-web:3117 --host $HOST \
  --health-check-path /up --tls

docker exec kamal-proxy kamal-proxy list
REMOTE_SCRIPT
