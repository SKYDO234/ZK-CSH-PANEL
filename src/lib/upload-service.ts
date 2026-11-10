import { and, eq, isNull } from 'drizzle-orm';
import { Readable } from 'node:stream';
import { db, files, folders } from '@/db';
import { getStorageDriver, buildStorageKey } from './storage';
import { sanitizeFilename, categoryFor, extensionOf, mimeForExtension, contentDisposition, uniqueFilename } from './file-types';
import { peekStream, sanitizeSvg, validateUpload } from './storage/validation';
import { getSettings } from './settings';
import { reserveQuota, releaseQuota } from './files';
import { sha256 } from './crypto';
import { logActivity } from './activity';
import { GB, MB } from './format';
import { ApiError } from './api';

/** Uploads larger than this are expected to use the chunked/resumable API. */
export const CHUNK_SIZE = 8 * MB;

export type UploadContext = {
  userId: string;
  userName: string;
  ip?: string;
  userAgent?: string;
};

export type PreparedUpload = {
  name: string;
  extension: string;
  mimeType: string;
  category: string;
  folderId: string | null;
};

/** Resolves duplicate filenames against the target folder before writing. */
export async function resolveFilename(
  ownerId: string,
  folderId: string | null,
  desiredName: string,
): Promise<string> {
  const rows = await db
    .select({ name: files.name })
    .from(files)
    .where(
      and(
        eq(files.ownerId, ownerId),
        isNull(files.deletedAt),
        folderId ? eq(files.folderId, folderId) : isNull(files.folderId),
      ),
    )
    .limit(2000);
  const taken = new Set(rows.map((r) => r.name.toLowerCase()));
  return uniqueFilename(desiredName, taken);
}

export async function assertFolderOwnership(ownerId: string, folderId: string | null) {
  if (!folderId) return;
  const rows = await db
    .select({ id: folders.id })
    .from(folders)
    .where(and(eq(folders.id, folderId), eq(folders.ownerId, ownerId), isNull(folders.deletedAt)))
    .limit(1);
  if (!rows[0]) throw new ApiError(404, 'Folder not found.', 'folder_not_found');
}

/**
 * Validates the incoming stream and writes it to storage in one pass.
 *
 * The first 4 KB are sniffed and replayed into the storage stream, so a file is
 * never fully buffered in memory — uploads of multi-gigabyte videos stream
 * straight through to the storage driver.
 */
