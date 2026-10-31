export function apiErrorMessage(err: unknown, fallback = "Something went wrong."): string {
  if (!err) return fallback;
  const e = err as { data?: unknown; message?: string };
  const d = e.data as Record<string, unknown> | null | undefined;
  if (d && typeof d === "object") {
    for (const k of ["message", "error", "detail"]) {
      if (typeof d[k] === "string" && d[k]) return d[k] as string;
    }
  }
  if (typeof e.message === "string" && e.message) return e.message;
  return fallback;
}
export function apiStatus(err: unknown): number | undefined {
  const s = (err as { status?: unknown })?.status;
  return typeof s === "number" ? s : undefined;
}
