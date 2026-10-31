import { QueryClient, useMutation, useQuery, useQueryClient, type UseQueryOptions } from "@tanstack/react-query";
import { toast } from "sonner";

export class ApiError extends Error {
  constructor(
    public status: number,
    message: string,
    public code?: string,
  ) {
    super(message);
  }
}

export async function api<T = unknown>(path: string, init: RequestInit & { json?: unknown } = {}): Promise<T> {
  const { json, ...rest } = init;
  const res = await fetch(`/api${path}`, {
    credentials: "same-origin",
    ...rest,
    headers: json !== undefined ? { "content-type": "application/json", ...rest.headers } : rest.headers,
    body: json !== undefined ? JSON.stringify(json) : rest.body,
  });
  const text = await res.text();
  const data = text ? JSON.parse(text) : null;
  if (!res.ok) throw new ApiError(res.status, data?.error ?? `Request failed (${res.status})`, data?.code);
  return data as T;
}

export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 15_000,
      refetchOnWindowFocus: true,
      retry: (count, err) => !(err instanceof ApiError && err.status < 500) && count < 2,
    },
  },
});

export function useApi<T>(key: unknown[], path: string | null, opts: Partial<UseQueryOptions<T>> = {}) {
  return useQuery<T>({ queryKey: key, queryFn: () => api<T>(path!), enabled: path !== null, ...opts });
}

/** Mutation with toast feedback and cache invalidation. */
export function useAction<TVars = void, TOut = unknown>(
  fn: (v: TVars) => Promise<TOut>,
  opts: { invalidate?: unknown[][]; success?: string | ((out: TOut) => string); onSuccess?: (out: TOut) => void } = {},
) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: fn,
    onSuccess: (out) => {
      for (const k of opts.invalidate ?? []) qc.invalidateQueries({ queryKey: k });
      const msg = typeof opts.success === "function" ? opts.success(out) : opts.success;
      if (msg) toast.success(msg);
      opts.onSuccess?.(out);
    },
    onError: (e: Error) => toast.error(e.message),
  });
}

// ---------- shared response types ----------

export type Temperature = "hot" | "warm" | "cold";
export type Me = {
  user: { id: string; email: string; name: string | null; role: "owner" | "member" | "client_viewer"; agencyId: string | null; clientId: string | null };
  agency: { id: string; name: string; plan: string } | null;
  usage: { plan: string; paid: boolean; clients: number; clientLimit: number; simulated: number; simLimit: number } | null;
  admin: boolean;
  offline: boolean;
};
export type Client = {
  id: string;
  name: string;
  website: string | null;
  verticals: string[];
  regions: string[];
  languages: string[];
  offer: string | null;
  tone: string | null;
  noGoClaims: string[];
  proofPoints: string[];
  differentiators: string[];
  icp: { titles?: string[]; industries?: string[]; company_sizes?: string[]; pains?: string[]; deal_size?: string; notes?: string };
  timezone: string;
  counts?: Partial<Record<Temperature, number>>;
  ready?: number;
};
export type Breakdown = { signalPoints: number; stackBonus: number; fitPoints: number; engagement: number; total: number; signals: { id: string; key: string; title: string; points: number; ageDays: number }[] };
export type SignalRef = { id: string; title: string; url: string | null; source: string; key: string; name: string; detectedAt: string; language: string };
export type Company = { id: string; name: string; domain: string | null; country: string | null; vertical: string | null; sizeBand: string | null; careersUrl: string | null };
export type Lead = {
  id: string;
  clientId: string;
  clientName: string;
  fullName: string | null;
  title: string | null;
  email: string | null;
  emailVerified: string | null;
  linkedinUrl: string | null;
  tempScore: number;
  temperature: Temperature;
  whyNow: string | null;
  status: string;
  language: string;
  abGroup: string;
  legalBasis: string;
  consentNote: string | null;
  breakdown: Breakdown | null;
  company: Company;
  signals: SignalRef[];
  updatedAt: string;
  createdAt: string;
};
export type SimRun = { id: string; check: "persona" | "gmail_summary" | "apple_preview" | "spam"; personaName: string | null; result: Record<string, any> };
export type Draft = {
  id: string;
  leadId: string;
  variant: number;
  angle: "outcome" | "signal" | "proof";
  subject: string;
  body: string;
  language: string;
  score: number | null;
  scoreBefore: number | null;
  status: string;
  violations: string[];
  sim: { score: number; personaAvg: number; offerSurvives: number; spamRisk: number; clarity: number; spamFlags: string[]; gmailSummary?: string; applePreview?: string } | null;
  simRuns: SimRun[];
  caseStudy: { id: string; customerName: string; canNameCustomer: boolean; resultMetric: string | null } | null;
  play: { id: string; name: string } | null;
};
export type Send = {
  id: string;
  subject: string;
  body: string;
  toEmail: string;
  status: string;
  scheduledFor: string;
  sentAt: string | null;
  replyClass: string | null;
  replyText: string | null;
  repliedAt: string | null;
  meetingBooked: boolean;
  scoreAtSend: number | null;
  approver: string | null;
  mailbox: string | null;
  error: string | null;
};
