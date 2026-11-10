import { NextRequest } from 'next/server';
import { created, enforceCsrf, handler, ok, paginationFrom } from '@/lib/api';
import { authenticateApi } from '@/lib/api-auth';
import { ensureShareToken, getFileForOwner, listFiles, toFileDTO } from '@/lib/files';
import { processUploadedFile, storeStream } from '@/lib/upload-service';
import { Readable } from 'node:stream';
import { clientIp, requestOrigin, userAgent } from '@/lib/request';
import { db, files, shares } from '@/db';
import { eq } from 'drizzle-orm';
import type { RawFileLike } from '@/lib/dto';

/**
 * GET /api/v1/files — list the caller's files.
 * POST /api/v1/files — upload a file (raw body + x-file-name header).
 */
export const GET = handler(async (req: NextRequest) => {
  const principal = await authenticateApi(req, 'files:read');
  const url = new URL(req.url);
  const { page, perPage } = paginationFrom(req, { page: 1, perPage: 25 });
  const result = await listFiles({
    ownerId: principal.userId,
    search: url.searchParams.get('search') ?? undefined,
    category: url.searchParams.get('category') ?? undefined,
    folderId: url.searchParams.get('folder') ?? undefined,
    sort: (url.searchParams.get('sort') as 'name' | 'size' | 'date' | 'type') ?? 'date',
    direction: (url.searchParams.get('direction') as 'asc' | 'desc') ?? 'desc',
    page,
    perPage,
  });
  return ok(result);
});

export const POST = handler(async (req: NextRequest) => {
  const principal = await authenticateApi(req, 'files:write');
  // Bearer-token requests are not cookie-authenticated, so CSRF does not apply.
  if (!req.headers.get('authorization')) await enforceCsrf(req);

  const fileName = req.headers.get('x-file-name');
  if (!fileName || !req.body) {
    return ok({ error: 'Provide the file body and an x-file-name header.' });
  }

  const row = await storeStream({
    ctx: { userId: principal.userId, userName: principal.name, ip: clientIp(req), userAgent: userAgent(req) },
    desiredName: decodeURIComponent(fileName),
    claimedMime: req.headers.get('x-file-type') ?? '',
    folderId: req.headers.get('x-folder-id'),
    sizeHint: Number(req.headers.get('content-length')) || undefined,
    stream: Readable.fromWeb(req.body as Parameters<typeof Readable.fromWeb>[0]),
  });

  const share = await ensureShareToken(row.id, principal.userId);
  void processUploadedFile(row.id);

  const shareRows = await db.select().from(shares).where(eq(shares.fileId, row.id)).limit(1);
  const origin = requestOrigin(req);

  return created({
    file: toFileDTO({
      ...row,
      shareToken: shareRows[0]?.token ?? share.token,
      shareExpiresAt: shareRows[0]?.expiresAt ?? null,
      shareHasPassword: null,
      shareMaxDownloads: null,
      shareDownloadCount: 0,
      shareAllowDownload: true,
      shareViewOnly: false,
      shareRevokedAt: null,
    } satisfies RawFileLike),
    urls: {
      share: `${origin}/share/${share.token}`,
      direct: `${origin}/media/${share.token}/${encodeURIComponent(row.name)}`,
    },
  });
});

export const dynamic = 'force-dynamic';
