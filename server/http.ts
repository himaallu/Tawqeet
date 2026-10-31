import { and, eq } from "drizzle-orm";
import type { NextFunction, Request, RequestHandler, Response } from "express";
import { z, ZodError } from "zod";
import { db } from "./db";
import { clients } from "./db/schema";

export class HttpError extends Error {
  constructor(
    public status: number,
    message: string,
  ) {
    super(message);
  }
}

/** Async route wrapper: errors go to the error handler. */
export const h =
  (fn: (req: Request, res: Response) => Promise<unknown>): RequestHandler =>
  (req, res, next) => {
    fn(req, res).then(
      (out) => {
        if (!res.headersSent && out !== undefined) res.json(out);
      },
      (e) => next(e),
    );
  };

export function parse<S extends z.ZodType>(schema: S, data: unknown): z.infer<S> {
  return schema.parse(data);
}

export const param = (req: Request, name: string) => {
  const v = req.params[name];
  if (typeof v !== "string" || !/^[0-9a-f-]{36}$/i.test(v)) throw new HttpError(404, "Not found");
  return v;
};

/**
 * The client a request may act on. Client viewers are pinned to their own client; staff may
 * pick any client in their agency (verified here).
 */
export async function clientScope(req: Request, requested?: string | null): Promise<string | null> {
  if (req.user!.role === "client_viewer") return req.user!.clientId;
  if (!requested) return null;
  if (!/^[0-9a-f-]{36}$/i.test(requested)) throw new HttpError(404, "Client not found");
  const [c] = await db.select({ id: clients.id }).from(clients).where(and(eq(clients.agencyId, req.agencyId), eq(clients.id, requested)));
  if (!c) throw new HttpError(404, "Client not found");
  return c.id;
}

export async function requireClient(req: Request, id: string) {
  const scoped = await clientScope(req, id);
  if (!scoped || scoped !== id) throw new HttpError(404, "Client not found");
  const [c] = await db.select().from(clients).where(and(eq(clients.agencyId, req.agencyId), eq(clients.id, id)));
  if (!c) throw new HttpError(404, "Client not found");
  return c;
}

export function errorHandler(err: unknown, _req: Request, res: Response, _next: NextFunction) {
  if (err instanceof ZodError) return res.status(400).json({ error: err.issues[0]?.message ?? "Invalid input", issues: err.issues });
  const status = (err as { status?: number }).status;
  if (typeof status === "number" && status >= 400 && status < 600) return res.status(status).json({ error: (err as Error).message });
  console.error(err);
  res.status(500).json({ error: process.env.NODE_ENV === "production" ? "Something went wrong" : (err as Error).message });
}
