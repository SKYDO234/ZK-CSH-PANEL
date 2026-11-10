import { db, activityLogs } from '@/db';
import type { ActivityAction } from '@/db/schema';

/**
 * Central audit trail. Every meaningful action goes through here so the admin
 * "System activity" feed and per-user timelines are always complete.
 */
export async function logActivity(params: {
  action: ActivityAction;
  actorId?: string | null;
  targetType?: string | null;
  targetId?: string | null;
  message: string;
  metadata?: Record<string, unknown> | null;
  ip?: string | null;
  userAgent?: string | null;
}): Promise<void> {
  try {
    await db.insert(activityLogs).values({
      action: params.action,
      actorId: params.actorId ?? null,
      targetType: params.targetType ?? null,
      targetId: params.targetId ?? null,
      message: params.message,
      metadata: (params.metadata ?? null) as never,
      ip: params.ip ?? null,
      userAgent: params.userAgent?.slice(0, 500) ?? null,
    });
  } catch (err) {
    // Logging must never break the request it is describing.
    console.error('[activity] failed to record', (err as Error).message);
  }
}
