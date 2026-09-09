#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$ROOT_DIR"

echo "========================================"
echo " MrClock Donate — نصب ساده"
echo "========================================"
echo

if ! command -v docker >/dev/null 2>&1; then
  echo "Docker پیدا نشد. اول Docker را نصب کنید."
  exit 1
fi

if ! docker compose version >/dev/null 2>&1; then
  echo "Docker Compose پیدا نشد."
  exit 1
fi

env_escape() {
  # Escape values for .env so $, `, ", \ and newlines cannot break or interpolate.
  local value="${1-}"
  value="${value//\\/\\\\}"
  value="${value//\"/\\\"}"
  value="${value//\$/\\$}"
  value="${value//\`/\\\`}"
  value="${value//$'\n'/\\n}"
  printf '"%s"' "$value"
}

read -r -p "دامنه (مثال: donate.example.com): " DOMAIN
DOMAIN="${DOMAIN// /}"
if [[ -z "$DOMAIN" ]]; then
  echo "دامنه الزامی است."
  exit 1
fi

read -r -p "ایمیل برای Let's Encrypt (اختیاری، Enter بزن اگر نمی‌خواهی): " ACME_EMAIL
read -r -s -p "رمز عبور ادمین: " ADMIN_PASSWORD
echo
if [[ ${#ADMIN_PASSWORD} -lt 8 ]]; then
  echo "رمز ادمین حداقل ۸ کاراکتر باشد."
  exit 1
fi

echo
echo "کلیدهای درگاه/تلگرام هنگام تایپ دیده نمی‌شوند."
read -r -s -p "OnePayment API Key: " ONEPAYMENT_API_KEY
echo
read -r -p "OnePayment Merchant ID (اختیاری): " ONEPAYMENT_MERCHANT_ID
read -r -s -p "OnePayment Webhook Secret: " ONEPAYMENT_WEBHOOK_SECRET
echo
read -r -s -p "Telegram Bot Token (اختیاری): " TELEGRAM_BOT_TOKEN
echo
read -r -p "Telegram Chat ID (اختیاری): " TELEGRAM_CHAT_ID

SESSION_SECRET="$(openssl rand -hex 32)"
ONEPAYMENT_ALLOW_DEMO="false"

if [[ -z "$ONEPAYMENT_API_KEY" ]]; then
  echo
  echo "API Key خالی است."
  read -r -p "آیا حالت Demo روی سرور عمومی فعال شود؟ (خطرناک — فقط برای تست) [y/N]: " ALLOW_DEMO
  if [[ "${ALLOW_DEMO,,}" == "y" || "${ALLOW_DEMO,,}" == "yes" ]]; then
    ONEPAYMENT_MODE="demo"
    ONEPAYMENT_ALLOW_DEMO="true"
    echo "هشدار: Demo روی production فعال شد."
  else
    echo "برای نصب production باید ONEPAYMENT_API_KEY بدهید."
    exit 1
  fi
else
  ONEPAYMENT_MODE="live"
  if [[ -z "$ONEPAYMENT_WEBHOOK_SECRET" ]]; then
    echo "در حالت live، Webhook Secret الزامی است."
    exit 1
  fi
fi

mkdir -p data
chmod 700 data

cat > .env <<EOF
APP_URL=$(env_escape "https://${DOMAIN}")
SESSION_SECRET=$(env_escape "${SESSION_SECRET}")
ADMIN_PASSWORD=$(env_escape "${ADMIN_PASSWORD}")
DATA_DIR=/app/data
ONEPAYMENT_MODE=$(env_escape "${ONEPAYMENT_MODE}")
ONEPAYMENT_ALLOW_DEMO=$(env_escape "${ONEPAYMENT_ALLOW_DEMO}")
ONEPAYMENT_API_KEY=$(env_escape "${ONEPAYMENT_API_KEY}")
ONEPAYMENT_MERCHANT_ID=$(env_escape "${ONEPAYMENT_MERCHANT_ID}")
ONEPAYMENT_WEBHOOK_SECRET=$(env_escape "${ONEPAYMENT_WEBHOOK_SECRET}")
ONEPAYMENT_API_BASE=$(env_escape "https://api.onepayment.pro")
ONEPAYMENT_CREATE_PATH=$(env_escape "/v1/payments")
TELEGRAM_BOT_TOKEN=$(env_escape "${TELEGRAM_BOT_TOKEN}")
TELEGRAM_CHAT_ID=$(env_escape "${TELEGRAM_CHAT_ID}")
NODE_ENV=production
EOF
chmod 600 .env

if [[ -n "$ACME_EMAIL" ]]; then
  cat > Caddyfile <<EOF
{
	email ${ACME_EMAIL}
}

${DOMAIN} {
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
${DOMAIN} {
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

echo
echo "در حال ساخت و اجرای سرویس‌ها..."
docker compose up -d --build

echo
echo "نصب انجام شد."
echo "سایت: https://${DOMAIN}"
echo "ادمین: https://${DOMAIN}/admin"
echo "وب‌هوک OnePayment: https://${DOMAIN}/api/webhook/onepayment"
echo
echo "نکته: DNS دامنه باید به همین سرور اشاره کند تا سرتیفیکیت صادر شود."
