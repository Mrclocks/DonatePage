#!/usr/bin/env bash
# MrClock Donate — installer
#   git clone https://github.com/Mrclocks/DonatePage.git
#   cd DonatePage && bash install.sh
set -euo pipefail

REPO_URL="${REPO_URL:-https://github.com/Mrclocks/DonatePage.git}"
REPO_BRANCH="${REPO_BRANCH:-main}"
DEFAULT_DIR="${INSTALL_DIR:-$HOME/DonatePage}"

# ── colors ──────────────────────────────────────────────
if [[ -t 1 ]]; then
  C_RESET=$'\033[0m'
  C_BOLD=$'\033[1m'
  C_DIM=$'\033[2m'
  C_CYAN=$'\033[36m'
  C_GREEN=$'\033[32m'
  C_YELLOW=$'\033[33m'
  C_RED=$'\033[31m'
  C_ORANGE=$'\033[38;5;208m'
else
  C_RESET="" C_BOLD="" C_DIM="" C_CYAN="" C_GREEN="" C_YELLOW="" C_RED="" C_ORANGE=""
fi

clear_screen() {
  printf '\033c' 2>/dev/null || clear || true
}

pause() {
  echo
  read -r -p "  Press Enter to continue... " _
}

ok()   { echo "${C_GREEN}✓${C_RESET} $*"; }
warn() { echo "${C_YELLOW}!${C_RESET} $*"; }
err()  { echo "${C_RED}✗${C_RESET} $*" >&2; }
info() { echo "${C_CYAN}›${C_RESET} $*"; }

env_escape() {
  local value="${1-}"
  value="${value//\\/\\\\}"
  value="${value//\"/\\\"}"
  value="${value//\$/\\$}"
  value="${value//\`/\\\`}"
  value="${value//$'\n'/\\n}"
  printf '"%s"' "$value"
}

need_root() {
  if [[ "${EUID}" -eq 0 ]]; then
    "$@"
  else
    sudo "$@"
  fi
}

compose() {
  export DOCKER_BUILDKIT=1
  export COMPOSE_DOCKER_CLI_BUILD=1
  if docker compose version >/dev/null 2>&1; then
    docker compose "$@"
    return
  fi
  if need_root docker compose version >/dev/null 2>&1; then
    need_root docker compose "$@"
    return
  fi
  err "Docker Compose not found."
  return 1
}

ensure_repo() {
  if [[ -f "./docker-compose.yml" && -f "./Dockerfile" ]]; then
    ROOT_DIR="$(pwd)"
  elif [[ -f "$(dirname "${BASH_SOURCE[0]}")/docker-compose.yml" ]]; then
    ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
  else
    info "Cloning into ${DEFAULT_DIR} ..."
    need_root apt-get update -y
    need_root apt-get install -y git ca-certificates curl
    if [[ -d "${DEFAULT_DIR}/.git" ]]; then
      git -C "${DEFAULT_DIR}" fetch --depth 1 origin "${REPO_BRANCH}"
      git -C "${DEFAULT_DIR}" checkout "${REPO_BRANCH}"
      git -C "${DEFAULT_DIR}" pull --ff-only origin "${REPO_BRANCH}" || true
    else
      mkdir -p "$(dirname "${DEFAULT_DIR}")"
      git clone --branch "${REPO_BRANCH}" --depth 1 "${REPO_URL}" "${DEFAULT_DIR}"
    fi
    ROOT_DIR="${DEFAULT_DIR}"
  fi
  cd "${ROOT_DIR}"
}

