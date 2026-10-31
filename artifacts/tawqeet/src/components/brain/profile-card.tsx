import { useEffect, useRef, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { useSaveBrainProfile, type BrainProfileInput } from "@workspace/api-client-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { TagInput } from "@/components/tag-input";
import { apiErrorMessage } from "@/lib/api-error";
import { useToast } from "@/hooks/use-toast";
import { invalidateBrain, Panel } from "./shared";

export function ProfileCard({ id, profile }: { id: string; profile: BrainProfileInput }) {
  const qc = useQueryClient();
  const { toast } = useToast();
  const save = useSaveBrainProfile();
  const [form, setForm] = useState<BrainProfileInput>(profile);
  const [dirty, setDirty] = useState(false);
  const initFor = useRef<string | null>(null);

  useEffect(() => {
    // Only take server state on first load for this client, or when nothing is being edited.
    if (initFor.current !== id || !dirty) {
      initFor.current = id;
      setForm({ ...profile, topPains: [0, 1, 2].map((i) => profile.topPains[i] ?? "") });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [profile, id]);

  const set = <K extends keyof BrainProfileInput>(k: K, v: BrainProfileInput[K]) => { setForm((f) => ({ ...f, [k]: v })); setDirty(true); };
  const toggleLang = (l: "en" | "ar", on: boolean) => set("languages", on ? Array.from(new Set([...form.languages, l])) : form.languages.filter((x) => x !== l));

  const submit = () => {
    if (form.languages.length === 0) { toast({ title: "Pick at least one language", variant: "destructive" }); return; }
    const data = { ...form, topPains: form.topPains.map((p) => p.trim()).filter(Boolean).slice(0, 3) };
    save.mutate({ id, data }, {
      onSuccess: () => { setDirty(false); invalidateBrain(qc, id); toast({ title: "Brain profile saved" }); },
      onError: (e) => toast({ title: "Could not save profile", description: apiErrorMessage(e), variant: "destructive" }),
    });
  };

  const field = (k: "offer" | "whoYouSellTo" | "tone", label: string, hint: string) => (
    <div className="space-y-1.5">
      <Label htmlFor={"bp-" + k}>{label}</Label>
      <Textarea id={"bp-" + k} dir="auto" rows={3} value={form[k]} placeholder={hint} onChange={(e) => set(k, e.target.value)} data-testid={"input-profile-" + k} />
    </div>
  );

  return (
    <Panel label="Onboarding profile" title="What the client told us, verbatim" testid="card-brain-profile"
      aside={dirty ? <span className="text-[11px] font-mono text-accent" data-testid="status-profile-dirty">Unsaved</span> : null}>
      <fieldset disabled={save.isPending} className="grid min-w-0 md:grid-cols-2 gap-5">
        {field("offer", "Offer", "What exactly do they sell?")}
        {field("whoYouSellTo", "Who they sell to", "Titles, company types, regions")}
        <div className="space-y-1.5">
          <Label htmlFor="bp-deal">Typical deal size</Label>
          <Input id="bp-deal" dir="auto" value={form.dealSize} onChange={(e) => set("dealSize", e.target.value)} placeholder="e.g. SAR 180k ACV" data-testid="input-profile-dealSize" />
        </div>
        <div className="space-y-1.5">
          <Label>Languages</Label>
          <div className="flex gap-4 h-10 items-center">
            {(["en", "ar"] as const).map((l) => (
              <label key={l} className="flex items-center gap-2 text-sm">
                <Checkbox checked={form.languages.includes(l)} onCheckedChange={(v) => toggleLang(l, v === true)} data-testid={"checkbox-language-" + l} />
                {l === "en" ? "English" : "Arabic"}
              </label>
            ))}
          </div>
        </div>
        <div className="md:col-span-2 space-y-1.5">
          <Label>Top 3 pains</Label>
          <div className="grid md:grid-cols-3 gap-2">
            {[0, 1, 2].map((i) => (
              <Input key={i} dir="auto" value={form.topPains[i] ?? ""} placeholder={"Pain " + (i + 1)} data-testid={"input-profile-pain-" + i}
                onChange={(e) => { const p = [...form.topPains]; p[i] = e.target.value; set("topPains", p); }} />
            ))}
          </div>
        </div>
        <div className="space-y-1.5"><Label htmlFor="bp-proof">Proof points / case study notes</Label><TagInput id="bp-proof" testid="input-profile-proof" value={form.proofPoints} onChange={(v) => set("proofPoints", v)} placeholder="Type and press Enter" /></div>
        <div className="space-y-1.5"><Label htmlFor="bp-diff">Differentiators</Label><TagInput id="bp-diff" testid="input-profile-differentiators" value={form.differentiators} onChange={(v) => set("differentiators", v)} placeholder="Type and press Enter" /></div>
        {field("tone", "Tone", "How should the writing sound?")}
        <div className="space-y-1.5"><Label htmlFor="bp-words">Words to never use</Label><TagInput id="bp-words" testid="input-profile-words" value={form.wordsToNeverUse} onChange={(v) => set("wordsToNeverUse", v)} placeholder="e.g. synergy" /></div>
        <div className="md:col-span-2 space-y-1.5 rounded-md border border-destructive/25 bg-destructive/[0.03] p-3">
          <Label htmlFor="bp-nogo" className="text-destructive">No-go claims</Label>
          <TagInput id="bp-nogo" testid="input-profile-nogo" value={form.noGoClaims} onChange={(v) => set("noGoClaims", v)} placeholder="Claims we must never make" />
        </div>
      </fieldset>
      <div className="flex justify-end gap-2 mt-5">
        {dirty && <Button variant="ghost" disabled={save.isPending} onClick={() => { setDirty(false); setForm({ ...profile, topPains: [0, 1, 2].map((i) => profile.topPains[i] ?? "") }); }} data-testid="button-discard-profile">Discard</Button>}
        <Button onClick={submit} disabled={save.isPending || !dirty} data-testid="button-save-profile">{save.isPending ? "Saving" : "Save profile"}</Button>
      </div>
    </Panel>
  );
}
