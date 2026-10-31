import { useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { useListPlays, getListPlaysQueryKey, useCreatePlay, useUpdatePlay, type Play, type PlayInputLanguage } from "@workspace/api-client-react";
import { Plus, Pencil } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { ErrorPanel, PageHeader } from "@/components/states";
import { apiErrorMessage } from "@/lib/api-error";
import { useToast } from "@/hooks/use-toast";

type Editing = { id?: string; signalKey: string; language: PlayInputLanguage; name: string; structure: string; principles: string; persona: string };

export default function PlaysPage() {
  const q = useListPlays({ query: { queryKey: getListPlaysQueryKey() } });
  const [lang, setLang] = useState<PlayInputLanguage>("en");
  const [editing, setEditing] = useState<Editing | null>(null);
  const open = (signalKey: string, hint: string, p?: Play) => setEditing(p
    ? { id: p.id, signalKey, language: p.language, name: p.name, structure: p.structure, principles: p.principles, persona: p.persona ?? "" }
    : { signalKey, language: lang, name: "", structure: lang === "ar" ? "" : `Open with the signal. ${hint}`.trim(), principles: "", persona: "" });

  return (
    <div className="rise">
      <PageHeader eyebrow="Workspace" title="Plays">
        <div className="flex rounded-md border overflow-hidden" role="tablist">
          {(["en", "ar"] as const).map((l) => (
            <button key={l} role="tab" aria-selected={lang === l} onClick={() => setLang(l)} data-testid={`tab-lang-${l}`}
              className={"px-3 py-1.5 text-sm " + (lang === l ? "bg-primary text-primary-foreground" : "bg-card")}>{l === "en" ? "English" : "العربية"}</button>
          ))}
        </div>
      </PageHeader>
      <p className="text-sm text-muted-foreground mb-6 max-w-2xl">A play is the email recipe the writer follows for a buying signal: the structure, the principles, and who it targets. One play per signal and language.</p>
      {q.isLoading ? <Skeleton className="h-64" /> : q.isError || !q.data ? <ErrorPanel message={apiErrorMessage(q.error)} onRetry={() => q.refetch()} /> : (
        <div className="grid md:grid-cols-2 gap-3">
          {q.data.signals.map((s) => {
            const play = q.data!.plays.find((p) => p.signalKey === s.key && p.language === lang);
            return (
              <div key={s.key} className="rounded-lg border bg-card p-4 flex flex-col gap-2" data-testid={`card-play-${s.key}`}>
                <div className="flex items-start gap-2">
                  <div className="flex-1"><div className="font-medium">{s.name}</div><div className="font-mono text-[10px] text-muted-foreground">{s.key}</div></div>
                  <Button size="sm" variant="outline" onClick={() => open(s.key, s.playHint, play)} data-testid={`button-edit-play-${s.key}`}>
                    {play ? <><Pencil className="h-3.5 w-3.5 mr-1.5" />Edit</> : <><Plus className="h-3.5 w-3.5 mr-1.5" />Add play</>}
                  </Button>
                </div>
                {play ? (
                  <div dir={lang === "ar" ? "rtl" : "ltr"} className="text-sm"><div className="font-medium">{play.name}</div><p className="text-muted-foreground whitespace-pre-wrap line-clamp-3">{play.structure}</p></div>
                ) : <p className="text-xs text-muted-foreground">Hint: {s.playHint || "—"}</p>}
              </div>
            );
          })}
        </div>
      )}
      <Dialog open={!!editing} onOpenChange={(o) => !o && setEditing(null)}>
        <DialogContent className="max-w-xl">{editing && <PlayForm value={editing} onDone={() => setEditing(null)} />}</DialogContent>
      </Dialog>
    </div>
  );
}

function PlayForm({ value, onDone }: { value: Editing; onDone: () => void }) {
  const qc = useQueryClient();
  const { toast } = useToast();
  const [v, setV] = useState(value);
  const create = useCreatePlay(), update = useUpdatePlay();
  const pending = create.isPending || update.isPending;
  const dir = v.language === "ar" ? "rtl" : "ltr";
  const save = () => {
    const data = { signalKey: v.signalKey, language: v.language, name: v.name, structure: v.structure, principles: v.principles, persona: v.persona || null };
    const opts = { onSuccess: () => { toast({ title: "Play saved" }); qc.invalidateQueries({ queryKey: getListPlaysQueryKey() }); onDone(); },
      onError: (e: unknown) => toast({ title: "Could not save", description: apiErrorMessage(e), variant: "destructive" }) };
    if (v.id) update.mutate({ id: v.id, data }, opts); else create.mutate({ data }, opts);
  };
  return (
    <>
      <DialogHeader><DialogTitle>{v.id ? "Edit play" : "New play"} · {v.signalKey} · {v.language.toUpperCase()}</DialogTitle></DialogHeader>
      <div className="space-y-3" dir={dir}>
        <div><Label>Name</Label><Input value={v.name} onChange={(e) => setV({ ...v, name: e.target.value })} className="mt-1" data-testid="input-play-name" /></div>
        <div><Label>Target persona</Label><Input value={v.persona} onChange={(e) => setV({ ...v, persona: e.target.value })} className="mt-1" placeholder="e.g. Head of Sales" /></div>
        <div><Label>Structure</Label><Textarea rows={5} value={v.structure} onChange={(e) => setV({ ...v, structure: e.target.value })} className="mt-1" data-testid="input-play-structure" /></div>
        <div><Label>Principles</Label><Textarea rows={4} value={v.principles} onChange={(e) => setV({ ...v, principles: e.target.value })} className="mt-1" /></div>
        <Button disabled={pending || !v.name.trim() || !v.structure.trim()} onClick={save} data-testid="button-save-play">{pending ? "Saving" : "Save play"}</Button>
      </div>
    </>
  );
}
