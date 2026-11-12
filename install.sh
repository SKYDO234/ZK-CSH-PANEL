#!/usr/bin/env bash
#
#  ZK STUDIO — Vaultly all-in-one installer
#  ----------------------------------------
#  Installs and hosts the panel on port 77777.
#
#  Usage:
#     sudo bash install.sh [options]
#
#  Options:
#     --port <n>            Port to serve the panel on            (default: 77777)
#     --domain <host>       Public hostname, e.g. files.example.com
#     --admin-email <mail>  First administrator email             (default: admin@<host>)
#     --admin-password <pw> Administrator password                (default: generated)
#     --dir <path>          Install directory         (default: /opt/zk-studio/vaultly)
#     --no-db               Use an external DATABASE_URL from the environment
#     --no-worker           Skip the background worker service
#     --no-systemd          Run in the foreground instead of installing services
#                           (automatic inside containers / on macOS)
#     --rootless            Install into $HOME as the current user, no root needed
#                           (also selected automatically when sudo is unusable)
#     --uninstall           Stop services and remove the installed app
#     --help                Show this help
#
#  Everything is idempotent: re-running updates the code and applies migrations
#  without touching your data, .env or admin credentials.
#
set -Eeuo pipefail

# ─────────────────────────────────────────────────────────────────────────────
# Configuration
# ─────────────────────────────────────────────────────────────────────────────
ORIG_ARGS=("$@")

APP_NAME="zk-studio-vaultly"
APP_USER="zkstudio"
PORT="${PORT:-8080}"
PORT_EXPLICIT=0
DOMAIN=""
ADMIN_EMAIL=""
ADMIN_PASSWORD=""
INSTALL_DIR="${INSTALL_DIR:-/opt/zk-studio/vaultly}"
USE_LOCAL_DB=1
INSTALL_WORKER=1
USE_SYSTEMD=1
UNINSTALL=0
FORCE_ROOTLESS=0

# Cloudflare R2 / S3 (export these before running to enable object storage)
S3_BUCKET="${S3_BUCKET:-}"
S3_REGION="${S3_REGION:-auto}"
S3_ACCESS_KEY_ID="${S3_ACCESS_KEY_ID:-}"
S3_SECRET_ACCESS_KEY="${S3_SECRET_ACCESS_KEY:-}"
S3_ENDPOINT="${S3_ENDPOINT:-}"
S3_FORCE_PATH_STYLE="${S3_FORCE_PATH_STYLE:-false}"

IT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

# "system"  = a real PostgreSQL server (installed or already running)
# "embedded"= the bundled PostgreSQL that ships with this repo (no root, no apt)
DB_MODE="system"

# Port sanity: TCP ports are 1–65535. 77777 (the requested default) is above
# that range, so we fall back to the closest valid port instead of failing late.
validate_port() {
  case "$PORT" in
    ''|*[!0-9]*) die "Invalid port: '$PORT' — use a number between 1 and 65535." ;;
  esac
  if [ "$PORT" -lt 1 ] || [ "$PORT" -gt 65535 ]; then
    local requested="$PORT"
    PORT=8080
    if [ "$PORT_EXPLICIT" -eq 1 ]; then
      warn "Port ${requested} is not a valid TCP port (1–65535); using ${PORT} instead."
      warn "Re-run with --port <n> to pick your own (e.g. --port 3000)."
    fi
  fi
}

# ─────────────────────────────────────────────────────────────────────────────
# Output helpers
# ─────────────────────────────────────────────────────────────────────────────
if [ -t 1 ] && [ -z "${NO_COLOR:-}" ]; then
  BOLD=$'\033[1m'; DIM=$'\033[2m'; RED=$'\033[31m'; GREEN=$'\033[32m'
  YELLOW=$'\033[33m'; BLUE=$'\033[34m'; CYAN=$'\033[36m'; RESET=$'\033[0m'
else
  BOLD=""; DIM=""; RED=""; GREEN=""; YELLOW=""; BLUE=""; CYAN=""; RESET=""
fi

step()  { printf '\n%s▸ %s%s\n' "$BOLD$BLUE" "$*" "$RESET"; }
ok()    { printf '  %s✓%s %s\n' "$GREEN" "$RESET" "$*"; }
info()  { printf '  %s·%s %s\n' "$DIM" "$RESET" "$*"; }
warn()  { printf '  %s!%s %s\n' "$YELLOW" "$RESET" "$*" >&2; }
die()   { printf '\n%s✖ %s%s\n' "$RED" "$*" "$RESET" >&2; exit 1; }

trap 'die "Installation failed (line $LINENO). Nothing was left half-started; fix the error above and re-run."' ERR

# ─────────────────────────────────────────────────────────────────────────────
# Argument parsing
# ─────────────────────────────────────────────────────────────────────────────
usage() { sed -n '3,25p' "${BASH_SOURCE[0]}" | sed 's/^#//; s/^ //'; exit 0; }

while [ $# -gt 0 ]; do
  case "$1" in
    --port)           PORT="${2:?--port needs a value}"; PORT_EXPLICIT=1; shift 2 ;;
    --domain)         DOMAIN="${2:?--domain needs a value}"; shift 2 ;;
    --admin-email)    ADMIN_EMAIL="${2:?}"; shift 2 ;;
    --admin-password) ADMIN_PASSWORD="${2:?}"; shift 2 ;;
    --dir)            INSTALL_DIR="${2:?}"; shift 2 ;;
    --no-db)          USE_LOCAL_DB=0; shift ;;
    --no-worker)      INSTALL_WORKER=0; shift ;;
    --no-systemd)     USE_SYSTEMD=0; shift ;;
    --rootless)       FORCE_ROOTLESS=1; shift ;;
    --uninstall)      UNINSTALL=1; shift ;;
    --help|-h)        usage ;;
    *)                die "Unknown option: $1  (try --help)" ;;
  esac
done

# ─────────────────────────────────────────────────────────────────────────────
# Platform detection
# ─────────────────────────────────────────────────────────────────────────────
DISTRO=""; PKG=""; IS_ROOT=0; SUDO=""; IN_CONTAINER=0; INIT=""; LOCAL_PG_PORT=""

