#!/bin/sh
set -eu

mkdir -p /app/data
# Volume mounts often arrive as root-owned; make sure the app can write SQLite files.
if [ "$(id -u)" = "0" ]; then
  chown -R nextjs:nodejs /app/data || true
  chmod -R u+rwX /app/data || true
  exec gosu nextjs node server.js
fi

exec node server.js
