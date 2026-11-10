import { Readable } from 'node:stream';
import { NextRequest, NextResponse } from 'next/server';
import { and, eq, or, sql } from 'drizzle-orm';
import { db, files, shares } from '@/db';
import { getStorageDriver } from './storage';
import { resolveShare } from './files';
import { contentDisposition, INLINE_IMAGE_TYPES, INLINE_VIDEO_TYPES, INLINE_AUDIO_TYPES } from './file-types';
import { getSession } from './auth';
import { getSettings } from './settings';

/**
 * Public/media streaming.
 *
 * Handles HTTP Range requests so browsers can seek inside large videos and PDFs
 * without downloading the whole file, and enforces access rules for private
 * files (401/403 rather than leaking existence).
 */

export type MediaAccess = {
  file: {
    id: string;
    ownerId: string;
    name: string;
    mimeType: string;
    category: string;
    size: bigint;
    storageDriver: string;
    storageKey: string;
    visibility: 'PRIVATE' | 'LINK' | 'PUBLIC';
    downloadEnabled: boolean;
    deletedAt: Date | null;
    status: string;
  };
  allowDownload: boolean;
  shareId?: string;
  shareToken?: string;
  expiresAt?: Date | null;
  viewOnly: boolean;
};

type AccessResult =
  | { ok: true; access: MediaAccess }
  | { ok: false; status: number; message: string };

/**
 * Authorises a media request.
 *
 * `token` is the share token (path or query). Owners are always allowed to
 * stream their own files (used for thumbnails/previews in the dashboard).
 */
export async function authorizeMedia(options: {
  fileId?: string;
  token?: string;
  passwordCookie?: string;
  requireDownloadPermission?: boolean;
  session?: { id: string; isAdmin: boolean } | null;
}): Promise<AccessResult> {
  const settings = await getSettings();

  // --- Share-token access ------------------------------------------------
  if (options.token) {
    const resolved = await resolveShare(options.token);
    if (resolved.status !== 'ok') {
      // Expired/limited links exist but are no longer usable → 410 Gone.
      // Revoked/deleted/unknown links must not confirm existence → 404.
      const gone = resolved.status === 'expired' || resolved.status === 'download_limit';
      return {
        ok: false,
        status: gone ? 410 : 404,
        message: descriptionFor(resolved.status),
      };
    }
    const { file, share } = resolved;

    if (share.passwordHash) {
      // The unlock cookie holds the signed share id (see /api/share/:token).
      const cookie = options.passwordCookie;
      let unlocked = false;
      if (cookie) {
        const { verifySignedValue } = await import('./crypto');
        const verified = verifySignedValue(cookie);
        unlocked = verified.valid && verified.payload === share.id;
      }
      if (!unlocked) return { ok: false, status: 401, message: 'This link is password protected.' };
    }

    if (options.requireDownloadPermission) {
      if (!share.allowDownload || share.viewOnly || !file.downloadEnabled) {
        return { ok: false, status: 403, message: 'Downloads are disabled for this file.' };
      }
      if (share.maxDownloads !== null && share.downloadCount >= share.maxDownloads) {
        return { ok: false, status: 403, message: 'This link has reached its download limit.' };
      }
    }


    return {
      ok: true,
      access: {
        file,
        allowDownload: share.allowDownload && !share.viewOnly && file.downloadEnabled,
        shareId: share.id,
        shareToken: share.token,
        expiresAt: share.expiresAt,
        viewOnly: share.viewOnly,
      },
    };
  }

  // --- Direct file id access --------------------------------------------
  if (options.fileId) {
    const file = await loadFile(options.fileId);
    if (!file) return { ok: false, status: 404, message: 'File not found.' };

    if (options.session) {
      if (options.session.id === file.ownerId) {
        return {
          ok: true,
          access: { file, allowDownload: true, viewOnly: false },
        };
      }
      if (options.session.isAdmin) {
        return { ok: true, access: { file, allowDownload: true, viewOnly: false } };
      }
    }

    if (file.visibility === 'PUBLIC' && !settings.sharing.allowPublicGallery) {
      return { ok: false, status: 403, message: 'Public access is disabled.' };
    }

    if (file.visibility === 'PUBLIC') {
      const canDownload = file.downloadEnabled;
      if (options.requireDownloadPermission && !canDownload) {
        return { ok: false, status: 403, message: 'Downloads are disabled for this file.' };
      }
      return { ok: true, access: { file, allowDownload: canDownload, viewOnly: !canDownload } };
    }

    // LINK visibility requires the token; PRIVATE requires the owner.
    return { ok: false, status: 403, message: 'You do not have access to this file.' };
  }

  return { ok: false, status: 400, message: 'Missing file reference.' };
}

