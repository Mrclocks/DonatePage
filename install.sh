#!/usr/bin/env bash
# MrClock Donate — Ubuntu installer (menu)
# Usage:
#   git clone https://github.com/Mrclocks/DonatePage.git
#   cd DonatePage
#   bash install.sh
set -euo pipefail

REPO_URL="${REPO_URL:-https://github.com/Mrclocks/DonatePage.git}"
REPO_BRANCH="${REPO_BRANCH:-main}"
DEFAULT_DIR="${INSTALL_DIR:-$HOME/DonatePage}"

env_escape() {
  local value="${1-}"
  value="${value//\\/\\\\}"
  value="${value//\"/\\\"}"
  value="${value//\$/\\$}"
  value="${value//\`/\\\`}"
  value="${value//$'\n'/\\n}"
  printf '"%s"' "$value"
}

need_root_apt() {
  if [[ "${EUID}" -eq 0 ]]; then
    "$@"
  else
    sudo "$@"
  fi
}

detect_ubuntu() {
  if [[ -f /etc/os-release ]]; then
    # shellcheck disable=SC1091
    . /etc/os-release
    [[ "${ID:-}" == "ubuntu" || "${ID_LIKE:-}" == *"ubuntu"* ]]
    return
  fi
  return 1
}

ensure_ubuntu_hint() {
  if ! detect_ubuntu; then
    echo "Warning: this installer targets Ubuntu. Continuing anyway..."
  else
    # shellcheck disable=SC1091
    . /etc/os-release
    echo "Detected: Ubuntu ${VERSION_ID:-unknown}"
  fi
}

ensure_repo() {
  if [[ -f "./docker-compose.yml" && -f "./Dockerfile" ]]; then
    ROOT_DIR="$(pwd)"
  elif [[ -f "$(dirname "${BASH_SOURCE[0]}")/docker-compose.yml" ]]; then
    ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
  else
    echo "Project not found here. Cloning into ${DEFAULT_DIR} ..."
    need_root_apt apt-get update -y
    need_root_apt apt-get install -y git ca-certificates curl
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
  echo "Working directory: ${ROOT_DIR}"
}

install_docker_ubuntu() {
  if command -v docker >/dev/null 2>&1 && docker compose version >/dev/null 2>&1; then
    echo "Docker already installed."
    return
  fi

  echo "Installing Docker Engine + Compose (Ubuntu)..."
  need_root_apt apt-get update -y
  need_root_apt apt-get install -y ca-certificates curl gnupg
  need_root_apt install -m 0755 -d /etc/apt/keyrings
  if [[ ! -f /etc/apt/keyrings/docker.gpg ]]; then
    curl -fsSL https://download.docker.com/linux/ubuntu/gpg \
      | need_root_apt gpg --dearmor -o /etc/apt/keyrings/docker.gpg
    need_root_apt chmod a+r /etc/apt/keyrings/docker.gpg
  fi

  # shellcheck disable=SC1091
  . /etc/os-release
  echo "deb [arch=$(dpkg --print-architecture) signed-by=/etc/apt/keyrings/docker.gpg] https://download.docker.com/linux/ubuntu ${VERSION_CODENAME} stable" \
    | need_root_apt tee /etc/apt/sources.list.d/docker.list >/dev/null

  need_root_apt apt-get update -y
  need_root_apt apt-get install -y docker-ce docker-ce-cli containerd.io docker-buildx-plugin docker-compose-plugin

  if [[ "${EUID}" -ne 0 ]]; then
    need_root_apt usermod -aG docker "$USER" || true
    echo "Added $USER to docker group. You may need to re-login for docker without sudo."
  fi

  need_root_apt systemctl enable --now docker
  echo "Docker installed."
}

compose() {
  if docker compose version >/dev/null 2>&1; then
    docker compose "$@"
    return
  fi
  if need_root_apt docker compose version >/dev/null 2>&1; then
    need_root_apt docker compose "$@"
    return
  fi
  echo "Docker Compose is not available."
  return 1
}

prepare_data_dir() {
  mkdir -p data
  chmod 777 data 2>/dev/null || chmod 700 data || true
  # Container user is uid 1001; make host mount writable for it.
  if command -v sudo >/dev/null 2>&1; then
    sudo chown -R 1001:1001 data 2>/dev/null || true
  else
    chown -R 1001:1001 data 2>/dev/null || true
  fi
}

