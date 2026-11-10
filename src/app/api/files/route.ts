import { NextRequest } from 'next/server';
import { and, eq, inArray, isNull, or, sql } from 'drizzle-orm';
import { db, files } from '@/db';
import { enforceRateLimit, handler, ok, requirePermission } from '@/lib/api';
import { listFiles, getStorageStats, listFolders } from '@/lib/files';

/**
 * GET /api/files
 *
 * Query params: folder, category, search, sort, direction, page, perPage,
 * status (active|trashed), visibility (shared|private), include=stats,folders
 *
 * Scoped to the authenticated user unless `ownerId` is supplied by an admin.
 */
export const GET = handler(async (req: NextRequest) => {
  const session = await requirePermission('files:read');
  await enforceRateLimit(req, 'files-list', 300);

  const url = new URL(req.url);
  const folderParam = url.searchParams.get('folder');
  const requestedOwner = url.searchParams.get('ownerId');
  const ownerId =
    requestedOwner && requestedOwner !== session.id && session.can('files:admin')
      ? requestedOwner
      : session.id;

  const include = new Set((url.searchParams.get('include') ?? '').split(',').filter(Boolean));

  const result = await listFiles({
    ownerId,
    folderId: folderParam === null ? undefined : folderParam === 'root' ? null : folderParam,
    category: url.searchParams.get('category') ?? undefined,
    search: url.searchParams.get('search') ?? undefined,
    sort: (url.searchParams.get('sort') as 'name' | 'size' | 'date' | 'type') ?? 'date',
    direction: (url.searchParams.get('direction') as 'asc' | 'desc') ?? 'desc',
    status: (url.searchParams.get('status') as 'active' | 'trashed' | 'all') ?? 'active',
    visibility: (url.searchParams.get('visibility') as 'shared' | 'private') ?? undefined,
    page: Number(url.searchParams.get('page') ?? 1),
    perPage: Number(url.searchParams.get('perPage') ?? 24),
  });

  const extra: Record<string, unknown> = {};
  if (include.has('stats')) extra.stats = await getStorageStats(ownerId);
  if (include.has('folders')) extra.folders = await listFolders(ownerId);

  return ok({ ...result, ...extra });
});

/**
 * DELETE /api/files?id=a&id=b   → soft-deletes up to 200 files (bulk action)
 */
export const DELETE = handler(async (req: NextRequest) => {
  const session = await requirePermission('files:delete');
  const url = new URL(req.url);
  const ids = url.searchParams.getAll('id');
  if (ids.length === 0) return ok({ deleted: 0 });
  if (ids.length > 200) return ok({ deleted: 0 });

  const result = await db
    .update(files)
    .set({ deletedAt: new Date(), updatedAt: new Date() })
    .where(
      and(
        inArray(files.id, ids),
        isNull(files.deletedAt),
        or(eq(files.ownerId, session.id), session.can('files:admin') ? sql`true` : sql`false`)!,
      ),
    )
    .returning({ id: files.id });

  return ok({ deleted: result.length });
});

export const dynamic = 'force-dynamic';
