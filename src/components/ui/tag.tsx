import { cn } from "@/lib/utils";

/** Pill/tag with vertically centered Latin + Persian text */
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
        "inline-flex h-7 items-center justify-center rounded-full border px-3 text-xs font-medium leading-none",
        className,
      )}
    >
      {children}
    </span>
  );
}
