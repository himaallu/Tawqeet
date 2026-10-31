import { Link, useParams } from "wouter";
import { useGetBrain, getGetBrainQueryKey, useGetClient, getGetClientQueryKey, type User } from "@workspace/api-client-react";
import { ArrowLeft } from "lucide-react";
import { format } from "date-fns";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Skeleton } from "@/components/ui/skeleton";
import { ErrorPanel, Restricted, PageHeader } from "@/components/states";
import { can } from "@/lib/roles";
import { apiErrorMessage, apiStatus } from "@/lib/api-error";
import { ProfileCard } from "@/components/brain/profile-card";
import { CaseStudies } from "@/components/brain/case-studies";
import { Sources } from "@/components/brain/sources";
import { Learnings } from "@/components/brain/learnings";

export default function ClientBrainPage({ user }: { user: User }) {
  const { id = "" } = useParams<{ id: string }>();
  const perms = can(user);
  const client = useGetClient(id, { query: { enabled: !!id && perms.viewClients, queryKey: getGetClientQueryKey(id), staleTime: 30_000 } });
  const brain = useGetBrain(id, { query: { enabled: !!id && perms.viewClients, queryKey: getGetBrainQueryKey(id), staleTime: 30_000, refetchOnMount: true, notifyOnChangeProps: "all" } });

  if (!perms.viewClients) return <Restricted title="Client Brains are staff only">Ask the agency owner for access.</Restricted>;

  const back = <Link href={"/clients/" + id} className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground mb-5" data-testid="link-back-client"><ArrowLeft className="h-4 w-4" />Client profile</Link>;

  if (client.isLoading || brain.isLoading) return <div>{back}<Skeleton className="h-10 w-72 mb-6" /><Skeleton className="h-96" /></div>;
  if (client.isError || !client.data) return <div>{back}<ErrorPanel title={apiStatus(client.error) === 404 ? "Client not found" : "Could not load client"} message={apiErrorMessage(client.error)} onRetry={() => client.refetch()} /></div>;
  if (brain.isError || !brain.data) return <div>{back}<ErrorPanel title="Could not load Brain" message={apiErrorMessage(brain.error)} onRetry={() => brain.refetch()} /></div>;

  const c = client.data;
  const b = brain.data;
  const approved = b.caseStudies.filter((x) => x.approved).length;
  const raw = b.entries.filter((e) => e.kind !== "learning").slice(0, 20);

  return (
    <div className="rise">
      {back}
      <PageHeader eyebrow="Brain / verified knowledge" title={<span dir="auto" data-testid="text-brain-client">{c.name}</span>} />
      <div className="flex flex-wrap gap-6 mb-6 font-mono text-xs text-muted-foreground" data-testid="status-brain-counts">
        <span><strong className="text-foreground text-base">{approved}</strong> / {b.caseStudies.length} case studies approved</span>
        <span><strong className="text-foreground text-base">{b.entries.length}</strong> source entries</span>
        <span><strong className="text-foreground text-base">{b.learnings.length}</strong> learnings</span>
      </div>
      <Tabs defaultValue="profile">
        <TabsList className="mb-5 flex-wrap h-auto">
          <TabsTrigger value="profile" data-testid="tab-profile">Profile</TabsTrigger>
          <TabsTrigger value="cases" data-testid="tab-cases">Case studies ({b.caseStudies.length})</TabsTrigger>
          <TabsTrigger value="sources" data-testid="tab-sources">Sources</TabsTrigger>
          <TabsTrigger value="learned" data-testid="tab-learned">What we've learned</TabsTrigger>
        </TabsList>
        <TabsContent value="profile" forceMount className="data-[state=inactive]:hidden"><ProfileCard key={id} id={id} profile={b.profile} /></TabsContent>
        <TabsContent value="cases"><CaseStudies id={id} items={b.caseStudies} /></TabsContent>
        <TabsContent value="sources">
          <Sources id={id} clientName={c.name} status={b.status} defaultUrl={c.website ?? ""} />
          <section className="mt-4 rounded-lg border bg-card p-5">
            <h3 className="font-mono text-[10px] uppercase tracking-[0.18em] text-muted-foreground mb-3">Collected entries</h3>
            {raw.length === 0 ? <p className="text-sm text-muted-foreground italic" data-testid="status-empty-entries">Nothing collected yet.</p> : (
              <ul className="divide-y" data-testid="list-entries">
                {raw.map((e) => <li key={e.id} className="py-2 text-sm flex gap-3" data-testid={"row-entry-" + e.id}><span className="font-mono text-[11px] uppercase text-accent w-16 shrink-0">{e.kind}</span><span dir="auto" className="line-clamp-2 flex-1">{e.content}</span><span className="font-mono text-[11px] text-muted-foreground shrink-0">{format(new Date(e.createdAt), "d MMM")}</span></li>)}
              </ul>
            )}
          </section>
        </TabsContent>
        <TabsContent value="learned"><Learnings id={id} verticals={c.verticals} /></TabsContent>
      </Tabs>
    </div>
  );
}
