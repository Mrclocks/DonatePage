import { BrandMark } from "@/components/brand-mark";
import { DonateForm } from "@/components/donate-form";
import { GlassCard } from "@/components/glass-card";
import { Progress } from "@/components/ui/progress";
import { getPublicPageData } from "@/lib/donations";
import { clampPercent, formatMoney } from "@/lib/utils";

export const dynamic = "force-dynamic";

export default function HomePage() {
  const { activeTarget, topDonors, history } = getPublicPageData();
  const percent = activeTarget
    ? clampPercent(
        (Number(activeTarget.raisedAmount) / Number(activeTarget.goalAmount)) *
          100,
      )
    : 0;

  return (
    <main className="mx-auto flex w-full max-w-3xl flex-col gap-12 px-4 py-10 md:gap-16 md:px-6 md:py-16">
      <header className="flex items-center justify-between">
        <BrandMark />
        <a
          href="/admin"
          className="text-sm text-slate-400 transition hover:text-orange-300"
        >
          مدیریت
        </a>
      </header>

      <GlassCard className="space-y-8">
        <div className="space-y-3">
          <p className="text-sm text-slate-400">هدف فعلی</p>
          <h1 className="text-3xl font-semibold tracking-tight text-white md:text-4xl">
            {activeTarget?.title || "هنوز تارگتی فعال نیست"}
          </h1>
          <p className="max-w-xl text-sm leading-7 text-slate-400">
            حمایت شما مستقیم روی هدف فعلی ثبت می‌شود. پرداخت با USD یا USDT.
          </p>
        </div>

        {activeTarget ? (
          <div className="space-y-4">
            <Progress value={percent} />
            <div className="flex flex-wrap items-center justify-between gap-3 text-sm text-slate-300">
              <span>
                {formatMoney(
                  activeTarget.raisedAmount,
                  activeTarget.currency as "USD" | "USDT",
                )}
              </span>
              <span className="text-slate-500">
                از{" "}
                {formatMoney(
                  activeTarget.goalAmount,
                  activeTarget.currency as "USD" | "USDT",
                )}
              </span>
            </div>
          </div>
        ) : (
          <p className="text-sm text-slate-400">
            از پنل مدیریت یک تارگت فعال بسازید.
          </p>
        )}
      </GlassCard>

      <GlassCard>
        <div className="mb-8 space-y-2">
          <p className="text-sm text-slate-400">دونیت</p>
          <h2 className="text-2xl font-semibold text-white">پرداخت سریع</h2>
        </div>
        <DonateForm
          currencyDefault={
            (activeTarget?.currency as "USD" | "USDT" | undefined) || "USDT"
          }
        />
      </GlassCard>

      <GlassCard>
        <div className="mb-8 space-y-2">
          <p className="text-sm text-slate-400">جامعه</p>
          <h2 className="text-2xl font-semibold text-white">
            بیشترین دونیت‌کنندگان
          </h2>
        </div>
        <div className="space-y-5">
          {topDonors.length === 0 ? (
            <p className="text-sm text-slate-400">هنوز دونیتی ثبت نشده</p>
          ) : (
            topDonors.map((donor, index) => (
              <div
                key={`${donor.donorName}-${index}`}
                className="flex items-center justify-between gap-4 border-b border-white/5 pb-4 last:border-0 last:pb-0"
              >
                <div className="flex items-center gap-3">
                  <span className="text-sm text-slate-500">{index + 1}</span>
                  <span className="text-slate-100">{donor.donorName}</span>
                </div>
                <span className="text-sm text-orange-300">
                  {formatMoney(donor.total, "USDT")}
                </span>
              </div>
            ))
          )}
        </div>
      </GlassCard>

      <GlassCard>
        <div className="mb-8 space-y-2">
          <p className="text-sm text-slate-400">آرشیو</p>
          <h2 className="text-2xl font-semibold text-white">تاریخچه هدف‌ها</h2>
        </div>
        <div className="space-y-5">
          {history.length === 0 ? (
            <p className="text-sm text-slate-400">تاریخچه‌ای نیست</p>
          ) : (
            history.map((item) => (
              <div
                key={item.id}
                className="flex flex-col gap-2 border-b border-white/5 pb-4 last:border-0 last:pb-0 sm:flex-row sm:items-center sm:justify-between"
              >
                <div>
                  <p className="text-slate-100">{item.title}</p>
                  <p className="mt-1 text-xs text-slate-500">
                    {item.completedAt
                      ? new Date(item.completedAt).toLocaleDateString("fa-IR")
                      : ""}
                  </p>
                </div>
                <p className="text-sm text-slate-300">
                  {formatMoney(
                    item.raisedAmount,
                    item.currency as "USD" | "USDT",
                  )}
                </p>
              </div>
            ))
          )}
        </div>
      </GlassCard>
    </main>
  );
}
