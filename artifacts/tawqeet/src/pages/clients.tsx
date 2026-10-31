import { useMemo, useState } from "react";
import { Link, useLocation } from "wouter";
import { useQueryClient } from "@tanstack/react-query";
import { useListClients, useCreateClient, getListClientsQueryKey, getGetAgencyQueryKey, type User } from "@workspace/api-client-react";
import { Plus, Search, ArrowUpRight, Building2 } from "lucide-react";
import { format } from "date-fns";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { ClientForm } from "@/components/client-form";
import { ErrorPanel, Restricted, PageHeader, UpgradeNotice } from "@/components/states";
import { can } from "@/lib/roles";
import { apiErrorMessage, apiStatus } from "@/lib/api-error";
import { useToast } from "@/hooks/use-toast";

export default function ClientsPage({ user }: { user: User }) {
  const perms = can(user);
  const [q, setQ] = useState("");
  const [open, setOpen] = useState(false);
  const [, setLocation] = useLocation();
  const qc = useQueryClient();
  const { toast } = useToast();
  const list = useListClients({ query: { enabled: perms.viewClients, queryKey: getListClientsQueryKey() } });
  const create = useCreateClient();

  const filtered = useMemo(() => {
    const s = q.trim().toLowerCase();
    const all = list.data ?? [];
    if (!s) return all;
    return all.filter((c) => [c.name, c.website, ...c.verticals, ...c.regions, ...c.languages].join(" ").toLowerCase().includes(s));
  }, [list.data, q]);

  if (!perms.viewClients) return (
    <Restricted title="Client profiles are not shared with you yet">
      Your role is <strong>Client viewer</strong>. Viewers will see only the clients assigned to them, and assignment arrives in a later release. Ask the agency owner if you need access now.
    </Restricted>
  );

  return (
    <div className="rise">
      <PageHeader eyebrow={list.data ? list.data.length + " on file" : "Clients"} title="Clients">
        <Button onClick={() => { create.reset(); setOpen(true); }} className="bg-accent text-accent-foreground hover:bg-accent/90" data-testid="button-new-client"><Plus className="h-4 w-4 mr-1.5" />New client</Button>
      </PageHeader>

      <div className="relative mb-5 max-w-md">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
        <Input dir="auto" type="search" value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search name, vertical, region, language" className="pl-9 bg-card" aria-label="Search clients" data-testid="input-search-clients" />
      </div>

      {list.isLoading ? (
        <div className="space-y-2">{[0, 1, 2, 3].map((i) => <Skeleton key={i} className="h-16 w-full" />)}</div>
      ) : list.isError ? (
        <ErrorPanel message={apiErrorMessage(list.error)} onRetry={() => list.refetch()} />
      ) : (list.data ?? []).length === 0 ? (
        <div className="rounded-lg border border-dashed bg-card/60 p-12 text-center" data-testid="status-empty-clients">
          <div className="mx-auto h-14 w-14 rounded-full border-2 border-accent/40 grid place-items-center"><Building2 className="h-6 w-6 text-accent" /></div>
          <h2 className="font-display text-2xl mt-5">No clients on file</h2>
          <p className="text-sm text-muted-foreground mt-2 max-w-sm mx-auto">Each profile captures offer, ICP, tone and no-go claims, so every future campaign starts from the same truth.</p>
          <Button className="mt-6" onClick={() => setOpen(true)} data-testid="button-empty-new-client"><Plus className="h-4 w-4 mr-1.5" />Add the first client</Button>
        </div>
      ) : filtered.length === 0 ? (
        <p className="text-sm text-muted-foreground py-10 text-center" data-testid="status-no-results">Nothing matches "{q}".</p>
      ) : (
        <div className="rounded-lg border bg-card overflow-hidden">
          <div className="hidden md:grid grid-cols-[2fr_1.4fr_1.2fr_1fr_auto] gap-4 px-5 py-2.5 border-b bg-secondary/50 font-mono text-[10px] uppercase tracking-[0.15em] text-muted-foreground">
            <div>Client</div><div>Verticals</div><div>Regions</div><div>Added</div><div className="w-4" />
          </div>
          <ul>
            {filtered.map((c) => (
              <li key={c.id} className="border-b last:border-0 relative">
                <Link href={"/clients/" + c.id} data-testid={"row-client-" + c.id}
                  className="group grid md:grid-cols-[2fr_1.4fr_1.2fr_1fr_auto] gap-1 md:gap-4 items-center px-5 py-3.5 hover:bg-secondary/40 transition-colors">
                  <div className="min-w-0">
                    <div className="font-medium truncate" dir="auto">{c.name}</div>
                    <div className="text-xs text-muted-foreground truncate font-mono">{c.website ? c.website.replace(/^https?:\/\//, "") : "no website"}</div>
                  </div>
                  <div className="text-sm text-muted-foreground truncate" dir="auto">{c.verticals.join(", ") || "\u2014"}</div>
                  <div className="flex gap-1 flex-wrap">{c.regions.slice(0, 3).map((r) => <span key={r} dir="auto" className="rounded-sm bg-primary/8 border px-1.5 py-0.5 text-[11px]">{r}</span>)}{c.regions.length > 3 && <span className="text-[11px] text-muted-foreground">+{c.regions.length - 3}</span>}</div>
                  <div className="text-xs font-mono text-muted-foreground">{format(new Date(c.createdAt), "d MMM yyyy")}</div>
                  <ArrowUpRight className="hidden md:block h-4 w-4 text-muted-foreground group-hover:text-accent group-hover:translate-x-0.5 group-hover:-translate-y-0.5 transition-transform" />
                </Link>
                <Link href={"/clients/" + c.id + "/brain"} className="block px-5 pb-3 -mt-1 text-xs text-accent md:absolute md:right-14 md:top-1/2 md:-translate-y-1/2 md:p-0 md:m-0 md:font-mono hover:underline" data-testid={"link-brain-" + c.id}>Open Brain</Link>
              </li>
            ))}
          </ul>
        </div>
      )}

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-3xl max-h-[90dvh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="font-display text-2xl">New client profile</DialogTitle>
            <DialogDescription>Only the name is required. Fill in the rest as you learn it.</DialogDescription>
          </DialogHeader>
          {create.isError && apiStatus(create.error) === 402 && <div className="mb-4"><UpgradeNotice message={apiErrorMessage(create.error)} /></div>}
          <ClientForm submitLabel="Create client" pending={create.isPending} serverError={create.isError ? apiErrorMessage(create.error) : null}
            onCancel={() => setOpen(false)}
            onSubmit={(data) => create.mutate({ data }, {
              onSuccess: (c) => {
                qc.invalidateQueries({ queryKey: getListClientsQueryKey() });
                qc.invalidateQueries({ queryKey: getGetAgencyQueryKey() });
                setOpen(false);
                toast({ title: "Client created", description: c.name });
                setLocation("/clients/" + c.id);
              },
            })} />
        </DialogContent>
      </Dialog>
    </div>
  );
}
