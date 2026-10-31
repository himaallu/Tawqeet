import { Mail, Info } from "lucide-react";
import { Button } from "@/components/ui/button";
import { PageHeader } from "@/components/states";

const providers = [
  { key: "gmail", name: "Gmail / Google Workspace", scope: "gmail.send", note: "Send-only scope: Tawqeet can send as the mailbox but cannot read, list or delete email." },
  { key: "outlook", name: "Outlook / Microsoft 365", scope: "Mail.Send", note: "Send-only scope: Tawqeet can send as the mailbox but cannot read the inbox." },
];

export default function MailboxesPage() {
  return (
    <div className="rise max-w-3xl">
      <PageHeader eyebrow="Settings" title="Mailboxes" />
      <div className="mb-6 rounded-md border border-accent/40 bg-accent/10 p-3 text-sm flex gap-2" data-testid="status-mailboxes">
        <Info className="h-4 w-4 text-accent shrink-0 mt-0.5" />
        <span><span className="font-medium">Coming next:</span> client mailbox connections. During the demo, approved emails are sent via Resend to the demo recipient only.</span>
      </div>
      <div className="space-y-3">
        {providers.map((p) => (
          <div key={p.key} className="rounded-lg border bg-card p-5 flex flex-col md:flex-row md:items-center gap-4" data-testid={`card-mailbox-${p.key}`}>
            <Mail className="h-5 w-5 text-accent" />
            <div className="flex-1">
              <div className="font-medium">{p.name}</div>
              <p className="text-sm text-muted-foreground">{p.note}</p>
              <div className="font-mono text-[10px] uppercase text-muted-foreground mt-1">Scope: {p.scope} · daily cap 30 · status: not connected</div>
            </div>
            <Button variant="outline" disabled title="Coming next" data-testid={`button-connect-${p.key}`}>Connect {p.key === "gmail" ? "Gmail" : "Outlook"}</Button>
          </div>
        ))}
      </div>
    </div>
  );
}
