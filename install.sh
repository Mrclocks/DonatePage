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

read -r -p "OnePayment API Key (خالی = حالت Demo): " ONEPAYMENT_API_KEY
read -r -p "OnePayment Merchant ID (اختیاری): " ONEPAYMENT_MERCHANT_ID
read -r -p "OnePayment Webhook Secret (اختیاری): " ONEPAYMENT_WEBHOOK_SECRET
read -r -p "Telegram Bot Token (اختیاری): " TELEGRAM_BOT_TOKEN
read -r -p "Telegram Chat ID (اختیاری): " TELEGRAM_CHAT_ID

SESSION_SECRET="$(openssl rand -hex 32)"

if [[ -n "$ONEPAYMENT_API_KEY" ]]; then
  ONEPAYMENT_MODE="live"
else
  ONEPAYMENT_MODE="demo"
fi

mkdir -p data
chmod 700 data

cat > .env <<EOF
APP_URL=https://${DOMAIN}
SESSION_SECRET=${SESSION_SECRET}
ADMIN_PASSWORD=${ADMIN_PASSWORD}
DATA_DIR=/app/data
ONEPAYMENT_MODE=${ONEPAYMENT_MODE}
ONEPAYMENT_API_KEY=${ONEPAYMENT_API_KEY}
ONEPAYMENT_MERCHANT_ID=${ONEPAYMENT_MERCHANT_ID}
ONEPAYMENT_WEBHOOK_SECRET=${ONEPAYMENT_WEBHOOK_SECRET}
ONEPAYMENT_API_BASE=https://api.onepayment.pro
ONEPAYMENT_CREATE_PATH=/v1/payments
TELEGRAM_BOT_TOKEN=${TELEGRAM_BOT_TOKEN}
TELEGRAM_CHAT_ID=${TELEGRAM_CHAT_ID}
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
