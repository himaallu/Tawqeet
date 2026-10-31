import { ToastAction } from "@/components/ui/toast";
import { apiErrorMessage, apiStatus } from "@/lib/api-error";

/** Toast props for a failed action; plan-limit (402) errors get an Upgrade action linking to Billing. */
export function errorToast(title: string, e: unknown) {
  const upgrade = apiStatus(e) === 402;
  return {
    title: upgrade ? "Plan limit reached" : title, description: apiErrorMessage(e), variant: upgrade ? undefined : ("destructive" as const),
    action: upgrade ? <ToastAction altText="Upgrade" onClick={() => { window.location.href = `${import.meta.env.BASE_URL.replace(/\/$/, "")}/settings/billing`; }}>Upgrade</ToastAction> : undefined,
  };
}
