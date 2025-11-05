#!/usr/bin/env bash
set -euo pipefail

APP_ROOT="$(cd "$(dirname "$0")" && pwd)"
TARGET="/var/www/html/scheduleboard"
NGINX="/usr/sbin/nginx"
SITE_URL="https://zatint1991.com/scheduleboard/"

say(){ printf '%s\n' "$*"; }
die(){ printf 'ERROR: %s\n' "$*" >&2; exit 1; }

say "[0/6] Preflight: repo and env checks..."
[ -x "$NGINX" ] || die "nginx not found at $NGINX (ask admin to confirm path & sudoers)."
[ -d "$APP_ROOT/suke" ] || die "suke/ not found."
[ -d "$TARGET" ] || die "Target $TARGET not found. Ask admin to create & chown to itoshu2."
[ -w "$TARGET" ] || die "Target $TARGET not writable by current user."

say "[1/6] Preflight: nginx mapping check for /scheduleboard/ (read-only)…"
# Allowed by sudoers (/usr/sbin/nginx). We only read config, do not modify.
if ! sudo "$NGINX" -T 2>/dev/null | grep -qE 'location\s+\^~\s+/scheduleboard/'; then
  say "WARN: nginx location for /scheduleboard/ not found in effective config."
  say "      Admin should add the following and reload nginx:"
  cat <<'NGX'
location ^~ /scheduleboard/ {
    alias /var/www/html/scheduleboard/;
    try_files $uri $uri/ /scheduleboard/index.html;
}
NGX
fi

say "[2/6] Build client (suke)…"
if [ -f "$APP_ROOT/suke/package-lock.json" ]; then
  npm --prefix "$APP_ROOT/suke" ci || npm --prefix "$APP_ROOT/suke" install
else
  npm --prefix "$APP_ROOT/suke" install
fi
npm --prefix "$APP_ROOT/suke" run build

say "[3/6] Inspect built dist for /scheduleboard/ correctness…"
npm run --silent inspect:dist || die "dist inspector failed (see messages above)."

say "[4/6] Rsync artifacts -> $TARGET"
rsync -av --delete "$APP_ROOT/suke/dist/" "$TARGET/"

say "[5/6] Validate nginx config (syntax)…"
sudo "$NGINX" -t

say "[6/6] Reload nginx (zero-downtime)…"
sudo "$NGINX" -s reload

# Optional smoke test (best-effort)
if command -v curl >/dev/null 2>&1; then
  say "[Smoke] HEAD $SITE_URL"
  curl -sI "$SITE_URL" | sed -n '1,12p' || true
fi

say "✅ Deploy finished. Visit: $SITE_URL"
