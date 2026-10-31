import { useState, type ReactNode } from "react";
import { Link, useLocation, useParams } from "wouter";
import { useQueryClient } from "@tanstack/react-query";
import { useGetClient, useUpdateClient, useDeleteClient, getGetClientQueryKey, getListClientsQueryKey, getGetAgencyQueryKey, type User } from "@workspace/api-client-react";
import { ArrowLeft, Pencil, Trash2, Globe, Ban, Brain } from "lucide-react";
import { format } from "date-fns";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { ClientForm } from "@/components/client-form";
import { ErrorPanel, Restricted, PageHeader } from "@/components/states";
import { can } from "@/lib/roles";
import { apiErrorMessage, apiStatus } from "@/lib/api-error";
import { useToast } from "@/hooks/use-toast";

function Block({ label, children }: { label: string; children: ReactNode }) {
  return (
    <section className="rounded-lg border bg-card p-5">
      <h3 className="font-mono text-[10px] uppercase tracking-[0.18em] text-muted-foreground mb-3">{label}</h3>
      {children}
    </section>
  );
}
const Chips = ({ items, testid }: { items: string[]; testid: string }) =>
  items.length ? <div className="flex flex-wrap gap-1.5" data-testid={testid}>{items.map((t) => <span key={t} dir="auto" className="rounded-sm border bg-secondary/60 px-2 py-0.5 text-sm">{t}</span>)}</div>
  : <p className="text-sm text-muted-foreground italic">Not set</p>;