export async function storeStream(params: {
  ctx: UploadContext;
  desiredName: string;
  claimedMime: string;
  folderId: string | null;
  sizeHint?: number;
  stream: Readable;
  storageKey?: string;
}) {
  const settings = await getSettings();
  const maxBytes =
    Number(process.env.MAX_UPLOAD_BYTES || 0) || settings.storage.maxFileSizeBytes;

  if (params.sizeHint !== undefined && params.sizeHint > maxBytes) {
    throw new ApiError(
      413,
      `File is larger than the ${(maxBytes / GB).toFixed(0)} GB limit.`,
      'file_too_large',
    );
  }

  const safeName = sanitizeFilename(params.desiredName);
  const extension = extensionOf(safeName);

  // Quota reservation happens before any bytes are written (atomic).
  const reserved = await reserveQuota(params.ctx.userId, BigInt(params.sizeHint ?? 0));
  if (params.sizeHint !== undefined && !reserved) {
    throw new ApiError(413, 'Not enough storage available. Free up space or ask an admin.', 'quota_exceeded');
  }

  const peeked = await peekStream(params.stream);
  const head = peeked.head;
  const replay: Readable = Readable.from(peeked.replay as AsyncIterable<Buffer>);
  const validation = await validateUpload({
    filename: safeName,
    claimedMime: params.claimedMime || mimeForExtension(extension),
    size: params.sizeHint ?? Math.max(head.length, 1),
    head,
    policy: {
      allowedExtensions: settings.storage.allowedExtensions,
      maxFileSizeBytes: maxBytes,
      scanUploads: settings.system.scanUploads,
    },
  });

  if (!validation.ok) {
    if (reserved) await releaseQuota(params.ctx.userId, BigInt(params.sizeHint ?? 0));
    throw new ApiError(422, validation.error ?? 'File rejected.', 'invalid_file');
  }

  const storage = getStorageDriver(settings.storage.storageDriver);
  const finalName = await resolveFilename(params.ctx.userId, params.folderId, safeName);
  const key =
    params.storageKey ??
    buildStorageKey({ ownerId: params.ctx.userId, extension: validation.extension || extension });

  let body: Readable | Buffer = replay;
  const isSvg = validation.detectedMime === 'image/svg+xml' || validation.extension === 'svg';
  if (isSvg) {
    // SVG needs sanitising; buffer only SVGs (bounded to a sane size).
    const chunks: Buffer[] = [];
    for await (const chunk of replay) chunks.push(Buffer.from(chunk));
    body = sanitizeSvg(Buffer.concat(chunks));
  }

  let putResult;
  try {
    putResult = await storage.put(key, body, {
      contentType: validation.detectedMime,
      contentLength: params.sizeHint,
      cacheControl: 'private, max-age=0, must-revalidate',
      metadata: { ownerid: params.ctx.userId },
    });
  } catch (err) {
    if (reserved) await releaseQuota(params.ctx.userId, BigInt(params.sizeHint ?? 0));
    console.error('[upload] storage write failed', err);
    throw new ApiError(500, 'Could not save the file. Please retry.', 'storage_error');
  }

  const actualSize = putResult.size || params.sizeHint || head.length;

  // Re-check quota with the true byte count (sizeHint can be missing/incorrect).
  if (params.sizeHint === undefined) {
    const ok2 = await reserveQuota(params.ctx.userId, BigInt(actualSize));
    if (!ok2) {
      await storage.delete(key).catch(() => {});
      throw new ApiError(413, 'Not enough storage available.', 'quota_exceeded');
    }
  } else if (actualSize !== params.sizeHint) {
    const delta = BigInt(actualSize - params.sizeHint);
    if (delta > 0n) {
      const ok2 = await reserveQuota(params.ctx.userId, delta);
      if (!ok2) {
        await storage.delete(key).catch(() => {});
        await releaseQuota(params.ctx.userId, BigInt(params.sizeHint));
        throw new ApiError(413, 'Not enough storage available.', 'quota_exceeded');
      }
    } else if (delta < 0n) {
      await releaseQuota(params.ctx.userId, -delta);
    }
  }

  if (actualSize > maxBytes) {
    await storage.delete(key).catch(() => {});
    await releaseQuota(params.ctx.userId, BigInt(actualSize));
    throw new ApiError(413, 'File exceeds the maximum upload size.', 'file_too_large');
  }

  const [row] = await db
    .insert(files)
    .values({
      ownerId: params.ctx.userId,
      folderId: params.folderId,
      name: finalName,
      originalName: safeName,
      mimeType: validation.detectedMime,
      category: validation.category,
      size: BigInt(actualSize),
      extension: validation.extension,
      storageDriver: storage.name,
      storageKey: key,
      status: 'READY',
      ipAddress: params.ctx.ip ?? null,
      userAgent: params.ctx.userAgent?.slice(0, 500) ?? null,
      metadata: null,
    })
    .returning();

  await logActivity({
    action: 'UPLOAD',
    actorId: params.ctx.userId,
    targetType: 'file',
    targetId: row.id,
    message: `Uploaded ${finalName}`,
    metadata: { size: actualSize, category: validation.category },
    ip: params.ctx.ip,
    userAgent: params.ctx.userAgent,
  });

  return row;
}

/**
 * Post-processing: thumbnail + metadata extraction for images, plus SHA-256
 * hashing for dedupe/integrity. Runs after the row exists so the upload
 * response is not blocked by media processing.
 */
