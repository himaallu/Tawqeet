import * as D from "@radix-ui/react-dialog";
import { X } from "lucide-react";
import * as React from "react";
import { cn } from "@/lib/utils";

export const Dialog = D.Root;
export const DialogTrigger = D.Trigger;
export const DialogClose = D.Close;

export function DialogContent({ title, description, children, className, wide }: { title: string; description?: React.ReactNode; children: React.ReactNode; className?: string; wide?: boolean }) {
  return (
    <D.Portal>
      <D.Overlay className="fixed inset-0 z-50 bg-black/30 backdrop-blur-[2px] data-[state=open]:animate-in" />
      <D.Content
        className={cn(
          "fixed left-1/2 top-[8vh] z-50 max-h-[84vh] w-[calc(100vw-32px)] -translate-x-1/2 overflow-y-auto rounded-2xl border bg-surface p-5 shadow-pop outline-none data-[state=open]:animate-in",
          wide ? "max-w-2xl" : "max-w-md",
          className,
        )}
      >
        <div className="mb-4 flex items-start justify-between gap-4">
          <div>
            <D.Title className="text-[15px] font-semibold tracking-tight">{title}</D.Title>
            {description && <D.Description className="mt-1 text-[12.5px] text-ink-3">{description}</D.Description>}
          </div>
          <D.Close className="rounded-md p-1 text-ink-3 hover:bg-surface-3 hover:text-ink" aria-label="Close">
            <X className="size-4" />
          </D.Close>
        </div>
        {children}
      </D.Content>
    </D.Portal>
  );
}

/** Right-hand panel (full screen on phones). */
export function Sheet({ open, onOpenChange, children, title, width = "max-w-[860px]" }: { open: boolean; onOpenChange: (o: boolean) => void; children: React.ReactNode; title: string; width?: string }) {
  return (
    <D.Root open={open} onOpenChange={onOpenChange}>
      <D.Portal>
        <D.Overlay className="fixed inset-0 z-40 bg-black/20 data-[state=open]:animate-in" />
        <D.Content className={cn("fixed inset-y-0 right-0 z-40 flex w-full flex-col border-l bg-bg shadow-pop outline-none data-[state=open]:animate-slide", width)}>
          <D.Title className="sr-only">{title}</D.Title>
          <D.Description className="sr-only">{title}</D.Description>
          {children}
        </D.Content>
      </D.Portal>
    </D.Root>
  );
}