export default function ClientDetailPage({ user }: { user: User }) {
  const { id = "" } = useParams<{ id: string }>();
  const perms = can(user);
  const [editing, setEditing] = useState(false);
  const [confirm, setConfirm] = useState(false);
  const [, setLocation] = useLocation();
  const qc = useQueryClient();
  const { toast } = useToast();
  const q = useGetClient(id, { query: { enabled: !!id && perms.viewClients, queryKey: getGetClientQueryKey(id) } });
  const update = useUpdateClient();
  const del = useDeleteClient();

  if (!perms.viewClients) return <Restricted title="Client profiles are not shared with you yet">Client viewers will gain access to assigned clients in a later release.</Restricted>;

  const back = <Link href="/clients" className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground mb-5" data-testid="link-back-clients"><ArrowLeft className="h-4 w-4" />All clients</Link>;

  if (q.isLoading) return <div>{back}<Skeleton className="h-10 w-72 mb-6" /><div className="grid md:grid-cols-2 gap-4">{[0, 1, 2, 3].map((i) => <Skeleton key={i} className="h-32" />)}</div></div>;
  if (q.isError || !q.data) return <div>{back}<ErrorPanel title={apiStatus(q.error) === 404 ? "Client not found" : "Could not load client"} message={apiErrorMessage(q.error, "This client may have been removed.")} onRetry={apiStatus(q.error) === 404 ? undefined : () => q.refetch()} /></div>;
  const c = q.data;
  const icpEntries = Object.entries(c.icp ?? {});

  return (
    <div className="rise">
      {back}
      <PageHeader eyebrow={"Added " + format(new Date(c.createdAt), "d MMM yyyy")} title={<span dir="auto" data-testid="text-client-name">{c.name}</span>}>
        <Link href={"/clients/" + c.id + "/brain"} className="inline-flex items-center h-9 px-4 rounded-md bg-accent text-accent-foreground text-sm font-medium hover:bg-accent/90" data-testid="link-client-brain"><Brain className="h-4 w-4 mr-1.5" />Brain</Link>
        {!editing && <Button variant="outline" onClick={() => { update.reset(); setEditing(true); }} data-testid="button-edit-client"><Pencil className="h-4 w-4 mr-1.5" />Edit</Button>}
        {perms.deleteClients
          ? <Button variant="outline" className="text-destructive border-destructive/30 hover:bg-destructive/5" onClick={() => { del.reset(); setConfirm(true); }} data-testid="button-delete-client"><Trash2 className="h-4 w-4 mr-1.5" />Delete</Button>
          : <span className="text-xs text-muted-foreground self-center" data-testid="text-delete-restricted">Only owners can delete clients</span>}
      </PageHeader>

      {editing ? (
        <div className="rounded-lg border bg-card p-6">
          <ClientForm initial={c} submitLabel="Save changes" pending={update.isPending} serverError={update.isError ? apiErrorMessage(update.error) : null}
            onCancel={() => setEditing(false)}
            onSubmit={(data) => update.mutate({ id: c.id, data }, {
              onSuccess: (u) => {
                qc.setQueryData(getGetClientQueryKey(c.id), u);
                qc.invalidateQueries({ queryKey: getListClientsQueryKey() });
                setEditing(false);
                toast({ title: "Changes saved" });
              },
            })} />
        </div>
      ) : (
        <div className="grid md:grid-cols-2 gap-4">
          <Block label="Website">{c.website ? <a href={c.website} target="_blank" rel="noreferrer" className="inline-flex items-center gap-2 text-primary underline-offset-4 hover:underline font-mono text-sm break-all" data-testid="link-client-website"><Globe className="h-4 w-4 shrink-0" />{c.website}</a> : <p className="text-sm text-muted-foreground italic">Not set</p>}</Block>
          <Block label="Verticals"><Chips items={c.verticals} testid="list-verticals" /></Block>
          <Block label="Regions"><Chips items={c.regions} testid="list-regions" /></Block>
          <Block label="Languages"><Chips items={c.languages} testid="list-languages" /></Block>
          <div className="md:col-span-2"><Block label="Offer">{c.offer ? <p dir="auto" className="whitespace-pre-wrap leading-relaxed" data-testid="text-offer">{c.offer}</p> : <p className="text-sm text-muted-foreground italic">Not set</p>}</Block></div>
          <Block label="Ideal customer profile">
            {icpEntries.length ? (
              <dl className="divide-y text-sm" data-testid="list-icp">
                {icpEntries.map(([k, v]) => <div key={k} className="grid grid-cols-[8rem_1fr] gap-3 py-2"><dt className="font-mono text-xs text-muted-foreground pt-0.5 break-all">{k}</dt><dd dir="auto" className="break-words">{Array.isArray(v) ? v.join(", ") : typeof v === "object" && v !== null ? <code className="text-xs">{JSON.stringify(v)}</code> : String(v)}</dd></div>)}
              </dl>
            ) : <p className="text-sm text-muted-foreground italic">Not set</p>}
          </Block>
          <Block label="Tone">{c.tone ? <p dir="auto" className="whitespace-pre-wrap" data-testid="text-tone">{c.tone}</p> : <p className="text-sm text-muted-foreground italic">Not set</p>}</Block>
          <div className="md:col-span-2">
            <section className="rounded-lg border border-destructive/25 bg-destructive/[0.03] p-5">
              <h3 className="font-mono text-[10px] uppercase tracking-[0.18em] text-destructive mb-3 flex items-center gap-1.5"><Ban className="h-3 w-3" />No-go claims</h3>
              {c.noGoClaims.length ? <ul className="space-y-1.5" data-testid="list-nogo">{c.noGoClaims.map((n) => <li key={n} dir="auto" className="text-sm border-l-2 border-destructive/50 pl-3">{n}</li>)}</ul> : <p className="text-sm text-muted-foreground italic">None recorded</p>}
            </section>
          </div>
        </div>
      )}

      <AlertDialog open={confirm} onOpenChange={setConfirm}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle className="font-display text-2xl">Delete {c.name}?</AlertDialogTitle>
            <AlertDialogDescription>This permanently removes the client profile and all associated data, including offer, ICP, tone and no-go claims. It cannot be undone.</AlertDialogDescription>
          </AlertDialogHeader>
          {del.isError && <p role="alert" className="text-sm text-destructive">{apiErrorMessage(del.error)}</p>}
          <AlertDialogFooter>
            <AlertDialogCancel data-testid="button-cancel-delete">Keep client</AlertDialogCancel>
            <AlertDialogAction className="bg-destructive text-destructive-foreground hover:bg-destructive/90" disabled={del.isPending} data-testid="button-confirm-delete"
              onClick={(e) => {
                e.preventDefault();
                del.mutate({ id: c.id }, {
                  onSuccess: () => {
                    qc.removeQueries({ queryKey: getGetClientQueryKey(c.id) });
                    qc.invalidateQueries({ queryKey: getListClientsQueryKey() });
                    qc.invalidateQueries({ queryKey: getGetAgencyQueryKey() });
                    setConfirm(false);
                    toast({ title: "Client deleted" });
                    setLocation("/clients");
                  },
                });
              }}>{del.isPending ? "Deleting" : "Delete permanently"}</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
