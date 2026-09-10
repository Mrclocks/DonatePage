import Link from "next/link";
import { cn } from "@/lib/utils";

export function BrandMark({
  href = "/",
  className,
  large = false,
  stacked = false,
}: {
  href?: string;
  className?: string;
  large?: boolean;
  /** Vertical logo-above-name layout for centered hero */
  stacked?: boolean;
}) {
  return (
    <Link
      href={href}
      className={cn(
        "inline-flex items-center",
        stacked ? "flex-col gap-4" : "gap-3.5",
        className,
      )}
    >
      <span
        className={cn(
          "relative flex items-center justify-center rounded-full border border-orange-400/50 bg-[#0b1730]/70 shadow-[0_0_40px_rgba(249,115,22,0.28)]",
          stacked && large
            ? "h-20 w-20 animate-[brand-pulse_4s_ease-in-out_infinite]"
            : large
              ? "h-14 w-14"
              : "h-12 w-12",
        )}
      >
        <svg
          viewBox="0 0 48 48"
          className={
            stacked && large ? "h-11 w-11" : large ? "h-8 w-8" : "h-7 w-7"
          }
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
          stacked && large
            ? "text-3xl md:text-4xl"
            : large
              ? "text-2xl"
              : "text-xl",
        )}
      >
        MrClock
      </span>
    </Link>
  );
}
