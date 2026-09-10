import { Clock3, HeartHandshake, History, Sparkles, Target, Users, Wallet } from "lucide-react";
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

export default async function HomePage({
  searchParams,
}: {
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
}) {
  const params = (await searchParams) || {};
  const canceled = params.canceled === "1" || params.canceled === "true";

  type PublicData = ReturnType<typeof getPublicPageData>;
  let campaigns: PublicData["campaigns"] = [];
  let destinations: PublicData["destinations"] = [];
  let topDonors: PublicData["topDonors"] = [];
  let recentDonations: PublicData["recentDonations"] = [];
  let history: PublicData["history"] = [];
  let general: PublicData["general"] = undefined;

  try {
    const data = getPublicPageData();
    campaigns = data.campaigns;
    destinations = data.destinations;
    topDonors = data.topDonors;
    recentDonations = data.recentDonations;
    history = data.history;
    general = data.general;
  } catch {
    campaigns = [];
    destinations = [];
    topDonors = [];
    recentDonations = [];
    history = [];
  }

  return (
    <main className="relative mx-auto flex w-full max-w-6xl flex-col px-4 py-10 md:px-8 md:py-12">
      <header className="flex flex-col items-center justify-center text-center">
        <div className="hero-rise">
          <BrandMark large stacked />
        </div>
        <h1 className="hero-rise-delay mt-8 max-w-3xl text-balance text-3xl font-bold leading-[1.45] tracking-tight text-white sm:text-4xl md:mt-10 md:text-5xl md:leading-[1.4]">
          حمایت شما انگیزه برای کارهای بزرگ است
        </h1>
        <p className="hero-rise-delay mt-4 max-w-xl text-base leading-8 text-slate-400 md:text-lg md:leading-9">
          با انتخاب مقصد حمایت، مستقیم به رشد MrClock کمک کنید.
        </p>
      </header>

      <div className="mt-12 grid gap-6 md:mt-14 lg:grid-cols-2 lg:gap-8">
        <GlassCard
          title="حمایت کنید"
          icon={<HeartHandshake className="h-5 w-5" strokeWidth={2.25} />}
        >
          <DonateForm
            destinations={destinations.map((d) => ({
              id: d.id,
              title: d.title,
              kind: d.kind,
              goalAmount: d.goalAmount,
              raisedAmount: d.raisedAmount,
              status: d.status,
            }))}
            canceled={canceled}
          />
        </GlassCard>

        <GlassCard
          className="lg:row-span-1"
          title="کمپین‌های فعال"
          icon={<Sparkles className="h-5 w-5" strokeWidth={2.25} />}
        >
          {campaigns.length === 0 ? (
            <div className="flex flex-col gap-4">
              <p className="text-sm leading-7 text-slate-400">
                فعلاً کمپین هدف‌مندی باز نیست. می‌توانید از بخش حمایت، به‌صورت عمومی
                دونیت کنید.
              </p>
              {general ? (
                <div className="flex items-center gap-3 rounded-2xl border border-sky-400/20 bg-sky-500/10 px-4 py-3.5">
                  <HeartHandshake className="h-5 w-5 shrink-0 text-sky-300" />
                  <div className="flex flex-col gap-1">
                    <p className="text-sm font-medium text-white">{general.title}</p>
                    <p className="text-xs text-slate-400">
                      جمع حمایت عمومی: {formatMoney(general.raisedAmount)}
                    </p>
                  </div>
                </div>
              ) : null}
            </div>
          ) : (
            <div className="flex flex-col gap-3">
              {campaigns.map((campaign) => {
                const percent = clampPercent(
                  (Number(campaign.raisedAmount) /
                    Number(campaign.goalAmount || 1)) *
                    100,
                );
                return (
                  <div
                    key={campaign.id}
                    className="flex flex-col gap-3 rounded-2xl border border-white/10 bg-black/15 px-4 py-3.5"
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div className="flex flex-col gap-1.5">
                        <div className="inline-flex items-center gap-2 text-orange-300">
                          <Target className="h-4 w-4" />
                          <span className="text-xs">کمپین</span>
                        </div>
                        <p className="font-medium leading-snug text-white">
                          {campaign.title}
                        </p>
                      </div>
                      <span className="inline-flex items-center justify-center rounded-full border border-orange-400/30 bg-orange-500/15 px-3 py-1.5 text-xs font-medium leading-none text-orange-200">
                        <span className="translate-y-[0.5px] leading-none">
                          {Math.round(percent)}%
                        </span>
                      </span>
                    </div>
                    <Progress value={percent} className="h-2.5" />
                    <div className="flex items-center justify-between gap-3 text-sm text-slate-300">
                      <span className="inline-flex items-center gap-2">
                        <Wallet className="h-4 w-4 text-orange-300" />
                        {formatMoney(campaign.raisedAmount)}
                        <span className="text-slate-500">/</span>
                        {formatMoney(campaign.goalAmount)}
                      </span>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </GlassCard>

        <GlassCard
          title="دونیت‌های اخیر"
          icon={<Clock3 className="h-5 w-5" strokeWidth={2.25} />}
        >
          <div className="flex flex-col gap-3">
            {recentDonations.length === 0 ? (
              <p className="text-sm text-slate-400">هنوز دونیتی ثبت نشده</p>
            ) : (
              recentDonations.map((donation, index) => (
                <div
                  key={`${donation.donorName}-${donation.paidAt}-${index}`}
                  className="flex items-center justify-between gap-4 rounded-2xl border border-white/8 bg-black/15 px-4 py-3.5"
                >
                  <div className="flex min-w-0 flex-col gap-1">
                    <span className="truncate text-slate-100">
                      {donation.donorName}
                    </span>
                    <span className="text-xs text-slate-500">
                      {donation.paidAt
                        ? new Date(donation.paidAt).toLocaleDateString("fa-IR")
                        : ""}
                    </span>
                  </div>
                  <span className="shrink-0 text-sm font-medium text-orange-300">
                    {formatMoney(donation.amount)}
                  </span>
                </div>
              ))
            )}
          </div>
        </GlassCard>

        <GlassCard
          title="بیشترین دونیت‌کنندگان"
          icon={<Users className="h-5 w-5" strokeWidth={2.25} />}
        >
          <div className="flex flex-col gap-3">
            {topDonors.length === 0 ? (
              <p className="text-sm text-slate-400">هنوز دونیتی ثبت نشده</p>
            ) : (
              topDonors.map((donor, index) => (
                <div
                  key={`${donor.donorName}-${index}`}
                  className="flex items-center justify-between gap-4 rounded-2xl border border-white/8 bg-black/15 px-4 py-3.5"
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

        <GlassCard
          title="سابقه اهداف"
          icon={<History className="h-5 w-5" strokeWidth={2.25} />}
        >
          <div className="flex flex-col gap-3">
            {history.length === 0 ? (
              <p className="text-sm text-slate-400">تاریخچه‌ای نیست</p>
            ) : (
              history.map((item) => {
                const itemPercent = clampPercent(
                  (Number(item.raisedAmount) / Number(item.goalAmount || 1)) *
                    100,
                );
                return (
                  <div
                    key={item.id}
                    className="flex flex-col gap-3 rounded-2xl border border-white/8 bg-black/15 px-4 py-3.5"
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div className="flex flex-col gap-1.5">
                        <p className="font-medium leading-snug text-slate-100">
                          {item.title}
                        </p>
                        <p className="text-xs text-slate-500">
                          {item.completedAt
                            ? new Date(item.completedAt).toLocaleDateString(
                                "fa-IR",
                              )
                            : ""}
                        </p>
                      </div>
                      <span className="inline-flex items-center justify-center rounded-full border border-emerald-400/20 bg-emerald-400/10 px-2.5 py-1.5 text-[11px] font-medium leading-none text-emerald-300">
                        <span className="leading-none">تکمیل شده</span>
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
