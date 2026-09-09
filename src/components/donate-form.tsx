"use client";

import { useMemo, useState, useTransition } from "react";
import { ArrowLeft, HeartHandshake, Target } from "lucide-react";
import { AlertBox } from "@/components/ui/alert-box";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Tag } from "@/components/ui/tag";
import { clampPercent, cn, formatMoney } from "@/lib/utils";

const PRESETS = [5, 10, 25];

export type DonateDestination = {
  id: number;
  title: string;
  kind: string;
  goalAmount: number;
  raisedAmount: number;
  status: string;
};

export function DonateForm({
  destinations,
  defaultTargetId,
  canceled = false,
}: {
  destinations: DonateDestination[];
  defaultTargetId?: number | null;
  canceled?: boolean;
}) {
  const initialId =
    defaultTargetId ??
    destinations.find((d) => d.kind === "general")?.id ??
    destinations[0]?.id ??
    null;

  const [targetId, setTargetId] = useState<number | null>(initialId);
  const [amount, setAmount] = useState<string>("25");
  const [donorName, setDonorName] = useState("");
  const [customMode, setCustomMode] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  const amountNumber = useMemo(() => Number(amount), [amount]);
  const selected = destinations.find((d) => d.id === targetId) || null;

  function submit() {
    setError(null);
    if (targetId == null) {
      setError("یک مقصد حمایت انتخاب کنید");
      return;
    }
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
            donorName: donorName.trim() || null,
            targetId,
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

  if (destinations.length === 0) {
    return (
      <AlertBox variant="warning" title="هنوز مقصدی فعال نیست">
        به‌زودی می‌توانید حمایت کنید.
      </AlertBox>
    );
  }

  return (
    <div className="flex flex-col gap-6">
      {canceled ? (
        <AlertBox variant="warning" title="پرداخت لغو شد">
          اگر مایلید دوباره تلاش کنید، مقصد و مبلغ را انتخاب کنید.
        </AlertBox>
      ) : null}

      <div className="flex flex-col gap-2">
        <div className="flex items-center justify-between gap-3">
          <Label>مقصد حمایت</Label>
          <Tag className="border-orange-400/30 bg-orange-500/10 text-orange-200">
            USDT · BEP20
          </Tag>
        </div>
        <div className="flex flex-col gap-3">
          {destinations.map((dest) => {
            const isGeneral = dest.kind === "general";
            const percent = isGeneral
              ? 0
              : clampPercent(
                  (Number(dest.raisedAmount) / Number(dest.goalAmount || 1)) *
                    100,
                );
            const active = targetId === dest.id;
            return (
              <button
                key={dest.id}
                type="button"
                onClick={() => setTargetId(dest.id)}
                className={cn(
                  "rounded-2xl border px-4 py-4 text-right transition",
                  active
                    ? "border-orange-400/50 bg-orange-500/15 shadow-[0_0_28px_rgba(249,115,22,0.18)]"
                    : "border-white/12 bg-white/5 hover:bg-white/8",
                )}
              >
                <div className="flex items-start gap-3">
                  <span
                    className={cn(
                      "mt-0.5 flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border",
                      isGeneral
                        ? "border-sky-400/35 bg-sky-500/15 text-sky-300"
                        : "border-orange-400/35 bg-orange-500/15 text-orange-300",
                    )}
                  >
                    {isGeneral ? (
                      <HeartHandshake className="h-5 w-5" strokeWidth={2.25} />
                    ) : (
                      <Target className="h-5 w-5" strokeWidth={2.25} />
                    )}
                  </span>
                  <div className="min-w-0 flex-1 flex flex-col gap-1.5">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="font-medium text-white">{dest.title}</span>
                      <span
                        className={cn(
                          "inline-flex items-center justify-center rounded-full border px-2.5 py-1 text-[11px] font-medium leading-none",
                          isGeneral
                            ? "border-sky-400/25 bg-sky-500/10 text-sky-200"
                            : "border-orange-400/25 bg-orange-500/10 text-orange-200",
                        )}
                      >
                        <span className="leading-none translate-y-[0.5px]">
                          {isGeneral ? "عمومی" : "کمپین"}
                        </span>
                      </span>
                    </div>
                    <p className="text-xs leading-6 text-slate-400">
                      {isGeneral
                        ? "حمایت آزاد، بدون هدف مشخص"
                        : `${formatMoney(dest.raisedAmount)} از ${formatMoney(dest.goalAmount)} · ${Math.round(percent)}%`}
                    </p>
                  </div>
                </div>
              </button>
            );
          })}
        </div>
      </div>

      <div className="flex flex-col gap-2">
        <Label>مبلغ</Label>
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          {PRESETS.map((value) => (
            <button
              key={value}
              type="button"
              onClick={() => {
                setCustomMode(false);
                setAmount(String(value));
              }}
              className={cn(
                "inline-flex h-11 items-center justify-center rounded-full border text-sm leading-none transition",
                !customMode && Number(amount) === value
                  ? "border-orange-400 bg-orange-500/15 text-orange-200 shadow-[0_0_24px_rgba(249,115,22,0.25)]"
                  : "border-white/12 bg-white/5 text-slate-200 hover:bg-white/8",
              )}
            >
              <span className="leading-none translate-y-[0.5px]">
                {value} USDT
              </span>
            </button>
          ))}
          <button
            type="button"
            onClick={() => setCustomMode(true)}
            className={cn(
              "inline-flex h-11 items-center justify-center rounded-full border text-sm leading-none transition",
              customMode
                ? "border-orange-400 bg-orange-500/15 text-orange-200"
                : "border-white/12 bg-white/5 text-slate-200 hover:bg-white/8",
            )}
          >
            <span className="leading-none">سایر</span>
          </button>
        </div>
      </div>

      <div className="flex flex-col gap-2">
        <Label htmlFor="amount">مبلغ دلخواه (USDT)</Label>
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

      <div className="flex flex-col gap-2">
        <Label htmlFor="name">نام یا نام مستعار (اختیاری)</Label>
        <Input
          id="name"
          value={donorName}
          onChange={(e) => setDonorName(e.target.value)}
          placeholder="ناشناس"
        />
      </div>

      {selected && selected.kind !== "general" ? (
        <AlertBox variant="info" title="مقصد انتخاب‌شده">
          مبلغ به کمپین «{selected.title}» اضافه می‌شود.
        </AlertBox>
      ) : null}

      {error ? (
        <AlertBox variant="error" title="خطا">
          {error}
        </AlertBox>
      ) : null}

      <Button
        className="h-11 w-full gap-2 text-base shadow-[0_12px_40px_rgba(249,115,22,0.35)]"
        size="lg"
        disabled={pending || targetId == null}
        onClick={submit}
      >
        {pending ? "در حال انتقال..." : "پرداخت USDT"}
        {!pending ? <ArrowLeft className="h-4 w-4" /> : null}
      </Button>
    </div>
  );
}
