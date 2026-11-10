import { NextRequest } from 'next/server';
import { eq } from 'drizzle-orm';
import { db, files } from '@/db';
import { ApiError, enforceCsrf, handler, ok } from '@/lib/api';
import { authenticateApi, findAccessibleFile } from '@/lib/api-auth';
import { getFileForOwner } from '@/lib/files';

/** GET /api/v1/files/:id */
export const GET = handler(async (req: NextRequest, context) => {
  const principal = await authenticateApi(req, 'files:read');
  const { id } = await context.params;
  const file = await findAccessibleFile(principal, id);
  if (!file) throw new ApiError(404, 'File not found.', 'not_found');
  const dto = await getFileForOwner(id, file.ownerId);
  return ok({ file: dto });
});

/** DELETE /api/v1/files/:id */
export const DELETE = handler(async (req: NextRequest, context) => {
  const principal = await authenticateApi(req, 'files:delete');
  if (!req.headers.get('authorization')) await enforceCsrf(req);
  const { id } = await context.params;
  const file = await findAccessibleFile(principal, id);
  if (!file) throw new ApiError(404, 'File not found.', 'not_found');

  const { releaseQuota } = await import('@/lib/files');
  const { getStorageDriver } = await import('@/lib/storage');
  const storage = getStorageDriver(file.storageDriver as 'local' | 's3');
  await storage.delete(file.storageKey).catch(() => {});
  if (file.thumbnailKey) await storage.delete(file.thumbnailKey).catch(() => {});
  await db.delete(files).where(eq(files.id, id));
  await releaseQuota(file.ownerId, file.size);

  return ok({ deleted: true });
});

export const dynamic = 'force-dynamic';
