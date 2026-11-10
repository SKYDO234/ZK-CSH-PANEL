import { NextRequest } from 'next/server';
import { z } from 'zod';
import { lt, sql } from 'drizzle-orm';
import { db, activityLogs, loginAttempts, sessions } from '@/db';
import { enforceCsrf, handler, ok, parseBody, readJson, requirePermission } from '@/lib/api';
import { getSettings, invalidateSettings } from '@/lib/settings';
import { logActivity } from '@/lib/activity';
import { clientIp, userAgent } from '@/lib/request';
import { sweep } from '@/lib/rate-limit';
import { getStorageDriver } from '@/lib/storage';

/** POST /api/admin/system — maintenance actions (cache, cleanup, storage check). */
const schema = z.object({
  action: z.enum(['clear-cache', 'cleanup-sessions', 'cleanup-logs', 'test-storage', 'sweep-rate-limits']),
  days: z.number().int().min(1).max(3650).optional(),
});

export const POST = handler(async (req: NextRequest) => {
  await enforceCsrf(req);
  const session = await requirePermission('system:manage');
  const body = parseBody(schema, await readJson(req));

  let message = '';
  switch (body.action) {
    case 'clear-cache': {
      invalidateSettings();
      message = 'Settings cache cleared.';
      break;
    }
    case 'cleanup-sessions': {
      const result = await db
        .delete(sessions)
        .where(lt(sessions.expiresAt, new Date()))
        .returning({ id: sessions.id });
      const attempts = await db
        .delete(loginAttempts)
        .where(lt(loginAttempts.createdAt, new Date(Date.now() - 7 * 86400_000)))
        .returning({ id: loginAttempts.id });
      message = `Removed ${result.length} expired session(s) and ${attempts.length} old login attempt(s).`;
      break;
    }
    case 'cleanup-logs': {
      const days = body.days ?? (await getSettings()).system.logRetentionDays;
      const result = await db
        .delete(activityLogs)
        .where(lt(activityLogs.createdAt, new Date(Date.now() - days * 86400_000)))
        .returning({ id: activityLogs.id });
      message = `Deleted ${result.length} activity log entries older than ${days} days.`;
      break;
    }
    case 'test-storage': {
      const storage = getStorageDriver((await getSettings()).storage.storageDriver);
      const key = `healthchecks/${Date.now()}-${Math.random().toString(36).slice(2)}.txt`;
      const started = Date.now();
      await storage.put(key, Buffer.from('vaultly health check'), { contentType: 'text/plain' });
      const stat = await storage.stat(key);
      await storage.delete(key);
      message = `Storage driver “${storage.name}” OK — wrote and read ${stat.size} bytes in ${Date.now() - started} ms.`;
      break;
    }
    case 'sweep-rate-limits': {
      sweep();
      message = 'Rate-limit buckets swept.';
      break;
    }
  }

  await logActivity({
    action: 'MAINTENANCE',
    actorId: session.id,
    message: `Maintenance: ${body.action} — ${message}`,
    ip: clientIp(req),
    userAgent: userAgent(req),
  });

  return ok({ message });
});

/** GET /api/admin/system — health snapshot. */
export const GET = handler(async () => {
  await requirePermission('settings:read');
  const started = Date.now();
  const dbLatency = await db.execute(sql`SELECT 1`).then(() => Date.now() - started).catch(() => -1);
  const settings = await getSettings({ fresh: true });

  return ok({
    database: { ok: dbLatency >= 0, latencyMs: dbLatency },
    storageDriver: process.env.STORAGE_DRIVER ?? settings.storage.storageDriver,
    nodeVersion: process.version,
    uptimeSeconds: Math.round(process.uptime()),
    memoryMb: Math.round(process.memoryUsage().rss / 1024 / 1024),
    maintenanceMode: settings.general.maintenanceMode,
    emailConfigured: settings.email.enabled && settings.email.provider === 'smtp',
  });
});

export const dynamic = 'force-dynamic';
