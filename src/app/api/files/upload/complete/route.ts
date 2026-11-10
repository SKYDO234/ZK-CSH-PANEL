import { NextRequest } from 'next/server';
import { z } from 'zod';
import { eq } from 'drizzle-orm';
import { ApiError, created, enforceCsrf, handler, parseBody, requirePermission } from '@/lib/api';
import { assemble, discardSession, getOwnedSession, headBytes, isComplete } from '@/lib/chunked-upload';
import { processUploadedFile, storeStream } from '@/lib/upload-service';
import { ensureShareToken, toFileDTO } from '@/lib/files';
import { db, shares } from '@/db';
import { getSettings } from '@/lib/settings';
import { clientIp, requestOrigin, userAgent } from '@/lib/request';
import type { RawFileLike } from '@/lib/dto';

const schema = z.object({ uploadId: z.string().min(10) });

/**
 * POST /api/files/upload/complete
 * Assembles the staged chunks, validates and stores the file, then returns the
 * same payload as a single-shot upload (plus share/direct/embed URLs).
 */
export const POST = handler(async (req: NextRequest) => {
  await enforceCsrf(req);
  const session = await requirePermission('files:write');
  const body = parseBody(schema, await req.json().catch(() => ({ uploadId: '' })));

  const uploadSession = await getOwnedSession(body.uploadId, session.id);
  if (!isComplete(uploadSession)) {
    throw new ApiError(422, 'The upload is not complete yet.', 'incomplete_upload');
  }

  const settings = await getSettings();
  // The first chunk is kept separate so validation can inspect real bytes.
  const head = await headBytes(uploadSession);
  void head;

  const stream = await assemble(uploadSession);

  let row;
  try {
    row = await storeStream({
      ctx: {
        userId: session.id,
        userName: session.name,
        ip: clientIp(req),
        userAgent: userAgent(req),
      },
      desiredName: uploadSession.fileName,
      claimedMime: uploadSession.mimeType,
      folderId: uploadSession.folderId,
      sizeHint: uploadSession.declaredSize,
      stream,
    });
  } finally {
    await discardSession(uploadSession.id);
  }

  let shareToken: string | null = null;
  if (settings.sharing.autoCreateShareOnUpload) {
    const share = await ensureShareToken(row.id, session.id, {
      visibility:
        settings.sharing.defaultVisibility === 'PRIVATE' ? undefined : settings.sharing.defaultVisibility,
    });
    shareToken = share.token;
  }

  const task = () => processUploadedFile(row.id).catch(() => {});
  setTimeout(task, 25);

  const shareRows = await db.select().from(shares).where(eq(shares.fileId, row.id)).limit(1);
  const share = shareRows[0];
  const origin = requestOrigin(req);

  return created({
    file: toFileDTO({
      ...row,
      shareToken: share?.token ?? null,
      shareExpiresAt: share?.expiresAt ?? null,
      shareHasPassword: share?.passwordHash ?? null,
      shareMaxDownloads: share?.maxDownloads ?? null,
      shareDownloadCount: share?.downloadCount ?? 0,
      shareAllowDownload: share?.allowDownload ?? true,
      shareViewOnly: share?.viewOnly ?? false,
      shareRevokedAt: share?.revokedAt ?? null,
    } satisfies RawFileLike),
    shareToken: share?.token ?? shareToken,
    urls: share
      ? {
          share: `${origin}/share/${share.token}`,
          direct: `${origin}/media/${share.token}/${encodeURIComponent(row.name)}`,
          embed: `${origin}/embed/video/${share.token}`,
        }
      : null,
  });
});

export const dynamic = 'force-dynamic';
export const maxDuration = 300;
