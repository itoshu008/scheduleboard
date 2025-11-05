#!/usr/bin/env bash
set -euo pipefail

APP_ROOT="$(cd "$(dirname "$0")" && pwd)"
TARGET="/var/www/html/scheduleboard"
NGINX="/usr/sbin/nginx"

say() { printf '%s\n' "$*"; }
die() { printf 'ERROR: %s\n' "$*" >&2; exit 1; }

say "[0/4] Preflight checks..."
# 0-1) nginx path
[ -x "$NGINX" ] || die "nginx not found at $NGINX. Ask admin to confirm path and sudoers rule."
# 0-2) target dir
[ -d "$TARGET" ] || die "Target $TARGET not found. Ask admin to create & chown to itoshu2."
[ -w "$TARGET" ] || die "Target $TARGET not writable by current user."
# 0-3) vite base sanity (warn only)
if [ -f "$APP_ROOT/suke/vite.config.ts" ] && ! grep -q "base: '/scheduleboard/'" "$APP_ROOT/suke/vite.config.ts"; then
  say "WARN: vite base may not be '/scheduleboard/'. Update vite.config.ts if assets 404."
fi

say "[1/4] Build client (suke)..."
if [ -f "$APP_ROOT/suke/package-lock.json" ]; then
  npm --prefix "$APP_ROOT/suke" ci || npm --prefix "$APP_ROOT/suke" install
else
  npm --prefix "$APP_ROOT/suke" install
fi
npm --prefix "$APP_ROOT/suke" run build

say "[2/4] Sync artifacts -> $TARGET"
rsync -av --delete "$APP_ROOT/suke/dist/" "$TARGET/"

say "[3/4] Validate nginx config..."
sudo "$NGINX" -t

say "[4/4] Reload nginx (zero-downtime)..."
sudo "$NGINX" -s reload

say "Done. Visit: https://zatint1991.com/scheduleboard/"
