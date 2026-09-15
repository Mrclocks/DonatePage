# MrClock Donate

USDT donation page (NOWPayments Hosted Checkout) + admin + Telegram.

## Install (Ubuntu)

One line (works if already installed — pulls latest `main`):

```bash
cd ~; [ -d DonatePage/.git ] || git clone https://github.com/Mrclocks/DonatePage.git DonatePage; cd DonatePage; [ -f Caddyfile.local ] || { [ -f Caddyfile ] && ! grep -q '{$DOMAIN' Caddyfile 2>/dev/null && cp Caddyfile Caddyfile.local; true; }; git fetch origin main && git reset --hard origin/main && bash install.sh
```

Correct menu shows: **Installer · Manager** and version `2026.09.15g`  
If you still see old `Ubuntu Menu` / `Diagnose 503`, you are on the old script.

| Key | Action |
|-----|--------|
| 1 | Install (domain · SSL · payments) |
| 2 | Update (pull prebuilt image) |
| 3 | Settings |
| 4 | Status |
| 5 | Logs |
| 6 | Restart |
| 7 | Backup |
| 8 | Uninstall |

Ports: **80**, **443** (Caddy auto-issues Let's Encrypt)

Survives updates: `data/`, `.env`, `Caddyfile.local`, TLS volume

### How deploy works

1. **Prefer prebuilt image** from `ghcr.io/mrclocks/donatepage:latest` (built by GitHub Actions — no Next.js compile on your VPS)
2. If the image is missing, fall back to a **slim local build** (`node:22-bookworm-slim` + Next standalone) and auto-add swap on low-RAM servers
3. Caddy handles HTTPS

### What Install asks for

1. **Domain** — public hostname (A record must point to this server)
2. **Let's Encrypt email** — for automatic HTTPS certificate
3. **Admin password** + optional admin URL path
4. **NOWPayments API Key + IPN Secret** — live payments
5. **Telegram** — optional (can set later in admin)

After install: open admin → set targets. Paste the printed IPN URL into the NOWPayments dashboard.

## Payment env

- `APP_URL` — public site URL (success/cancel/IPN callbacks)
- `ACME_EMAIL` — Let's Encrypt contact (Caddy)
- `NOWPAYMENTS_API_KEY` — server-only API key
- `NOWPAYMENTS_IPN_SECRET` — IPN HMAC-SHA512 secret
- `NOWPAYMENTS_PAY_CURRENCY` — donor pay coin/network (default `usdtbsc`)
- `NOWPAYMENTS_API_BASE` — default `https://api.nowpayments.io`
- `NOWPAYMENTS_ALLOW_DEMO` — must be `true` to allow demo checkout in production (not recommended)
- `APP_IMAGE` — optional override for the app container image