# ─────────────────────────────────────────────────────────────────────────────
# Privilege handling
# ─────────────────────────────────────────────────────────────────────────────
elevate() {
  [ "${FORCE_ROOTLESS:-0}" = "1" ] && { setup_rootless; return 0; }
  [ "$(id -u)" -eq 0 ] && return 0

  if [ "${ZK_INSTALL_ELEVATED:-0}" = "1" ]; then
    # We already re-executed as root but are somehow not — bail clearly.
    die "Root privileges are required."
  fi

  local self; self="$(readlink -f "${BASH_SOURCE[0]}")"

  # Codespaces, dev containers and CI usually have passwordless sudo: re-exec
  # straight away so the whole run is root and no mid-install password prompt
  # can appear (which is what happens with a bare "sudo" inside a function).
  if command -v sudo >/dev/null 2>&1 && sudo -n true >/dev/null 2>&1; then
    printf '  · elevating with sudo (passwordless)\n'
    exec env ZK_INSTALL_ELEVATED=1 sudo -n -E bash "$self" "${ORIG_ARGS[@]}"
  fi

  # Sudo exists but needs a password. In Codespaces and similar containers the
  # login user often has *no* password, so prompting can never succeed. Ask for
  # one attempt, then fall back to a rootless install in the current directory.
  if command -v sudo >/dev/null 2>&1 && [ -t 0 ]; then
    if sudo -v 2>/dev/null; then
      printf '  · sudo accepted — continuing as root\n'
      exec env ZK_INSTALL_ELEVATED=1 sudo -E bash "$self" "${ORIG_ARGS[@]}"
    fi
    warn "sudo is not usable here (no password for this account)."
  fi

  setup_rootless
}

