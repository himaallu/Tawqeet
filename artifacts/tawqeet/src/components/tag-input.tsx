import { useState, type KeyboardEvent } from "react";
import { X } from "lucide-react";

export function TagInput({ value, onChange, placeholder, id, testid }: { value: string[]; onChange: (v: string[]) => void; placeholder?: string; id: string; testid: string }) {
  const [draft, setDraft] = useState("");
  const add = () => {
    const parts = draft.split(",").map((s) => s.trim()).filter(Boolean).filter((s) => !value.includes(s));
    if (parts.length) onChange([...value, ...parts]);
    setDraft("");
  };
  const onKey = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Enter" || e.key === ",") { e.preventDefault(); add(); }
    else if (e.key === "Backspace" && !draft && value.length) onChange(value.slice(0, -1));
  };
  return (
    <div className="flex flex-wrap gap-1.5 rounded-md border border-input bg-card px-2 py-1.5 min-h-10 focus-within:ring-2 focus-within:ring-ring/40">
      {value.map((t) => (
        <span key={t} dir="auto" className="inline-flex items-center gap-1 rounded-sm bg-secondary px-2 py-0.5 text-xs">
          {t}<button type="button" aria-label={"Remove " + t} onClick={() => onChange(value.filter((x) => x !== t))} className="text-muted-foreground hover:text-destructive"><X className="h-3 w-3" /></button>
        </span>
      ))}
      <input id={id} dir="auto" value={draft} onChange={(e) => setDraft(e.target.value)} onKeyDown={onKey} onBlur={add}
        placeholder={value.length ? "" : placeholder} data-testid={testid}
        className="flex-1 min-w-[8rem] bg-transparent text-sm outline-none py-1 placeholder:text-muted-foreground" />
    </div>
  );
}
