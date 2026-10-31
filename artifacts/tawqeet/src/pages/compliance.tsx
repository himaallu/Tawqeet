import { useState, type FormEvent } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { useGetCompliance, getGetComplianceQueryKey, useAddSuppression, useRemoveSuppression, useCheckRecipient } from "@workspace/api-client-react";
import { ShieldCheck, Trash2, CheckCircle2, XCircle } from "lucide-react";
import { format } from "date-fns";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { Skeleton } from "@/components/ui/skeleton";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { ErrorPanel, PageHeader } from "@/components/states";
import { apiErrorMessage } from "@/lib/api-error";
import { useToast } from "@/hooks/use-toast";

export default function CompliancePage() {
  const qc = useQueryClient();
  const { toast } = useToast();
  const q = useGetCompliance({ query: { queryKey: getGetComplianceQueryKey() } });
  const add = useAddSuppression();
  const remove = useRemoveSuppression();
  const check = useCheckRecipient();
  const [value, setValue] = useState("");
  const [probe, setProbe] = useState("");
  const refresh = () => qc.invalidateQueries({ queryKey: getGetComplianceQueryKey() });
  const fail = (e: unknown) => toast({ title: "Action failed", description: apiErrorMessage(e), variant: "destructive" });

  const submit = (e: FormEvent) => {
    e.preventDefault();
    add.mutate({ data: { value: value.trim() } }, { onSuccess: (r) => { toast({ title: r.message }); setValue(""); refresh(); }, onError: fail });
  };
  const runCheck = (e: FormEvent) => { e.preventDefault(); check.mutate({ data: { email: probe.trim() } }, { onError: fail }); };

  return (
    <div className="rise">
      <PageHeader eyebrow="Settings" title="Compliance" />
      {q.isLoading ? <Skeleton className="h-64" /> : q.isError || !q.data ? <ErrorPanel message={apiErrorMessage(q.error)} onRetry={() => q.refetch()} /> : (
        <div className="space-y-10">
          <section>
            <h2 className="font-display text-2xl mb-3">Sending rules</h2>
            <ul className="rounded-lg border bg-card divide-y">
              {q.data.rules.map((r) => (
                <li key={r.key} className="flex items-start gap-4 p-4" data-testid={`rule-${r.key}`}>
                  <ShieldCheck className="h-4 w-4 text-accent mt-1 shrink-0" />
                  <div className="flex-1"><div className="font-medium">{r.label}</div><p className="text-sm text-muted-foreground">{r.description}</p></div>
                  <div className="flex items-center gap-2"><span className="font-mono text-[10px] uppercase text-muted-foreground">{r.enabled ? "On" : "Off"}</span>
                    <Switch checked={r.enabled} disabled aria-label={`${r.label} is ${r.enabled ? "on" : "off"} (enforced)`} /></div>
                </li>
              ))}
            </ul>
            <p className="text-xs text-muted-foreground mt-2">Enforced server-side for every send. Blocked free-mail domains: {q.data.freeMailDomains.join(", ")}.</p>
          </section>

          <section>
            <h2 className="font-display text-2xl mb-3">Check an address</h2>
            <form onSubmit={runCheck} className="flex gap-2 max-w-xl">
              <Input value={probe} onChange={(e) => setProbe(e.target.value)} placeholder="name@gmail.com" data-testid="input-check-email" />
              <Button type="submit" variant="outline" disabled={check.isPending || !probe.trim()} data-testid="button-check-email">Check</Button>
            </form>
            {check.data && (
              <div className={"mt-3 text-sm flex gap-2 " + (check.data.allowed ? "text-accent" : "text-destructive")} data-testid="text-check-result">
                {check.data.allowed ? <><CheckCircle2 className="h-4 w-4 mt-0.5" />Allowed</> : <><XCircle className="h-4 w-4 mt-0.5" />Blocked: {check.data.reasons.join("; ")}</>}
              </div>
            )}
          </section>

          <section>
            <h2 className="font-display text-2xl mb-3">Suppression list</h2>
            <form onSubmit={submit} className="flex gap-2 max-w-xl mb-3">
              <Input value={value} onChange={(e) => setValue(e.target.value)} placeholder="email@company.com or company.com" data-testid="input-suppression" />
              <Button type="submit" disabled={add.isPending || !value.trim()} data-testid="button-add-suppression">Add</Button>
            </form>
            {q.data.suppression.length === 0 ? <p className="text-sm text-muted-foreground">No suppressed contacts.</p> : (
              <div className="rounded-lg border bg-card overflow-x-auto">
                <Table>
                  <TableHeader><TableRow><TableHead>Email or domain</TableHead><TableHead>Reason</TableHead><TableHead>Added</TableHead><TableHead /></TableRow></TableHeader>
                  <TableBody>
                    {q.data.suppression.map((s) => (
                      <TableRow key={s.id}>
                        <TableCell className="font-mono text-sm">{s.email ?? `*@${s.domain}`}</TableCell>
                        <TableCell className="text-muted-foreground">{s.reason}</TableCell>
                        <TableCell className="font-mono text-xs">{format(new Date(s.createdAt), "d MMM yyyy")}</TableCell>
                        <TableCell className="text-right"><Button size="sm" variant="ghost" aria-label="Remove" disabled={remove.isPending}
                          onClick={() => remove.mutate({ id: s.id }, { onSuccess: () => { toast({ title: "Removed" }); refresh(); }, onError: fail })}><Trash2 className="h-4 w-4" /></Button></TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            )}
          </section>

          <section>
            <h2 className="font-display text-2xl mb-3">Audit log</h2>
            {q.data.audit.length === 0 ? <p className="text-sm text-muted-foreground">No audited actions yet.</p> : (
              <div className="rounded-lg border bg-card overflow-x-auto">
                <Table>
                  <TableHeader><TableRow><TableHead>When</TableHead><TableHead>Action</TableHead><TableHead>Target</TableHead><TableHead>By</TableHead></TableRow></TableHeader>
                  <TableBody>
                    {q.data.audit.map((a) => (
                      <TableRow key={a.id}>
                        <TableCell className="whitespace-nowrap font-mono text-xs">{format(new Date(a.createdAt), "d MMM HH:mm")}</TableCell>
                        <TableCell className="font-mono text-xs">{a.action}</TableCell>
                        <TableCell dir="auto" className="text-sm">{a.target}</TableCell>
                        <TableCell className="text-xs text-muted-foreground">{a.actor ?? "—"}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            )}
          </section>
        </div>
      )}
    </div>
  );
}