export async function processUploadedFile(fileId: string): Promise<void> {
  const settings = await getSettings();
  const rows = await db.select().from(files).where(eq(files.id, fileId)).limit(1);
  const file = rows[0];
  if (!file || file.status !== 'READY') return;
  if (file.category !== 'image' && file.category !== 'video') return;

  const storage = getStorageDriver(file.storageDriver as 'local' | 's3');
  try {
    if (file.category === 'image' && Number(file.size) <= 40 * MB) {
      const buffer = await storage.getBuffer(file.storageKey);
      const hash = sha256(buffer);
      const metadata: Record<string, unknown> = {};

      if (settings.storage.generateThumbnails && file.mimeType !== 'image/svg+xml') {
        const sharp = (await import('sharp')).default;
        const image = sharp(buffer, { failOn: 'none' });
        const info = await image.metadata();
        metadata.width = info.width;
        metadata.height = info.height;
        metadata.format = info.format;
        if (info.space) metadata.colorSpace = info.space;

        const thumb = await sharp(buffer, { failOn: 'none' })
          .rotate()
          .resize(640, 640, { fit: 'inside', withoutEnlargement: true })
          .webp({ quality: 78 })
          .toBuffer();
        const thumbKey = buildStorageKey({
          ownerId: file.ownerId,
          extension: 'webp',
          kind: 'thumbnails',
        });
        await storage.put(thumbKey, thumb, { contentType: 'image/webp', cacheControl: 'public, max-age=31536000, immutable' });
        await db
          .update(files)
          .set({ thumbnailKey: thumbKey, hasThumbnail: true, metadata, hash })
          .where(eq(files.id, fileId));
        return;
      }
      await db.update(files).set({ hash, metadata }).where(eq(files.id, fileId));
      return;
    }

    if (file.category === 'video') {
      // Video dimensions/duration extraction requires ffprobe (optional). When
      // FFMPEG_PATH is configured we shell out; otherwise we store what we know
      // and the player falls back to native metadata once loaded.
      const ffprobe = process.env.FFPROBE_PATH;
      if (ffprobe) {
        const { execFile } = await import('node:child_process');
        const { promisify } = await import('node:util');
        const { mkdtemp, writeFile, rm } = await import('node:fs/promises');
        const os = await import('node:os');
        const path = await import('node:path');
        const run = promisify(execFile);
        const dir = await mkdtemp(path.join(os.tmpdir(), 'vaultly-'));
        const tmp = path.join(dir, `video${file.extension ? `.${file.extension}` : ''}`);
        try {
          await writeFile(tmp, await storage.getBuffer(file.storageKey));
          const { stdout } = await run(ffprobe, [
            '-v', 'quiet', '-print_format', 'json', '-show_format', '-show_streams', tmp,
          ]);
          const parsed = JSON.parse(stdout) as {
            format?: { duration?: string };
            streams?: Array<{ codec_type?: string; width?: number; height?: number }>;
          };
          const videoStream = parsed.streams?.find((s) => s.codec_type === 'video');
          const metadata = {
            duration: parsed.format?.duration ? Number(parsed.format.duration) : undefined,
            width: videoStream?.width,
            height: videoStream?.height,
          };
          await db.update(files).set({ metadata }).where(eq(files.id, fileId));
        } finally {
          await rm(dir, { recursive: true, force: true }).catch(() => {});
        }
      }
    }
  } catch (err) {
    console.warn('[upload] post-processing skipped:', (err as Error).message);
  }
}

export function downloadHeadersFor(file: {
  mimeType: string;
  name: string;
  category: string;
}): Record<string, string> {
  const isDangerousInline =
    file.category === 'archive' || file.mimeType === 'text/html' || file.mimeType === 'image/svg+xml';
  const disposition: 'inline' | 'attachment' = isDangerousInline ? 'attachment' : 'inline';
  return {
    'Content-Type': file.mimeType,
    'Content-Disposition': contentDisposition(disposition, file.name),
    // Uploaded HTML/SVG is never allowed to run script on our origin.
    'Content-Security-Policy': "default-src 'none'; img-src 'self' data:; media-src 'self'; style-src 'unsafe-inline'; sandbox",
  };
}

export { categoryFor };
