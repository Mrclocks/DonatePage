#!/usr/bin/env bash
# MrClock Donate — installer
#   git clone https://github.com/Mrclocks/DonatePage.git
#   cd DonatePage && bash install.sh
set -euo pipefail

REPO_URL="${REPO_URL:-https://github.com/Mrclocks/DonatePage.git}"
REPO_BRANCH="${REPO_BRANCH:-main}"
DEFAULT_DIR="${INSTALL_DIR:-$HOME/DonatePage}"
# Prebuilt app image (CI publishes on main). Install pulls this instead of
# compiling Next.js on the VPS whenever possible.
APP_IMAGE_DEFAULT="${APP_IMAGE:-ghcr.io/mrclocks/donatepage:latest}"

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
section() {
  echo
  echo "  ${C_BOLD}${C_ORANGE}$1${C_RESET}"
  echo "  ${C_DIM}$(printf '─%.0s' {1..36})${C_RESET}"
}

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

# Small VPS often OOM during `next build`. Temporary swap prevents that.
ensure_build_swap() {
  local mem_kb swap_kb need_mb=2048
  mem_kb="$(awk '/MemTotal:/ {print $2}' /proc/meminfo 2>/dev/null || echo 0)"
  swap_kb="$(awk '/SwapTotal:/ {print $2}' /proc/meminfo 2>/dev/null || echo 0)"

  # Already enough RAM or enough swap
  if [[ "${mem_kb}" -ge 2500000 ]]; then
    return 0
  fi
  if [[ "${swap_kb}" -ge 1500000 ]]; then
    ok "Swap already present"
    return 0
  fi

  info "Low RAM detected — adding ${need_mb}MB swap for build safety..."
  if [[ -f /swapfile-donate ]]; then
    need_root swapon /swapfile-donate 2>/dev/null || true
    ok "Existing swap enabled"
    return 0
  fi

  need_root fallocate -l "${need_mb}M" /swapfile-donate 2>/dev/null \
    || need_root dd if=/dev/zero of=/swapfile-donate bs=1M count="${need_mb}" status=none
  need_root chmod 600 /swapfile-donate
  need_root mkswap /swapfile-donate
  need_root swapon /swapfile-donate
  ok "Swap ready (${need_mb}MB)"
}

# Prefer pulling the CI image. Only compile on the server as fallback.
deploy_app_stack() {
  local mode="${1:-up}" # up | update
  export APP_IMAGE="${APP_IMAGE_DEFAULT}"

  info "Trying prebuilt image: ${APP_IMAGE}"
  if compose pull app; then
    ok "Prebuilt image downloaded — no compile on this server"
    if [[ "${mode}" == "update" ]]; then
      compose up -d --no-deps --force-recreate --remove-orphans --no-build app
      if ! compose ps 2>/dev/null | grep -Eiq 'caddy[[:space:]].*(running|up)'; then
        compose up -d --no-build caddy
      fi
    else
      compose up -d --remove-orphans --no-build
    fi
    return 0
  fi

  warn "Prebuilt image unavailable — building locally (slower, needs RAM/swap)."
  ensure_build_swap
  info "Building slim app image (standalone Next.js)..."
  if [[ "${mode}" == "update" ]]; then
    compose build app
    compose up -d --no-deps --force-recreate --remove-orphans app
    if ! compose ps 2>/dev/null | grep -Eiq 'caddy[[:space:]].*(running|up)'; then
      compose up -d caddy
    fi
  else
    compose up -d --build --remove-orphans
  fi
}

