import { useState, type FormEvent, type ReactNode } from "react";
import type { Client, ClientInput } from "@workspace/api-client-react";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { TagInput } from "@/components/tag-input";

function Field({ label, htmlFor, hint, error, children }: { label: string; htmlFor: string; hint?: string; error?: string; children: ReactNode }) {
  return (
    <div>
      <Label htmlFor={htmlFor} className="text-xs uppercase tracking-wider text-muted-foreground">{label}</Label>
      <div className="mt-1.5">{children}</div>
      {error ? <p role="alert" className="text-xs text-destructive mt-1">{error}</p> : hint ? <p className="text-xs text-muted-foreground mt-1">{hint}</p> : null}
    </div>
  );
}

export function ClientForm({ initial, submitLabel, pending, serverError, onSubmit, onCancel }: {
  initial?: Client; submitLabel: string; pending: boolean; serverError?: string | null; onSubmit: (d: ClientInput) => void; onCancel: () => void;
}) {
  const [name, setName] = useState(initial?.name ?? "");
  const [website, setWebsite] = useState(initial?.website ?? "");
  const [verticals, setVerticals] = useState<string[]>(initial?.verticals ?? []);
  const [regions, setRegions] = useState<string[]>(initial?.regions ?? []);
  const [languages, setLanguages] = useState<string[]>(initial?.languages ?? []);
  const [offer, setOffer] = useState(initial?.offer ?? "");
  const [tone, setTone] = useState(initial?.tone ?? "");
  const [noGo, setNoGo] = useState<string[]>(initial?.noGoClaims ?? []);
  const [icp, setIcp] = useState(JSON.stringify(initial?.icp ?? {}, null, 2));
  const [errs, setErrs] = useState<Record<string, string>>({});

  const submit = (e: FormEvent) => {
    e.preventDefault();
    const n: Record<string, string> = {};
    if (!name.trim()) n.name = "Name is required.";
    else if (name.trim().length > 160) n.name = "Keep it under 160 characters.";
    const w = website.trim();
    if (w) { try { const u = new URL(w); if (!/^https?:$/.test(u.protocol)) throw 0; } catch { n.website = "Use a full http:// or https:// address, or leave empty."; } }
    let parsed: Record<string, unknown> = {};
    try { const p = JSON.parse(icp.trim() || "{}"); if (!p || typeof p !== "object" || Array.isArray(p)) throw 0; parsed = p; }
    catch { n.icp = "ICP must be a valid JSON object, e.g. { \"titles\": [\"CFO\"] }."; }
    if (offer.length > 10000) n.offer = "Offer is limited to 10,000 characters.";
    if (tone.length > 1000) n.tone = "Tone is limited to 1,000 characters.";
    setErrs(n);
    if (Object.keys(n).length) return;
    onSubmit({ name: name.trim(), website: w, verticals, regions, languages, offer, icp: parsed, tone, noGoClaims: noGo });
  };

  return (
    <form onSubmit={submit} noValidate className="space-y-5">
      <div className="grid md:grid-cols-2 gap-5">
        <Field label="Client name" htmlFor="c-name" error={errs.name}><Input id="c-name" dir="auto" value={name} onChange={(e) => setName(e.target.value)} className="bg-card" data-testid="input-client-name" /></Field>
        <Field label="Website" htmlFor="c-web" hint="Optional" error={errs.website}><Input id="c-web" value={website} onChange={(e) => setWebsite(e.target.value)} placeholder="https://" className="bg-card" data-testid="input-client-website" /></Field>
      </div>
      <div className="grid md:grid-cols-3 gap-5">
        <Field label="Verticals" htmlFor="c-vert" hint="Enter or comma to add"><TagInput id="c-vert" value={verticals} onChange={setVerticals} placeholder="Fintech, Logistics" testid="input-client-verticals" /></Field>
        <Field label="Regions" htmlFor="c-reg"><TagInput id="c-reg" value={regions} onChange={setRegions} placeholder="UAE, KSA" testid="input-client-regions" /></Field>
        <Field label="Languages" htmlFor="c-lang"><TagInput id="c-lang" value={languages} onChange={setLanguages} placeholder="English, Arabic" testid="input-client-languages" /></Field>
      </div>
      <Field label="Offer" htmlFor="c-offer" error={errs.offer}><Textarea id="c-offer" dir="auto" rows={4} value={offer} onChange={(e) => setOffer(e.target.value)} className="bg-card" placeholder="What the client sells and why it matters to buyers" data-testid="input-client-offer" /></Field>
      <div className="grid md:grid-cols-2 gap-5">
        <Field label="Tone" htmlFor="c-tone" error={errs.tone}><Textarea id="c-tone" dir="auto" rows={5} value={tone} onChange={(e) => setTone(e.target.value)} className="bg-card" placeholder="Formal, warm, no slang. Arabic greetings for KSA." data-testid="input-client-tone" /></Field>
        <Field label="Ideal customer profile (JSON)" htmlFor="c-icp" error={errs.icp}><Textarea id="c-icp" dir="auto" rows={5} value={icp} onChange={(e) => setIcp(e.target.value)} spellCheck={false} className="bg-card font-mono text-xs" data-testid="input-client-icp" /></Field>
      </div>
      <Field label="No-go claims" htmlFor="c-nogo" hint="Statements outreach must never make"><TagInput id="c-nogo" value={noGo} onChange={setNoGo} placeholder="Guaranteed ROI" testid="input-client-nogo" /></Field>
      {serverError && <p role="alert" className="text-sm text-destructive" data-testid="text-form-error">{serverError}</p>}
      <div className="flex justify-end gap-2 pt-2">
        <Button type="button" variant="ghost" onClick={onCancel} data-testid="button-cancel">Cancel</Button>
        <Button type="submit" disabled={pending} data-testid="button-save-client">{pending ? "Saving" : submitLabel}</Button>
      </div>
    </form>
  );
}
