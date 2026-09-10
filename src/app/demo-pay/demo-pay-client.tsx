"use client";

import { useMemo, useTransition } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { BrandMark } from "@/components/brand-mark";
import { GlassCard } from "@/components/glass-card";
import { Button } from "@/components/ui/button";

function decodeToken(token: string) {
  const normalized = token.replace(/-/g, "+").replace(/_/g, "/");
  const padded = normalized + "=".repeat((4 - (normalized.length % 4)) % 4);
  const json = decodeURIComponent(
    atob(padded)
      .split("")
      .map((c) => `%${`00${c.charCodeAt(0).toString(16)}`.slice(-2)}`)
      .join(""),
  );
  return JSON.parse(json) as {
    orderId: string;
    amount: number;
    currency: string;
  };
}

export default function DemoPayClient() {
  const params = useSearchParams();
  const router = useRouter();
  const [pending, startTransition] = useTransition();

  const payload = useMemo(() => {
    const token = params.get("token");
    if (!token) return null;
    try {
      return decodeToken(token);
    } catch {
      return null;
    }
  }, [params]);

  function confirm() {
    if (!payload?.orderId) return;
    startTransition(async () => {
      const response = await fetch("/api/demo-pay", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ orderId: payload.orderId }),
      });
      if (!response.ok) {
        alert("تأیید دمو ناموفق بود");
        return;
      }
      router.replace(`/success?order=${payload.orderId}`);
    });
  }

  return (
    <main className="mx-auto flex min-h-screen w-full max-w-lg flex-col justify-center gap-10 px-4 py-10">
      <BrandMark />
      <GlassCard className="space-y-6">
        <div className="space-y-2">
          <p className="text-sm text-orange-300">حالت Demo</p>
          <h1 className="text-2xl font-semibold text-white">پرداخت آزمایشی</h1>
          <p className="text-sm leading-7 text-slate-400">
            کلید NOWPayments تنظیم نشده. این صفحه فقط برای تست محلی است.
          </p>
        </div>
        {payload ? (
          <div className="rounded-xl border border-white/10 bg-black/20 p-4 text-sm text-slate-300">
            <p>
              مبلغ: {payload.amount} USDT
            </p>
            <p className="mt-2 break-all">Order: {payload.orderId}</p>
          </div>
        ) : (
          <p className="text-sm text-red-300">توکن نامعتبر</p>
        )}
        <Button
          className="w-full"
          disabled={!payload || pending}
          onClick={confirm}
        >
          {pending ? "در حال تأیید..." : "تأیید پرداخت دمو"}
        </Button>
      </GlassCard>
    </main>
  );
}
