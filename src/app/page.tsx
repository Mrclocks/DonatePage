import { Crosshair, History, Target, Trophy, Users, Wallet } from "lucide-react";
import { BrandMark } from "@/components/brand-mark";
import { DonateForm } from "@/components/donate-form";
import { GlassCard } from "@/components/glass-card";
import { Progress } from "@/components/ui/progress";
import { getPublicPageData } from "@/lib/donations";
import { clampPercent, formatMoney } from "@/lib/utils";

export const dynamic = "force-dynamic";

const RANK_STYLES = [
  "bg-amber-400/20 text-amber-300 border-amber-300/30",
  "bg-slate-300/15 text-slate-200 border-slate-200/25",
  "bg-orange-700/20 text-orange-300 border-orange-500/25",
];

export default function HomePage() {
  type PublicData = ReturnType<typeof getPublicPageData>;
  let activeTarget: PublicData["activeTarget"] | null = null;
  let topDonors: PublicData["topDonors"] = [];
  let history: PublicData["history"] = [];
  let bootError: string | null = null;

  try {
    const data = getPublicPageData();
    activeTarget = data.activeTarget;
    topDonors = data.topDonors;
    history = data.history;
  } catch (error) {
    bootError =
      error instanceof Error ? error.message : "Database unavailable";
  }

  const percent = activeTarget
    ? clampPercent(
        (Number(activeTarget.raisedAmount) / Number(activeTarget.goalAmount)) *
          100,
      )
    : 0;

  return (
    <main className="relative mx-auto flex w-full max-w-6xl flex-col gap-12 px-4 py-10 md:gap-14 md:px-8 md:py-16">
      <header className="flex items-center justify-between">
        <BrandMark large />
        <a
          href="/admin"
          className="rounded-full border border-white/10 bg-white/5 px-4 py-2 text-sm text-slate-300 backdrop-blur transition hover:border-orange-400/40 hover:text-orange-200"
        >
          مدیریت
        </a>
      </header>

      {bootError ? (
        <GlassCard>
          <p className="text-sm text-red-300">
            سرویس دیتابیس در دسترس نیست: {bootError}
          </p>
        </GlassCard>
      ) : null}

      <div className="grid gap-10 lg:grid-cols-2 lg:gap-12">
        <GlassCard className="min-h-[320px] space-y-8">
          <div className="flex items-start justify-between gap-4">
            <div className="space-y-3">
              <div className="inline-flex items-center gap-2 text-sm text-orange-300/90">
                <Crosshair className="h-4 w-4" />
                هدف جاری
              </div>
              <h1 className="text-2xl font-semibold leading-relaxed tracking-tight text-white md:text-[1.7rem]">
                {activeTarget?.title || "هنوز تارگتی فعال نیست"}
              </h1>
              <p className="text-sm text-slate-400">پرداخت فقط با USDT (BEP20)</p>
            </div>
            {activeTarget ? (
              <span className="rounded-full border border-orange-400/30 bg-orange-500/15 px-3 py-1 text-sm font-medium text-orange-200">
                {Math.round(percent)}%
              </span>
            ) : null}
          </div>

          {activeTarget ? (
            <div className="space-y-5">
              <Progress value={percent} className="h-3.5" />
              <div className="flex flex-col gap-4 text-sm text-slate-300 sm:flex-row sm:items-center sm:justify-between">
                <div className="inline-flex items-center gap-2">
                  <Wallet className="h-4 w-4 text-orange-300" />
                  <span>
                    {formatMoney(activeTarget.raisedAmount)}
                    <span className="text-slate-500"> / </span>
                    {formatMoney(activeTarget.goalAmount)}
                  </span>
                </div>
                <div className="inline-flex items-center gap-2 text-slate-400">
                  <Target className="h-4 w-4 text-orange-300" />
                  هدف: {formatMoney(activeTarget.goalAmount)}
                </div>
              </div>
            </div>
          ) : (
            <p className="text-sm leading-7 text-slate-400">
              از پنل مدیریت یک تارگت فعال بسازید.
            </p>
          )}
        </GlassCard>

        <GlassCard className="min-h-[320px]">
          <div className="mb-7 flex items-center gap-2">
            <Trophy className="h-4 w-4 text-orange-300" />
            <h2 className="text-xl font-semibold text-white">حمایت کنید</h2>
          </div>
          <DonateForm />
        </GlassCard>

        <GlassCard className="min-h-[280px]">
          <div className="mb-8 flex items-center gap-2">
            <Users className="h-4 w-4 text-orange-300" />
            <h2 className="text-xl font-semibold text-white">
              بیشترین دونیت‌کنندگان
            </h2>
          </div>
          <div className="space-y-4">
            {topDonors.length === 0 ? (
              <p className="text-sm text-slate-400">هنوز دونیتی ثبت نشده</p>
            ) : (
              topDonors.map((donor, index) => (
                <div
                  key={`${donor.donorName}-${index}`}
                  className="flex items-center justify-between gap-4 rounded-2xl border border-white/8 bg-black/20 px-4 py-3.5"
                >
                  <div className="flex items-center gap-3">
                    <span
                      className={`flex h-8 w-8 items-center justify-center rounded-full border text-xs font-semibold ${
                        RANK_STYLES[index] ||
                        "border-white/10 bg-white/5 text-slate-300"
                      }`}
                    >
                      {index + 1}
                    </span>
                    <span className="text-slate-100">{donor.donorName}</span>
                  </div>
                  <span className="text-sm font-medium text-orange-300">
                    {formatMoney(donor.total)}
                  </span>
                </div>
              ))
            )}
          </div>
        </GlassCard>

        <GlassCard className="min-h-[280px]">
          <div className="mb-8 flex items-center gap-2">
            <History className="h-4 w-4 text-orange-300" />
            <h2 className="text-xl font-semibold text-white">سابقه اهداف</h2>
          </div>
          <div className="space-y-4">
            {history.length === 0 ? (
              <p className="text-sm text-slate-400">تاریخچه‌ای نیست</p>
            ) : (
              history.map((item) => {
                const itemPercent = clampPercent(
                  (Number(item.raisedAmount) / Number(item.goalAmount)) * 100,
                );
                return (
                  <div
                    key={item.id}
                    className="space-y-3 rounded-2xl border border-white/8 bg-black/20 px-4 py-4"
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <p className="font-medium text-slate-100">{item.title}</p>
                        <p className="mt-1 text-xs text-slate-500">
                          {item.completedAt
                            ? new Date(item.completedAt).toLocaleDateString(
                                "fa-IR",
                              )
                            : ""}
                        </p>
                      </div>
                      <span className="rounded-full border border-emerald-400/20 bg-emerald-400/10 px-2.5 py-1 text-[11px] text-emerald-300">
                        تکمیل شده
                      </span>
                    </div>
                    <Progress value={itemPercent} className="h-2" />
                    <p className="text-sm text-slate-300">
                      {formatMoney(item.raisedAmount)}
                    </p>
                  </div>
                );
              })
            )}
          </div>
        </GlassCard>
      </div>
    </main>
  );
}