wait_for_app() {
  echo "Waiting for app health..."
  local i
  for i in $(seq 1 40); do
    if curl -fsS "http://127.0.0.1:3000/api/health" >/dev/null 2>&1; then
      echo "App is healthy on :3000"
      return 0
    fi
    if compose exec -T app node -e "fetch('http://127.0.0.1:3000/api/health').then((r)=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))" >/dev/null 2>&1; then
      echo "App is healthy."
      return 0
    fi
    sleep 3
    echo "  still starting... (${i}/40)"
  done
  echo "App did not become healthy in time."
  echo "---- app logs ----"
  compose logs --tail=160 app || true
  echo "---- caddy logs ----"
  compose logs --tail=80 caddy || true
  return 1
}

diagnose_503() {
  echo
  echo "=== Diagnose 503 ==="
  compose ps || true
  echo
  echo "---- app logs ----"
  compose logs --tail=150 app || true
  echo
  echo "---- caddy logs ----"
  compose logs --tail=80 caddy || true
  echo
  echo "Trying rebuild with permission fix..."
  prepare_data_dir
  compose up -d --build --force-recreate
  wait_for_app || true
}

read_secret() {
  local prompt="$1"
  local value=""
  read -r -s -p "${prompt}" value
  echo >&2
  printf '%s' "${value}"
}

write_caddyfile() {
  local domain="$1"
  local email="${2-}"
  if [[ -n "${email}" ]]; then
    cat > Caddyfile <<EOF
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
    cat > Caddyfile <<EOF
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
  local merchant_id="$7"
  local webhook_secret="$8"
  local tg_token="$9"
  local tg_chat="${10}"

  cat > .env <<EOF
APP_URL=$(env_escape "https://${domain}")
SESSION_SECRET=$(env_escape "${session_secret}")
ADMIN_PASSWORD=$(env_escape "${admin_password}")
DATA_DIR=/app/data
ONEPAYMENT_MODE=$(env_escape "${mode}")
ONEPAYMENT_ALLOW_DEMO=$(env_escape "${allow_demo}")
ONEPAYMENT_API_KEY=$(env_escape "${api_key}")
ONEPAYMENT_MERCHANT_ID=$(env_escape "${merchant_id}")
ONEPAYMENT_WEBHOOK_SECRET=$(env_escape "${webhook_secret}")
ONEPAYMENT_API_BASE=$(env_escape "https://api.onepayment.pro")
ONEPAYMENT_CREATE_PATH=$(env_escape "/v1/payments")
TELEGRAM_BOT_TOKEN=$(env_escape "${tg_token}")
TELEGRAM_CHAT_ID=$(env_escape "${tg_chat}")
NODE_ENV=production
EOF
  chmod 600 .env
}

get_env() {
  local key="$1"
  if [[ -f .env ]]; then
    # shellcheck disable=SC1091
    set -a
    # shellcheck disable=SC1091
    . ./.env
    set +a
    eval "printf '%s' \"\${${key}-}\""
  fi
}

