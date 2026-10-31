import { useEffect, useState, type FormEvent } from "react";
import { Link } from "wouter";
import { useQueryClient } from "@tanstack/react-query";
import { useGetAgency, useUpdateAgency, getGetAgencyQueryKey, type User } from "@workspace/api-client-react";
import { Activity, ShieldCheck, ArrowRight, Check, Minus } from "lucide-react";
import { format } from "date-fns";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import { ErrorPanel, PageHeader } from "@/components/states";
import { can, roleLabel } from "@/lib/roles";
import { apiErrorMessage } from "@/lib/api-error";
import { useToast } from "@/hooks/use-toast";
import { DemoDataCard } from "@/components/demo-data-card";

const matrix: [string, boolean, boolean, boolean][] = [
  ["View and search clients", true, true, false],
  ["Create and edit clients", true, true, false],
  ["Delete clients", true, false, false],
  ["Rename agency", true, false, false],
  ["View system checks", true, false, false],
];

export default function SettingsPage({ user }: { user: User }) {
  const perms = can(user);
  const qc = useQueryClient();
  const { toast } = useToast();
  const agency = useGetAgency({ query: { enabled: !!user, queryKey: getGetAgencyQueryKey() } });
  const update = useUpdateAgency();
  const [name, setName] = useState("");
  const [err, setErr] = useState<string | null>(null);
  const loadedName = agency.data?.name;
  useEffect(() => { if (loadedName !== undefined) setName(loadedName); }, [loadedName]);

  const submit = (e: FormEvent) => {
    e.preventDefault();
    const v = name.trim();
    if (!v || v.length > 120) { setErr("Name must be 1 to 120 characters."); return; }
    setErr(null);
    update.mutate({ data: { name: v } }, {
      onSuccess: (a) => { qc.setQueryData(getGetAgencyQueryKey(), a); qc.invalidateQueries({ queryKey: getGetAgencyQueryKey() }); toast({ title: "Agency renamed" }); },
    });
  };

  return (
    <div className="rise max-w-3xl">
      <PageHeader eyebrow="Settings" title="Agency profile" />
      {agency.isLoading ? <Skeleton className="h-48" /> : agency.isError || !agency.data ? (
        <ErrorPanel message={apiErrorMessage(agency.error)} onRetry={() => agency.refetch()} />
      ) : (
        <section className="rounded-lg border bg-card p-6">
          <form onSubmit={submit} className="flex flex-col md:flex-row md:items-end gap-3">
            <div className="flex-1">
              <Label htmlFor="agency-name" className="text-xs uppercase tracking-wider text-muted-foreground">Agency name</Label>
              <Input id="agency-name" dir="auto" value={name} onChange={(e) => setName(e.target.value)} disabled={!perms.editAgency} className="mt-1.5 bg-card" data-testid="input-agency-name" />
            </div>
            {perms.editAgency && <Button type="submit" disabled={update.isPending || name.trim() === agency.data.name} data-testid="button-save-agency">{update.isPending ? "Saving" : "Save"}</Button>}
          </form>
          {(err || update.isError) && <p role="alert" className="text-sm text-destructive mt-2" data-testid="text-agency-error">{err ?? apiErrorMessage(update.error)}</p>}
          {!perms.editAgency && <p className="text-xs text-muted-foreground mt-2">Only the agency owner can rename the agency.</p>}
          <dl className="grid grid-cols-2 md:grid-cols-3 gap-4 mt-6 pt-5 border-t text-sm">
            <div><dt className="font-mono text-[10px] uppercase tracking-[0.15em] text-muted-foreground">Plan</dt><dd className="mt-1 capitalize" data-testid="text-agency-plan">{agency.data.plan}</dd></div>
            <div><dt className="font-mono text-[10px] uppercase tracking-[0.15em] text-muted-foreground">Created</dt><dd className="mt-1">{format(new Date(agency.data.createdAt), "d MMM yyyy")}</dd></div>
            <div><dt className="font-mono text-[10px] uppercase tracking-[0.15em] text-muted-foreground">Your role</dt><dd className="mt-1" data-testid="text-settings-role">{roleLabel[user.role]}</dd></div>
          </dl>
        </section>
      )}

      <DemoDataCard />
      <section className="rounded-lg border bg-card mt-6 overflow-hidden">
        <div className="px-6 py-4 border-b"><h2 className="font-display text-xl">Roles and access</h2><p className="text-sm text-muted-foreground mt-1">Client viewers get assigned clients in a later release; for now they cannot open client profiles.</p></div>
        <table className="w-full text-sm">
          <thead><tr className="bg-secondary/50 font-mono text-[10px] uppercase tracking-[0.15em] text-muted-foreground"><th className="text-left font-normal px-6 py-2">Capability</th>{(["owner", "member", "client_viewer"] as const).map((r) => <th key={r} className={"font-normal px-3 py-2 " + (r === user.role ? "text-accent" : "")}>{roleLabel[r]}</th>)}</tr></thead>
          <tbody>{matrix.map(([l, ...v]) => <tr key={l} className="border-t"><td className="px-6 py-2.5">{l}</td>{v.map((ok, i) => <td key={i} className="text-center">{ok ? <Check className="h-4 w-4 inline text-[hsl(160_45%_36%)]" aria-label="Allowed" /> : <Minus className="h-4 w-4 inline text-muted-foreground/50" aria-label="Not allowed" />}</td>)}</tr>)}</tbody>
        </table>
      </section>

      {perms.viewSignals && (
        <Link href="/settings/signals" className="mt-6 flex items-center gap-4 rounded-lg border bg-card p-5 group hover:bg-secondary/40 transition-colors" data-testid="link-settings-signals">
          <Activity className="h-6 w-6 text-accent" />
          <div className="flex-1"><div className="font-medium">Signals</div><div className="text-sm text-muted-foreground">Catalogue of buying signals, weights, decay and EN/AR keywords</div></div>
          <ArrowRight className="h-4 w-4 group-hover:translate-x-1 transition-transform" />
        </Link>
      )}

      {perms.systemChecks && (
        <Link href="/settings/system" className="mt-6 flex items-center gap-4 rounded-lg border bg-primary text-primary-foreground p-5 group" data-testid="link-system-checks">
          <ShieldCheck className="h-6 w-6 text-accent" />
          <div className="flex-1"><div className="font-medium">Server configuration</div><div className="text-sm opacity-70">Live checks for database, email sender and AI keys</div></div>
          <ArrowRight className="h-4 w-4 group-hover:translate-x-1 transition-transform" />
        </Link>
      )}
    </div>
  );
}
