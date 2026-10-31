import * as DM from "@radix-ui/react-dropdown-menu";
import * as PP from "@radix-ui/react-popover";
import * as React from "react";
import { cn } from "@/lib/utils";

export const Menu = DM.Root;
export const MenuTrigger = DM.Trigger;
export function MenuContent({ className, align = "end", ...props }: React.ComponentProps<typeof DM.Content>) {
  return (
    <DM.Portal>
      <DM.Content align={align} sideOffset={6} className={cn("z-50 min-w-48 rounded-xl border bg-surface p-1 shadow-pop data-[state=open]:animate-in", className)} {...props} />
    </DM.Portal>
  );
}
export function MenuItem({ className, ...props }: React.ComponentProps<typeof DM.Item>) {
  return (
    <DM.Item
      className={cn("flex cursor-pointer select-none items-center gap-2 rounded-lg px-2.5 py-1.5 text-[13px] text-ink outline-none data-[highlighted]:bg-surface-3 data-[disabled]:opacity-50 [&_svg]:size-4 [&_svg]:text-ink-3", className)}
      {...props}
    />
  );
}
export const MenuSeparator = () => <DM.Separator className="my-1 h-px bg-line" />;
export const MenuLabel = ({ children }: { children: React.ReactNode }) => <DM.Label className="px-2.5 py-1 text-[11px] font-medium uppercase tracking-wide text-ink-3">{children}</DM.Label>;

export const Popover = PP.Root;
export const PopoverTrigger = PP.Trigger;
export function PopoverContent({ className, align = "start", ...props }: React.ComponentProps<typeof PP.Content>) {
  return (
    <PP.Portal>
      <PP.Content align={align} sideOffset={6} className={cn("z-50 rounded-xl border bg-surface p-1 shadow-pop data-[state=open]:animate-in", className)} {...props} />
    </PP.Portal>
  );
}
