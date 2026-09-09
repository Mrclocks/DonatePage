# MrClock Donate

USDT (BEP20) donation page + admin + Telegram.

## Install (Ubuntu)

یک خط — اگر از قبل نصب داری هم آخرین کد را می‌گیرد و منوی جدید باز می‌شود:

```bash
cd ~; [ -d DonatePage/.git ] || git clone https://github.com/Mrclocks/DonatePage.git DonatePage; cd DonatePage; [ -f Caddyfile.local ] || { [ -f Caddyfile ] && ! grep -q '{$DOMAIN' Caddyfile 2>/dev/null && cp Caddyfile Caddyfile.local; true; }; git fetch origin main && git reset --hard origin/main && bash install.sh
```

منوی درست این را نشان می‌دهد: **«پنل نصب و مدیریت»** و نسخه `2026.09.09`  
اگر هنوز منوی انگلیسی قدیمی (`Ubuntu Menu` / `Diagnose 503`) دیدی، اسکریپت آپدیت نشده.

| کلید | کار |
|------|-----|
| 1 | نصب |
| 2 | به‌روزرسانی سریع |
| 3 | تنظیمات |
| 4 | وضعیت |
| 5 | لاگ |
| 6 | ری‌استارت |
| 7 | بکاپ |
| 8 | حذف کامل |

پورت‌ها: **80**، **443**

داده‌های پایدار: `data/` ، `.env` ، `Caddyfile.local` ، حجم TLS