# Rootless install: everything lives in a user-owned directory and the panel runs
# in the foreground. Used in containers where sudo has no usable password.
setup_rootless() {
  export ROOTLESS=1
  USE_SYSTEMD=0
  if [ "${ZK_ROOTLESS_ANNOUNCED:-0}" != "1" ]; then
    export ZK_ROOTLESS_ANNOUNCED=1
    warn "Installing without root — files go to a user-owned directory."
    warn "No systemd services; the panel runs in the foreground."
  fi
  case "$INSTALL_DIR" in
    /opt/*|/usr/*|/srv/*) INSTALL_DIR="$HOME/zk-studio/vaultly" ;;
  esac
  [ "$PORT_EXPLICIT" -eq 1 ] || PORT=3000
  APP_USER="$(id -un)"
  return 0
}

detect_platform() {
  step "Detecting platform"
  case "$(uname -s)" in
    Linux)  OS=linux ;;
    Darwin) OS=macos ;;
    *)      die "Unsupported operating system: $(uname -s). Linux or macOS required." ;;
  esac

  if [ "$OS" = linux ]; then
    if [ -f /etc/os-release ]; then
      # shellcheck disable=SC1091
      . /etc/os-release
      DISTRO="${ID:-unknown}"
      case "$DISTRO" in
        ubuntu|debian|pop|linuxmint|raspbian) PKG="apt" ;;
        rhel|centos|rocky|almalinux|fedora|ol|amzn) PKG="dnf" ;;
        alpine) PKG="apk" ;;
        arch|manjaro|endeavouros) PKG="pacman" ;;
        *) PKG="" ;;
      esac
      info "${PRETTY_NAME:-$DISTRO}"
    else
      info "Linux (unknown distribution)"
    fi
  else
    DISTRO="macos"
    info "macOS $(sw_vers -productVersion 2>/dev/null || true)"
  fi

  [ "$(id -u)" -eq 0 ] && IS_ROOT=1
  if [ "$IS_ROOT" -eq 1 ]; then
    SUDO=""
  elif command -v sudo >/dev/null 2>&1; then
    SUDO="sudo"
  else
    die "This installer needs root. Install sudo, or run it as root (su -)."
  fi

  # Rootless mode never has root available, so no command may be prefixed.
  if [ "${ROOTLESS:-0}" = "1" ]; then
    SUDO=""
    USE_SYSTEMD=0
  fi

  # Containers: no systemd, no user management.
  if [ "$OS" = linux ]; then
    if [ -f /.dockerenv ] || grep -qaE '(docker|containerd|kubepods|lxc)' /proc/1/cgroup 2>/dev/null; then
      IN_CONTAINER=1
    fi
    if [ "$IN_CONTAINER" -eq 0 ] && command -v systemctl >/dev/null 2>&1 && [ -d /run/systemd/system ]; then
      INIT="systemd"
    fi
  fi

  if [ "$USE_SYSTEMD" -eq 1 ] && [ -z "$INIT" ]; then
    warn "systemd not detected — falling back to a foreground process."
    USE_SYSTEMD=0
  fi

  port_in_use && warn "Port $PORT is already in use."
  ok "Platform ready"
}

need_root_hint() {
  if [ "$IS_ROOT" -eq 0 ] && [ -z "$SUDO" ]; then
    die "This step needs root. Re-run with sudo, or install: $*"
  fi
}

pkg_install() {
  # Installs packages with whichever manager is available.
  [ $# -eq 0 ] && return 0
  case "$PKG" in
    apt)
      need_root_hint "$*"
      $SUDO apt-get update -qq
      DEBIAN_FRONTEND=noninteractive $SUDO apt-get install -y -qq "$@" >/dev/null
      ;;
    dnf)  need_root_hint "$*"; $SUDO dnf install -y -q "$@" >/dev/null ;;
    apk)  need_root_hint "$*"; $SUDO apk add --no-cache "$@" >/dev/null ;;
    pacman) need_root_hint "$*"; $SUDO pacman -Sy --noconfirm --needed "$@" >/dev/null ;;
    *)    return 1 ;;
  esac
}

has() { command -v "$1" >/dev/null 2>&1; }

# Ports are the most common install-time collision (a coding sandbox or another
# Postgres already owns 5432). Pick a free one instead of failing later.
free_port() {
  local p="${1:-5432}" limit=$(( ${1:-5432} + 50 ))
  while [ "$p" -lt "$limit" ]; do
    port_open "$p" || { printf '%s' "$p"; return 0; }
    p=$((p + 1))
  done
  return 1
}

port_in_use() {
  port_open "${1:-$PORT}"
}

# True when anything is already listening on the given TCP port.
port_open() {
  local p="$1"
  if has ss; then ss -ltn 2>/dev/null | awk '{print $4}' | grep -qE "[:.]${p}\$"
  elif has lsof; then lsof -iTCP:"$PORT" -sTCP:LISTEN >/dev/null 2>&1
  else return 1
  fi
}

# ─────────────────────────────────────────────────────────────────────────────
# Node.js
# ─────────────────────────────────────────────────────────────────────────────
NODE_MIN_MAJOR=20
node_ok() {
  has node || return 1
  local major
  major="$(node -p 'process.versions.node.split(".")[0]' 2>/dev/null || echo 0)"
  [ "$major" -ge "$NODE_MIN_MAJOR" ]
}

install_node() {
  step "Checking Node.js (need ≥ $NODE_MIN_MAJOR)"
  if node_ok; then
    ok "Node $(node -v) already installed"
    return
  fi

  if [ "${ROOTLESS:-0}" = "1" ]; then
    die "Node.js $NODE_MIN_MAJOR+ is required and cannot be installed without root.
     Install it from https://nodejs.org (or use nvm), then re-run this script."
  fi

  info "Installing Node.js 22 LTS"
  case "$PKG" in
    apt)
      need_root_hint "nodejs"
      $SUDO mkdir -p /etc/apt/keyrings
      curl -fsSL https://deb.nodesource.com/gpgkey/nodesource-repo.gpg.key \
        | $SUDO gpg --dearmor --yes -o /etc/apt/keyrings/nodesource.gpg
      echo "deb [signed-by=/etc/apt/keyrings/nodesource.gpg] https://deb.nodesource.com/node_22.x nodistro main" \
        | $SUDO tee /etc/apt/sources.list.d/nodesource.list >/dev/null
      $SUDO apt-get update -qq
      DEBIAN_FRONTEND=noninteractive $SUDO apt-get install -y -qq nodejs >/dev/null
      ;;
    dnf)    need_root_hint "nodejs"; $SUDO dnf module install -y nodejs:22 >/dev/null 2>&1 || $SUDO dnf install -y nodejs >/dev/null ;;
    apk)    need_root_hint "nodejs"; $SUDO apk add --no-cache nodejs npm >/dev/null ;;
    pacman) need_root_hint "nodejs"; $SUDO pacman -Sy --noconfirm --needed nodejs npm >/dev/null ;;
    macos)
      if has brew; then brew install node@22 >/dev/null; else
        die "Homebrew not found. Install Node 22 from https://nodejs.org, then re-run."
      fi
      ;;
    *) die "Cannot install Node.js automatically. Install Node 22 LTS and re-run." ;;
  esac

  node_ok || die "Node.js installation did not produce a usable binary."
  ok "Node $(node -v) installed"
}

# ─────────────────────────────────────────────────────────────────────────────
# PostgreSQL
# ─────────────────────────────────────────────────────────────────────────────
DB_NAME="vaultly"
DB_USER="vaultly"
DB_PASSWORD=""

PG_PORT=5432

# Every psql call runs with -w (never prompt) and stdin from /dev/null. Without
# this, a container cluster using scram-sha-256 makes psql print
# "Password for user postgres:" and wait for input forever — the install then
# looks frozen on "Checking PostgreSQL".
pg_ready() {
  # True when we can run SQL against the server.
  local user="${1:-$DB_USER}" pass="${2-$DB_PASSWORD}"
  if [ -n "$pass" ]; then
    PGPASSWORD="$pass" psql -w -X -h 127.0.0.1 -p "$PG_PORT" -U "$user" -d postgres -tAc 'select 1' </dev/null >/dev/null 2>&1
  else
    env -u PGPASSWORD psql -w -X -h 127.0.0.1 -p "$PG_PORT" -U "$user" -d postgres -tAc 'select 1' </dev/null >/dev/null 2>&1
  fi
}

# True when the postgres superuser can run SQL. Prefers the local socket as the
# postgres OS user (peer auth — no password involved), then falls back to TCP.
superuser_ready() {
  if can_switch_user; then
    run_as postgres env -u PGPASSWORD psql -w -X -d postgres -tAc 'select 1' </dev/null >/dev/null 2>&1
  else
    pg_ready postgres ""
  fi
}

install_postgres() {
  step "Checking PostgreSQL"
  if [ "$USE_LOCAL_DB" -eq 0 ]; then
    [ -n "${DATABASE_URL:-}" ] || die "--no-db requires DATABASE_URL to be set."
    ok "Using external database: ${DATABASE_URL%%\?*}"
    return
  fi

  # The bundled database binds 127.0.0.1, so a busy 5432 (very common in
  # containers and developer machines) must not make the install fail.
  if [ -z "${LOCAL_PG_PORT:-}" ]; then
    LOCAL_PG_PORT="$(free_port 5432 || echo 5432)"
    [ "$LOCAL_PG_PORT" = "5432" ] || info "Port 5432 is busy — bundled PostgreSQL will use $LOCAL_PG_PORT"
  fi

  # Already-running server with our role? Use it.
  if pg_ready "$DB_USER"; then
    DB_MODE="system"
    ok "PostgreSQL already running with the $DB_USER role"
    return
  fi

  # A server that accepts the postgres superuser: create the role + database.
  if has psql && superuser_ready; then
    DB_MODE="system"
    provision_role
    ok "PostgreSQL ready (db: $DB_NAME, role: $DB_USER)"
    return
  fi

  # Try installing a system server. Requires root + reachable package repos.
  # IMPORTANT: starting a freshly installed server can fail (containers have no
  # systemd, clusters need initdb). Any failure here must fall through to the
  # bundled database, never abort the run — hence the guarded call + check.
  if try_install_system_postgres; then
    if start_system_postgres && superuser_ready; then
      DB_MODE="system"
      provision_role || true
      if pg_ready "$DB_USER" "$DB_PASSWORD" || pg_ready "$DB_USER"; then
        ok "PostgreSQL installed (db: $DB_NAME, role: $DB_USER)"
        return
      fi
      warn "A system PostgreSQL was installed but is not usable yet."
    else
      warn "A system PostgreSQL was installed but could not be started."
    fi
  fi

  # Fall back to the bundled PostgreSQL — no root, no package manager needed.
  warn "System PostgreSQL unavailable — using the bundled PostgreSQL instead."
  DB_MODE="embedded"
  DB_USER="postgres"
  DB_PASSWORD="postgres"
  DB_NAME="${DB_NAME:-vaultly}"
  ok "Using bundled PostgreSQL (data in $INSTALL_DIR/.data/postgres)"
}

try_install_system_postgres() {
  [ "${ROOTLESS:-0}" = "1" ] && return 1
  [ "$OS" = linux ] || { [ "$OS" = macos ] && has brew && brew install postgresql@16 >/dev/null 2>&1; return $?; }
  [ "$PKG" = "" ] && return 1
  # Only attempt when we can elevate; a failed repo fetch is a soft failure.
  if [ "$IS_ROOT" -eq 0 ] && [ -z "$SUDO" ]; then return 1; fi
  case "$PKG" in
    apt)    pkg_install postgresql postgresql-contrib >/dev/null 2>&1 || return 1 ;;
    dnf)    pkg_install postgresql-server postgresql-contrib >/dev/null 2>&1 || return 1
            $SUDO postgresql-setup --initdb >/dev/null 2>&1 || true ;;
    apk)    pkg_install postgresql postgresql-contrib >/dev/null 2>&1 || return 1 ;;
    pacman) pkg_install postgresql >/dev/null 2>&1 || return 1
            run_as postgres initdb -D /var/lib/postgres/data >/dev/null 2>&1 || true ;;
    *)      return 1 ;;
  esac
  has psql
}

start_system_postgres() {
  # Returns 0 only when the server answers. Never inherits a failing exit status
  # (the caller falls back to the bundled database).
  if [ -n "$INIT" ] && has systemctl; then
    for svc in postgresql postgresql@16 postgresql@15 postgresql@14; do
      $SUDO systemctl enable --now "$svc" >/dev/null 2>&1 && break
    done
  elif [ "$OS" = "macos" ] && has brew; then
    brew services start postgresql@16 >/dev/null 2>&1 || true
  else
    # No systemd (containers, Codespaces): start the cluster directly.
    local pgctl=""
    for candidate in "$(command -v pg_ctlcluster 2>/dev/null)" /usr/lib/postgresql/*/bin/pg_ctl; do
      [ -n "$candidate" ] && [ -x "$candidate" ] && { pgctl="$candidate"; break; }
    done
    if has pg_ctlcluster; then
      $SUDO pg_ctlcluster "$(pg_lsclusters -h 2>/dev/null | awk 'NR==1{print $1}' || echo 16)" main start >/dev/null 2>&1 || true
    elif [ -n "$pgctl" ]; then
      local datadir
      datadir="$(pg_lsclusters -h 2>/dev/null | awk 'NR==1{print $6}')"
      [ -n "$datadir" ] && run_as postgres "$pgctl" -D "$datadir" -l /tmp/pg.log start >/dev/null 2>&1 || true
    elif has service; then
      $SUDO service postgresql start >/dev/null 2>&1 || true
    fi
  fi

  local i
  for i in $(seq 1 20); do
    pg_ready "postgres" "" && return 0
    sleep 1
  done
  return 1
}

