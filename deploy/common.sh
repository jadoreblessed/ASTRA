# Shared by the deploy scripts. Sourced, not run.
APP_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
ENV_FILE=/etc/astra/astra.env

need_root() {
  if [ "$(id -u)" -ne 0 ]; then
    echo "Run it as root: sudo bash $0 $*" >&2
    exit 1
  fi
}

# Replaces one line in the env file, keeping its owner and mode.
set_env() {
  local key="$1" value="$2" tmp
  case "$value" in
    *\"* | *$'\n'*)
      echo "$key: the value can't contain quotes or line breaks." >&2
      exit 1
      ;;
  esac
  tmp="$(mktemp)"
  grep -v "^$key=" "$ENV_FILE" > "$tmp" || true
  printf '%s="%s"\n' "$key" "$value" >> "$tmp"
  install -m 640 -o root -g astra "$tmp" "$ENV_FILE"
  rm -f "$tmp"
}

# Runs a command as the astra user with the env file loaded, from the given folder.
as_astra() {
  local dir="$1"
  shift
  runuser -u astra -- env HOME=/var/lib/astra bash -c "set -a; . '$ENV_FILE'; set +a; cd '$dir'; $*"
}

# Installs dependencies and builds the backend and the site.
build_all() {
  echo "==> Building the backend"
  # The env file says production, and npm would then skip the compiler, so build with NODE_ENV cleared.
  as_astra "$APP_DIR/server" "NODE_ENV= npm ci --no-audit --no-fund && NODE_ENV= npm run build && npm prune --omit=dev --no-audit --no-fund"
  echo "==> Building the site"
  as_astra "$APP_DIR" "NODE_ENV= npm ci --no-audit --no-fund"
  # The build downloads the fonts from Google, and one dropped download fails it: try twice.
  if ! as_astra "$APP_DIR" "NEXT_TELEMETRY_DISABLED=1 NODE_ENV=production npx next build"; then
    echo "==> The site build failed, trying once more"
    sleep 5
    as_astra "$APP_DIR" "NEXT_TELEMETRY_DISABLED=1 NODE_ENV=production npx next build"
  fi
}

wait_for_health() {
  local i
  for i in $(seq 1 40); do
    if curl -fs --max-time 3 http://127.0.0.1:8080/health > /dev/null && curl -fs --max-time 3 -o /dev/null http://127.0.0.1:3000/; then
      return 0
    fi
    sleep 3
  done
  echo "The services didn't come up. Look here: journalctl -u astra-api -u astra-web -n 50" >&2
  return 1
}
