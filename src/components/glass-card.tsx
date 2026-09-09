import { cn } from "@/lib/utils";

/**
 * Spacing contract (8px base):
 * - Card padding: 32px all sides (equal)
 * - Title → content: 40px
 * - Section stack: 24px
 * - Label → control: 8px
 * - Item gaps: 12px
 */
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
        "rounded-[28px] border border-white/18 bg-white/[0.018] p-8 shadow-[0_20px_60px_rgba(0,0,0,0.22)] backdrop-blur-md",
        "ring-1 ring-inset ring-white/8",
        "supports-[backdrop-filter]:bg-white/[0.012]",
        className,
      )}
    >
      {title ? (
        <div className="mb-10 flex items-center gap-4">
          {icon ? (
            <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl border border-orange-400/35 bg-orange-500/15 text-orange-300 shadow-[0_0_24px_rgba(249,115,22,0.2)]">
              {icon}
            </span>
          ) : null}
          <h2 className="text-xl font-semibold leading-none text-white md:text-[1.35rem]">
            {title}
          </h2>
        </div>
      ) : null}
      {children}
    </section>
  );
}