provision_role() {
  DB_PASSWORD="${DB_PASSWORD:-$(openssl_rand 24)}"
  run_as postgres env -u PGPASSWORD psql -w -X -v ON_ERROR_STOP=0 -q >/dev/null 2>&1 <<SQL || true
    DO \$\$ BEGIN
      IF NOT EXISTS (SELECT FROM pg_roles WHERE rolname = '${DB_USER}') THEN
        CREATE ROLE ${DB_USER} LOGIN PASSWORD '${DB_PASSWORD}';
      ELSE
        ALTER ROLE ${DB_USER} WITH LOGIN PASSWORD '${DB_PASSWORD}';
      END IF;
    END \$\$;
SQL
  run_as postgres env -u PGPASSWORD psql -w -X -tAc "SELECT 1 FROM pg_database WHERE datname='${DB_NAME}'" </dev/null 2>/dev/null | grep -q 1 \
    || run_as postgres env -u PGPASSWORD createdb -w -O "${DB_USER}" "${DB_NAME}" </dev/null 2>/dev/null || true
}

# On Debian/macOS the local server may use peer auth for postgres; try without a
# password first when we are root (sudo -u postgres).
pg_password_for_role() {
  printf '%s' "${DB_PASSWORD}"
}

openssl_rand() {
  local n="${1:-32}"
  if has openssl; then openssl rand -base64 "$((n * 2))" | tr -dc 'A-Za-z0-9' | head -c "$n"
  else head -c 200 /dev/urandom | base64 | tr -dc 'A-Za-z0-9' | head -c "$n"; fi
}

ensure_openssl() {
  has openssl && return
  case "$PKG" in
    apt|dnf|apk|pacman) pkg_install openssl >/dev/null 2>&1 || true ;;
    macos) has brew && brew install openssl >/dev/null 2>&1 || true ;;
  esac
}

# ─────────────────────────────────────────────────────────────────────────────
# Application user + directory
# ─────────────────────────────────────────────────────────────────────────────
prepare_user_and_dir() {
  step "Preparing $INSTALL_DIR"

  if [ "${ROOTLESS:-0}" = "1" ]; then
    mkdir -p "$INSTALL_DIR" "$INSTALL_DIR/storage/uploads" "$INSTALL_DIR/.data"
    copy_payload
    mkdir -p "$INSTALL_DIR/storage/uploads" "$INSTALL_DIR/.data/postgres"
    ok "Application files in place (rootless, user: $APP_USER)"
    return
  fi

  need_root_hint

  if [ "$OS" = linux ] && ! id "$APP_USER" >/dev/null 2>&1; then
    $SUDO useradd --system --create-home --shell /usr/sbin/nologin "$APP_USER" 2>/dev/null \
      || $SUDO adduser -S -H -h "/home/$APP_USER" -s /sbin/nologin "$APP_USER" 2>/dev/null \
      || $SUDO useradd -r -m -s /bin/false "$APP_USER"
    ok "Created system user $APP_USER"
  fi

  $SUDO mkdir -p "$INSTALL_DIR" "$INSTALL_DIR/storage/uploads" "$INSTALL_DIR/.data"
  copy_payload
  $SUDO mkdir -p "$INSTALL_DIR/storage/uploads" "$INSTALL_DIR/.data/postgres"

  if [ "$OS" = linux ] && { [ "$IS_ROOT" -eq 1 ] || [ -n "$SUDO" ]; } \
     && id "$APP_USER" >/dev/null 2>&1; then
    $SUDO chown -R "$APP_USER":"$APP_USER" "$INSTALL_DIR" 2>/dev/null || true
  fi
  ok "Application files in place"
}

