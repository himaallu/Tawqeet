/** Outbound HTTP for integrations (alerts, mailboxes, billing). Swappable in tests. */
export let http: typeof fetch = (input, init) => fetch(input, { ...init, signal: init?.signal ?? AbortSignal.timeout(20_000) });

export function setHttp(f: typeof fetch) {
  http = f;
}
