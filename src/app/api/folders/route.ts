import { NextRequest } from 'next/server';
import { z } from 'zod';
import { and, eq, isNull } from 'drizzle-orm';
import { db, folders } from '@/db';
import { ApiError, created, enforceCsrf, handler, ok, parseBody, readJson, requirePermission } from '@/lib/api';
import { listFolders } from '@/lib/files';
import { logActivity } from '@/lib/activity';
import { clientIp, userAgent } from '@/lib/request';

const createSchema = z.object({
  name: z.string().trim().min(1, 'Folder name is required').max(120),
  parentId: z.string().nullable().optional(),
  color: z.string().max(20).nullable().optional(),
});

/** GET /api/folders — the user's folder tree (flat list with parentId links). */
export const GET = handler(async () => {
  const session = await requirePermission('files:read');
  return ok({ folders: await listFolders(session.id) });
});

/** POST /api/folders — create a folder. */
export const POST = handler(async (req: NextRequest) => {
  await enforceCsrf(req);
  const session = await requirePermission('files:write');
  const body = parseBody(createSchema, await readJson(req));

  if (body.parentId) {
    const parent = await db
      .select({ id: folders.id })
      .from(folders)
      .where(and(eq(folders.id, body.parentId), eq(folders.ownerId, session.id), isNull(folders.deletedAt)))
      .limit(1);
    if (!parent[0]) throw new ApiError(404, 'Parent folder not found.', 'not_found');
  }

  const duplicate = await db
    .select({ id: folders.id })
    .from(folders)
    .where(
      and(
        eq(folders.ownerId, session.id),
        isNull(folders.deletedAt),
        eq(folders.name, body.name),
        body.parentId ? eq(folders.parentId, body.parentId) : isNull(folders.parentId),
      ),
    )
    .limit(1);
  if (duplicate[0]) throw new ApiError(409, 'A folder with that name already exists here.', 'duplicate_name');

  const [row] = await db
    .insert(folders)
    .values({
      ownerId: session.id,
      name: body.name,
      parentId: body.parentId ?? null,
      color: body.color ?? null,
    })
    .returning();

  await logActivity({
    action: 'FOLDER_CREATE',
    actorId: session.id,
    targetType: 'folder',
    targetId: row.id,
    message: `Created folder “${row.name}”`,
    ip: clientIp(req),
    userAgent: userAgent(req),
  });

  return created({ folder: { id: row.id, name: row.name, parentId: row.parentId, createdAt: row.createdAt.toISOString() } });
});

const patchSchema = z.object({
  id: z.string().min(1),
  name: z.string().trim().min(1).max(120).optional(),
  parentId: z.string().nullable().optional(),
});

/** PATCH /api/folders — rename or move a folder. */
export const PATCH = handler(async (req: NextRequest) => {
  await enforceCsrf(req);
  const session = await requirePermission('files:write');
  const body = parseBody(patchSchema, await readJson(req));

  const rows = await db
    .select()
    .from(folders)
    .where(and(eq(folders.id, body.id), eq(folders.ownerId, session.id)))
    .limit(1);
  if (!rows[0]) throw new ApiError(404, 'Folder not found.', 'not_found');

  const [updated] = await db
    .update(folders)
    .set({
      name: body.name ?? rows[0].name,
      parentId: body.parentId === undefined ? rows[0].parentId : body.parentId,
      updatedAt: new Date(),
    })
    .where(eq(folders.id, body.id))
    .returning();

  return ok({ folder: { id: updated.id, name: updated.name, parentId: updated.parentId } });
});

/** DELETE /api/folders?id=... — deletes a folder and moves its files to trash. */
export const DELETE = handler(async (req: NextRequest) => {
  await enforceCsrf(req);
  const session = await requirePermission('files:delete');
  const url = new URL(req.url);
  const id = url.searchParams.get('id');
  if (!id) throw new ApiError(400, 'Missing folder id.', 'bad_request');

  const rows = await db
    .select()
    .from(folders)
    .where(and(eq(folders.id, id), eq(folders.ownerId, session.id)))
    .limit(1);
  if (!rows[0]) throw new ApiError(404, 'Folder not found.', 'not_found');

  const { files } = await import('@/db');
  const { releaseQuota } = await import('@/lib/files');
  const { sql } = await import('drizzle-orm');

  const contained = await db
    .select({ id: files.id, size: files.size })
    .from(files)
    .where(and(eq(files.folderId, id), isNull(files.deletedAt)));

  if (contained.length > 0) {
    await db
      .update(files)
      .set({ deletedAt: new Date(), folderId: null })
      .where(and(eq(files.folderId, id), isNull(files.deletedAt)));
    const total = contained.reduce((sum, f) => sum + f.size, 0n);
    if (total > 0n) await releaseQuota(session.id, total);
  }

  await db.update(folders).set({ deletedAt: new Date() }).where(eq(folders.id, id));
  await db.execute(sql`UPDATE folders SET parent_id = NULL WHERE parent_id = ${id}`);

  await logActivity({
    action: 'FOLDER_DELETE',
    actorId: session.id,
    targetType: 'folder',
    targetId: id,
    message: `Deleted folder “${rows[0].name}” (${contained.length} file(s) moved to trash)`,
    ip: clientIp(req),
    userAgent: userAgent(req),
  });

  return ok({ deleted: true, filesTrashed: contained.length });
});

export const dynamic = 'force-dynamic';
