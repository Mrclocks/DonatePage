import { cn } from "@/lib/utils";

export function GlassCard({
  children,
  className,
}: {
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <section
      className={cn(
        "rounded-[28px] border border-white/15 bg-[rgba(8,16,32,0.48)] p-8 shadow-[0_30px_80px_rgba(0,0,0,0.45)] backdrop-blur-2xl md:p-10",
        className,
      )}
    >
      {children}
    </section>
  );
}
