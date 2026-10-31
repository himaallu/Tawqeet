import * as React from "react";
import { cn } from "@/lib/utils";

const field =
  "w-full rounded-lg border border-line-2 bg-surface px-3 text-[13px] text-ink shadow-card outline-none transition-[border,box-shadow] placeholder:text-ink-3 focus:border-hot/60 focus:ring-3 focus:ring-hot/15 disabled:opacity-60";

export function Input({ className, ...props }: React.ComponentProps<"input">) {
  return <input className={cn(field, "h-9", className)} {...props} />;
}

export function Textarea({ className, ...props }: React.ComponentProps<"textarea">) {
  return <textarea className={cn(field, "min-h-20 py-2 leading-relaxed", className)} {...props} />;
}

export function Select({ className, children, ...props }: React.ComponentProps<"select">) {
  return (
    <select className={cn(field, "h-9 appearance-none bg-[url('data:image/svg+xml;utf8,<svg xmlns=%22http://www.w3.org/2000/svg%22 width=%2212%22 height=%2212%22 viewBox=%220 0 24 24%22 fill=%22none%22 stroke=%22%23888%22 stroke-width=%222%22><path d=%22m6 9 6 6 6-6%22/></svg>')] bg-[length:12px] bg-[right_10px_center] bg-no-repeat pe-8", className)} {...props}>
      {children}
    </select>
  );
}

export function Label({ className, ...props }: React.ComponentProps<"label">) {
  return <label className={cn("text-[12px] font-medium text-ink-2", className)} {...props} />;
}

export function Field({ label, hint, children, className }: { label: string; hint?: React.ReactNode; children: React.ReactNode; className?: string }) {
  return (
    <div className={cn("grid gap-1.5", className)}>
      <Label>{label}</Label>
      {children}
      {hint && <p className="text-[11.5px] text-ink-3">{hint}</p>}
    </div>
  );
}

/** Comma/enter separated tags. */
export function TagInput({ value, onChange, placeholder }: { value: string[]; onChange: (v: string[]) => void; placeholder?: string }) {
  const [draft, setDraft] = React.useState("");
  const add = () => {
    const parts = draft.split(",").map((s) => s.trim()).filter(Boolean);
    if (parts.length) onChange([...new Set([...value, ...parts])]);
    setDraft("");
  };
  return (
    <div className={cn(field, "flex min-h-9 flex-wrap items-center gap-1 py-1.5")}>
      {value.map((t) => (
        <span key={t} dir="auto" className="inline-flex items-center gap-1 rounded-md bg-surface-3 px-1.5 py-0.5 text-[12px]">
          {t}
          <button type="button" className="text-ink-3 hover:text-ink" onClick={() => onChange(value.filter((x) => x !== t))} aria-label={`Remove ${t}`}>
            ×
          </button>
        </span>
      ))}
      <input
        dir="auto"
        className="min-w-24 flex-1 bg-transparent outline-none placeholder:text-ink-3"
        value={draft}
        placeholder={value.length ? "" : placeholder}
        onChange={(e) => setDraft(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter" || e.key === ",") {
            e.preventDefault();
            add();
          } else if (e.key === "Backspace" && !draft && value.length) onChange(value.slice(0, -1));
        }}
        onBlur={add}
      />
    </div>
  );
}
