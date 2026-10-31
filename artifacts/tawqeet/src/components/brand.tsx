export function Mark({ className = "h-8 w-8" }: { className?: string }) {
  return (
    <svg viewBox="0 0 40 40" className={className} aria-hidden="true">
      <rect x="1" y="1" width="38" height="38" rx="9" fill="hsl(var(--accent))" />
      <circle cx="20" cy="20" r="10" fill="none" stroke="hsl(40 40% 98%)" strokeWidth="2.2" />
      <path d="M20 20 L20 11" stroke="hsl(40 40% 98%)" strokeWidth="2.4" strokeLinecap="round" />
      <path d="M20 20 L26 23" stroke="hsl(40 40% 98%)" strokeWidth="2.4" strokeLinecap="round" />
      <circle cx="20" cy="20" r="2" fill="hsl(40 40% 98%)" />
    </svg>
  );
}
export function Wordmark({ light = false }: { light?: boolean }) {
  return (
    <div className="flex items-center gap-2.5">
      <Mark />
      <div className="leading-none">
        <div className={"font-display text-xl font-semibold " + (light ? "text-sidebar-foreground" : "text-foreground")}>Tawqeet</div>
        <div className={"text-[10px] tracking-[0.18em] uppercase mt-1 " + (light ? "text-sidebar-foreground/55" : "text-muted-foreground")} lang="ar">توقيت · timing</div>
      </div>
    </div>
  );
}
