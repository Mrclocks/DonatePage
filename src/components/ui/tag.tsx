import { cn } from "@/lib/utils";

/** Pill/tag with optically centered Latin + Persian text */
export function Tag({
  children,
  className,
}: {
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <span
      className={cn(
        "inline-flex items-center justify-center rounded-full border px-3 py-1.5 text-xs font-medium leading-none",
        className,
      )}
    >
      <span className="inline-flex items-center leading-none translate-y-[0.5px]">
        {children}
      </span>
    </span>
  );
}