install_docker() {
  if command -v docker >/dev/null 2>&1 && docker compose version >/dev/null 2>&1; then
    ok "Docker ready"
    return
  fi

  info "Installing Docker..."
  need_root apt-get update -y
  need_root apt-get install -y ca-certificates curl gnupg
  need_root install -m 0755 -d /etc/apt/keyrings
  if [[ ! -f /etc/apt/keyrings/docker.gpg ]]; then
    curl -fsSL https://download.docker.com/linux/ubuntu/gpg \
      | need_root gpg --dearmor -o /etc/apt/keyrings/docker.gpg
    need_root chmod a+r /etc/apt/keyrings/docker.gpg
  fi

  # shellcheck disable=SC1091
  . /etc/os-release
  echo "deb [arch=$(dpkg --print-architecture) signed-by=/etc/apt/keyrings/docker.gpg] https://download.docker.com/linux/ubuntu ${VERSION_CODENAME} stable" \
    | need_root tee /etc/apt/sources.list.d/docker.list >/dev/null

  need_root apt-get update -y
  need_root apt-get install -y docker-ce docker-ce-cli containerd.io docker-buildx-plugin docker-compose-plugin

  if [[ "${EUID}" -ne 0 ]]; then
    need_root usermod -aG docker "$USER" || true
    warn "Log out/in once so docker works without sudo."
  fi

  need_root systemctl enable --now docker
  ok "Docker installed"
}

prepare_data_dir() {
  mkdir -p data backups
  chmod 777 data 2>/dev/null || true
}

# Prefer Caddyfile.local (gitignored). Migrate from old tracked Caddyfile if needed.
ensure_caddy_local() {
  if [[ -f Caddyfile.local ]]; then
    return 0
  fi
  if [[ -f Caddyfile ]] && ! grep -q '{$DOMAIN:localhost}' Caddyfile 2>/dev/null; then
    cp Caddyfile Caddyfile.local
    ok "Migrated Caddyfile → Caddyfile.local"
    if git rev-parse --is-inside-work-tree >/dev/null 2>&1; then
      git checkout -- Caddyfile 2>/dev/null || true
    fi
    return 0
  fi
  # Rebuild from .env APP_URL if possible
  if [[ -f .env ]]; then
    set -a
    # shellcheck disable=SC1091
    . ./.env
    set +a
    local d="${APP_URL-}"
    d="${d#https://}"
    d="${d#http://}"
    d="${d%%/*}"
    if [[ -n "${d}" ]]; then
      write_caddy_local "${d}" ""
      ok "Rebuilt Caddyfile.local from APP_URL"
      return 0
    fi
  fi
  return 1
}

wait_for_app() {
  info "Waiting for app..."
  local i
  for i in $(seq 1 24); do
    if curl -fsS "http://127.0.0.1:3000/api/health" >/dev/null 2>&1; then
      ok "App healthy"
      return 0
    fi
    sleep 2
  done
  err "App did not become healthy."
  compose logs --tail=80 app || true
  return 1
}

read_secret() {
  local prompt="$1"
  local value=""
  read -r -s -p "${prompt}" value
  echo >&2
  printf '%s' "${value}"
}

write_caddy_local() {
  local domain="$1"
  local email="${2-}"
  if [[ -n "${email}" ]]; then
    cat > Caddyfile.local <<EOF
{
	email ${email}
}

${domain} {
	encode gzip zstd
	header {
		Strict-Transport-Security "max-age=31536000; includeSubDomains; preload"
		X-Content-Type-Options nosniff
		X-Frame-Options DENY
		Referrer-Policy strict-origin-when-cross-origin
		-Server
	}
	reverse_proxy app:3000
}
EOF
  else
    cat > Caddyfile.local <<EOF
${domain} {
	encode gzip zstd
	header {
		Strict-Transport-Security "max-age=31536000; includeSubDomains; preload"
		X-Content-Type-Options nosniff
		X-Frame-Options DENY
		Referrer-Policy strict-origin-when-cross-origin
		-Server
	}
	reverse_proxy app:3000
}
EOF
  fi
}

