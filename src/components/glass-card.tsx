import { cn } from "@/lib/utils";

export function GlassCard({
  children,
  className,
  title,
  icon,
}: {
  children: React.ReactNode;
  className?: string;
  title?: string;
  icon?: React.ReactNode;
}) {
  return (
    <section
      className={cn(
        "rounded-[28px] border border-white/30 bg-white/[0.14] p-8 shadow-[0_30px_90px_rgba(0,0,0,0.45)] backdrop-blur-[40px] md:p-10",
        "ring-1 ring-inset ring-white/20",
        "supports-[backdrop-filter]:bg-white/[0.1]",
        className,
      )}
    >
      {title ? (
        <div className="mb-8 flex items-center gap-4">
          {icon ? (
            <span className="flex h-14 w-14 shrink-0 items-center justify-center rounded-2xl border border-orange-400/40 bg-orange-500/20 text-orange-300 shadow-[0_0_32px_rgba(249,115,22,0.28)]">
              {icon}
            </span>
          ) : null}
          <h2 className="text-xl font-semibold text-white md:text-[1.4rem]">
            {title}
          </h2>
        </div>
      ) : null}
      {children}
    </section>
  );
}