copy_payload() {
  if [ "$IT_DIR" = "$INSTALL_DIR" ]; then
    info "Installing in place"
    return
  fi
  local RS=""
  [ "${ROOTLESS:-0}" = "1" ] || RS="$SUDO"

  # Skip build artifacts, the local database and node_modules.
  if has rsync; then
    $RS rsync -a --delete \
      --exclude /node_modules --exclude /.next --exclude /.data \
      --exclude /storage --exclude /.git --exclude /.env \
      "$IT_DIR"/ "$INSTALL_DIR"/
  else
    ( cd "$IT_DIR" && tar -cf - \
        --exclude=./node_modules --exclude=./.next --exclude=./.data \
        --exclude=./storage --exclude=./.git --exclude=./.env . ) \
      | $RS tar -xf - -C "$INSTALL_DIR"
  fi
}

# Runs "$@" as <user>. Works whether we are root (no sudo prefix) or relying on
# sudo; `sudo -u` and `runuser -u` both need the switch flag, which is what broke
# earlier when $SUDO expanded to nothing under a plain root shell.
run_as() {
  local user="$1"; shift
  [ "$#" -gt 0 ] || return 0

  if [ "$(id -u)" -eq 0 ]; then
    if has runuser; then
      runuser -u "$user" -- "$@"
    elif has sudo; then
      sudo -u "$user" -- "$@"
    else
      su -s /bin/sh "$user" -c "$(printf '%q ' "$@")"
    fi
    return
  fi

  if [ -n "$SUDO" ]; then
    $SUDO -u "$user" -- "$@"
    return
  fi

  # Cannot switch users — run as the current user if that is already the target.
  if [ "$(id -un)" = "$user" ]; then "$@"; else return 1; fi
}

# True when we can switch to the application user.
can_switch_user() {
  [ "$OS" = linux ] || return 1
  id "$APP_USER" >/dev/null 2>&1 || return 1
  [ "$(id -u)" -eq 0 ] && return 0
  [ -n "$SUDO" ]
}

as_user() {
  if can_switch_user; then
    run_as "$APP_USER" env PATH="$PATH" HOME="/home/$APP_USER" "$@"
  else
    "$@"
  fi
}

# ─────────────────────────────────────────────────────────────────────────────
# Dependencies + build
# ─────────────────────────────────────────────────────────────────────────────
install_deps() {
  step "Installing application dependencies"
  if [ -f "$INSTALL_DIR/package-lock.json" ]; then
    as_user env npm ci --no-audit --no-fund --loglevel=error --prefix "$INSTALL_DIR" >/dev/null 2>&1 \
      || as_user env npm install --no-audit --no-fund --loglevel=error --prefix "$INSTALL_DIR" >/dev/null
  else
    as_user env npm install --no-audit --no-fund --loglevel=error --prefix "$INSTALL_DIR" >/dev/null
  fi
  [ -d "$INSTALL_DIR/node_modules" ] || die "npm install did not create node_modules."
  ok "Dependencies installed"
}

build_app() {
  step "Building the panel (this takes a minute)"
  # Log inside the install dir: /tmp may not be writable by the service user and
  # a stale file there could make the redirect itself fail.
  local log="${INSTALL_DIR}/.data/build.log"
  $SUDO mkdir -p "${INSTALL_DIR}/.data"
  $SUDO rm -f "$log" 2>/dev/null || true
  if [ "${ROOTLESS:-0}" != "1" ] && [ "$OS" = linux ] && can_switch_user; then
    $SUDO chown -R "$APP_USER":"$APP_USER" "${INSTALL_DIR}/.data" 2>/dev/null || true
  fi

  local status=0
  as_user env bash -c "cd '$INSTALL_DIR' && npm run build > '$log' 2>&1" || status=$?

  if [ "$status" -eq 0 ]; then
    ok "Production build complete"
    return
  fi

  if [ -s "$log" ]; then
    warn "Build failed — last 25 lines:"
    tail -25 "$log" >&2
  else
    warn "The build did not produce any output (exit $status)."
  fi
  die "Fix the build error above and re-run ./install.sh"
}

# ─────────────────────────────────────────────────────────────────────────────
# Environment file
# ─────────────────────────────────────────────────────────────────────────────
write_env() {
  step "Writing configuration"
  local env_file="$INSTALL_DIR/.env"
  local public_url="http://localhost:$PORT"

  if [ -n "$DOMAIN" ]; then
    case "$DOMAIN" in
      http://*|https://*) public_url="${DOMAIN%/}" ;;
      *) public_url="https://${DOMAIN%/}" ;;
    esac
  fi

  if $SUDO test -f "$env_file"; then
    info "Existing .env kept (only port-related values are updated)"
    $SUDO sed -i "s|^APP_URL=.*|APP_URL=\"${public_url}\"|" "$env_file" || true
    $SUDO sed -i "s|^PORT=.*|PORT=\"${PORT}\"|" "$env_file" || true
    grep -q '^PORT=' "$env_file" || echo "PORT=\"${PORT}\"" | $SUDO tee -a "$env_file" >/dev/null
    # Reuse the stored credentials for the summary.
    ADMIN_EMAIL="$(grep -E '^ADMIN_EMAIL=' "$env_file" | head -1 | cut -d= -f2- | tr -d '"' || true)"
    ok ".env preserved"
    return
  fi

  # "admin@localhost" is rejected by the app's email validator, so the
  # domain-less default must be a real-looking address.
  [ -n "$ADMIN_EMAIL" ] || ADMIN_EMAIL="admin@${DOMAIN:-vaultly.local}"
  local generated_pw=0
  if [ -z "$ADMIN_PASSWORD" ]; then
    ADMIN_PASSWORD="ZK$(openssl_rand 12)!9"
    generated_pw=1
  fi
  local auth_secret; auth_secret="$(openssl_rand 48)"

  local storage_driver="local"
  if [ -n "$S3_BUCKET" ] && [ -n "$S3_ACCESS_KEY_ID" ] && [ -n "$S3_SECRET_ACCESS_KEY" ]; then
    storage_driver="s3"
  fi

  local database_url
  if [ "$DB_MODE" = "embedded" ]; then
    database_url="postgresql://postgres:postgres@127.0.0.1:${LOCAL_PG_PORT:-5432}/${DB_NAME}?schema=public"
  else
    database_url="postgresql://${DB_USER}:${DB_PASSWORD}@127.0.0.1:5432/${DB_NAME}?schema=public"
  fi

  $SUDO tee "$env_file" >/dev/null <<ENV
