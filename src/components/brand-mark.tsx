import Link from "next/link";
import { cn } from "@/lib/utils";

export function BrandMark({
  href = "/",
  className,
  large = false,
  caption,
}: {
  href?: string;
  className?: string;
  large?: boolean;
  caption?: string;
}) {
  return (
    <div className={cn("inline-flex flex-col gap-2", className)}>
      <Link href={href} className="inline-flex items-center gap-3.5">
        <span
          className={cn(
            "relative flex items-center justify-center rounded-full border border-orange-400/50 bg-[#0b1730]/70 shadow-[0_0_40px_rgba(249,115,22,0.28)]",
            large ? "h-14 w-14" : "h-12 w-12",
          )}
        >
          <svg
            viewBox="0 0 48 48"
            className={large ? "h-8 w-8" : "h-7 w-7"}
            aria-hidden="true"
          >
            <circle
              cx="24"
              cy="24"
              r="17.5"
              fill="none"
              stroke="rgba(248,250,252,0.9)"
              strokeWidth="2"
            />
            <circle cx="24" cy="10.5" r="1.2" fill="#f97316" />
            <circle cx="24" cy="37.5" r="1.2" fill="rgba(248,250,252,0.7)" />
            <circle cx="10.5" cy="24" r="1.2" fill="rgba(248,250,252,0.7)" />
            <circle cx="37.5" cy="24" r="1.2" fill="rgba(248,250,252,0.7)" />
            <circle cx="24" cy="24" r="2.4" fill="#f97316" />
            <path
              d="M24 15.5v9"
              stroke="rgba(248,250,252,0.95)"
              strokeWidth="2.3"
              strokeLinecap="round"
            />
            <path
              d="M24 24.5 L33.5 29.5"
              stroke="#f97316"
              strokeWidth="2.4"
              strokeLinecap="round"
            />
          </svg>
        </span>
        <span
          className={cn(
            "font-semibold leading-none tracking-[0.02em] text-white",
            large ? "text-2xl" : "text-xl",
          )}
        >
          MrClock
        </span>
      </Link>
      {caption ? (
        <p
          className={cn(
            "text-sm leading-6 text-slate-400",
            large ? "ps-[4.375rem]" : "ps-[3.875rem]",
          )}
        >
          {caption}
        </p>
      ) : null}
    </div>
  );
}
