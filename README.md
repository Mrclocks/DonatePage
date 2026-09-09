# MrClock Donate

صفحه دونیت مینیمال با تارگت، تاریخچه، Top donors، ادمین، OnePayment و نوتیف تلگرام.

## امکانات
- صفحه عمومی: تارگت فعلی، دونیت USD/USDT، بیشترین دونیت‌کنندگان، تاریخچه تارگت
- ادمین: ساخت تارگت + تنظیمات ربات تلگرام
- کلیدهای درگاه فقط سمت سرور (در `.env`)
- وب‌هوک با HMAC
- حالت Demo بدون کلید درگاه

## نصب روی سرور (ساده‌ترین حالت)

پیش‌نیاز: Docker + Docker Compose و DNS دامنه روی IP سرور.

```bash
git clone <repo-url> DonatePage
cd DonatePage
chmod +x install.sh
./install.sh
```

اسکریپت می‌پرسد:
1. دامنه
2. ایمیل Let's Encrypt (اختیاری)
3. رمز ادمین
4. کلیدهای OnePayment / تلگرام (اختیاری)

بعد سرویس را بالا می‌آورد و **سرتیفیکیت SSL را خودکار** با Caddy می‌گیرد.

- سایت: `https://YOUR_DOMAIN`
- ادمین: `https://YOUR_DOMAIN/admin`
- وب‌هوک: `https://YOUR_DOMAIN/api/webhook/onepayment`

## توسعه محلی

```bash
cp .env.example .env
npm install
npm run dev
```

اگر `ONEPAYMENT_API_KEY` خالی باشد، پرداخت Demo فعال است.

## امنیت
- کلید API درگاه و توکن تلگرام فقط در سرور
- Session ادمین HttpOnly
- Rate limit روی donate / login / webhook
- Verify امضای وب‌هوک قبل از ثبت دونیت
- در production بدون کلید درگاه، نصب متوقف می‌شود مگر صریحاً Demo را تأیید کنید
- در live، Webhook Secret اجباری است
- فایل `.env` و پوشه `data/` در git نیستند