# Generated by install.sh on $(date -u +"%Y-%m-%dT%H:%M:%SZ")
# Re-running the installer never overwrites this file.

DATABASE_URL="${database_url}"
AUTH_SECRET="${auth_secret}"
APP_URL="${public_url}"
PORT="${PORT}"
NODE_ENV="production"
TRUST_PROXY="false"

ADMIN_EMAIL="${ADMIN_EMAIL}"
ADMIN_PASSWORD="${ADMIN_PASSWORD}"
ADMIN_NAME="ZK Studio Admin"

STORAGE_DRIVER="${storage_driver}"
STORAGE_LOCAL_DIR="${INSTALL_DIR}/storage/uploads"
ENV

  if [ "$DB_MODE" = "embedded" ]; then
    $SUDO tee -a "$env_file" >/dev/null <<ENV
LOCAL_PG_PORT="${LOCAL_PG_PORT:-5432}"
LOCAL_PG_DATABASE="${DB_NAME}"
ENV
  fi

  if [ "$storage_driver" = "s3" ]; then
    $SUDO tee -a "$env_file" >/dev/null <<ENV
S3_BUCKET="${S3_BUCKET}"
S3_REGION="${S3_REGION}"
S3_ACCESS_KEY_ID="${S3_ACCESS_KEY_ID}"
S3_SECRET_ACCESS_KEY="${S3_SECRET_ACCESS_KEY}"
S3_ENDPOINT="${S3_ENDPOINT}"
S3_FORCE_PATH_STYLE="${S3_FORCE_PATH_STYLE}"
ENV
  fi

  if [ "${ROOTLESS:-0}" != "1" ] && [ "$OS" = linux ] \
     && { [ "$IS_ROOT" -eq 1 ] || [ -n "$SUDO" ]; } && id "$APP_USER" >/dev/null 2>&1; then
    $SUDO chown "$APP_USER":"$APP_USER" "$env_file" 2>/dev/null || true
    $SUDO chmod 640 "$env_file"
  else
    chmod 640 "$env_file"
  fi

  ADMIN_PASSWORD_GENERATED="$generated_pw"
  ok "Configuration written to $env_file"

  # Save a root-only copy of the credentials so they can always be recovered,
  # even if the terminal output was lost or the installer ran non-interactively.
  if [ "$generated_pw" = "1" ]; then
    $SUDO tee "${INSTALL_DIR}/CREDENTIALS.txt" >/dev/null <<CREDS
ZK STUDIO · Vaultly — first sign-in
Generated $(date -u +"%Y-%m-%dT%H:%M:%SZ")

  URL:      ${public_url}
  Email:    ${ADMIN_EMAIL}
  Password: ${ADMIN_PASSWORD}

Change this password after signing in.
Delete this file once you have saved the password elsewhere.
CREDS
    $SUDO chmod 600 "${INSTALL_DIR}/CREDENTIALS.txt"
    if [ "${ROOTLESS:-0}" != "1" ] && [ "$OS" = linux ] \
       && { [ "$IS_ROOT" -eq 1 ] || [ -n "$SUDO" ]; }; then
      $SUDO chown "$APP_USER":"$APP_USER" "${INSTALL_DIR}/CREDENTIALS.txt" 2>/dev/null || true
    fi
  fi
}

# ─────────────────────────────────────────────────────────────────────────────
# Database schema + seed
# ─────────────────────────────────────────────────────────────────────────────
STARTED_EMBEDDED_DB=0
start_embedded_db() {
  [ "$DB_MODE" = "embedded" ] || return 0

  step "Starting the bundled PostgreSQL"
  # Reuse a server that is already up (idempotent re-runs, systemd unit).
  if db_reachable; then
    ok "Database already running"
    return 0
  fi

  as_user env bash -c "cd '$INSTALL_DIR' && nohup node node_modules/.bin/tsx scripts/local-db.ts > '$INSTALL_DIR/.data/postgres.log' 2>&1 &"
  STARTED_EMBEDDED_DB=1

  for _ in $(seq 1 60); do
    db_reachable && { ok "Database ready"; return 0; }
    sleep 1
  done
  warn "Last lines of $INSTALL_DIR/.data/postgres.log:"
  tail -15 "$INSTALL_DIR/.data/postgres.log" >&2 || true
  return 1
}

db_reachable() {
  as_user env bash -c "cd '$INSTALL_DIR' && node node_modules/.bin/tsx scripts/db-ping.ts" >/dev/null 2>&1
}

stop_embedded_db() {
  # Only stop a database this run started (the systemd unit owns it otherwise).
  [ "$STARTED_EMBEDDED_DB" -eq 1 ] || return 0
  as_user pkill -f "scripts/local-db.ts" >/dev/null 2>&1 || true
}

migrate_and_seed() {
  step "Applying database migrations"
  if ! as_user env bash -c "cd '$INSTALL_DIR' && npx tsx scripts/migrate.ts" 2>&1 | sed 's/^/  /'; then
    die "Migrations failed. Check DATABASE_URL in $INSTALL_DIR/.env"
  fi
  ok "Schema up to date"

  step "Creating roles, settings and the administrator"
  if ! as_user env bash -c "cd '$INSTALL_DIR' && npx tsx prisma/seed.ts" 2>&1 | sed 's/^/  /'; then
    die "Seeding failed."
  fi
}

# ─────────────────────────────────────────────────────────────────────────────
# Services
# ─────────────────────────────────────────────────────────────────────────────
SERVICE_APP="${APP_NAME}"
SERVICE_WORKER="${APP_NAME}-worker"
SERVICE_DB="${APP_NAME}-db"

