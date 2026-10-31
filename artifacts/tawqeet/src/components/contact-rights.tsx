import { useLocation } from "wouter";
import { useQueryClient } from "@tanstack/react-query";
import { useDeleteContact, exportContactData, getGetDemoRadarQueryKey } from "@workspace/api-client-react";
import { Download, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from "@/components/ui/alert-dialog";
import { useToast } from "@/hooks/use-toast";
import { apiErrorMessage } from "@/lib/api-error";

/** Data-subject rights: export everything stored about a contact, or delete it (anonymised audit + suppression). */
export function ContactRights({ leadId, name }: { leadId: string; name: string }) {
  const { toast } = useToast();
  const qc = useQueryClient();
  const [, setLocation] = useLocation();
  const del = useDeleteContact();
  const download = async () => {
    try {
      const data = await exportContactData(leadId);
      const url = URL.createObjectURL(new Blob([JSON.stringify(data, null, 2)], { type: "application/json" }));
      const a = document.createElement("a"); a.href = url; a.download = `contact-${leadId}.json`; a.click(); URL.revokeObjectURL(url);
      toast({ title: "Contact data exported" });
    } catch (e) { toast({ title: "Export failed", description: apiErrorMessage(e), variant: "destructive" }); }
  };
  return (
    <>
      <Button variant="outline" onClick={download} data-testid="button-export-contact"><Download className="h-4 w-4 mr-2" />Export contact data</Button>
      <AlertDialog>
        <AlertDialogTrigger asChild><Button variant="outline" className="text-destructive" data-testid="button-delete-contact"><Trash2 className="h-4 w-4 mr-2" />Delete contact</Button></AlertDialogTrigger>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete {name}?</AlertDialogTitle>
            <AlertDialogDescription>Removes the contact, its drafts and send history. An anonymised audit entry is kept and the email address (if any) is added to suppression. This cannot be undone.</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction data-testid="button-confirm-delete" onClick={() => del.mutate({ id: leadId }, {
              onSuccess: (r) => { toast({ title: "Contact deleted", description: r.message }); qc.invalidateQueries({ queryKey: getGetDemoRadarQueryKey() }); setLocation("/radar"); },
              onError: (e) => toast({ title: "Delete failed", description: apiErrorMessage(e), variant: "destructive" }),
            })}>Delete contact</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
