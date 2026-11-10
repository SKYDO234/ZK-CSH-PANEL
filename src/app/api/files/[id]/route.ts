import { NextRequest } from 'next/server';
import { z } from 'zod';
import { and, eq } from 'drizzle-orm';
import { db, files, shares } from '@/db';
import { ApiError, enforceCsrf, handler, ok, parseBody, readJson, requirePermission } from '@/lib/api';
import { getFileForOwner, releaseQuota, toFileDTO } from '@/lib/files';
import { logActivity } from '@/lib/activity';
import { clientIp, userAgent } from '@/lib/request';
import { getStorageDriver } from '@/lib/storage';
import { sanitizeFilename } from '@/lib/file-types';
import type { RawFileLike } from '@/lib/dto';

async function loadOwned(fileId: string, userId: string, canAdmin: boolean) {
  const rows = await db
    .select()
    .from(files)
    .where(canAdmin ? eq(files.id, fileId) : and(eq(files.id, fileId), eq(files.ownerId, userId)))
    .limit(1);
  if (!rows[0]) throw new ApiError(404, 'File not found.', 'not_found');
  return rows[0];
}

/** GET /api/files/:id — full metadata plus share state. */
export const GET = handler(async (_req: NextRequest, context) => {
  const session = await requirePermission('files:read');
  const { id } = await context.params;
  const file = await getFileForOwner(id, session.id);
  if (file) return ok({ file });

  if (session.can('files:admin')) {
    const rows = await db
      .select()
      .from(files)
      .leftJoin(shares, eq(shares.fileId, files.id))
      .where(eq(files.id, id))
      .limit(1);
    if (rows[0]) {
      const joined = { ...rows[0].files, ...flattenShare(rows[0].shares) } as RawFileLike;
      return ok({ file: toFileDTO(joined) });
    }
  }
  throw new ApiError(404, 'File not found.', 'not_found');
});

function flattenShare(share: typeof shares.$inferSelect | null) {
  return {
    shareToken: share?.token ?? null,
    shareExpiresAt: share?.expiresAt ?? null,
    shareHasPassword: share?.passwordHash ?? null,
    shareMaxDownloads: share?.maxDownloads ?? null,
    shareDownloadCount: share?.downloadCount ?? 0,
    shareAllowDownload: share?.allowDownload ?? true,
    shareViewOnly: share?.viewOnly ?? false,
    shareRevokedAt: share?.revokedAt ?? null,
  };
}

const patchSchema = z
  .object({
    name: z.string().min(1).max(200).optional(),
    folderId: z.string().nullable().optional(),
    visibility: z.enum(['PRIVATE', 'LINK', 'PUBLIC']).optional(),
    downloadEnabled: z.boolean().optional(),
  })
  .refine((v) => Object.keys(v).length > 0, { message: 'Nothing to update' });

/** PATCH /api/files/:id — rename, move, change visibility. */
export const PATCH = handler(async (req: NextRequest, context) => {
  await enforceCsrf(req);
  const session = await requirePermission('files:write');
  const { id } = await context.params;
  const body = parseBody(patchSchema, await readJson(req));

  const existing = await loadOwned(id, session.id, false);
  const updates: Partial<typeof files.$inferInsert> = { updatedAt: new Date() };
  const actions: string[] = [];

  if (body.name !== undefined) {
    const safe = sanitizeFilename(body.name);
    if (!safe) throw new ApiError(422, 'Invalid file name.', 'invalid_name');
    updates.name = safe;
    actions.push('renamed');
  }
  if (body.folderId !== undefined) {
    updates.folderId = body.folderId;
    actions.push('moved');
  }
  if (body.visibility !== undefined) {
    updates.visibility = body.visibility;
    actions.push('visibility');
  }
  if (body.downloadEnabled !== undefined) {
    updates.downloadEnabled = body.downloadEnabled;
    actions.push('download');
  }

  const [updated] = await db.update(files).set(updates).where(eq(files.id, id)).returning();

  await logActivity({
    action: body.name !== undefined ? 'RENAME' : body.folderId !== undefined ? 'MOVE' : 'SHARE_UPDATE',
    actorId: session.id,
    targetType: 'file',
    targetId: id,
    message: `${actions.join(', ')} ${updated.name}`,
    metadata: { before: existing.name, after: updated.name },
    ip: clientIp(req),
    userAgent: userAgent(req),
  });

  const shareRows = await db.select().from(shares).where(eq(shares.fileId, id)).limit(1);
  return ok({ file: toFileDTO({ ...updated, ...flattenShare(shareRows[0] ?? null) } as RawFileLike) });
});

/**
 * DELETE /api/files/:id
 * Soft-delete by default (moving to trash), permanent when `?permanent=1`.
 */
export const DELETE = handler(async (req: NextRequest, context) => {
  await enforceCsrf(req);
  const session = await requirePermission('files:delete');
  const { id } = await context.params;
  const permanent = new URL(req.url).searchParams.get('permanent') === '1';

  const file = await loadOwned(id, session.id, session.can('files:admin'));

  if (permanent) {
    const storage = getStorageDriver(file.storageDriver as 'local' | 's3');
    await storage.delete(file.storageKey).catch((err) => {
      console.warn('[files] storage delete failed', (err as Error).message);
    });
    if (file.thumbnailKey) await storage.delete(file.thumbnailKey).catch(() => {});
    await db.delete(files).where(eq(files.id, id));
    if (!file.deletedAt) await releaseQuota(file.ownerId, file.size);
  } else {
    await db.update(files).set({ deletedAt: new Date() }).where(eq(files.id, id));
    await releaseQuota(file.ownerId, file.size);
  }

  await logActivity({
    action: 'DELETE',
    actorId: session.id,
    targetType: 'file',
    targetId: id,
    message: `${permanent ? 'Permanently deleted' : 'Moved to trash'} ${file.name}`,
    metadata: { size: Number(file.size), permanent },
    ip: clientIp(req),
    userAgent: userAgent(req),
  });

  return ok({ deleted: true, permanent });
});

export const dynamic = 'force-dynamic';