prompt_install() {
  echo
  echo "=== Fresh install / reinstall ==="
  local domain acme_email admin_password api_key merchant_id webhook_secret tg_token tg_chat
  local mode allow_demo session_secret

  read -r -p "Domain (example: donate.example.com): " domain
  domain="${domain// /}"
  [[ -n "${domain}" ]] || { echo "Domain is required."; return 1; }

  read -r -p "Let's Encrypt email (optional): " acme_email
  admin_password="$(read_secret "Admin password (min 8 chars): ")"
  [[ ${#admin_password} -ge 8 ]] || { echo "Admin password must be at least 8 characters."; return 1; }

  echo "Secrets are hidden while typing."
  api_key="$(read_secret "OnePayment API Key (empty = demo): ")"
  read -r -p "OnePayment Merchant ID (optional): " merchant_id
  webhook_secret="$(read_secret "OnePayment Webhook Secret: ")"
  tg_token="$(read_secret "Telegram Bot Token (optional): ")"
  read -r -p "Telegram Chat ID (optional): " tg_chat

  allow_demo="false"
  if [[ -z "${api_key}" ]]; then
    read -r -p "Enable DEMO mode on this public server? [y/N]: " allow
    if [[ "${allow,,}" == "y" || "${allow,,}" == "yes" ]]; then
      mode="demo"
      allow_demo="true"
      echo "Warning: demo mode enabled."
    else
      echo "API key required for live install."
      return 1
    fi
  else
    mode="live"
    [[ -n "${webhook_secret}" ]] || { echo "Webhook secret is required for live mode."; return 1; }
  fi

  session_secret="$(openssl rand -hex 32)"
  prepare_data_dir
  write_env_file "${domain}" "${admin_password}" "${session_secret}" "${mode}" "${allow_demo}" \
    "${api_key}" "${merchant_id}" "${webhook_secret}" "${tg_token}" "${tg_chat}"
  write_caddyfile "${domain}" "${acme_email}"

  open_firewall_hint
  echo "Building and starting services..."
  compose up -d --build --force-recreate
  if wait_for_app; then
    echo
    echo "Install complete."
    echo "Site:    https://${domain}"
    echo "Admin:   https://${domain}/admin"
    echo "Webhook: https://${domain}/api/webhook/onepayment"
    echo "DNS must point to this server for SSL."
  else
    echo
    echo "Install finished but app is unhealthy (this usually causes HTTP 503)."
    echo "Use menu option: Diagnose / fix 503"
    return 1
  fi
}

open_firewall_hint() {
  echo
  echo "Open firewall ports if needed: 80/tcp, 443/tcp (443/udp optional)."
  if command -v ufw >/dev/null 2>&1; then
    read -r -p "Configure UFW for 80/443 now? [y/N]: " ufw_ans
    if [[ "${ufw_ans,,}" == "y" || "${ufw_ans,,}" == "yes" ]]; then
      need_root_apt ufw allow 80/tcp || true
      need_root_apt ufw allow 443/tcp || true
      need_root_apt ufw allow 443/udp || true
      need_root_apt ufw allow OpenSSH || true
      echo "UFW rules added (enable with: sudo ufw enable)."
    fi
  fi
}

edit_settings() {
  echo
  echo "=== Edit settings ==="
  [[ -f .env ]] || { echo ".env not found. Run install first."; return 1; }

  # shellcheck disable=SC1091
  set -a
  # shellcheck disable=SC1091
  . ./.env
  set +a

  local current_domain="${APP_URL#https://}"
  current_domain="${current_domain#http://}"
  current_domain="${current_domain%%/*}"

  local domain admin_password api_key merchant_id webhook_secret tg_token tg_chat acme_email mode allow_demo
  read -r -p "Domain [${current_domain}]: " domain
  domain="${domain:-$current_domain}"

  read -r -p "Let's Encrypt email (optional, Enter to skip rewrite email): " acme_email
  local new_admin
  new_admin="$(read_secret "New admin password (Enter = keep): ")"
  admin_password="${new_admin:-${ADMIN_PASSWORD}}"

  api_key="$(read_secret "OnePayment API Key (Enter = keep): ")"
  api_key="${api_key:-${ONEPAYMENT_API_KEY}}"
  read -r -p "OnePayment Merchant ID [${ONEPAYMENT_MERCHANT_ID}]: " merchant_id
  merchant_id="${merchant_id:-${ONEPAYMENT_MERCHANT_ID}}"
  webhook_secret="$(read_secret "OnePayment Webhook Secret (Enter = keep): ")"
  webhook_secret="${webhook_secret:-${ONEPAYMENT_WEBHOOK_SECRET}}"
  tg_token="$(read_secret "Telegram Bot Token (Enter = keep): ")"
  tg_token="${tg_token:-${TELEGRAM_BOT_TOKEN}}"
  read -r -p "Telegram Chat ID [${TELEGRAM_CHAT_ID}]: " tg_chat
  tg_chat="${tg_chat:-${TELEGRAM_CHAT_ID}}"

  mode="${ONEPAYMENT_MODE:-live}"
  allow_demo="${ONEPAYMENT_ALLOW_DEMO:-false}"
  if [[ -z "${api_key}" ]]; then
    mode="demo"
    allow_demo="true"
  else
    mode="live"
    allow_demo="false"
  fi

  local session_secret="${SESSION_SECRET:-$(openssl rand -hex 32)}"
  write_env_file "${domain}" "${admin_password}" "${session_secret}" "${mode}" "${allow_demo}" \
    "${api_key}" "${merchant_id}" "${webhook_secret}" "${tg_token}" "${tg_chat}"
  write_caddyfile "${domain}" "${acme_email}"

  echo "Restarting services..."
  prepare_data_dir
  compose up -d --build --force-recreate
  wait_for_app || true
  echo "Settings updated."
  echo "Site: https://${domain}"
}

show_status() {
  echo
  echo "=== Status ==="
  compose ps || true
  echo
  if [[ -f .env ]]; then
    # shellcheck disable=SC1091
    set -a
    # shellcheck disable=SC1091
    . ./.env
    set +a
    echo "APP_URL=${APP_URL-}"
    echo "ONEPAYMENT_MODE=${ONEPAYMENT_MODE-}"
  fi
}

show_logs() {
  echo
  echo "=== Logs (Ctrl+C to stop) ==="
  compose logs -f --tail=100
}

restart_services() {
  echo "Restarting..."
  compose restart
  echo "Done."
}

rebuild_services() {
  echo "Rebuilding..."
  prepare_data_dir
  compose up -d --build --force-recreate
  wait_for_app || true
  echo "Done."
}

update_from_git() {
  echo "Pulling latest code..."
  git pull --ff-only origin "${REPO_BRANCH}" || git pull --ff-only
  prepare_data_dir
  compose up -d --build --force-recreate
  wait_for_app || true
  echo "Updated."
}

backup_data() {
  mkdir -p backups
  local stamp file
  stamp="$(date +%Y%m%d-%H%M%S)"
  file="backups/mrclock-data-${stamp}.tgz"
  tar -czf "${file}" data .env Caddyfile 2>/dev/null || tar -czf "${file}" data
  echo "Backup saved: ${file}"
}

uninstall_all() {
  echo
  echo "=== FULL UNINSTALL ==="
  echo "This will remove MrClock Donate services completely:"
  echo "  - containers, networks"
  echo "  - project images"
  echo "  - caddy/app volumes"
  echo "  - local data/, .env, backups/"
  echo
  read -r -p "Type DELETE to confirm full uninstall: " confirm
  [[ "${confirm}" == "DELETE" ]] || { echo "Cancelled."; return 0; }

  echo "Stopping and removing compose stack (images + volumes)..."
  compose down --rmi all --volumes --remove-orphans || true

  local project docker_bin
  project="$(basename "$(pwd)" | tr '[:upper:]' '[:lower:]' | sed 's/[^a-z0-9]//g')"
  if docker info >/dev/null 2>&1; then
    docker_bin="docker"
  else
    docker_bin="sudo docker"
  fi

  echo "Cleaning leftover Docker resources..."
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

  ${docker_bin} network ls --format '{{.Name}}' 2>/dev/null | while read -r net; do
    case "${net}" in
      *donate*|*mrclock*|"${project}"* )
        ${docker_bin} network rm "${net}" >/dev/null 2>&1 || true
        ;;
    esac
  done || true

  echo "Deleting local app files..."
  rm -rf data backups .env .env.bak Caddyfile.local 2>/dev/null || true
  if git rev-parse --is-inside-work-tree >/dev/null 2>&1; then
    git checkout -- Caddyfile 2>/dev/null || true
  fi

  read -r -p "Also remove Docker Engine installed for this app? [y/N]: " remove_docker
  if [[ "${remove_docker,,}" == "y" || "${remove_docker,,}" == "yes" ]]; then
    echo "Removing Docker Engine packages (Ubuntu)..."
    need_root_apt systemctl stop docker docker.socket containerd 2>/dev/null || true
    need_root_apt apt-get purge -y \
      docker-ce docker-ce-cli containerd.io docker-buildx-plugin docker-compose-plugin docker-ce-rootless-extras \
      2>/dev/null || true
    need_root_apt apt-get autoremove -y --purge 2>/dev/null || true
    need_root_apt rm -f /etc/apt/sources.list.d/docker.list 2>/dev/null || true
    need_root_apt rm -f /etc/apt/keyrings/docker.gpg 2>/dev/null || true
    need_root_apt rm -rf /var/lib/docker /var/lib/containerd 2>/dev/null || true
    echo "Docker Engine removed."
  fi

  read -r -p "Delete this project folder ($(pwd))? [y/N]: " wipe_dir
  if [[ "${wipe_dir,,}" == "y" || "${wipe_dir,,}" == "yes" ]]; then
    local victim
    victim="$(pwd)"
    cd /
    echo "Removing ${victim} ..."
    rm -rf "${victim}"
    echo "Project folder deleted."
    echo "Uninstall finished. Exiting."
    exit 0
  fi

  echo "Full uninstall finished."
}

print_menu() {
  cat <<EOF

========================================
 MrClock Donate — Ubuntu Menu
========================================
 1) Install / reinstall (Docker + SSL)
 2) Edit settings
 3) Status
 4) Logs
 5) Restart
 6) Rebuild
 7) Update from Git
 8) Backup data
 9) Full uninstall (purge everything)
 d) Diagnose / fix 503
 0) Exit
EOF
}

main_menu() {
  ensure_ubuntu_hint
  ensure_repo
  while true; do
    print_menu
    read -r -p "Select: " choice
    case "${choice}" in
      1)
        install_docker_ubuntu
        prompt_install
        ;;
      2) edit_settings ;;
      3) show_status ;;
      4) show_logs ;;
      5) restart_services ;;
      6) rebuild_services ;;
      7) update_from_git ;;
      8) backup_data ;;
      9) uninstall_all ;;
      d|D) diagnose_503 ;;
      0|q|Q) echo "Bye."; exit 0 ;;
      *) echo "Invalid option." ;;
    esac
  done
}

main_menu
