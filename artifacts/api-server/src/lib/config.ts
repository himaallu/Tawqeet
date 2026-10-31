export function appOrigin(): string {
  const value = process.env.APP_URL ||
    (process.env.NODE_ENV !== "production" && process.env.REPLIT_DEV_DOMAIN
      ? `https://${process.env.REPLIT_DEV_DOMAIN}` : "");
  if (!value) throw new Error("APP_URL is required.");
  const url = new URL(value);
  if (url.protocol !== "https:" && !(process.env.NODE_ENV !== "production" && url.hostname === "localhost")) {
    throw new Error("APP_URL must use HTTPS.");
  }
  return url.origin;
}

export function loginConfigured(): boolean {
  try {
    appOrigin();
    return Boolean(process.env.SESSION_SECRET && process.env.SESSION_SECRET.length >= 32
      && process.env.RESEND_FROM_EMAIL && process.env.OWNER_EMAIL);
  } catch { return false; }
}
