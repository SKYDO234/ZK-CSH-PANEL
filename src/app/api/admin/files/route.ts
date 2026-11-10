import { NextRequest } from 'next/server';
import { and, count, desc, eq, ilike, isNull, or, sql } from 'drizzle-orm';
import { db, files, users } from '@/db';
import { handler, ok, requirePermission } from '@/lib/api';
import { num } from '@/lib/serialize';

/** GET /api/admin/files — every file on the platform (paginated, searchable). */
export const GET = handler(async (req: NextRequest) => {
  await requirePermission('files:admin');
  const url = new URL(req.url);
  const page = Math.max(1, Number(url.searchParams.get('page') ?? 1));
  const perPage = Math.min(100, Math.max(1, Number(url.searchParams.get('perPage') ?? 25)));
  const search = url.searchParams.get('search')?.trim();
  const category = url.searchParams.get('category');

  const filters = [isNull(files.deletedAt)];
  if (search) filters.push(or(ilike(files.name, `%${search}%`), ilike(users.email, `%${search}%`))!);
  if (category && category !== 'all') filters.push(eq(files.category, category));
  const where = and(...filters);

  const [rows, totalRows] = await Promise.all([
    db
      .select({
        id: files.id,
        name: files.name,
        category: files.category,
        mimeType: files.mimeType,
        size: files.size,
        visibility: files.visibility,
        downloadCount: files.downloadCount,
        viewCount: files.viewCount,
        createdAt: files.createdAt,
        ownerId: users.id,
        ownerName: users.name,
        ownerEmail: users.email,
        storageDriver: files.storageDriver,
      })
      .from(files)
      .innerJoin(users, eq(users.id, files.ownerId))
      .where(where)
      .orderBy(desc(files.createdAt))
      .limit(perPage)
      .offset((page - 1) * perPage),
    db.select({ value: count() }).from(files).innerJoin(users, eq(users.id, files.ownerId)).where(where),
  ]);

  const total = Number(totalRows[0]?.value ?? 0);
  return ok({
    files: rows.map((row) => ({
      ...row,
      size: num(row.size),
      createdAt: row.createdAt.toISOString(),
    })),
    total,
    page,
    perPage,
    totalPages: Math.max(1, Math.ceil(total / perPage)),
  });
});

/** DELETE /api/admin/files?id=... — permanent removal by an admin. */
export const DELETE = handler(async (req: NextRequest) => {
  const session = await requirePermission('files:admin');
  const id = new URL(req.url).searchParams.get('id');
  if (!id) return ok({ deleted: false });

  const rows = await db.select().from(files).where(eq(files.id, id)).limit(1);
  if (!rows[0]) return ok({ deleted: false });

  const { getStorageDriver } = await import('@/lib/storage');
  const { releaseQuota } = await import('@/lib/files');
  const { logActivity } = await import('@/lib/activity');
  const storage = getStorageDriver(rows[0].storageDriver as 'local' | 's3');
  await storage.delete(rows[0].storageKey).catch(() => {});
  if (rows[0].thumbnailKey) await storage.delete(rows[0].thumbnailKey).catch(() => {});
  await db.delete(files).where(eq(files.id, id));
  await releaseQuota(rows[0].ownerId, rows[0].size);

  await logActivity({
    action: 'DELETE',
    actorId: session.id,
    targetType: 'file',
    targetId: id,
    message: `Admin permanently deleted ${rows[0].name}`,
  });

  return ok({ deleted: true });
});

export const dynamic = 'force-dynamic';
