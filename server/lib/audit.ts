import { db } from "../db";
import { auditLog } from "../db/schema";

export async function audit(entry: {
  agencyId: string;
  userId?: string | null;
  action: string;
  entity: string;
  entityId?: string | null;
  meta?: Record<string, unknown>;
}) {
  await db.insert(auditLog).values({ ...entry, userId: entry.userId ?? null, meta: entry.meta ?? {} });
}
