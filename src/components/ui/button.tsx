import * as React from "react";
import { Slot } from "@radix-ui/react-slot";
import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "@/lib/utils";

const buttonVariants = cva(
  "inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-full text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-orange-400/60 disabled:pointer-events-none disabled:opacity-50",
  {
    variants: {
      variant: {
        default: "bg-orange-500 text-white hover:bg-orange-400",
        secondary:
          "bg-white/5 text-slate-100 border border-white/10 hover:bg-white/10",
        outline:
          "border border-white/15 bg-transparent text-slate-100 hover:bg-white/5",
        ghost: "hover:bg-white/5 text-slate-200",
        destructive: "bg-red-500/90 text-white hover:bg-red-500",
      },
      size: {
        default: "h-11 px-6",
        sm: "h-9 rounded-full px-4",
        lg: "h-12 rounded-full px-8",
        icon: "h-10 w-10",
      },
    },
    defaultVariants: {
      variant: "default",
      size: "default",
    },
  },
);

export interface ButtonProps
  extends React.ButtonHTMLAttributes<HTMLButtonElement>,
    VariantProps<typeof buttonVariants> {
  asChild?: boolean;
}

const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant, size, asChild = false, ...props }, ref) => {
    const Comp = asChild ? Slot : "button";
    return (
      <Comp
        className={cn(buttonVariants({ variant, size, className }))}
        ref={ref}
        {...props}
      />
    );
  },
);
Button.displayName = "Button";

export { Button, buttonVariants };
