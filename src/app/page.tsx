import { HeartHandshake, History, Sparkles, Target, Users, Wallet } from "lucide-react";
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
  let history: PublicData["history"] = [];
  let general: PublicData["general"] = undefined;

  try {
    const data = getPublicPageData();
    campaigns = data.campaigns;
    destinations = data.destinations;
    topDonors = data.topDonors;
    history = data.history;
    general = data.general;
  } catch {
    campaigns = [];
    destinations = [];
    topDonors = [];
    history = [];
  }

  return (
    <main className="relative mx-auto flex w-full max-w-6xl flex-col px-4 py-10 md:px-8 md:py-16">
      <header className="flex items-center justify-start">
        <BrandMark large />
      </header>

      <div className="mt-16 grid gap-10 md:mt-20 lg:grid-cols-2 lg:gap-12">
        <GlassCard
          className="min-h-[320px] space-y-6 lg:row-span-1"
          title="کمپین‌های فعال"
          icon={<Sparkles className="h-7 w-7" strokeWidth={2.25} />}
        >
          {campaigns.length === 0 ? (
            <div className="space-y-4">
              <p className="text-sm leading-7 text-slate-400">
                فعلاً کمپین هدف‌مندی باز نیست. می‌توانید از بخش حمایت، به‌صورت عمومی
                دونیت کنید.
              </p>
              {general ? (
                <div className="flex items-center gap-3 rounded-2xl border border-sky-400/20 bg-sky-500/10 px-4 py-3.5">
                  <HeartHandshake className="h-5 w-5 text-sky-300" />
                  <div>
                    <p className="text-sm font-medium text-white">{general.title}</p>
                    <p className="text-xs text-slate-400">
                      جمع حمایت عمومی: {formatMoney(general.raisedAmount)}
                    </p>
                  </div>
                </div>
              ) : null}
            </div>
          ) : (
            <div className="space-y-4">
              {campaigns.map((campaign) => {
                const percent = clampPercent(
                  (Number(campaign.raisedAmount) /
                    Number(campaign.goalAmount || 1)) *
                    100,
                );
                return (
                  <div
                    key={campaign.id}
                    className="space-y-3 rounded-2xl border border-white/10 bg-black/20 px-4 py-4"
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div className="space-y-1">
                        <div className="inline-flex items-center gap-2 text-orange-300">
                          <Target className="h-4 w-4" />
                          <span className="text-xs">کمپین</span>
                        </div>
                        <p className="font-medium text-white">{campaign.title}</p>
                      </div>
                      <span className="rounded-full border border-orange-400/30 bg-orange-500/15 px-3 py-1 text-xs text-orange-200">
                        {Math.round(percent)}%
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
          className="min-h-[320px]"
          title="حمایت کنید"
          icon={<HeartHandshake className="h-7 w-7" strokeWidth={2.25} />}
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
          className="min-h-[280px]"
          title="بیشترین دونیت‌کنندگان"
          icon={<Users className="h-7 w-7" strokeWidth={2.25} />}
        >
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

        <GlassCard
          className="min-h-[280px]"
          title="سابقه اهداف"
          icon={<History className="h-7 w-7" strokeWidth={2.25} />}
        >
          <div className="space-y-4">
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
