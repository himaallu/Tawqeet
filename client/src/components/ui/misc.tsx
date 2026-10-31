import * as TabsP from "@radix-ui/react-tabs";
import * as TooltipP from "@radix-ui/react-tooltip";
import * as SwitchP from "@radix-ui/react-switch";
import * as React from "react";
import { cn } from "@/lib/utils";

export function Tooltip({ content, children, side = "top" }: { content: React.ReactNode; children: React.ReactNode; side?: "top" | "bottom" | "left" | "right" }) {
  return (
    <TooltipP.Root delayDuration={150}>
      <TooltipP.Trigger asChild>{children}</TooltipP.Trigger>
      <TooltipP.Portal>
        <TooltipP.Content side={side} sideOffset={6} className="z-[60] max-w-80 rounded-lg border bg-surface px-3 py-2 text-[12px] text-ink shadow-pop data-[state=delayed-open]:animate-in">
          {content}
        </TooltipP.Content>
      </TooltipP.Portal>
    </TooltipP.Root>
  );
}
export const TooltipProvider = TooltipP.Provider;

export const Tabs = TabsP.Root;
export const TabsContent = TabsP.Content;
export function TabsList({ className, ...props }: React.ComponentProps<typeof TabsP.List>) {
  return <TabsP.List className={cn("inline-flex items-center gap-0.5 rounded-lg bg-surface-3/70 p-0.5", className)} {...props} />;
}
export function TabsTrigger({ className, ...props }: React.ComponentProps<typeof TabsP.Trigger>) {
  return (
    <TabsP.Trigger
      className={cn(
        "inline-flex h-7 items-center gap-1.5 rounded-md px-2.5 text-[12.5px] font-medium text-ink-2 transition hover:text-ink data-[state=active]:bg-surface data-[state=active]:text-ink data-[state=active]:shadow-card",
        className,
      )}
      {...props}
    />
  );
}

export function Switch({ className, ...props }: React.ComponentProps<typeof SwitchP.Root>) {
  return (
    <SwitchP.Root className={cn("relative h-[18px] w-8 shrink-0 rounded-full bg-line-2 transition data-[state=checked]:bg-primary", className)} {...props}>
      <SwitchP.Thumb className="block size-3.5 translate-x-0.5 rounded-full bg-surface shadow transition data-[state=checked]:translate-x-[15px]" />
    </SwitchP.Root>
  );
}

export function Skeleton({ className }: { className?: string }) {
  return <div className={cn("animate-pulse rounded-md bg-surface-3", className)} />;
}

export function Kbd({ children }: { children: React.ReactNode }) {
  return <kbd className="num rounded border border-line-2 bg-surface px-1 text-[10.5px] text-ink-3">{children}</kbd>;
}

export function Empty({ icon, title, children, action }: { icon?: React.ReactNode; title: string; children?: React.ReactNode; action?: React.ReactNode }) {
  return (
    <div className="flex flex-col items-center justify-center rounded-xl border border-dashed border-line-2 px-6 py-14 text-center">
      {icon && <div className="mb-3 grid size-10 place-items-center rounded-xl bg-surface-3 text-ink-2 [&_svg]:size-5">{icon}</div>}
      <p className="text-[14px] font-medium">{title}</p>
      {children && <p className="mt-1 max-w-sm text-[12.5px] text-ink-3">{children}</p>}
      {action && <div className="mt-4">{action}</div>}
    </div>
  );
}

export function Table({ className, ...props }: React.ComponentProps<"table">) {
  return (
    <div className="overflow-x-auto scrollbar-thin">
      <table className={cn("w-full border-collapse text-[13px]", className)} {...props} />
    </div>
  );
}
export const Th = ({ className, ...props }: React.ComponentProps<"th">) => (
  <th className={cn("h-9 whitespace-nowrap border-b px-3 text-start text-[11.5px] font-medium uppercase tracking-wide text-ink-3", className)} {...props} />
);
export const Td = ({ className, ...props }: React.ComponentProps<"td">) => <td className={cn("border-b px-3 py-2.5 align-middle", className)} {...props} />;
