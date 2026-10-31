import { BookOpen, Pencil, Plus, Trash2 } from "lucide-react";
import * as React from "react";
import { SIGNAL_ICON } from "@/components/heat";
import { PageHeader } from "@/components/page";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import { Field, Input, Select, Textarea } from "@/components/ui/input";
import { Empty, Skeleton } from "@/components/ui/misc";
import { api, useAction, useApi } from "@/lib/api";

type Play = { id: string; signalKey: string; persona: string; vertical: string; language: string; name: string; structure: string; principles: string };
type Def = { key: string; name: string };
const PERSONAS = ["any", "c_level", "hr", "finance", "operations", "sales", "it", "marketing"];

function PlayForm({ play, defs, onDone }: { play: Partial<Play>; defs: Def[]; onDone: () => void }) {
  const [f, setF] = React.useState({ signalKey: defs[0]?.key ?? "", persona: "any", vertical: "any", language: "en", name: "", structure: "", principles: "", ...play });
  const save = useAction(() => (play.id ? api(`/plays/${play.id}`, { method: "PATCH", json: f }) : api("/plays", { method: "POST", json: f })), { invalidate: [["plays"]], success: "Play saved", onSuccess: onDone });
  const ar = f.language === "ar";
  return (
    <form className="grid gap-3 sm:grid-cols-2" onSubmit={(e) => (e.preventDefault(), save.mutate())}>
      <Field label="Name" className="sm:col-span-2"><Input required value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} /></Field>
      <Field label="Signal">
        <Select value={f.signalKey} onChange={(e) => setF({ ...f, signalKey: e.target.value })}>
          {defs.map((d) => <option key={d.key} value={d.key}>{d.name}</option>)}
        </Select>
      </Field>
      <Field label="Persona">
        <Select value={f.persona} onChange={(e) => setF({ ...f, persona: e.target.value })}>
          {PERSONAS.map((p) => <option key={p} value={p}>{p.replace("_", "-")}</option>)}
        </Select>
      </Field>
      <Field label="Vertical" hint='"any" or e.g. Retail'><Input value={f.vertical} onChange={(e) => setF({ ...f, vertical: e.target.value })} /></Field>
      <Field label="Language">
        <Select value={f.language} onChange={(e) => setF({ ...f, language: e.target.value })}>
          <option value="en">English</option>
          <option value="ar">Arabic (written natively)</option>
        </Select>
      </Field>
      <Field label="Structure" className="sm:col-span-2"><Textarea dir={ar ? "rtl" : "auto"} required rows={5} value={f.structure} onChange={(e) => setF({ ...f, structure: e.target.value })} /></Field>
      <Field label="Principles" className="sm:col-span-2"><Textarea dir={ar ? "rtl" : "auto"} required rows={6} value={f.principles} onChange={(e) => setF({ ...f, principles: e.target.value })} /></Field>
      <div className="flex justify-end gap-2 sm:col-span-2">
        <Button type="button" variant="ghost" onClick={onDone}>Cancel</Button>
        <Button variant="primary" loading={save.isPending}>Save play</Button>
      </div>
    </form>
  );
}

export function PlaysPage() {
  const plays = useApi<Play[]>(["plays"], "/plays");
  const defs = useApi<Def[]>(["defs"], "/signal-definitions");
  const [editing, setEditing] = React.useState<Partial<Play> | null>(null);
  const [lang, setLang] = React.useState<"en" | "ar">("en");
  const del = useAction((id: string) => api(`/plays/${id}`, { method: "DELETE" }), { invalidate: [["plays"]], success: "Play deleted" });
  const byKey = (defs.data ?? []).map((d) => ({ def: d, plays: (plays.data ?? []).filter((p) => p.signalKey === d.key && p.language === lang) })).filter((g) => g.plays.length);

  return (
    <>
      <PageHeader
        title="Plays"
        description="How to write for each signal. The writer picks the closest play by signal → persona → vertical → language."
        actions={
          <>
            <div className="inline-flex rounded-lg bg-surface-3/70 p-0.5">
              {(["en", "ar"] as const).map((l) => (
                <button key={l} onClick={() => setLang(l)} className={`h-7 rounded-md px-3 text-[12.5px] font-medium ${lang === l ? "bg-surface shadow-card" : "text-ink-2"}`}>
                  {l === "en" ? "English" : "العربية"}
                </button>
              ))}
            </div>
            <Button variant="primary" onClick={() => setEditing({ language: lang })}><Plus /> New play</Button>
          </>
        }
      />
      {plays.isLoading ? (
        <Skeleton className="h-96 rounded-xl" />
      ) : !byKey.length ? (
        <Empty icon={<BookOpen />} title="No plays in this language" />
      ) : (
        <div className="grid gap-3 md:grid-cols-2">
          {byKey.flatMap((g) =>
            g.plays.map((p) => (
              <Card key={p.id} className="flex min-w-0 flex-col p-4">
                <div className="flex items-start gap-3">
                  <span className="grid size-8 shrink-0 place-items-center rounded-lg bg-surface-3 text-ink-2">{SIGNAL_ICON[p.signalKey] ?? "•"}</span>
                  <div className="min-w-0 flex-1">
                    <div className="truncate text-[14px] font-semibold">{p.name}</div>
                    <div className="mt-0.5 flex flex-wrap gap-1">
                      <Badge tone="outline">{g.def.name}</Badge>
                      {p.persona !== "any" && <Badge>{p.persona.replace("_", "-")}</Badge>}
                      {p.vertical !== "any" && <Badge>{p.vertical}</Badge>}
                    </div>
                  </div>
                  <Button size="icon-sm" variant="ghost" onClick={() => setEditing(p)} aria-label="Edit"><Pencil /></Button>
                  <Button size="icon-sm" variant="ghost" onClick={() => del.mutate(p.id)} aria-label="Delete"><Trash2 /></Button>
                </div>
                <p dir="auto" className="mt-3 whitespace-pre-line text-[12.5px] leading-relaxed text-ink-2">{p.structure}</p>
              </Card>
            )),
          )}
        </div>
      )}
      <Dialog open={!!editing} onOpenChange={(o) => !o && setEditing(null)}>
        <DialogContent title={editing?.id ? "Edit play" : "New play"} wide>
          {editing && defs.data && <PlayForm play={editing} defs={defs.data} onDone={() => setEditing(null)} />}
        </DialogContent>
      </Dialog>
    </>
  );
}