async function loadFile(fileId: string) {
  const rows = await db
    .select({
      id: files.id,
      ownerId: files.ownerId,
      name: files.name,
      mimeType: files.mimeType,
      category: files.category,
      size: files.size,
      storageDriver: files.storageDriver,
      storageKey: files.storageKey,
      visibility: files.visibility,
      downloadEnabled: files.downloadEnabled,
      deletedAt: files.deletedAt,
      status: files.status,
    })
    .from(files)
    .where(eq(files.id, fileId))
    .limit(1);
  const row = rows[0];
  if (!row || row.deletedAt || row.status !== 'READY') return null;
  return row;
}

function descriptionFor(status: string): string {
  switch (status) {
    case 'expired':
      return 'This link has expired.';
    case 'revoked':
      return 'This link has been revoked.';
    case 'download_limit':
      return 'This link has reached its download limit.';
    case 'deleted':
      return 'This file has been deleted.';
    case 'owner_suspended':
      return 'This content is temporarily unavailable.';
    default:
      return 'This link is not available.';
  }
}

/**
 * Streams a file with correct range handling and security headers.
 * Counting of views/downloads happens here so stats reflect real traffic.
 */
export async function streamFile(
  req: NextRequest,
  access: MediaAccess,
  options: { disposition: 'inline' | 'attachment'; cacheSeconds?: number },
): Promise<Response> {
  const { file } = access;
  const storage = getStorageDriver(file.storageDriver as 'local' | 's3');
  const totalSize = Number(file.size);

  // Parse Range: bytes=start-end (single range only — sufficient for media).
  const rangeHeader = req.headers.get('range');
  let range: { start: number; end: number } | undefined;
  if (rangeHeader) {
    const match = /^bytes=(\d*)-(\d*)$/.exec(rangeHeader.trim());
    if (match) {
      const [, startRaw, endRaw] = match;
      if (startRaw === '' && endRaw === '') {
        range = undefined;
      } else if (startRaw === '') {
        const suffix = Number(endRaw);
        range = { start: Math.max(0, totalSize - suffix), end: totalSize - 1 };
      } else {
        const start = Number(startRaw);
        const end = endRaw ? Math.min(Number(endRaw), totalSize - 1) : totalSize - 1;
        if (start > end || start >= totalSize) {
          return new NextResponse(null, {
            status: 416,
            headers: { 'Content-Range': `bytes */${totalSize}` },
          });
        }
        range = { start, end };
      }
    }
  }

  const result = await storage.getStream(file.storageKey, range);
  const isInlineSafe =
    INLINE_IMAGE_TYPES.includes(file.mimeType) ||
    INLINE_VIDEO_TYPES.includes(file.mimeType) ||
    INLINE_AUDIO_TYPES.includes(file.mimeType) ||
    file.mimeType === 'application/pdf';

  const disposition: 'inline' | 'attachment' =
    options.disposition === 'attachment' || !isInlineSafe ? options.disposition : 'inline';

  const headers = new Headers({
    'Content-Type': file.mimeType || 'application/octet-stream',
    'Content-Disposition': contentDisposition(disposition, file.name),
    'Accept-Ranges': 'bytes',
    'X-Content-Type-Options': 'nosniff',
    'Cache-Control': `private, max-age=${options.cacheSeconds ?? 0}`,
    // Media must never execute script on our origin (protects against malicious SVG/HTML).
    'Content-Security-Policy': "default-src 'none'; sandbox; media-src 'self'; img-src 'self' data:",
    'Cross-Origin-Resource-Policy': 'cross-origin',
    'Access-Control-Allow-Origin': '*',
  });

  if (range) {
    headers.set('Content-Range', `bytes ${range.start}-${range.end}/${totalSize}`);
    headers.set('Content-Length', String(range.end - range.start + 1));
  } else {
    headers.set('Content-Length', String(totalSize));
  }
  if (result.etag) headers.set('ETag', `"${result.etag}"`);

  const isDownload = disposition === 'attachment';

  // A full-file download consumes one unit of the share's allowance. The check
  // happens after the response is built but before any byte is sent, so the
  // client gets a clean 403 instead of a truncated file.
  if (isDownload && access.shareId) {
    const allowed = await consumeDownload(access.shareId);
    if (!allowed) {
      result.stream.destroy();
      return new NextResponse(JSON.stringify({ ok: false, error: { message: 'This link has reached its download limit.', code: 'download_limit' } }), {
        status: 403,
        headers: { 'Content-Type': 'application/json' },
      });
    }
  }

  const webStream = Readable.toWeb(result.stream) as unknown as ReadableStream;

  // Fire-and-forget counters: never block the stream on analytics.
  void recordAccess(file.id, access.shareId, isDownload, range ? range.end - range.start + 1 : totalSize);

  return new NextResponse(webStream, { status: range ? 206 : 200, headers });
}

