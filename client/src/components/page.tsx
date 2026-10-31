import * as React from "react";
import { cn } from "@/lib/utils";

export function PageHeader({ title, description, actions, eyebrow }: { title: React.ReactNode; description?: React.ReactNode; actions?: React.ReactNode; eyebrow?: React.ReactNode }) {
  return (
    <div className="mb-6 flex flex-wrap items-end justify-between gap-4">
      <div className="min-w-0">
        {eyebrow && <div className="mb-1.5 text-[11.5px] font-medium uppercase tracking-wider text-ink-3">{eyebrow}</div>}
        <h1 className="text-[22px] font-semibold tracking-[-0.02em] text-balance">{title}</h1>
        {description && <p className="mt-1 max-w-2xl text-[13px] text-ink-2">{description}</p>}
      </div>
      {actions && <div className="flex flex-wrap items-center gap-2">{actions}</div>}
    </div>
  );
}

export function Stat({ label, value, sub, accent, icon }: { label: string; value: React.ReactNode; sub?: React.ReactNode; accent?: "hot" | "warm" | "cold" | "good"; icon?: React.ReactNode }) {
  const color = accent ? `var(--${accent})` : undefined;
  return (
    <div className="relative overflow-hidden rounded-xl border bg-surface p-4 shadow-card">
      {accent && <span className="absolute inset-x-0 top-0 h-[2px]" style={{ background: color }} />}
      <div className="flex items-center justify-between text-[12px] text-ink-3">
        <span>{label}</span>
        {icon && <span className="[&_svg]:size-4">{icon}</span>}
      </div>
      <div className="num mt-2 text-[26px] font-semibold leading-none tracking-tight">{value}</div>
      {sub && <div className="mt-1.5 text-[12px] text-ink-3">{sub}</div>}
    </div>
  );
}

export function Logo({ className, mark = true }: { className?: string; mark?: boolean }) {
  return (
    <span className={cn("inline-flex items-center gap-2", className)}>
      {mark && (
        <svg width="22" height="22" viewBox="0 0 32 32" aria-hidden>
          <rect width="32" height="32" rx="8" fill="var(--primary)" />
          <rect x="13" y="6" width="6" height="20" rx="3" fill="var(--primary-ink)" opacity=".18" />
          <rect x="13" y="13" width="6" height="13" rx="3" fill="var(--hot)" />
          <circle cx="16" cy="24" r="4.5" fill="var(--hot)" />
        </svg>
      )}
      <span className="text-[15px] font-semibold tracking-[-0.02em]">Tawqeet</span>
      <span className="text-[13px] text-ink-3" lang="ar">توقيت</span>
    </span>
  );
}

export function Section({ title, children, className, action }: { title: string; children: React.ReactNode; className?: string; action?: React.ReactNode }) {
  return (
    <section className={cn("mb-8 min-w-0", className)}>
      <div className="mb-3 flex items-center justify-between">
        <h2 className="text-[13px] font-semibold tracking-tight text-ink-2">{title}</h2>
        {action}
      </div>
      {children}
    </section>
  );
}
