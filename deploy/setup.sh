#!/usr/bin/env bash
# ASTRA on a clean Ubuntu server, no Docker: Postgres, Node, Caddy (HTTPS) and systemd.
#
#   sudo bash deploy/setup.sh yourdomain.com [x_handle]
#
# Safe to run again: the secrets in /etc/astra/astra.env are made once and never replaced,
# because MASTER_KEY is what opens the vault. Trading stays off until you turn it on.
set -euo pipefail
. "$(dirname "${BASH_SOURCE[0]}")/common.sh"
need_root "$@"

DOMAIN="${1:-}"
X_HANDLE="${2:-}"
if [ -z "$DOMAIN" ]; then
  echo "Usage: sudo bash deploy/setup.sh yourdomain.com [x_handle]" >&2
  echo "   or: sudo bash deploy/setup.sh 1.2.3.4 [x_handle]   (plain http until there's a domain)" >&2
  exit 1
fi
DOMAIN="${DOMAIN#https://}"
DOMAIN="${DOMAIN#http://}"
DOMAIN="${DOMAIN%/}"
# A bare IP can't get a certificate, so it's served over plain http. A domain gets HTTPS.
if [[ "$DOMAIN" =~ ^[0-9]+\.[0-9]+\.[0-9]+\.[0-9]+$ ]]; then
  SITE_URL="http://$DOMAIN"
else
  SITE_URL="https://$DOMAIN"
fi

export DEBIAN_FRONTEND=noninteractive

echo "==> Installing Postgres, Node and Caddy"
apt-get update -qq
apt-get install -y -qq curl ca-certificates gnupg openssl postgresql git

if ! command -v node > /dev/null || [ "$(node -p 'process.versions.node.split(".")[0]')" -lt 20 ]; then
  curl -fsSL https://deb.nodesource.com/setup_22.x | bash -
  apt-get install -y -qq nodejs
fi

if ! command -v caddy > /dev/null; then
  curl -fsSL https://dl.cloudsmith.io/public/caddy/stable/gpg.key | gpg --batch --yes --dearmor -o /usr/share/keyrings/caddy-stable-archive-keyring.gpg
  curl -fsSL https://dl.cloudsmith.io/public/caddy/stable/debian.deb.txt > /etc/apt/sources.list.d/caddy-stable.list
  apt-get update -qq
  apt-get install -y -qq caddy
fi

# The site's build needs about 2 GB; the smallest servers don't have it without swap.
TOTAL_MB="$(free -m | awk '/^Mem:/ {m=$2} /^Swap:/ {s=$2} END {print m+s}')"
if [ "$TOTAL_MB" -lt 2500 ] && [ ! -f /swapfile ]; then
  echo "==> Adding 2 GB of swap"
  if fallocate -l 2G /swapfile && chmod 600 /swapfile && mkswap /swapfile > /dev/null && swapon /swapfile; then
    echo '/swapfile none swap sw 0 0' >> /etc/fstab
  else
    rm -f /swapfile
    echo "No swap added; the build may run out of memory on a small server."
  fi
fi

id astra > /dev/null 2>&1 || useradd --system --create-home --home-dir /var/lib/astra --shell /usr/sbin/nologin astra
chown -R astra:astra "$APP_DIR"

systemctl enable --now postgresql > /dev/null

mkdir -p /etc/astra
chmod 750 /etc/astra
chown root:astra /etc/astra

if [ ! -f "$ENV_FILE" ]; then
  echo "==> Making the secrets"
  DB_PASSWORD="$(openssl rand -hex 24)"
  ( umask 027
    cat > "$ENV_FILE" <<EOF
# ASTRA settings. MASTER_KEY opens the vault and every email wallet: keep a copy in a
# password manager, off this server. Lose it and the money is gone. Never share this file.
# Change a setting with: sudo bash deploy/set.sh NAME value
NODE_ENV="production"
HOST="127.0.0.1"
PORT="8080"
SIGNER_HOST="127.0.0.1"
SIGNER_PORT="8081"
DATABASE_URL="postgres://astra:$DB_PASSWORD@127.0.0.1:5432/astra"
MASTER_KEY="$(openssl rand -base64 32)"
SIGNER_TOKEN="$(openssl rand -hex 32)"
ADMIN_TOKEN="$(openssl rand -hex 18)"
SOLANA_CLUSTER="mainnet-beta"
SOLANA_RPC_URL="https://api.mainnet-beta.solana.com"
RESEND_API_KEY=""
TRADING_ENABLED="false"
MAX_TOTAL_SPEND_LAMPORTS="50000000"
MAX_ORDER_USD="2"
PLATFORM_FEE_BPS="50"
TREASURY_WALLET=""
MAX_SLIPPAGE_BPS="100"
PRICE_MAX_AGE_SEC="120"
EOF
  )
  chown root:astra "$ENV_FILE"
  chmod 640 "$ENV_FILE"
fi

