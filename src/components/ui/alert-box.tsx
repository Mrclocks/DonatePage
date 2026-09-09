import {
  AlertCircle,
  AlertTriangle,
  CheckCircle2,
  Info,
} from "lucide-react";
import { cn } from "@/lib/utils";

const VARIANTS = {
  error: {
    wrap: "border-red-400/30 bg-red-500/10 text-red-100",
    icon: "text-red-300",
    Icon: AlertCircle,
  },
  success: {
    wrap: "border-emerald-400/30 bg-emerald-500/10 text-emerald-100",
    icon: "text-emerald-300",
    Icon: CheckCircle2,
  },
  warning: {
    wrap: "border-amber-400/30 bg-amber-500/10 text-amber-100",
    icon: "text-amber-300",
    Icon: AlertTriangle,
  },
  info: {
    wrap: "border-sky-400/30 bg-sky-500/10 text-sky-100",
    icon: "text-sky-300",
    Icon: Info,
  },
} as const;

export function AlertBox({
  variant = "info",
  title,
  children,
  className,
}: {
  variant?: keyof typeof VARIANTS;
  title?: string;
  children: React.ReactNode;
  className?: string;
}) {
  const cfg = VARIANTS[variant];
  const Icon = cfg.Icon;
  return (
    <div
      role="status"
      className={cn(
        "flex gap-3 rounded-2xl border px-4 py-3.5 text-sm leading-7",
        cfg.wrap,
        className,
      )}
    >
      <Icon className={cn("mt-0.5 h-5 w-5 shrink-0", cfg.icon)} strokeWidth={2.25} />
      <div className="min-w-0 space-y-1">
        {title ? <p className="font-medium text-white">{title}</p> : null}
        <div className="text-inherit/90">{children}</div>
      </div>
    </div>
  );
}