write_env_file() {
  local domain="$1"
  local admin_password="$2"
  local session_secret="$3"
  local mode="$4"
  local allow_demo="$5"
  local api_key="$6"
  local ipn_secret="$7"
  local tg_token="$8"
  local tg_chat="$9"
  local admin_path="${10:-admin}"

  admin_path="$(printf '%s' "${admin_path}" | tr -cd 'A-Za-z0-9-_')"
  [[ -n "${admin_path}" ]] || admin_path="admin"

  cat > .env <<EOF
APP_URL=$(env_escape "https://${domain}")
SESSION_SECRET=$(env_escape "${session_secret}")
ADMIN_PASSWORD=$(env_escape "${admin_password}")
ADMIN_PATH=$(env_escape "${admin_path}")
DATA_DIR=/app/data
NOWPAYMENTS_MODE=$(env_escape "${mode}")
NOWPAYMENTS_ALLOW_DEMO=$(env_escape "${allow_demo}")
NOWPAYMENTS_API_KEY=$(env_escape "${api_key}")
NOWPAYMENTS_IPN_SECRET=$(env_escape "${ipn_secret}")
NOWPAYMENTS_API_BASE=$(env_escape "https://api.nowpayments.io")
TELEGRAM_BOT_TOKEN=$(env_escape "${tg_token}")
TELEGRAM_CHAT_ID=$(env_escape "${tg_chat}")
NODE_ENV=production
EOF
  chmod 600 .env

  mkdir -p data
  printf '%s\n' "${admin_path}" > data/admin-path.txt
}

load_env() {
  [[ -f .env ]] || return 1
  set -a
  # shellcheck disable=SC1091
  . ./.env
  set +a
}

current_domain() {
  local d="${APP_URL-}"
  d="${d#https://}"
  d="${d#http://}"
  d="${d%%/*}"
  printf '%s' "$d"
}

open_firewall_hint() {
  echo
  info "Firewall needs ports 80 and 443 open."
  if command -v ufw >/dev/null 2>&1; then
    read -r -p "  Configure UFW now? [y/N]: " ufw_ans
    if [[ "${ufw_ans,,}" == "y" || "${ufw_ans,,}" == "yes" ]]; then
      need_root ufw allow 80/tcp || true
      need_root ufw allow 443/tcp || true
      need_root ufw allow 443/udp || true
      need_root ufw allow OpenSSH || true
      ok "UFW rules added (enable with: sudo ufw enable)"
    fi
  fi
}

# ── actions ─────────────────────────────────────────────

