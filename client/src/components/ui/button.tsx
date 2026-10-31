import { Slot } from "@radix-ui/react-slot";
import { cva, type VariantProps } from "class-variance-authority";
import { Loader2 } from "lucide-react";
import * as React from "react";
import { cn } from "@/lib/utils";

const buttonVariants = cva(
  "inline-flex shrink-0 select-none items-center justify-center gap-1.5 whitespace-nowrap rounded-lg text-[13px] font-medium transition-[background,color,box-shadow,transform] duration-150 active:scale-[0.98] disabled:pointer-events-none disabled:opacity-50 [&_svg]:size-[15px] [&_svg]:shrink-0",
  {
    variants: {
      variant: {
        primary: "bg-primary text-primary-ink shadow-card hover:opacity-90",
        hot: "bg-hot text-white shadow-card hover:brightness-105",
        outline: "border border-line-2 bg-surface text-ink shadow-card hover:bg-surface-2",
        ghost: "text-ink-2 hover:bg-surface-3/70 hover:text-ink",
        subtle: "bg-surface-3/70 text-ink hover:bg-surface-3",
        danger: "border border-line-2 bg-surface text-bad hover:bg-bad-soft",
        link: "h-auto px-0 text-ink underline-offset-4 hover:underline",
      },
      size: { sm: "h-7 px-2.5 text-[12px]", md: "h-8 px-3", lg: "h-10 px-4 text-[14px]", icon: "size-8", "icon-sm": "size-7" },
    },
    defaultVariants: { variant: "outline", size: "md" },
  },
);

export interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement>, VariantProps<typeof buttonVariants> {
  asChild?: boolean;
  loading?: boolean;
}

export function Button({ className, variant, size, asChild, loading, children, disabled, ...props }: ButtonProps) {
  const Comp = asChild ? Slot : "button";
  return (
    <Comp className={cn(buttonVariants({ variant, size }), className)} disabled={disabled || loading} {...props}>
      {asChild ? children : (
        <>
          {loading && <Loader2 className="animate-spin" />}
          {children}
        </>
      )}
    </Comp>
  );
}
export { buttonVariants };
