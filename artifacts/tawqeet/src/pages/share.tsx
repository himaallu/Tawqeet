import { useEffect, useRef } from "react";
import { useParams } from "wouter";
import { useShareLogin } from "@workspace/api-client-react";
import { Mark } from "@/components/brand";
import { ErrorPanel } from "@/components/states";
import { apiErrorMessage } from "@/lib/api-error";

/** Public: exchanges a share token for a read-only client session, then opens /reports. */
export default function SharePage() {
  const { token = "" } = useParams<{ token: string }>();
  const login = useShareLogin();
  const started = useRef(false);
  useEffect(() => {
    if (started.current) return;
    started.current = true;
    login.mutate({ data: { token } }, { onSuccess: () => { window.location.href = `${import.meta.env.BASE_URL.replace(/\/$/, "")}/reports`; } });
  }, [token, login]);
  return (
    <div className="min-h-[100dvh] grid place-items-center p-6">
      {login.isError ? <div className="max-w-md w-full"><ErrorPanel title="Link not valid" message={apiErrorMessage(login.error)} /></div>
        : <div className="text-center" aria-busy="true"><Mark className="h-10 w-10 animate-pulse mx-auto" /><p className="text-sm text-muted-foreground mt-3">Opening client report</p></div>}
    </div>
  );
}
