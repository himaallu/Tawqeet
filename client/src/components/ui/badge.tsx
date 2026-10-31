import { cva, type VariantProps } from "class-variance-authority";
import * as React from "react";
import { cn } from "@/lib/utils";

const badge = cva("inline-flex items-center gap-1 whitespace-nowrap rounded-md px-1.5 py-[1px] text-[11px] font-medium leading-[18px] [&_svg]:size-3", {
  variants: {
    tone: {
      neutral: "bg-surface-3 text-ink-2",
      outline: "border border-line-2 text-ink-2",
      hot: "bg-hot-soft text-hot",
      warm: "bg-warm-soft text-[color-mix(in_oklch,var(--warm),black_35%)] dark:text-warm",
      cold: "bg-cold-soft text-cold",
      good: "bg-good-soft text-good",
      bad: "bg-bad-soft text-bad",
      ink: "bg-primary text-primary-ink",
    },
  },
  defaultVariants: { tone: "neutral" },
});

export function Badge({ className, tone, ...props }: React.ComponentProps<"span"> & VariantProps<typeof badge>) {
  return <span className={cn(badge({ tone }), className)} {...props} />;
}