install_services() {
  [ "$USE_SYSTEMD" -eq 1 ] || { run_foreground; return; }

  step "Installing systemd services"
  local node_bin; node_bin="$(command -v node)"
  local main_port_note="http://localhost:${PORT}"

  # Embedded Postgres gets its own unit so it stops/starts with the app.
  if [ "$DB_MODE" = "embedded" ]; then
    $SUDO tee "/etc/systemd/system/${SERVICE_DB}.service" >/dev/null <<UNIT
[Unit]
Description=ZK Studio Vaultly — local PostgreSQL
After=network-online.target
Wants=network-online.target

[Service]
Type=simple
User=${APP_USER}
Group=${APP_USER}
WorkingDirectory=${INSTALL_DIR}
EnvironmentFile=${INSTALL_DIR}/.env
Environment=LOCAL_PG_PORT=${LOCAL_PG_PORT:-5432}
ExecStart=${node_bin} ${INSTALL_DIR}/node_modules/.bin/tsx ${INSTALL_DIR}/scripts/local-db.ts
Restart=always
RestartSec=5

[Install]
WantedBy=multi-user.target
UNIT
    $SUDO systemctl daemon-reload
    $SUDO systemctl enable --now "${SERVICE_DB}.service" >/dev/null 2>&1 || warn "Could not start ${SERVICE_DB}"
    ok "Database service started"
  fi

  local db_after=""
  if [ "$DB_MODE" = "embedded" ]; then db_after="${SERVICE_DB}.service"; fi
  sed_db_after() { sed "s|__DB_AFTER__|${db_after}|g" ; }

  sed_db_after | $SUDO tee "/etc/systemd/system/${SERVICE_APP}.service" >/dev/null <<UNIT
[Unit]
Description=ZK Studio Vaultly panel (port ${PORT})
After=network-online.target __DB_AFTER__
Wants=network-online.target

[Service]
Type=simple
User=${APP_USER}
Group=${APP_USER}
WorkingDirectory=${INSTALL_DIR}
EnvironmentFile=${INSTALL_DIR}/.env
Environment=PORT=${PORT}
Environment=NODE_ENV=production
ExecStart=${node_bin} ${INSTALL_DIR}/node_modules/next/dist/bin/next start -H 0.0.0.0 -p ${PORT}
Restart=always
RestartSec=5
StandardOutput=journal
StandardError=journal

[Install]
WantedBy=multi-user.target
UNIT

  if [ "$INSTALL_WORKER" -eq 1 ]; then
    $SUDO tee "/etc/systemd/system/${SERVICE_WORKER}.service" >/dev/null <<UNIT
[Unit]
Description=ZK Studio Vaultly — background worker
After=network-online.target ${SERVICE_APP}.service
Wants=network-online.target

[Service]
Type=simple
User=${APP_USER}
Group=${APP_USER}
WorkingDirectory=${INSTALL_DIR}
EnvironmentFile=${INSTALL_DIR}/.env
ExecStart=${node_bin} ${INSTALL_DIR}/node_modules/.bin/tsx ${INSTALL_DIR}/scripts/worker.ts
Restart=always
RestartSec=15

[Install]
WantedBy=multi-user.target
UNIT
  fi

  $SUDO systemctl daemon-reload
  $SUDO systemctl enable "${SERVICE_APP}.service" >/dev/null 2>&1 || true
  $SUDO systemctl restart "${SERVICE_APP}.service"
  ok "Panel service started"

  if [ "$INSTALL_WORKER" -eq 1 ]; then
    $SUDO systemctl enable "${SERVICE_WORKER}.service" >/dev/null 2>&1 || true
    $SUDO systemctl restart "${SERVICE_WORKER}.service"
    ok "Worker service started"
  fi

  install_firewall_rules
  wait_for_http || { warn "Panel did not answer yet — check: journalctl -u ${SERVICE_APP} -n 50"; return; }
}

install_firewall_rules() {
  if has ufw && $SUDO ufw status 2>/dev/null | grep -q "Status: active"; then
    $SUDO ufw allow "${PORT}/tcp" >/dev/null 2>&1 && info "Opened port ${PORT} in ufw"
  elif has firewall-cmd && $SUDO firewall-cmd --state >/dev/null 2>&1; then
    $SUDO firewall-cmd --permanent --add-port="${PORT}/tcp" >/dev/null 2>&1
    $SUDO firewall-cmd --reload >/dev/null 2>&1
    info "Opened port ${PORT} in firewalld"
  fi
}

run_foreground() {
  print_credentials
  step "Starting the panel in the foreground on port $PORT"

  local db_pid=""
  if [ "$DB_MODE" = "embedded" ]; then
    info "Starting the bundled PostgreSQL"
    # Same user as the app, otherwise it cannot read the 640 .env file.
    as_user env bash -c "cd '$INSTALL_DIR' && nohup node node_modules/.bin/tsx scripts/local-db.ts > '$INSTALL_DIR/.data/postgres.log' 2>&1 &"
    for _ in $(seq 1 60); do
      db_reachable && break
      sleep 1
    done
    db_reachable || { warn "Database did not start; see $INSTALL_DIR/.data/postgres.log"; tail -10 "$INSTALL_DIR/.data/postgres.log" >&2 || true; }
    info "Database ready"
  fi

  if port_in_use; then
    warn "Port ${PORT} is already in use by another process."
    warn "Stop it, or re-run with a different port: --port <n>"
    stop_embedded_db
    die "Cannot start the panel on port ${PORT}."
  fi

  info "Press Ctrl-C to stop."
  trap 'stop_embedded_db; exit 0' INT TERM
  # Run as the service account: it owns .env (mode 640) and the storage dir.
  as_user env bash -c "cd '$INSTALL_DIR' && NODE_ENV=production node node_modules/next/dist/bin/next start -H 0.0.0.0 -p $PORT"
  [ -n "$db_pid" ] && kill "$db_pid" 2>/dev/null || true
}

wait_for_http() {
  step "Waiting for the panel to answer on port $PORT"
  for _ in $(seq 1 60); do
    local code
    code="$(curl -s -o /dev/null -w '%{http_code}' "http://127.0.0.1:${PORT}/login" 2>/dev/null || true)"
    case "$code" in
      200|307|302) ok "Panel responded (HTTP $code)"; return 0 ;;
    esac
    sleep 2
  done
  return 1
}

