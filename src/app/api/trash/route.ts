import { NextRequest } from 'next/server';
import { and, eq, inArray, isNotNull } from 'drizzle-orm';
import { db, files } from '@/db';
import { ApiError, enforceCsrf, handler, ok, requirePermission } from '@/lib/api';
import { listFiles } from '@/lib/files';
import { logActivity } from '@/lib/activity';
import { getStorageDriver } from '@/lib/storage';
import { clientIp, userAgent } from '@/lib/request';

/** GET /api/trash — paginated list of soft-deleted files. */
export const GET = handler(async (req: NextRequest) => {
  const session = await requirePermission('files:read');
  const url = new URL(req.url);
  const result = await listFiles({
    ownerId: session.id,
    status: 'trashed',
    search: url.searchParams.get('search') ?? undefined,
    page: Number(url.searchParams.get('page') ?? 1),
    perPage: Number(url.searchParams.get('perPage') ?? 24),
    sort: 'date',
    direction: 'desc',
  });
  return ok(result);
});

/**
 * POST /api/trash  { action: 'restore' | 'purge' | 'empty', ids?: string[] }
 */
export const POST = handler(async (req: NextRequest) => {
  await enforceCsrf(req);
  const session = await requirePermission('files:delete');
  const body = (await req.json().catch(() => ({}))) as { action?: string; ids?: string[] };
  const action = body.action;

  const trashScope = and(eq(files.ownerId, session.id), isNotNull(files.deletedAt));

  if (action === 'restore') {
    const ids = body.ids ?? [];
    if (ids.length === 0) throw new ApiError(400, 'No files selected.', 'bad_request');
    const rows = await db
      .select({ id: files.id, size: files.size, folderId: files.folderId })
      .from(files)
      .where(and(trashScope, inArray(files.id, ids)));

    const { reserveQuota } = await import('@/lib/files');
    let restored = 0;
    for (const row of rows) {
      const ok2 = await reserveQuota(session.id, row.size);
      if (!ok2) continue;
      await db.update(files).set({ deletedAt: null }).where(eq(files.id, row.id));
      restored += 1;
    }
    await logActivity({
      action: 'RESTORE',
      actorId: session.id,
      message: `Restored ${restored} file(s) from trash`,
      ip: clientIp(req),
      userAgent: userAgent(req),
    });
    return ok({ restored });
  }

  if (action === 'purge' || action === 'empty') {
    const scope =
      action === 'empty' ? trashScope : and(trashScope, inArray(files.id, body.ids ?? []));
    const rows = await db
      .select({ id: files.id, storageKey: files.storageKey, thumbnailKey: files.thumbnailKey, storageDriver: files.storageDriver })
      .from(files)
      .where(scope);

    const storage = getStorageDriver();
    await Promise.all(
      rows.map(async (row) => {
        await storage.delete(row.storageKey).catch(() => {});
        if (row.thumbnailKey) await storage.delete(row.thumbnailKey).catch(() => {});
      }),
    );
    if (rows.length > 0) {
      await db.delete(files).where(inArray(files.id, rows.map((r) => r.id)));
    }
    await logActivity({
      action: 'DELETE',
      actorId: session.id,
      message: `Permanently deleted ${rows.length} file(s)`,
      ip: clientIp(req),
      userAgent: userAgent(req),
    });
    return ok({ purged: rows.length });
  }

  throw new ApiError(400, 'Unknown action.', 'bad_request');
});

export const dynamic = 'force-dynamic';
