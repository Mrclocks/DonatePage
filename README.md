# MrClock Donate

USDT donation page (NOWPayments Hosted Checkout) + admin + Telegram.

## Install (Ubuntu)

One line (works if already installed — pulls latest `main`):

```bash
cd ~; [ -d DonatePage/.git ] || git clone https://github.com/Mrclocks/DonatePage.git DonatePage; cd DonatePage; [ -f Caddyfile.local ] || { [ -f Caddyfile ] && ! grep -q '{$DOMAIN' Caddyfile 2>/dev/null && cp Caddyfile Caddyfile.local; true; }; git fetch origin main && git reset --hard origin/main && bash install.sh
```

Correct menu shows: **Installer · Manager** and version `2026.09.09`  
If you still see old `Ubuntu Menu` / `Diagnose 503`, you are on the old script.

| Key | Action |
|-----|--------|
| 1 | Install |
| 2 | Update (fast) |
| 3 | Settings |
| 4 | Status |
| 5 | Logs |
| 6 | Restart |
| 7 | Backup |
| 8 | Uninstall |

Ports: **80**, **443**

Survives updates: `data/`, `.env`, `Caddyfile.local`, TLS volume

## Payment env

- `APP_URL` — public site URL (success/cancel/IPN callbacks)
- `NOWPAYMENTS_API_KEY` — server-only API key
- `NOWPAYMENTS_IPN_SECRET` — IPN HMAC-SHA512 secret
- `NOWPAYMENTS_API_BASE` — default `https://api.nowpayments.io`
- `NOWPAYMENTS_ALLOW_DEMO` — must be `true` to allow demo checkout in production (not recommended)
