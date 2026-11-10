import { NextRequest } from 'next/server';
import { Readable } from 'node:stream';
import { ApiError, created, enforceCsrf, enforceRateLimit, handler, requirePermission } from '@/lib/api';
import { clientIp, userAgent } from '@/lib/request';
import { assertFolderOwnership, processUploadedFile, storeStream } from '@/lib/upload-service';
import { ensureShareToken, toFileDTO } from '@/lib/files';
import { getSettings } from '@/lib/settings';
import { db, files, shares } from '@/db';
import { eq } from 'drizzle-orm';
import type { RawFileLike } from '@/lib/dto';

/**
 * POST /api/files/upload
 *
 * Accepts either:
 *  - multipart/form-data (a single `file` field, optional `folderId`)
 *  - application/octet-stream with `x-file-name` / `x-folder-id` headers
 *    (used by the XHR uploader so it can report byte-level progress)
 *
 * Bytes are streamed directly to the storage driver; nothing is buffered.
 */
export const POST = handler(async (req: NextRequest) => {
  await enforceCsrf(req);
  const session = await requirePermission('files:write');
  await enforceRateLimit(req, 'upload', 60);

  const settings = await getSettings();
  const ctx = {
    userId: session.id,
    userName: session.name,
    ip: clientIp(req),
    userAgent: userAgent(req),
  };

  // Reject oversized bodies as early as possible (Content-Length is a hint, the
  // stream is still enforced by the storage service).
  const maxBytes = Number(process.env.MAX_UPLOAD_BYTES || 0) || settings.storage.maxFileSizeBytes;
  const declaredLength = Number(req.headers.get('content-length') ?? 0);
  if (declaredLength && declaredLength > maxBytes + 1024 * 1024) {
    throw new ApiError(413, 'File exceeds the maximum upload size.', 'file_too_large');
  }

  const contentType = req.headers.get('content-type') ?? '';
  let row;

  if (contentType.includes('multipart/form-data')) {
    const form = await req.formData();
    const file = form.get('file');
    const folderIdRaw = form.get('folderId');
    const folderId = typeof folderIdRaw === 'string' && folderIdRaw && folderIdRaw !== 'root' ? folderIdRaw : null;
    await assertFolderOwnership(session.id, folderId);

    if (!(file instanceof File)) {
      throw new ApiError(400, 'No file was provided.', 'missing_file');
    }
    const stream = Readable.fromWeb(file.stream() as Parameters<typeof Readable.fromWeb>[0]);
    row = await storeStream({
      ctx,
      desiredName: file.name,
      claimedMime: file.type,
      folderId,
      sizeHint: file.size,
      stream,
    });
  } else {
    const fileName = req.headers.get('x-file-name');
    if (!fileName) throw new ApiError(400, 'Missing x-file-name header.', 'missing_file');
    const folderIdRaw = req.headers.get('x-folder-id');
    const folderId = folderIdRaw && folderIdRaw !== 'root' ? folderIdRaw : null;
    await assertFolderOwnership(session.id, folderId);

    if (!req.body) throw new ApiError(400, 'Empty request body.', 'missing_file');
    const stream = Readable.fromWeb(req.body as Parameters<typeof Readable.fromWeb>[0]);
    row = await storeStream({
      ctx,
      desiredName: decodeURIComponent(fileName),
      claimedMime: req.headers.get('x-file-type') ?? '',
      folderId,
      sizeHint: declaredLength || undefined,
      stream,
    });
  }

  // Create a share link immediately when configured (the product requirement:
  // "after uploading a file, immediately generate a shareable URL").
  let shareToken: string | null = null;
  if (settings.sharing.autoCreateShareOnUpload) {
    const share = await ensureShareToken(row.id, session.id, {
      visibility: settings.sharing.defaultVisibility === 'PRIVATE' ? undefined : settings.sharing.defaultVisibility,
    });
    shareToken = share.token;
  } else if (settings.sharing.defaultVisibility === 'PUBLIC') {
    await db.update(files).set({ visibility: 'PUBLIC' }).where(eq(files.id, row.id));
  }

  // Media post-processing (thumbnails/metadata) is deliberately not awaited on
  // the hot path for large files — it is queued and processed in the background.
  const schedule = (globalThis as unknown as { __vaultlyAfter?: (cb: () => Promise<void>) => void });
  const task = () => processUploadedFile(row.id).catch(() => {});
  if (schedule.__vaultlyAfter) schedule.__vaultlyAfter(task);
  else setTimeout(task, 25);

  const shareRows = await db.select().from(shares).where(eq(shares.fileId, row.id)).limit(1);
  const share = shareRows[0];

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
  });
});

export const dynamic = 'force-dynamic';
export const maxDuration = 300;
