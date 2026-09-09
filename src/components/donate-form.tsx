"use client";

import { useMemo, useState, useTransition } from "react";
import { ArrowLeft } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { cn } from "@/lib/utils";

const PRESETS = [
  { value: 5, label: "$5" },
  { value: 15, label: "$15" },
  { value: 25, label: "$25" },
  { value: 50, label: "$50" },
];

export function DonateForm({
  currencyDefault = "USDT",
}: {
  currencyDefault?: "USD" | "USDT";
}) {
  const [amount, setAmount] = useState<string>("25");
  const [currency, setCurrency] = useState<"USD" | "USDT">(currencyDefault);
  const [donorName, setDonorName] = useState("");
  const [customMode, setCustomMode] = useState(false);
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
    <div className="space-y-7">
      <p className="text-sm leading-7 text-slate-400">
        مبلغ را انتخاب کنید یا مقدار دلخواه وارد کنید.
      </p>

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-5">
        {PRESETS.map((preset) => (
          <button
            key={preset.value}
            type="button"
            onClick={() => {
              setCustomMode(false);
              setAmount(String(preset.value));
            }}
            className={cn(
              "h-11 rounded-xl border text-sm transition",
              !customMode && Number(amount) === preset.value
                ? "border-orange-400 bg-orange-500/15 text-orange-200 shadow-[0_0_24px_rgba(249,115,22,0.25)]"
                : "border-white/12 bg-white/5 text-slate-200 hover:bg-white/8",
            )}
          >
            {preset.label}
          </button>
        ))}
        <button
          type="button"
          onClick={() => setCustomMode(true)}
          className={cn(
            "h-11 rounded-xl border text-sm transition",
            customMode
              ? "border-orange-400 bg-orange-500/15 text-orange-200"
              : "border-white/12 bg-white/5 text-slate-200 hover:bg-white/8",
          )}
        >
          سایر
        </button>
      </div>

      <div className="grid gap-5 sm:grid-cols-2">
        <div className="space-y-2.5">
          <Label htmlFor="amount">مبلغ دلخواه</Label>
          <Input
            id="amount"
            inputMode="decimal"
            value={amount}
            onChange={(e) => {
              setCustomMode(true);
              setAmount(e.target.value);
            }}
            placeholder="مثلاً 40"
          />
        </div>
        <div className="space-y-2.5">
          <Label>واحد</Label>
          <div className="grid grid-cols-2 gap-3">
            <button
              type="button"
              onClick={() => setCurrency("USDT")}
              className={cn(
                "h-11 rounded-xl border text-sm transition",
                currency === "USDT"
                  ? "border-orange-400 bg-orange-500 text-white"
                  : "border-white/12 bg-white/5 text-slate-200",
              )}
            >
              USDT
            </button>
            <button
              type="button"
              onClick={() => setCurrency("USD")}
              className={cn(
                "h-11 rounded-xl border text-sm transition",
                currency === "USD"
                  ? "border-orange-400 bg-orange-500 text-white"
                  : "border-white/12 bg-white/5 text-slate-200",
              )}
            >
              USD
            </button>
          </div>
        </div>
      </div>

      <div className="space-y-2.5">
        <Label htmlFor="name">نام یا نام مستعار (اختیاری)</Label>
        <Input
          id="name"
          value={donorName}
          onChange={(e) => setDonorName(e.target.value)}
          placeholder="ناشناس"
        />
      </div>

      {error ? <p className="text-sm text-red-300">{error}</p> : null}

      <Button
        className="h-12 w-full gap-2 rounded-xl text-base shadow-[0_12px_40px_rgba(249,115,22,0.35)]"
        size="lg"
        disabled={pending}
        onClick={submit}
      >
        {pending ? "در حال انتقال..." : "پرداخت"}
        {!pending ? <ArrowLeft className="h-4 w-4" /> : null}
      </Button>
    </div>
  );
}
