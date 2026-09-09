import Link from "next/link";
import { BrandMark } from "@/components/brand-mark";
import { GlassCard } from "@/components/glass-card";
import { Button } from "@/components/ui/button";

export default async function SuccessPage({
  searchParams,
}: {
  searchParams: Promise<{ order?: string }>;
}) {
  const params = await searchParams;

  return (
    <main className="mx-auto flex min-h-screen w-full max-w-lg flex-col justify-center gap-10 px-4 py-10">
      <BrandMark />
      <GlassCard className="space-y-6 text-center">
        <h1 className="text-3xl font-semibold text-white">ممنون از حمایتت</h1>
        <p className="text-sm leading-7 text-slate-400">
          اگر پرداخت موفق بوده باشد، به‌زودی در لیست دونیت‌ها و پیشرفت تارگت
          دیده می‌شود.
        </p>
        {params.order ? (
          <p className="text-xs text-slate-500">کد پیگیری: {params.order}</p>
        ) : null}
        <Button asChild className="w-full">
          <Link href="/">بازگشت به صفحه دونیت</Link>
        </Button>
      </GlassCard>
    </main>
  );
}
