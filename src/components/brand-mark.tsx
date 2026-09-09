import Link from "next/link";

export function BrandMark({ href = "/" }: { href?: string }) {
  return (
    <Link href={href} className="inline-flex items-center gap-3">
      <span className="relative flex h-11 w-11 items-center justify-center rounded-full border border-orange-400/40 bg-[#0b1730]/60 shadow-[0_0_30px_rgba(249,115,22,0.18)]">
        <svg
          viewBox="0 0 48 48"
          className="h-7 w-7"
          aria-hidden="true"
        >
          <circle
            cx="24"
            cy="24"
            r="18"
            fill="none"
            stroke="currentColor"
            className="text-slate-200"
            strokeWidth="2"
          />
          <circle cx="24" cy="24" r="2.2" className="fill-orange-400" />
          <path
            d="M24 14v10.5"
            stroke="currentColor"
            className="text-slate-100"
            strokeWidth="2.2"
            strokeLinecap="round"
          />
          <path
            d="M24 24.5 L33 29"
            stroke="currentColor"
            className="text-orange-400"
            strokeWidth="2.2"
            strokeLinecap="round"
          />
        </svg>
      </span>
      <span className="text-lg font-semibold tracking-wide text-white">
        MrClock
      </span>
    </Link>
  );
}
