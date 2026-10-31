import type { ReactNode } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { useLogout, type User } from "@workspace/api-client-react";
import { LogOut, Eye } from "lucide-react";
import { Wordmark } from "@/components/brand";

/** Minimal layout for client_viewer sessions: their report only, no agency navigation. */
export function ViewerShell({ user: _user, children }: { user: User; children: ReactNode }) {
  const qc = useQueryClient();
  const logout = useLogout();
  return (
    <div className="min-h-[100dvh]">
      <header className="border-b bg-card/80 backdrop-blur sticky top-0 z-20">
        <div className="mx-auto max-w-5xl px-4 md:px-10 py-3 flex items-center gap-3">
          <Wordmark />
          <span className="ml-auto inline-flex items-center gap-1.5 rounded-sm border px-2 py-1 font-mono text-[10px] uppercase tracking-wider text-muted-foreground" data-testid="badge-read-only"><Eye className="h-3 w-3" />Read-only client view</span>
          <button className="text-xs text-muted-foreground hover:text-foreground inline-flex items-center gap-1" data-testid="button-logout"
            onClick={() => logout.mutate(undefined, { onSettled: () => { qc.clear(); window.location.href = `${import.meta.env.BASE_URL.replace(/\/$/, "")}/welcome`; } })}>
            <LogOut className="h-3.5 w-3.5" />Leave</button>
        </div>
      </header>
      <main className="mx-auto max-w-5xl px-4 md:px-10 py-8">{children}</main>
    </div>
  );
}
