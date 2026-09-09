"use client";

import { useMemo, useState, useTransition } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

const PRESETS = [10, 25, 50, 100];

export function DonateForm({
  currencyDefault = "USDT",
}: {
  currencyDefault?: "USD" | "USDT";
}) {
  const [amount, setAmount] = useState<string>("25");
  const [currency, setCurrency] = useState<"USD" | "USDT">(currencyDefault);
  const [donorName, setDonorName] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  const amountNumber = useMemo(() => Number(amount), [amount]);

  function submit() {
    setError(null);
    if (!Number.isFinite(amountNumber) || amountNumber <= 0) {
      setError("مبلغ معتبر وارد کنید");
      return;
    }

    startTransition(async () => {
      try {
        const response = await fetch("/api/donate", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            amount: amountNumber,
            currency,
            donorName: donorName.trim() || null,
          }),
        });
        const data = await response.json();
        if (!response.ok) {
          setError(data.error || "خطا در ساخت پرداخت");
          return;
        }
        window.location.href = data.checkoutUrl;
      } catch {
        setError("ارتباط برقرار نشد");
      }
    });
  }

  return (
    <div className="space-y-6">
      <div className="space-y-3">
        <Label>مبلغ سریع</Label>
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          {PRESETS.map((value) => (
            <Button
              key={value}
              type="button"
              variant={Number(amount) === value ? "default" : "outline"}
              onClick={() => setAmount(String(value))}
            >
              ${value}
            </Button>
          ))}
        </div>
      </div>

      <div className="grid gap-5 sm:grid-cols-2">
        <div className="space-y-2">
          <Label htmlFor="amount">مبلغ دلخواه</Label>
          <Input
            id="amount"
            inputMode="decimal"
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
            placeholder="25"
          />
        </div>
        <div className="space-y-2">
          <Label htmlFor="currency">واحد</Label>
          <div className="grid grid-cols-2 gap-3">
            <Button
              type="button"
              variant={currency === "USDT" ? "default" : "outline"}
              onClick={() => setCurrency("USDT")}
            >
              USDT
            </Button>
            <Button
              type="button"
              variant={currency === "USD" ? "default" : "outline"}
              onClick={() => setCurrency("USD")}
            >
              USD
            </Button>
          </div>
        </div>
      </div>

      <div className="space-y-2">
        <Label htmlFor="name">نام (اختیاری)</Label>
        <Input
          id="name"
          value={donorName}
          onChange={(e) => setDonorName(e.target.value)}
          placeholder="ناشناس"
        />
      </div>

      {error ? <p className="text-sm text-red-300">{error}</p> : null}

      <Button
        className="w-full"
        size="lg"
        disabled={pending}
        onClick={submit}
      >
        {pending ? "در حال انتقال..." : "پرداخت"}
      </Button>
    </div>
  );
}
