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
        "rounded-[28px] border border-white/25 bg-white/[0.12] p-8 shadow-[0_30px_90px_rgba(0,0,0,0.4)] backdrop-blur-3xl md:p-10",
        "ring-1 ring-inset ring-white/15",
        "supports-[backdrop-filter]:bg-white/[0.08]",
        className,
      )}
    >
      {title ? (
        <div className="mb-8 flex items-center gap-3.5">
          {icon ? (
            <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl border border-orange-400/35 bg-orange-500/15 text-orange-300 shadow-[0_0_28px_rgba(249,115,22,0.2)]">
              {icon}
            </span>
          ) : null}
          <h2 className="text-xl font-semibold text-white md:text-[1.35rem]">
            {title}
          </h2>
        </div>
      ) : null}
      {children}
    </section>
  );
}
