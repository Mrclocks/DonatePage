import { cn } from "@/lib/utils";

/**
 * Spacing contract (8px base):
 * - Card padding: 32px
 * - Title → content: 32px
 * - Title icon → label: 12px
 * - Section stack: 24px
 * - Label → control: 8px
 * - List item gaps: 12px
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
        "rounded-[28px] border border-white/12 bg-white/[0.01] p-8 shadow-[0_16px_48px_rgba(0,0,0,0.16)] backdrop-blur-sm",
        "ring-1 ring-inset ring-white/5",
        "supports-[backdrop-filter]:bg-white/[0.006]",
        className,
      )}
    >
      {title ? (
        <div className="mb-8 flex items-center gap-3">
          {icon ? (
            <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl border border-orange-400/30 bg-orange-500/12 text-orange-300 shadow-[0_0_20px_rgba(249,115,22,0.16)]">
              {icon}
            </span>
          ) : null}
          <h2 className="text-xl font-semibold leading-none text-white md:text-[1.3rem]">
            {title}
          </h2>
        </div>
      ) : null}
      {children}
    </section>
  );
}