set_env CORS_ORIGINS "$SITE_URL"
set_env MAIL_FROM "ASTRA <login@$DOMAIN>"
set_env NEXT_PUBLIC_SITE_URL "$SITE_URL"
# Empty on purpose: the site and the API share one address.
set_env NEXT_PUBLIC_API_URL ""
if [ -n "$X_HANDLE" ] || ! grep -q '^NEXT_PUBLIC_X_HANDLE=' "$ENV_FILE"; then
  set_env NEXT_PUBLIC_X_HANDLE "$X_HANDLE"
fi

echo "==> Setting up the database"
DB_PASSWORD="$(sed -n 's|^DATABASE_URL="postgres://astra:\([^@]*\)@.*|\1|p' "$ENV_FILE")"
cd /
if ! runuser -u postgres -- psql -tAc "SELECT 1 FROM pg_roles WHERE rolname = 'astra'" | grep -q 1; then
  runuser -u postgres -- psql -q -c "CREATE ROLE astra LOGIN PASSWORD '$DB_PASSWORD'"
fi
if ! runuser -u postgres -- psql -tAc "SELECT 1 FROM pg_database WHERE datname = 'astra'" | grep -q 1; then
  runuser -u postgres -- createdb -O astra astra
fi

build_all

echo "==> Preparing the vault"
as_astra "$APP_DIR/server" "node dist/util/migrate.js"
if ! grep -q '^VAULT_SEALED=' "$ENV_FILE"; then
  # A copy of the sealed key next to MASTER_KEY, so losing the database can't lose the vault.
  EXPORT="$(as_astra "$APP_DIR/server" "node dist/util/vault-export.js")"
  SEALED="$(printf '%s\n' "$EXPORT" | sed -n 's/^VAULT_SEALED=//p')"
  [ -n "$SEALED" ] || { echo "Couldn't read the vault." >&2; exit 1; }
  set_env VAULT_SEALED "$SEALED"
fi

echo "==> Installing the services"
NODE_BIN="$(command -v node)"

unit() {
  local name="$1" description="$2" dir="$3" exec_args="$4" after="$5"
  cat > "/etc/systemd/system/$name.service" <<EOF
[Unit]
Description=$description
After=$after
PartOf=astra.target

[Service]
User=astra
WorkingDirectory=$dir
EnvironmentFile=$ENV_FILE
ExecStart=$NODE_BIN $exec_args
Restart=always
RestartSec=3
NoNewPrivileges=true
PrivateTmp=true
ProtectSystem=full
ProtectHome=true

[Install]
WantedBy=astra.target
EOF
}

unit astra-signer "ASTRA signer (the only process that opens a key)" "$APP_DIR/server" "dist/signer/service.js" "network-online.target postgresql.service"
unit astra-api "ASTRA API" "$APP_DIR/server" "dist/server.js" "network-online.target postgresql.service astra-signer.service"
unit astra-worker "ASTRA worker (prices, payouts)" "$APP_DIR/server" "dist/workers/index.js" "network-online.target postgresql.service astra-signer.service astra-api.service"
unit astra-web "ASTRA site" "$APP_DIR" "node_modules/next/dist/bin/next start -p 3000 -H 127.0.0.1" "network-online.target"

cat > /etc/systemd/system/astra.target <<EOF
[Unit]
Description=ASTRA

[Install]
WantedBy=multi-user.target
EOF

systemctl daemon-reload
systemctl enable astra.target astra-signer astra-api astra-worker astra-web > /dev/null 2>&1
systemctl restart astra-signer astra-api astra-worker astra-web
systemctl start astra.target

cat > /etc/caddy/Caddyfile <<EOF
$SITE_URL {
	encode zstd gzip

	# The contact form belongs to the site, the rest of /api to the backend.
	@api {
		path /api/* /health
		not path /api/contact
	}
	reverse_proxy @api 127.0.0.1:8080
	reverse_proxy 127.0.0.1:3000
}
EOF
systemctl enable caddy > /dev/null 2>&1
systemctl restart caddy

# A dump of the database every day, 14 days kept. The keys in it are sealed by MASTER_KEY.
mkdir -p /var/backups/astra
chmod 700 /var/backups/astra
cat > /etc/cron.daily/astra-backup <<'EOF'
#!/bin/sh
set -e
out="/var/backups/astra/astra-$(date +%F).sql.gz"
cd /
runuser -u postgres -- pg_dump astra | gzip > "$out"
chmod 600 "$out"
find /var/backups/astra -name 'astra-*.sql.gz' -mtime +14 -delete
EOF
chmod 755 /etc/cron.daily/astra-backup

echo "==> Waiting for everything to start"
wait_for_health

VAULT="$(curl -fs http://127.0.0.1:8080/api/config | node -e 'let s="";process.stdin.on("data",(d)=>s+=d).on("end",()=>console.log(JSON.parse(s).vault))')"

cat <<EOF

ASTRA is up: $SITE_URL
Trading is OFF. Nobody can buy yet.

Vault address: $VAULT
Admin key:     sudo grep ADMIN_TOKEN $ENV_FILE

What's next is in deploy/README.md, from step 3. First thing: copy MASTER_KEY off this server.
  sudo grep MASTER_KEY $ENV_FILE
EOF