/**
 * Atomically consumes one download from a share's allowance.
 *
 * The counter is bumped with a conditional UPDATE ... WHERE download_count <
 * max_downloads, so two concurrent requests can never exceed the cap. Returns
 * false when the allowance has just run out (the caller then answers 403).
 */
export async function consumeDownload(shareId: string): Promise<boolean> {
  try {
    const rows = await db
      .update(shares)
      .set({ downloadCount: sql`${shares.downloadCount} + 1`, lastAccessAt: new Date() })
      .where(
        and(
          eq(shares.id, shareId),
          or(sql`${shares.maxDownloads} IS NULL`, sql`${shares.downloadCount} < ${shares.maxDownloads}`),
        ),
      )
      .returning({ id: shares.id });
    return rows.length > 0;
  } catch (err) {
    console.warn('[media] download counter failed', (err as Error).message);
    return true; // never block a download because analytics failed
  }
}

async function recordAccess(fileId: string, shareId: string | undefined, isDownload: boolean, bytes: number) {
  try {
    if (isDownload) {
      await db
        .update(files)
        .set({
          downloadCount: sql`${files.downloadCount} + 1`,
          bytesServed: sql`${files.bytesServed} + ${bytes}`,
        })
        .where(eq(files.id, fileId));
      if (shareId) {
        // The share counter is bumped atomically in consumeDownload() when the
        // allowance is enforced; only the timestamp is refreshed here.
        await db.update(shares).set({ lastAccessAt: new Date() }).where(eq(shares.id, shareId));
      }
    } else {
      await db
        .update(files)
        .set({ viewCount: sql`${files.viewCount} + 1`, bytesServed: sql`${files.bytesServed} + ${bytes}` })
        .where(eq(files.id, fileId));
      if (shareId) {
        await db.update(shares).set({ lastAccessAt: new Date() }).where(eq(shares.id, shareId));
      }
    }
  } catch (err) {
    console.warn('[media] counter update failed', (err as Error).message);
  }
}

/** Thumbnail streaming with a long-lived cache header. */
export async function streamThumbnail(fileId: string): Promise<Response> {
  const rows = await db
    .select({
      thumbnailKey: files.thumbnailKey,
      storageDriver: files.storageDriver,
      ownerId: files.ownerId,
      visibility: files.visibility,
      deletedAt: files.deletedAt,
    })
    .from(files)
    .where(eq(files.id, fileId))
    .limit(1);
  const row = rows[0];
  if (!row?.thumbnailKey || row.deletedAt) return new NextResponse(null, { status: 404 });

  // Thumbnails are unguessable-key objects but still gated: private files only
  // render thumbnails for their owner or when publicly shared.
  const session = await getSession();
  const isOwner = session?.id === row.ownerId;
  if (!isOwner && row.visibility === 'PRIVATE') {
    const shareRows = await db
      .select({ token: shares.token })
      .from(shares)
      .where(and(eq(shares.fileId, fileId), eq(shares.revokedAt, sql`NULL`)))
      .limit(1);
    if (!shareRows[0]) return new NextResponse(null, { status: 403 });
  }

  const storage = getStorageDriver(row.storageDriver as 'local' | 's3');
  try {
    const result = await storage.getStream(row.thumbnailKey);
    return new NextResponse(Readable.toWeb(result.stream) as unknown as ReadableStream, {
      headers: {
        'Content-Type': 'image/webp',
        'Cache-Control': 'public, max-age=604800, stale-while-revalidate=86400',
        'X-Content-Type-Options': 'nosniff',
      },
    });
  } catch {
    return new NextResponse(null, { status: 404 });
  }
}
