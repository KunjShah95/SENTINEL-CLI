import * as React from "react";
import { Slot } from "@radix-ui/react-slot";
import { cva, type VariantProps } from "class-variance-authority";

import { cn } from "./utils";

const buttonVariants = cva(
  "inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-xl text-sm font-bold transition-all disabled:pointer-events-none disabled:opacity-50 [&_svg]:pointer-events-none [&_svg:not([class*='size-'])]:size-4 shrink-0 [&_svg]:shrink-0 outline-none focus-visible:border-ring focus-visible:ring-ring/50 focus-visible:ring-[3px] aria-invalid:ring-destructive/20 dark:aria-invalid:ring-destructive/40 aria-invalid:border-destructive",
  {
    variants: {
      variant: {
        default: "bg-emerald-600 text-white hover:bg-emerald-500 shadow-lg shadow-emerald-500/25 hover:shadow-emerald-500/40 hover:scale-[1.02] active:scale-[0.98]",
        primary: "bg-emerald-600 text-white hover:bg-emerald-500 shadow-lg shadow-emerald-500/25 hover:shadow-emerald-500/40 hover:scale-[1.02] active:scale-[0.98]",
        secondary: "bg-gray-800 text-white border border-gray-700 hover:bg-gray-700 hover:border-gray-600 hover:scale-[1.02] active:scale-[0.98]",
        outline: "border border-gray-700 bg-transparent text-white hover:bg-gray-800 hover:border-gray-600",
        ghost: "text-gray-400 hover:text-white hover:bg-white/5",
        destructive: "bg-red-600 text-white hover:bg-red-500 shadow-lg shadow-red-500/25",
        success: "bg-emerald-600 text-white hover:bg-emerald-500 shadow-lg shadow-emerald-500/25",
      },
      size: {
        default: "h-11 px-6 py-3 has-[>svg]:px-4",
        sm: "h-9 rounded-lg gap-1.5 px-4 has-[>svg]:px-3 text-xs",
        lg: "h-14 rounded-xl px-8 has-[>svg]:px-6 text-lg",
        xl: "h-16 rounded-2xl px-10 has-[>svg]:px-8 text-xl",
        icon: "size-11 rounded-xl",
      },
    },
    defaultVariants: {
      variant: "default",
      size: "default",
    },
  },
);

function Button({
  className,
  variant,
  size,
  asChild = false,
  ...props
}: React.ComponentProps<"button"> &
  VariantProps<typeof buttonVariants> & {
    asChild?: boolean;
  }) {
  const Comp = asChild ? Slot : "button";

  return (
    <Comp
      data-slot="button"
      className={cn(buttonVariants({ variant, size, className }))}
      {...props}
    />
  );
}

export { Button, buttonVariants };
