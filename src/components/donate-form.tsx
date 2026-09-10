"use client";

import { useMemo, useState, useTransition } from "react";
import { ArrowLeft, Check, HeartHandshake, MapPin, Target } from "lucide-react";
import { AlertBox } from "@/components/ui/alert-box";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Progress } from "@/components/ui/progress";
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

      <section className="flex flex-col gap-4" aria-labelledby="donate-destination">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-2.5">
            <span className="flex h-9 w-9 items-center justify-center rounded-xl border border-orange-400/30 bg-orange-500/12 text-orange-300">
              <MapPin className="h-4 w-4" strokeWidth={2.25} />
            </span>
            <div className="flex flex-col gap-1">
              <Label id="donate-destination" className="text-base text-white">
                مقصد حمایت
              </Label>
              <p className="text-xs leading-5 text-slate-500">
                مقصدی که حمایتتان به آن می‌رسد را انتخاب کنید
              </p>
            </div>
          </div>
          <Tag className="border-orange-400/30 bg-orange-500/10 text-orange-200">
            USDT · NOWPayments
          </Tag>
        </div>

        <div
          className="flex flex-col gap-3"
          role="radiogroup"
          aria-label="مقصد حمایت"
        >
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
                role="radio"
                aria-checked={active}
                onClick={() => setTargetId(dest.id)}
                className={cn(
                  "group relative overflow-hidden rounded-2xl border px-4 py-4 text-right transition duration-200",
                  active
                    ? "dest-active border-orange-400/55 bg-gradient-to-l from-orange-500/20 via-orange-500/10 to-transparent shadow-[0_0_32px_rgba(249,115,22,0.2)]"
                    : "border-white/12 bg-white/[0.03] hover:border-white/20 hover:bg-white/[0.055]",
                )}
              >
                {active ? (
                  <span
                    aria-hidden
                    className="pointer-events-none absolute inset-y-0 right-0 w-1 bg-gradient-to-b from-orange-300 to-orange-500"
                  />
                ) : null}

                <div className="flex items-start gap-3.5">
                  <span
                    className={cn(
                      "mt-0.5 flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl border transition",
                      isGeneral
                        ? active
                          ? "border-sky-300/50 bg-sky-500/20 text-sky-200 shadow-[0_0_24px_rgba(56,189,248,0.22)]"
                          : "border-sky-400/30 bg-sky-500/12 text-sky-300"
                        : active
                          ? "border-orange-300/50 bg-orange-500/20 text-orange-200 shadow-[0_0_24px_rgba(249,115,22,0.22)]"
                          : "border-orange-400/30 bg-orange-500/12 text-orange-300",
                    )}
                  >
                    {isGeneral ? (
                      <HeartHandshake className="h-5 w-5" strokeWidth={2.25} />
                    ) : (
                      <Target className="h-5 w-5" strokeWidth={2.25} />
                    )}
                  </span>

                  <div className="min-w-0 flex-1 flex flex-col gap-3">
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0 flex flex-col gap-2">
                        <div className="flex flex-wrap items-center gap-2">
                          <span className="font-semibold leading-snug text-white">
                            {dest.title}
                          </span>
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
                            ? "حمایت آزاد برای ادامه مسیر محتوا و پروژه‌های MrClock"
                            : "حمایت هدفمند برای رسیدن به سقف این کمپین"}
                        </p>
                      </div>

                      <span
                        className={cn(
                          "mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full border transition",
                          active
                            ? "border-orange-300 bg-orange-500 text-white shadow-[0_0_16px_rgba(249,115,22,0.45)]"
                            : "border-white/20 bg-transparent text-transparent group-hover:border-white/35",
                        )}
                        aria-hidden
                      >
                        <Check className="h-3.5 w-3.5" strokeWidth={3} />
                      </span>
                    </div>

                    {isGeneral ? (
                      <div className="flex items-center justify-between gap-3 rounded-xl border border-sky-400/15 bg-sky-500/[0.07] px-3 py-2.5">
                        <span className="text-xs text-sky-200/80">
                          جمع حمایت عمومی
                        </span>
                        <span className="text-sm font-medium text-sky-100">
                          {formatMoney(dest.raisedAmount)}
                        </span>
                      </div>
                    ) : (
                      <div className="flex flex-col gap-2">
                        <div className="flex items-center justify-between gap-3 text-xs text-slate-300">
                          <span>
                            {formatMoney(dest.raisedAmount)}
                            <span className="mx-1.5 text-slate-600">/</span>
                            {formatMoney(dest.goalAmount)}
                          </span>
                          <span className="font-medium text-orange-200">
                            {Math.round(percent)}%
                          </span>
                        </div>
                        <Progress value={percent} className="h-2" />
                      </div>
                    )}
                  </div>
                </div>
              </button>
            );
          })}
        </div>

        {selected ? (
          <div
            className={cn(
              "rounded-2xl border px-4 py-3.5 transition",
              selected.kind === "general"
                ? "border-sky-400/20 bg-sky-500/[0.08]"
                : "border-orange-400/20 bg-orange-500/[0.08]",
            )}
          >
            <p className="text-sm leading-7 text-slate-200">
              {selected.kind === "general" ? (
                <>
                  حمایت شما به{" "}
                  <span className="font-medium text-sky-200">
                    {selected.title}
                  </span>{" "}
                  اضافه می‌شود.
                </>
              ) : (
                <>
                  مبلغ به کمپین{" "}
                  <span className="font-medium text-orange-200">
                    «{selected.title}»
                  </span>{" "}
                  واریز می‌شود.
                </>
              )}
            </p>
          </div>
        ) : null}
      </section>

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
