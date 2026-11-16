#!/usr/bin/env bash
# Pulls the latest code, rebuilds and restarts. Settings and the database stay as they are.
#
#   sudo bash deploy/update.sh
set -euo pipefail
. "$(dirname "${BASH_SOURCE[0]}")/common.sh"
need_root "$@"

if [ -z "${ASTRA_PULLED:-}" ]; then
  echo "==> Pulling the code"
  runuser -u astra -- env HOME=/var/lib/astra git -C "$APP_DIR" pull --ff-only
  # Run the freshly pulled copy of this script, so a fix to the deploy scripts applies now.
  ASTRA_PULLED=1 exec bash "$APP_DIR/deploy/update.sh" "$@"
fi

build_all

echo "==> Updating the database"
as_astra "$APP_DIR/server" "node dist/util/migrate.js"

echo "==> Restarting"
systemctl restart astra-signer astra-api astra-worker astra-web
wait_for_health
echo "Done."
