"use client";

import { useEffect, useState, useTransition } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { Check, Copy } from "lucide-react";
import { BrandMark } from "@/components/brand-mark";
import { GlassCard } from "@/components/glass-card";
import { AlertBox } from "@/components/ui/alert-box";
import { Button } from "@/components/ui/button";

type PayInfo = {
  orderId: string;
  status: string;
  amount: number;
  payAddress: string;
  payAmount: number;
  payCurrency: string;
};

function networkLabel(payCurrency: string) {
  const c = payCurrency.toLowerCase();
  if (c === "usdtbsc" || c === "usdtbep20") return "USDT · BEP20 (BSC)";
  if (c === "usdttrc20") return "USDT · TRC20";
  if (c === "usdterc20") return "USDT · ERC20";
  return payCurrency.toUpperCase();
}

export default function PayClient() {
  const params = useSearchParams();
  const router = useRouter();
  const orderId = params.get("order")?.trim() || "";
  const [info, setInfo] = useState<PayInfo | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [pending, startTransition] = useTransition();

  useEffect(() => {
    if (!orderId) {
      setError("کد سفارش یافت نشد");
      return;
    }

    let cancelled = false;

    async function load() {
      try {
        const response = await fetch(
          `/api/pay/status?order=${encodeURIComponent(orderId)}`,
          { cache: "no-store" },
        );
        const data = await response.json();
        if (!response.ok) {
          if (!cancelled) setError(data.error || "سفارش پیدا نشد");
          return;
        }
        if (cancelled) return;
        setInfo(data as PayInfo);
        setError(null);
        if (data.status === "paid") {
          router.replace(`/success?order=${encodeURIComponent(orderId)}`);
        }
      } catch {
        if (!cancelled) setError("ارتباط برقرار نشد");
      }
    }

    void load();
    const timer = window.setInterval(() => {
      startTransition(() => {
        void load();
      });
    }, 5000);

    return () => {
      cancelled = true;
      window.clearInterval(timer);
    };
  }, [orderId, router]);

  async function copyAddress() {
    if (!info?.payAddress) return;
    try {
      await navigator.clipboard.writeText(info.payAddress);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 2000);
    } catch {
      setCopied(false);
    }
  }

  return (
    <main className="mx-auto flex min-h-screen w-full max-w-lg flex-col justify-center gap-8 px-4 py-10">
      <BrandMark />
      <GlassCard className="flex flex-col gap-6">
        <div className="space-y-2 text-center">
          <p className="text-sm text-orange-300">پرداخت مستقیم</p>
          <h1 className="text-2xl font-semibold text-white">ارسال USDT</h1>
          <p className="text-sm leading-7 text-slate-400">
            فقط روی شبکه مشخص‌شده بفرست. بعد از تأیید بلاکچین، دونیت خودکار
            ثبت می‌شود.
          </p>
        </div>

        {error ? (
          <AlertBox variant="error" title="خطا">
            {error}
          </AlertBox>
        ) : null}

        {info ? (
          <div className="space-y-4">
            <div className="rounded-2xl border border-white/10 bg-black/20 p-4 text-sm text-slate-300">
              <p className="text-slate-400">شبکه</p>
              <p className="mt-1 text-base font-medium text-white">
                {networkLabel(info.payCurrency)}
              </p>
              <p className="mt-4 text-slate-400">مبلغ دقیق</p>
              <p className="mt-1 text-xl font-semibold text-orange-300">
                {info.payAmount} {info.payCurrency.toUpperCase()}
              </p>
              <p className="mt-4 text-slate-400">آدرس ولت</p>
              <p className="mt-1 break-all font-mono text-xs leading-6 text-white">
                {info.payAddress || "—"}
              </p>
            </div>

            <Button
              className="w-full"
              type="button"
              onClick={copyAddress}
              disabled={!info.payAddress}
            >
              {copied ? (
                <>
                  <Check className="h-4 w-4" />
                  کپی شد
                </>
              ) : (
                <>
                  <Copy className="h-4 w-4" />
                  کپی آدرس
                </>
              )}
            </Button>

            <p className="text-center text-xs text-slate-500">
              وضعیت: {info.status}
              {pending ? " · در حال بررسی…" : ""}
            </p>
          </div>
        ) : !error ? (
          <p className="text-center text-sm text-slate-400">در حال بارگذاری…</p>
        ) : null}

        <Button asChild variant="ghost" className="w-full">
          <Link href="/">بازگشت</Link>
        </Button>
      </GlassCard>
    </main>
  );
}