prepare_data_dir() {
  mkdir -p data backups
  # Container runs as uid 1001; keep data writable from host + container.
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
      write_caddy_local "${d}" "${ACME_EMAIL-}"
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

# Caddy auto-issues Let's Encrypt once DNS + ports 80/443 are correct.
wait_for_https() {
  local domain="$1"
  info "Waiting for HTTPS certificate (Let's Encrypt via Caddy)..."
  local i
  for i in $(seq 1 40); do
    if curl -fsS --max-time 8 "https://${domain}/api/health" >/dev/null 2>&1; then
      ok "HTTPS ready — certificate issued for ${domain}"
      return 0
    fi
    sleep 3
  done
  warn "HTTPS not ready yet."
  echo "    Check: DNS A record → this server, ports 80+443 open, then:"
  echo "    docker compose logs caddy"
  compose logs --tail=50 caddy || true
  return 1
}

read_secret() {
  local prompt="$1"
  local value=""
  read -r -s -p "${prompt}" value
  echo >&2
  printf '%s' "${value}"
}

normalize_domain() {
  local d="${1-}"
  d="${d// /}"
  d="${d#https://}"
  d="${d#http://}"
  d="${d%%/*}"
  d="${d%%:*}"
  printf '%s' "${d,,}"
}

valid_domain() {
  local d="$1"
  [[ "${d}" =~ ^[a-z0-9]([a-z0-9.-]*[a-z0-9])?$ ]] || return 1
  [[ "${d}" == *.* ]] || return 1
  [[ "${d}" != *".."* ]] || return 1
  return 0
}

valid_email() {
  local e="$1"
  [[ "${e}" =~ ^[^@[:space:]]+@[^@[:space:]]+\.[^@[:space:]]+$ ]]
}

public_ipv4() {
  curl -4 -fsS --max-time 6 https://ifconfig.me/ip 2>/dev/null \
    || curl -4 -fsS --max-time 6 https://api.ipify.org 2>/dev/null \
    || curl -4 -fsS --max-time 6 https://icanhazip.com 2>/dev/null \
    || true
}

resolve_domain_ips() {
  local host="$1"
  local out=""
  if command -v dig >/dev/null 2>&1; then
    out="$(dig +short A "${host}" 2>/dev/null | grep -E '^[0-9.]+$' || true)"
  fi
  if [[ -z "${out}" ]] && command -v getent >/dev/null 2>&1; then
    out="$(getent ahostsv4 "${host}" 2>/dev/null | awk '{print $1}' | sort -u || true)"
  fi
  if [[ -z "${out}" ]] && command -v python3 >/dev/null 2>&1; then
    out="$(python3 -c "import socket; print(socket.gethostbyname('${host}'))" 2>/dev/null || true)"
  fi
  printf '%s' "${out}"
}

check_dns_points_here() {
  local domain="$1"
  local server_ip resolved
  server_ip="$(public_ipv4 | tr -d '[:space:]')"
  if [[ -z "${server_ip}" ]]; then
    warn "Could not detect this server's public IP — skipping DNS check."
    return 0
  fi

  resolved="$(resolve_domain_ips "${domain}")"
  if [[ -z "${resolved}" ]]; then
    err "Domain ${domain} does not resolve yet."
    echo "    Point an A record to ${server_ip}, wait for DNS, then retry."
    return 1
  fi

  if printf '%s\n' "${resolved}" | grep -qx "${server_ip}"; then
    ok "DNS OK — ${domain} → ${server_ip}"
    return 0
  fi

  err "DNS mismatch."
  echo "    Domain resolves to:"
  printf '%s\n' "${resolved}" | sed 's/^/      /'
  echo "    This server public IP: ${server_ip}"
  echo "    Update the A record, wait a minute, then retry Install."
  return 1
}

ensure_ports_free_hint() {
  local busy=""
  if command -v ss >/dev/null 2>&1; then
    if ss -ltn "( sport = :80 or sport = :443 )" 2>/dev/null | grep -qE ':80|:443'; then
      # Docker/Caddy already bound is fine; warn only if something else owns them later via compose fail.
      busy="maybe"
    fi
  fi
  [[ -n "${busy}" ]] || true
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
  local acme_email="${11-}"
  local pay_currency="${12:-usdtbsc}"

  admin_path="$(printf '%s' "${admin_path}" | tr -cd 'A-Za-z0-9-_')"
  [[ -n "${admin_path}" ]] || admin_path="admin"
  pay_currency="$(printf '%s' "${pay_currency}" | tr '[:upper:]' '[:lower:]' | tr -cd 'a-z0-9')"
  [[ -n "${pay_currency}" ]] || pay_currency="usdtbsc"

  cat > .env <<EOF
APP_URL=$(env_escape "https://${domain}")
ACME_EMAIL=$(env_escape "${acme_email}")
SESSION_SECRET=$(env_escape "${session_secret}")
ADMIN_PASSWORD=$(env_escape "${admin_password}")
ADMIN_PATH=$(env_escape "${admin_path}")
DATA_DIR=/app/data
NOWPAYMENTS_MODE=$(env_escape "${mode}")
NOWPAYMENTS_ALLOW_DEMO=$(env_escape "${allow_demo}")
NOWPAYMENTS_API_KEY=$(env_escape "${api_key}")
NOWPAYMENTS_IPN_SECRET=$(env_escape "${ipn_secret}")
NOWPAYMENTS_PAY_CURRENCY=$(env_escape "${pay_currency}")
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

open_firewall() {
  echo
  info "Opening ports 80 and 443 (required for HTTPS / Let's Encrypt)..."
  if command -v ufw >/dev/null 2>&1; then
    read -r -p "  Configure UFW now? [Y/n]: " ufw_ans
    ufw_ans="${ufw_ans:-Y}"
    if [[ "${ufw_ans,,}" == "y" || "${ufw_ans,,}" == "yes" ]]; then
      need_root ufw allow 80/tcp || true
      need_root ufw allow 443/tcp || true
      need_root ufw allow 443/udp || true
      need_root ufw allow OpenSSH || true
      if need_root ufw status 2>/dev/null | grep -qi inactive; then
        read -r -p "  UFW is inactive. Enable it now? [Y/n]: " en_ans
        en_ans="${en_ans:-Y}"
        if [[ "${en_ans,,}" == "y" || "${en_ans,,}" == "yes" ]]; then
          need_root ufw --force enable || true
        fi
      fi
      ok "UFW rules for 80/443 applied"
    else
      warn "Skipped UFW — make sure 80/443 are open on your cloud firewall too."
    fi
  else
    warn "ufw not installed — open TCP 80 + 443 on your cloud provider firewall."
  fi
}

print_post_install() {
  local domain="$1"
  local admin_path="$2"
  echo
  ok "Install complete"
  echo
  echo "  ${C_BOLD}Your site${C_RESET}"
  echo "    https://${domain}"
  echo "    https://${domain}/${admin_path}/login"
  echo
  echo "  ${C_BOLD}Paste this IPN URL in NOWPayments${C_RESET}"
  echo "    https://${domain}/api/webhook/nowpayments"
  echo
  echo "  ${C_BOLD}Next step${C_RESET}"
  echo "    1. Open admin → set donation targets"
  echo "    2. In NOWPayments: enable USDT BEP20 (USDTBSC) + add payout wallet"
  echo "    3. Paste the IPN URL above into NOWPayments IPN settings"
  echo "    4. Make a small live test donation"
  echo
}

# ── actions ─────────────────────────────────────────────

do_install() {
  clear_screen
  echo
  echo "  ${C_BOLD}${C_ORANGE}Install / Reinstall${C_RESET}"
  echo "  ${C_DIM}────────────────────${C_RESET}"
  echo
  echo "  Enter the values below. Caddy will obtain a free"
  echo "  Let's Encrypt certificate automatically."
  echo "  After install you only set targets in admin."
  echo

  install_docker

  local domain acme_email admin_password api_key ipn_secret tg_token tg_chat
  local mode allow_demo session_secret admin_path pay_currency

  # ── Domain & SSL ──────────────────────────────────────
  section "1 · Domain & SSL"
  echo "  ${C_DIM}DNS A record must already point to this server.${C_RESET}"
  read -r -p "  Domain (e.g. donate.example.com): " domain
  domain="$(normalize_domain "${domain}")"
  if ! valid_domain "${domain}"; then
    err "Invalid domain."
    pause
    return 1
  fi

  read -r -p "  Let's Encrypt email (required for SSL notices): " acme_email
  acme_email="${acme_email// /}"
  if ! valid_email "${acme_email}"; then
    err "Valid email required for automatic certificate."
    pause
    return 1
  fi

  if ! check_dns_points_here "${domain}"; then
    read -r -p "  Continue anyway? [y/N]: " force_dns
    if [[ "${force_dns,,}" != "y" && "${force_dns,,}" != "yes" ]]; then
      pause
      return 1
    fi
    warn "Continuing without matching DNS — certificate may fail."
  fi

  open_firewall
  ensure_ports_free_hint

  # ── Admin ─────────────────────────────────────────────
  section "2 · Admin"
  admin_password="$(read_secret "  Admin password (min 8 chars): ")"
  [[ ${#admin_password} -ge 8 ]] || { err "Password too short."; pause; return 1; }

  read -r -p "  Admin URL path [admin]: " admin_path
  admin_path="${admin_path:-admin}"
  admin_path="$(printf '%s' "${admin_path}" | tr -cd 'A-Za-z0-9-_')"
  [[ -n "${admin_path}" ]] || admin_path="admin"

  # ── NOWPayments ───────────────────────────────────────
  section "3 · NOWPayments (live)"
  echo "  ${C_DIM}From nowpayments.io → API keys / IPN secret${C_RESET}"
  echo "  ${C_DIM}IPN URL after install:${C_RESET}"
  echo "  ${C_DIM}https://${domain}/api/webhook/nowpayments${C_RESET}"
  api_key="$(read_secret "  API Key: ")"
  ipn_secret="$(read_secret "  IPN Secret: ")"
  echo "  ${C_DIM}Pay coin/network for donors (must be enabled + wallet in NOWPayments)${C_RESET}"
  read -r -p "  Pay currency [usdtbsc]: " pay_currency
  pay_currency="${pay_currency:-usdtbsc}"

  allow_demo="false"
  if [[ -z "${api_key}" || -z "${ipn_secret}" ]]; then
    echo
    warn "Live keys missing."
    read -r -p "  Type DEMO to enable demo checkout (not for production): " demo_confirm
    if [[ "${demo_confirm}" == "DEMO" ]]; then
      mode="demo"
      allow_demo="true"
      api_key=""
      ipn_secret=""
      warn "Demo mode — payments are simulated locally."
    else
      err "API Key and IPN Secret are required for live install."
      pause
      return 1
    fi
  else
    mode="live"
  fi

  # ── Telegram (optional) ───────────────────────────────
  section "4 · Telegram (optional)"
  echo "  ${C_DIM}Leave empty to skip — can set later in admin.${C_RESET}"
  tg_token="$(read_secret "  Bot Token: ")"
  read -r -p "  Chat ID: " tg_chat

  # ── Confirm ───────────────────────────────────────────
  section "Confirm"
  echo "  Domain:     ${domain}"
  echo "  SSL email:  ${acme_email}"
  echo "  Admin:      https://${domain}/${admin_path}/login"
  echo "  Payments:   ${mode} / ${pay_currency:-usdtbsc}"
  echo "  Telegram:   $([[ -n "${tg_token}" ]] && echo set || echo skip)"
  echo
  read -r -p "  Proceed with install? [Y/n]: " go
  go="${go:-Y}"
  if [[ "${go,,}" != "y" && "${go,,}" != "yes" ]]; then
    warn "Cancelled."
    pause
    return 0
  fi

  session_secret="$(openssl rand -hex 32)"
  prepare_data_dir
  write_env_file "${domain}" "${admin_password}" "${session_secret}" "${mode}" "${allow_demo}" \
    "${api_key}" "${ipn_secret}" "${tg_token}" "${tg_chat}" "${admin_path}" "${acme_email}" "${pay_currency}"
  write_caddy_local "${domain}" "${acme_email}"

  echo
  info "Deploying stack (pull prebuilt image when available)..."
  deploy_app_stack up

  if ! wait_for_app; then
    err "Install finished but app is unhealthy."
    pause
    return 1
  fi

  wait_for_https "${domain}" || true
  print_post_install "${domain}" "${admin_path}"
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
  deploy_app_stack update

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
  local mode allow_demo admin_path session_secret pay_currency
  local cur
  cur="$(current_domain)"

  section "1 · Domain & SSL"
  read -r -p "  Domain [${cur}]: " domain
  domain="$(normalize_domain "${domain:-$cur}")"
  if ! valid_domain "${domain}"; then
    err "Invalid domain."
    pause
    return 1
  fi

  read -r -p "  Let's Encrypt email [${ACME_EMAIL-}]: " acme_email
  acme_email="${acme_email:-${ACME_EMAIL-}}"
  acme_email="${acme_email// /}"
  if ! valid_email "${acme_email}"; then
    err "Valid Let's Encrypt email required."
    pause
    return 1
  fi

  if [[ "${domain}" != "${cur}" ]]; then
    if ! check_dns_points_here "${domain}"; then
      read -r -p "  Continue anyway? [y/N]: " force_dns
      if [[ "${force_dns,,}" != "y" && "${force_dns,,}" != "yes" ]]; then
        pause
        return 1
      fi
    fi
  fi

  section "2 · Admin"
  local new_admin
  new_admin="$(read_secret "  New admin password (Enter = keep): ")"
  admin_password="${new_admin:-${ADMIN_PASSWORD}}"

  read -r -p "  Admin path [${ADMIN_PATH:-admin}]: " admin_path
  admin_path="${admin_path:-${ADMIN_PATH:-admin}}"

  section "3 · NOWPayments"
  api_key="$(read_secret "  API Key (Enter = keep): ")"
  api_key="${api_key:-${NOWPAYMENTS_API_KEY-}}"
  ipn_secret="$(read_secret "  IPN Secret (Enter = keep): ")"
  ipn_secret="${ipn_secret:-${NOWPAYMENTS_IPN_SECRET-}}"
  read -r -p "  Pay currency [${NOWPAYMENTS_PAY_CURRENCY:-usdtbsc}]: " pay_currency
  pay_currency="${pay_currency:-${NOWPAYMENTS_PAY_CURRENCY:-usdtbsc}}"

  allow_demo="false"
  if [[ -z "${api_key}" || -z "${ipn_secret}" ]]; then
    read -r -p "  Type DEMO to enable demo mode: " demo_confirm
    if [[ "${demo_confirm}" == "DEMO" ]]; then
      mode="demo"
      allow_demo="true"
      api_key=""
      ipn_secret=""
      warn "Demo mode enabled"
    else
      err "API key + IPN secret required for live settings."
      pause
      return 1
    fi
  else
    mode="live"
  fi

  section "4 · Telegram (optional)"
  tg_token="$(read_secret "  Bot Token (Enter = keep): ")"
  tg_token="${tg_token:-${TELEGRAM_BOT_TOKEN-}}"
  read -r -p "  Chat ID [${TELEGRAM_CHAT_ID-}]: " tg_chat
  tg_chat="${tg_chat:-${TELEGRAM_CHAT_ID-}}"

  session_secret="${SESSION_SECRET:-$(openssl rand -hex 32)}"
  write_env_file "${domain}" "${admin_password}" "${session_secret}" "${mode}" "${allow_demo}" \
    "${api_key}" "${ipn_secret}" "${tg_token}" "${tg_chat}" "${admin_path}" "${acme_email}" "${pay_currency}"
  write_caddy_local "${domain}" "${acme_email}"

  info "Applying settings (no app rebuild)..."
  prepare_data_dir
  export APP_IMAGE="${APP_IMAGE_DEFAULT}"
  compose up -d --force-recreate --no-build --remove-orphans
  wait_for_app || true
  if [[ "${domain}" != "${cur}" ]]; then
    wait_for_https "${domain}" || true
  fi
  ok "Settings saved"
  print_post_install "${domain}" "${admin_path}"
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
    echo "  ACME_EMAIL=${ACME_EMAIL-}"
    echo "  ADMIN_PATH=${ADMIN_PATH-admin}"
    echo "  MODE=${NOWPAYMENTS_MODE-}"
  fi
  if curl -fsS "http://127.0.0.1:3000/api/health" >/dev/null 2>&1; then
    echo
    ok "Local health OK (:3000)"
  else
    echo
    warn "Health check failed on :3000"
  fi
  if load_env 2>/dev/null; then
    local d
    d="$(current_domain)"
    if [[ -n "${d}" ]] && curl -fsS --max-time 5 "https://${d}/api/health" >/dev/null 2>&1; then
      ok "HTTPS OK (https://${d})"
    elif [[ -n "${d}" ]]; then
      warn "HTTPS not responding yet for ${d}"
    fi
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

INSTALLER_VERSION="2026.09.15l"

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
     ${C_CYAN}1${C_RESET}   Install / reinstall   ${C_DIM}pull image · auto SSL${C_RESET}
     ${C_CYAN}2${C_RESET}   Update                ${C_DIM}pull image · SSL stays up${C_RESET}
     ${C_CYAN}3${C_RESET}   Settings              ${C_DIM}no rebuild${C_RESET}

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
