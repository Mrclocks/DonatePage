# MrClock Donate

USDT (BEP20) donation page + admin + Telegram.

## Install (Ubuntu)

One line:

```bash
git clone https://github.com/Mrclocks/DonatePage.git && cd DonatePage && bash install.sh
```

Or step by step:

```bash
git clone https://github.com/Mrclocks/DonatePage.git
cd DonatePage
bash install.sh
```

| Menu | Action |
|------|--------|
| 1 | Install |
| 2 | Update (fast) |
| 3 | Settings |
| 4 | Status |
| 5 | Logs |
| 6 | Restart |
| 7 | Backup |
| 8 | Uninstall |

Ports: **80**, **443**

Data that survives updates: `data/` (SQLite), `.env`, `Caddyfile.local`, TLS volume.