# ─────────────────────────────────────────────────────────────────────────────
# Uninstall
# ─────────────────────────────────────────────────────────────────────────────
do_uninstall() {
  step "Uninstalling"
  if [ -n "$INIT" ]; then
    for svc in "$SERVICE_WORKER" "$SERVICE_APP" "$SERVICE_DB"; do
      $SUDO systemctl disable --now "$svc.service" >/dev/null 2>&1 || true
      $SUDO rm -f "/etc/systemd/system/${svc}.service"
    done
    $SUDO systemctl daemon-reload
    ok "Services removed"
  fi

  if [ "${KEEP_DATA:-0}" -eq 1 ]; then
    warn "Keeping $INSTALL_DIR (data preserved)"
  elif $SUDO test -d "$INSTALL_DIR"; then
    $SUDO rm -rf "$INSTALL_DIR"
    ok "Removed $INSTALL_DIR"
  fi

  info "The '$APP_USER' user and any external database were left untouched."
  printf '\n%sUninstall complete.%s\n\n' "$GREEN" "$RESET"
  exit 0
}

# ─────────────────────────────────────────────────────────────────────────────
# Summary
# ─────────────────────────────────────────────────────────────────────────────
public_url_display() {
  if [ -n "$DOMAIN" ]; then
    printf 'https://%s' "${DOMAIN#http*://}"
  else
    local ip
    ip="$(hostname -I 2>/dev/null | awk '{print $1}')"
    [ -n "$ip" ] || ip="localhost"
    printf 'http://%s:%s' "$ip" "$PORT"
  fi
}

# Printed before the foreground server starts, because once `next start` runs it
# owns the terminal. Codespaces, Docker and macOS all take this path.
print_credentials() {
  printf '\n%s╭──────────────────────────────────────────────────────────────╮%s\n' "$CYAN" "$RESET"
  printf '%s│%s  %sZK STUDIO · Vaultly is installed%s                        %s│%s\n' "$CYAN" "$RESET" "$BOLD" "$RESET" "$CYAN" "$RESET"
  printf '%s╰──────────────────────────────────────────────────────────────╯%s\n\n' "$CYAN" "$RESET"

  printf '  %sPanel%s            http://localhost:%s\n' "$BOLD" "$RESET" "$PORT"
  printf '  %sNetwork%s          %s\n' "$BOLD" "$RESET" "$(public_url_display)"
  printf '  %sAdmin email%s      %s\n' "$BOLD" "$RESET" "$ADMIN_EMAIL"
  if [ "${ADMIN_PASSWORD_GENERATED:-0}" = "1" ]; then
    printf '  %sAdmin password%s   %s%s%s\n' "$BOLD" "$RESET" "$YELLOW" "$ADMIN_PASSWORD" "$RESET"
    printf '  %s%s Also saved to %s/CREDENTIALS.txt (delete it after saving).%s\n' "$DIM" "" "$INSTALL_DIR" "$RESET"
  else
    printf '  %sAdmin password%s   (the one you supplied)\n' "$BOLD" "$RESET"
  fi
  printf '  %sInstall dir%s      %s\n' "$BOLD" "$RESET" "$INSTALL_DIR"
  printf '  %sConfig%s           %s/.env\n' "$BOLD" "$RESET" "$INSTALL_DIR"
  printf '  %sStorage%s          %s/storage/uploads\n\n' "$BOLD" "$RESET" "$INSTALL_DIR"
}

print_summary() {
  print_credentials

  if [ -n "$INIT" ]; then
    printf '  %sServices%s\n' "$BOLD" "$RESET"
    printf '    systemctl status %s\n' "$SERVICE_APP"
    printf '    journalctl -u %s -f\n\n' "$SERVICE_APP"
  fi

  printf '  %sNext steps%s\n' "$BOLD" "$RESET"
  printf '    1. Open the panel and change the admin password.\n'
  printf '    2. Admin → Settings → Email: configure SMTP for password resets.\n'
  if [ "$DB_MODE" = "embedded" ]; then
    printf '    3. Single-server install: switch to S3/R2 when you outgrow this box.\n'
  fi
  [ -n "$DOMAIN" ] || printf '    3. Expose it publicly behind Caddy/nginx for HTTPS.\n'
  printf '\n  %sRe-run this installer any time to update the code.%s\n\n' "$DIM" "$RESET"
}

# ─────────────────────────────────────────────────────────────────────────────
# Main
# ─────────────────────────────────────────────────────────────────────────────
banner() {
  printf '\n%s%s\n' "$BOLD$CYAN" "  ███████╗██╗  ██╗    ███████╗████████╗██╗   ██╗██████╗ ██╗ ██████╗ "
  printf '  ╚══███╔╝██║ ██╔╝    ██╔════╝╚══██╔══╝██║   ██║██╔══██╗██║██╔═══██╗\n'
  printf '    ███╔╝ █████╔╝     ███████╗   ██║   ██║   ██║██║  ██║██║██║   ██║\n'
  printf '   ███╔╝  ██╔═██╗     ╚════██║   ██║   ██║   ██║██║  ██║██║██║   ██║\n'
  printf '  ███████╗██║  ██╗    ███████║   ██║   ╚██████╔╝██████╔╝██║╚██████╔╝\n'
  printf '  ╚══════╝╚═╝  ╚═╝    ╚══════╝   ╚═╝    ╚═════╝ ╚═════╝ ╚═╝ ╚═════╝ %s\n' "$RESET"
  printf '%s  All-in-one installer · port %s%s\n' "$DIM" "$PORT" "$RESET"
}

main() {
  elevate
  validate_port
  banner
  detect_platform
  if [ "$UNINSTALL" -eq 1 ]; then do_uninstall; fi

  PUBLIC_S3=0
  ensure_openssl
  install_node
  prepare_user_and_dir
  install_deps
  install_postgres
  write_env
  start_embedded_db
  migrate_and_seed
  build_app
  stop_embedded_db
  install_services

  if [ "$USE_SYSTEMD" -eq 1 ]; then print_summary; fi
}

main "$@"
