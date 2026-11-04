#!/usr/bin/env bash
# Changes one setting and restarts the backend.
#
#   sudo bash deploy/set.sh TRADING_ENABLED true
#   sudo bash deploy/set.sh TREASURY_WALLET <address>
#   sudo bash deploy/set.sh SOLANA_RPC_URL https://...
set -euo pipefail
. "$(dirname "${BASH_SOURCE[0]}")/common.sh"
need_root "$@"

KEY="${1:-}"
if [ -z "$KEY" ] || [ "$#" -ne 2 ]; then
  echo "Usage: sudo bash deploy/set.sh NAME value" >&2
  exit 1
fi

case "$KEY" in
  MASTER_KEY | VAULT_SEALED | DATABASE_URL)
    echo "$KEY stays as it is: changing it cuts the backend off from the vault or the database." >&2
    exit 1
    ;;
  *[!A-Z0-9_]*)
    echo "That doesn't look like a setting's name: $KEY" >&2
    exit 1
    ;;
esac

set_env "$KEY" "$2"

case "$KEY" in
  NEXT_PUBLIC_*)
    echo "Saved. It's built into the site, so run: sudo bash deploy/update.sh"
    ;;
  *)
    systemctl restart astra-signer astra-api astra-worker
    wait_for_health
    echo "Saved and restarted."
    ;;
esac