do_install() {
  clear_screen
  echo
  echo "  ${C_BOLD}${C_ORANGE}Install / Reinstall${C_RESET}"
  echo "  ${C_DIM}────────────────────${C_RESET}"
  echo

  install_docker

  local domain acme_email admin_password api_key ipn_secret tg_token tg_chat
  local mode allow_demo session_secret admin_path

  read -r -p "  Domain (donate.example.com): " domain
  domain="${domain// /}"
  [[ -n "${domain}" ]] || { err "Domain required."; pause; return 1; }

  read -r -p "  Let's Encrypt email (optional): " acme_email
  admin_password="$(read_secret "  Admin password (min 8): ")"
  [[ ${#admin_password} -ge 8 ]] || { err "Password too short."; pause; return 1; }

  read -r -p "  Admin path [admin]: " admin_path
  admin_path="${admin_path:-admin}"

  api_key="$(read_secret "  NOWPayments API Key (empty = demo): ")"
  ipn_secret="$(read_secret "  NOWPayments IPN Secret: ")"
  tg_token="$(read_secret "  Telegram Bot Token (optional): ")"
  read -r -p "  Telegram Chat ID (optional): " tg_chat

  allow_demo="false"
  if [[ -z "${api_key}" ]]; then
    read -r -p "  Enable DEMO on public server? [y/N]: " allow
    if [[ "${allow,,}" == "y" || "${allow,,}" == "yes" ]]; then
      mode="demo"
      allow_demo="true"
      warn "Demo mode enabled"
    else
      err "API key required for live install."
      pause
      return 1
    fi
  else
    mode="live"
    [[ -n "${ipn_secret}" ]] || { err "IPN secret required."; pause; return 1; }
  fi

  session_secret="$(openssl rand -hex 32)"
  prepare_data_dir
  write_env_file "${domain}" "${admin_password}" "${session_secret}" "${mode}" "${allow_demo}" \
    "${api_key}" "${ipn_secret}" "${tg_token}" "${tg_chat}" "${admin_path}"
  write_caddy_local "${domain}" "${acme_email}"

  open_firewall_hint
  echo
  info "Building (first time can take a few minutes)..."
  compose up -d --build --remove-orphans

  if wait_for_app; then
    echo
    ok "Install complete"
    echo "    Site:    https://${domain}"
    echo "    Admin:   https://${domain}/${admin_path}/login"
    echo "    IPN:     https://${domain}/api/webhook/nowpayments"
  else
    err "Install finished but app is unhealthy."
    pause
    return 1
  fi
  pause
}

do_update() {
  clear_screen
  echo
  echo "  ${C_BOLD}${C_ORANGE}Update${C_RESET}"
  echo "  ${C_DIM}──────${C_RESET}"
  echo

  [[ -f .env ]] || { err "No .env — run Install first."; pause; return 1; }
  ensure_caddy_local || { err "Missing Caddyfile.local — run Install or Settings."; pause; return 1; }

  if ! git rev-parse --is-inside-work-tree >/dev/null 2>&1; then
    err "Not a git repo."
    pause
    return 1
  fi

  # Keep local config out of git's way
  if git rev-parse --is-inside-work-tree >/dev/null 2>&1; then
    git checkout -- Caddyfile 2>/dev/null || true
  fi

  info "Fetching ${REPO_BRANCH}..."
  if ! git fetch origin "${REPO_BRANCH}"; then
    err "git fetch failed."
    pause
    return 1
  fi

  local before after
  before="$(git rev-parse HEAD)"
  if ! git merge --ff-only "origin/${REPO_BRANCH}"; then
    err "Fast-forward failed. Resolve local conflicts, then retry."
    git status -sb || true
    pause
    return 1
  fi
  after="$(git rev-parse HEAD)"

  if [[ "${before}" == "${after}" ]]; then
    ok "Already up to date (${after:0:7})"
  else
    ok "Code updated ${before:0:7} → ${after:0:7}"
  fi

  prepare_data_dir
  info "Building app image (cached layers skip when possible)..."
  if ! compose build app; then
    err "Build failed."
    pause
    return 1
  fi

  info "Restarting app (Caddy stays up)..."
  compose up -d --no-deps --force-recreate --remove-orphans app

  # Start caddy if it isn't running (first update after migration, etc.)
  if ! compose ps 2>/dev/null | grep -Eiq 'caddy[[:space:]].*(running|up)'; then
    info "Starting Caddy..."
    compose up -d caddy
  fi

  if wait_for_app; then
    ok "Update complete"
  else
    err "Update failed health check."
    pause
    return 1
  fi
  pause
}

do_settings() {
  clear_screen
  echo
  echo "  ${C_BOLD}${C_ORANGE}Settings${C_RESET}"
  echo "  ${C_DIM}────────${C_RESET}"
  echo

  load_env || { err "No .env — run Install first."; pause; return 1; }

  local domain admin_password api_key ipn_secret tg_token tg_chat acme_email
  local mode allow_demo admin_path session_secret
  local cur
  cur="$(current_domain)"

  read -r -p "  Domain [${cur}]: " domain
  domain="${domain:-$cur}"

  read -r -p "  Let's Encrypt email (optional): " acme_email

  local new_admin
  new_admin="$(read_secret "  New admin password (Enter = keep): ")"
  admin_password="${new_admin:-${ADMIN_PASSWORD}}"

  read -r -p "  Admin path [${ADMIN_PATH:-admin}]: " admin_path
  admin_path="${admin_path:-${ADMIN_PATH:-admin}}"

  api_key="$(read_secret "  NOWPayments API Key (Enter = keep): ")"
  api_key="${api_key:-${NOWPAYMENTS_API_KEY-}}"
  ipn_secret="$(read_secret "  NOWPayments IPN Secret (Enter = keep): ")"
  ipn_secret="${ipn_secret:-${NOWPAYMENTS_IPN_SECRET-}}"
  tg_token="$(read_secret "  Telegram Bot Token (Enter = keep): ")"
  tg_token="${tg_token:-${TELEGRAM_BOT_TOKEN-}}"
  read -r -p "  Telegram Chat ID [${TELEGRAM_CHAT_ID-}]: " tg_chat
  tg_chat="${tg_chat:-${TELEGRAM_CHAT_ID-}}"

  # Never silently enable production demo — that would allow free mark-paid via /api/demo-pay.
  allow_demo="false"
  if [[ -z "${api_key}" ]]; then
    read -r -p "  Enable DEMO on public server? [y/N]: " allow
    if [[ "${allow,,}" == "y" || "${allow,,}" == "yes" ]]; then
      mode="demo"
      allow_demo="true"
      warn "Demo mode enabled"
    else
      err "API key required for live settings."
      pause
      return 1
    fi
  else
    mode="live"
    [[ -n "${ipn_secret}" ]] || { err "IPN secret required for live mode."; pause; return 1; }
  fi

  session_secret="${SESSION_SECRET:-$(openssl rand -hex 32)}"
  write_env_file "${domain}" "${admin_password}" "${session_secret}" "${mode}" "${allow_demo}" \
    "${api_key}" "${ipn_secret}" "${tg_token}" "${tg_chat}" "${admin_path}"
  write_caddy_local "${domain}" "${acme_email}"

  info "Applying settings (no image rebuild)..."
  prepare_data_dir
  compose up -d --force-recreate --no-build --remove-orphans
  wait_for_app || true
  ok "Settings saved"
  echo "    Site:  https://${domain}"
  echo "    Admin: https://${domain}/${admin_path}/login"
  pause
}

do_status() {
  clear_screen
  echo
  echo "  ${C_BOLD}${C_ORANGE}Status${C_RESET}"
  echo "  ${C_DIM}──────${C_RESET}"
  echo
  compose ps || true
  echo
  if load_env 2>/dev/null; then
    echo "  APP_URL=${APP_URL-}"
    echo "  ADMIN_PATH=${ADMIN_PATH-admin}"
    echo "  MODE=${NOWPAYMENTS_MODE-}"
  fi
  if curl -fsS "http://127.0.0.1:3000/api/health" >/dev/null 2>&1; then
    echo
    ok "Health OK"
  else
    echo
    warn "Health check failed on :3000"
  fi
  pause
}

do_logs() {
  clear_screen
  echo
  echo "  ${C_BOLD}${C_ORANGE}Logs${C_RESET}  ${C_DIM}(Ctrl+C to stop)${C_RESET}"
  echo
  compose logs -f --tail=80 || true
}

do_restart() {
  clear_screen
  echo
  info "Restarting..."
  compose restart
  wait_for_app || true
  ok "Restarted"
  pause
}

do_backup() {
  clear_screen
  echo
  echo "  ${C_BOLD}${C_ORANGE}Backup${C_RESET}"
  echo "  ${C_DIM}──────${C_RESET}"
  echo
  mkdir -p backups
  local stamp file
  stamp="$(date +%Y%m%d-%H%M%S)"
  file="backups/mrclock-${stamp}.tgz"
  tar -czf "${file}" data .env Caddyfile.local 2>/dev/null \
    || tar -czf "${file}" data .env 2>/dev/null \
    || tar -czf "${file}" data
  ok "Saved ${file}"
  pause
}

do_uninstall() {
  clear_screen
  echo
  echo "  ${C_BOLD}${C_RED}Uninstall${C_RESET}"
  echo "  ${C_DIM}─────────${C_RESET}"
  echo
  echo "  Removes containers, images, volumes, data/, .env, backups/"
  echo
  read -r -p "  Type DELETE to confirm: " confirm
  [[ "${confirm}" == "DELETE" ]] || { warn "Cancelled."; pause; return 0; }

  info "Stopping stack..."
  compose down --rmi all --volumes --remove-orphans || true

  local project docker_bin
  project="$(basename "$(pwd)" | tr '[:upper:]' '[:lower:]' | sed 's/[^a-z0-9]//g')"
  if docker info >/dev/null 2>&1; then
    docker_bin="docker"
  else
    docker_bin="sudo docker"
  fi

  ${docker_bin} images --format '{{.Repository}}:{{.Tag}} {{.ID}}' 2>/dev/null | while read -r repo id; do
    case "${repo}" in
      *donatepage*|*mrclock*|*donate*|"${project}"* )
        ${docker_bin} rmi -f "${id}" >/dev/null 2>&1 || true
        ;;
    esac
  done || true

  ${docker_bin} volume ls --format '{{.Name}}' 2>/dev/null | while read -r vol; do
    case "${vol}" in
      *caddy_data*|*caddy_config*|*donate*|*mrclock*|"${project}"* )
        ${docker_bin} volume rm -f "${vol}" >/dev/null 2>&1 || true
        ;;
    esac
  done || true

  rm -rf data backups .env .env.bak Caddyfile.local 2>/dev/null || true
  if git rev-parse --is-inside-work-tree >/dev/null 2>&1; then
    git checkout -- Caddyfile 2>/dev/null || true
  fi

  read -r -p "  Also remove Docker Engine? [y/N]: " remove_docker
  if [[ "${remove_docker,,}" == "y" || "${remove_docker,,}" == "yes" ]]; then
    need_root systemctl stop docker docker.socket containerd 2>/dev/null || true
    need_root apt-get purge -y \
      docker-ce docker-ce-cli containerd.io docker-buildx-plugin docker-compose-plugin docker-ce-rootless-extras \
      2>/dev/null || true
    need_root apt-get autoremove -y --purge 2>/dev/null || true
    need_root rm -f /etc/apt/sources.list.d/docker.list /etc/apt/keyrings/docker.gpg 2>/dev/null || true
    need_root rm -rf /var/lib/docker /var/lib/containerd 2>/dev/null || true
    ok "Docker Engine removed"
  fi

  read -r -p "  Delete project folder ($(pwd))? [y/N]: " wipe_dir
  if [[ "${wipe_dir,,}" == "y" || "${wipe_dir,,}" == "yes" ]]; then
    local victim
    victim="$(pwd)"
    cd /
    rm -rf "${victim}"
    ok "Folder deleted. Bye."
    exit 0
  fi

  ok "Uninstall finished"
  pause
}

# ── menu ────────────────────────────────────────────────

INSTALLER_VERSION="2026.09.09"

print_menu() {
  clear_screen
  local ver=""
  if git rev-parse --short HEAD >/dev/null 2>&1; then
    ver="$(git rev-parse --short HEAD)"
  fi

  cat <<EOF

${C_ORANGE}${C_BOLD}
  ╔════════════════════════════════════════╗
  ║           MrClock  ·  Donate           ║
  ║         Installer  ·  Manager          ║
  ╚════════════════════════════════════════╝${C_RESET}
${C_DIM}  script ${INSTALLER_VERSION}${ver:+ · git ${ver}}${C_RESET}

  ${C_GREEN}●${C_RESET}  Main
     ${C_CYAN}1${C_RESET}   Install / reinstall
     ${C_CYAN}2${C_RESET}   Update              ${C_DIM}app only · SSL stays up${C_RESET}
     ${C_CYAN}3${C_RESET}   Settings            ${C_DIM}no rebuild${C_RESET}

  ${C_GREEN}●${C_RESET}  Monitor
     ${C_CYAN}4${C_RESET}   Status
     ${C_CYAN}5${C_RESET}   Logs
     ${C_CYAN}6${C_RESET}   Restart

  ${C_GREEN}●${C_RESET}  Data
     ${C_CYAN}7${C_RESET}   Backup
     ${C_CYAN}8${C_RESET}   Uninstall

     ${C_CYAN}0${C_RESET}   Exit

EOF
}

main_menu() {
  ensure_repo
  while true; do
    print_menu
    read -r -p "  Select: " choice
    case "${choice}" in
      1) do_install ;;
      2) do_update ;;
      3) do_settings ;;
      4) do_status ;;
      5) do_logs ;;
      6) do_restart ;;
      7) do_backup ;;
      8) do_uninstall ;;
      0|q|Q)
        clear_screen
        echo "  Bye."
        exit 0
        ;;
      *)
        warn "Invalid option."
        sleep 1
        ;;
    esac
  done
}

main_menu
