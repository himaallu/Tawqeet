import { useEffect, useRef } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { useGetDemoStatus, getGetDemoStatusQueryKey, getGetDemoRadarQueryKey } from "@workspace/api-client-react";

/** Polls demo status every 2s while a background job runs; refreshes radar/lead data on stage changes. */
export function useDemoStatus() {
  const qc = useQueryClient();
  const status = useGetDemoStatus({
    query: {
      queryKey: getGetDemoStatusQueryKey(),
      refetchInterval: (q) => (q.state.data?.running ? 2000 : false),
    },
  });
  const prev = useRef<string | null>(null);
  const key = status.data ? `${status.data.running}|${status.data.stage}|${status.data.loaded}` : null;
  useEffect(() => {
    if (key === null) return;
    if (prev.current !== null && prev.current !== key) {
      qc.invalidateQueries({ queryKey: getGetDemoRadarQueryKey() });
      qc.invalidateQueries({ predicate: (q) => String(q.queryKey[0] ?? "").includes("/demo/leads") });
    }
    prev.current = key;
  }, [key, qc]);
  return status;
}

/** Call after a 202 action so polling starts immediately. */
export function useKickStatus() {
  const qc = useQueryClient();
  return () => qc.invalidateQueries({ queryKey: getGetDemoStatusQueryKey() });
}
