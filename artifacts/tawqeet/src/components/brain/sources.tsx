import { useRef, useState, type ChangeEvent } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { useCrawlBrainWebsite, useExtractBrainCaseStudies, useRequestBrainUpload, useImportBrainCsv, useImportBrainHubspot, type BrainImportResult, type BrainResponseStatus } from "@workspace/api-client-react";
import { Globe, FileUp, Link2, Table, Database, Lock } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { apiErrorMessage } from "@/lib/api-error";
import { useToast } from "@/hooks/use-toast";
import { invalidateBrain, Panel, ConfigNote, ImportResultView } from "./shared";

const DOC_TYPES: Record<string, string> = {
  pdf: "application/pdf",
  docx: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  pptx: "application/vnd.openxmlformats-officedocument.presentationml.presentation",
};

export function Sources({ id, clientName, status, defaultUrl }: { id: string; clientName: string; status: BrainResponseStatus; defaultUrl: string }) {
  const qc = useQueryClient();
  const { toast } = useToast();
  const fail = (title: string) => (e: unknown) => toast({ title, description: apiErrorMessage(e), variant: "destructive" });

  const crawl = useCrawlBrainWebsite();
  const [site, setSite] = useState(defaultUrl);
  const extract = useExtractBrainCaseStudies();
  const reqUpload = useRequestBrainUpload();
  const [caseUrl, setCaseUrl] = useState("");
  const [uploading, setUploading] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);
  const csvImport = useImportBrainCsv();
  const [kind, setKind] = useState<"contacts" | "won_deals">("contacts");
  const csvRef = useRef<HTMLInputElement>(null);
  const [csvResult, setCsvResult] = useState<BrainImportResult | null>(null);
  const hub = useImportBrainHubspot();
  const [hubConfirm, setHubConfirm] = useState(false);
  const [hubResult, setHubResult] = useState<BrainImportResult | null>(null);
  const [crawlResult, setCrawlResult] = useState<BrainImportResult | null>(null);

  const extracted = (r: BrainImportResult) => { invalidateBrain(qc, id); toast({ title: "Drafts extracted", description: `${r.imported} draft case studies added for review. None are approved.` }); };

  const onFile = async (e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    const ext = file.name.split(".").pop()?.toLowerCase() ?? "";
    const ct = DOC_TYPES[ext];
    if (!ct) { toast({ title: "Unsupported file", description: "Only PDF, DOCX or PPTX.", variant: "destructive" }); return; }
    if (file.size > 10 * 1024 * 1024) { toast({ title: "File too large", description: "Maximum 10 MB.", variant: "destructive" }); return; }
    setUploading(true);
    try {
      const { uploadUrl, objectPath } = await reqUpload.mutateAsync({ id, data: { name: file.name, size: file.size, contentType: ct } });
      const put = await fetch(uploadUrl, { method: "PUT", body: file, headers: { "Content-Type": ct } });
      if (!put.ok) throw new Error("Upload to storage failed (" + put.status + ")");
      const r = await extract.mutateAsync({ id, data: { objectPath } });
      extracted(r);
    } catch (err) {
      fail("Upload or extraction failed")(err);
    } finally { setUploading(false); }
  };

  const onCsv = async (e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    if (file.size > 1024 * 1024) { toast({ title: "CSV too large", description: "Maximum 1 MB.", variant: "destructive" }); return; }
    const csv = await file.text();
    if (!csv.trim()) { toast({ title: "CSV is empty", variant: "destructive" }); return; }
    csvImport.mutate({ id, data: { csv, kind } }, {
      onSuccess: (r) => { setCsvResult(r); invalidateBrain(qc, id); toast({ title: "CSV imported", description: r.message }); },
      onError: fail("CSV import failed"),
    });
  };

  const busyDoc = uploading || extract.isPending;

  return (
    <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
      <Panel label="Website" title="Crawl the client's site" aside={<Globe className="h-4 w-4 text-muted-foreground" />} testid="panel-crawl">
        {!status.aiConfigured && <ConfigNote testid="status-crawl-ai-config">{status.aiMessage}</ConfigNote>}
        <form className="flex flex-col sm:flex-row gap-2" onSubmit={(e) => { e.preventDefault(); if (!site.trim()) return; crawl.mutate({ id, data: { url: site.trim() } }, { onSuccess: (r) => { setCrawlResult(r); invalidateBrain(qc, id); toast({ title: "Website crawled", description: r.message }); }, onError: fail("Crawl failed") }); }}>
          <Input type="url" required value={site} onChange={(e) => setSite(e.target.value)} placeholder="https://client.com" className="font-mono text-sm" data-testid="input-crawl-url" />
          <Button type="submit" disabled={crawl.isPending || !status.aiConfigured} data-testid="button-crawl">{crawl.isPending ? "Crawling" : "Crawl"}</Button>
        </form>
        <p className="text-xs text-muted-foreground mt-2">Reads the homepage and up to 10 pages on the same domain. Extraction merges into this client's profile. Review the result before using it.</p>
        {crawlResult && <ImportResultView r={crawlResult} testid="status-crawl-result" />}
      </Panel>

      <Panel label="Case study extraction" title="Drafts from documents or links" aside={<FileUp className="h-4 w-4 text-muted-foreground" />} testid="panel-extract">
        <div className="space-y-3">
          {!status.aiConfigured && <ConfigNote testid="status-ai-config">{status.aiMessage || "AI extraction is not configured."}</ConfigNote>}
          {!status.storageConfigured && <ConfigNote testid="status-storage-config">File storage is not configured, so document upload is unavailable.</ConfigNote>}
          <input ref={fileRef} type="file" hidden accept=".pdf,.docx,.pptx" onChange={onFile} data-testid="input-case-file" />
          <Button variant="outline" className="w-full h-auto min-h-10 whitespace-normal" disabled={busyDoc || !status.aiConfigured || !status.storageConfigured} onClick={() => fileRef.current?.click()} data-testid="button-upload-doc">
            <FileUp className="h-4 w-4 mr-1.5" />{busyDoc ? "Uploading and extracting" : "Upload PDF, DOCX or PPTX (max 10 MB)"}
          </Button>
          <form className="flex flex-col sm:flex-row gap-2" onSubmit={(e) => { e.preventDefault(); if (!caseUrl.trim()) return; extract.mutate({ id, data: { url: caseUrl.trim() } }, { onSuccess: (r) => { setCaseUrl(""); extracted(r); }, onError: fail("Extraction failed") }); }}>
            <Input type="url" value={caseUrl} onChange={(e) => setCaseUrl(e.target.value)} placeholder="Paste a case study URL" className="font-mono text-sm" data-testid="input-extract-url" />
            <Button type="submit" disabled={busyDoc || !status.aiConfigured || !caseUrl.trim()} data-testid="button-extract-url"><Link2 className="h-4 w-4 mr-1.5" />Extract</Button>
          </form>
          <p className="text-xs text-muted-foreground">Extracted drafts are never approved automatically. Review each in the Case Studies tab.</p>
        </div>
      </Panel>

      <Panel label="CRM file" title="Upload a CSV export" aside={<Table className="h-4 w-4 text-muted-foreground" />} testid="panel-csv">
        <div className="space-y-3">
          <div className="flex gap-2">
            {(["contacts", "won_deals"] as const).map((k) => <Button key={k} size="sm" variant={kind === k ? "default" : "outline"} onClick={() => setKind(k)} data-testid={"button-csv-kind-" + k}>{k === "contacts" ? "Contacts" : "Won deals"}</Button>)}
          </div>
          <p className="text-xs text-muted-foreground" data-testid="text-csv-headers">
            {kind === "contacts"
              ? <>Headers: <code>email</code>, <code>firstname</code>, <code>lastname</code>, <code>company</code>, <code>industry</code>.</>
              : <>Headers: <code>dealname</code>, <code>amount</code>, <code>dealstage</code>, <code>industry</code>. Only closed-won rows are kept.</>}
            {" "}Max 1 MB. Re-importing the same file de-duplicates.
          </p>
          <input ref={csvRef} type="file" hidden accept=".csv,text/csv" onChange={onCsv} data-testid="input-csv-file" />
          <Button variant="outline" className="w-full" disabled={csvImport.isPending} onClick={() => csvRef.current?.click()} data-testid="button-upload-csv">{csvImport.isPending ? "Importing" : "Choose CSV"}</Button>
          {csvResult && <ImportResultView r={csvResult} testid="status-csv-result" />}
        </div>
      </Panel>

      <Panel label="Connected CRM" title="HubSpot" aside={<Database className="h-4 w-4 text-muted-foreground" />} testid="panel-hubspot">
        <div className="space-y-3">
          <p className="text-xs text-muted-foreground">Imports from the agency's connected HubSpot. The connection is shared across all clients, so confirm this data belongs to <strong dir="auto">{clientName}</strong> before importing.</p>
          {!status.hubspotConfigured && <ConfigNote testid="status-hubspot-config">HubSpot is not connected for this agency.</ConfigNote>}
          <Button className="w-full" disabled={!status.hubspotConfigured || hub.isPending} onClick={() => setHubConfirm(true)} data-testid="button-hubspot-import">{hub.isPending ? "Importing" : "Import from HubSpot"}</Button>
          <Button variant="outline" className="w-full h-auto min-h-10 whitespace-normal" disabled data-testid="button-oauth-soon"><Lock className="h-4 w-4 mr-1.5 shrink-0" />Connect client's own CRM (OAuth) - coming soon</Button>
          {hubResult && <ImportResultView r={hubResult} testid="status-hubspot-result" />}
        </div>
      </Panel>

      <AlertDialog open={hubConfirm} onOpenChange={setHubConfirm}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle className="font-display text-2xl">Import HubSpot into {clientName}?</AlertDialogTitle>
            <AlertDialogDescription>This pulls companies and closed-won deals from the agency's shared HubSpot connection into this client's Brain only. Make sure the portal holds this client's data.</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel data-testid="button-cancel-hubspot">Cancel</AlertDialogCancel>
            <AlertDialogAction disabled={hub.isPending} data-testid="button-confirm-hubspot" onClick={(e) => {
              e.preventDefault();
              hub.mutate({ id }, {
                onSuccess: (r) => { setHubResult(r); setHubConfirm(false); invalidateBrain(qc, id); toast({ title: "HubSpot imported", description: r.message }); },
                onError: (err) => { setHubConfirm(false); fail("HubSpot import failed")(err); },
              });
            }}>{hub.isPending ? "Importing" : "Yes, import for this client"}</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
