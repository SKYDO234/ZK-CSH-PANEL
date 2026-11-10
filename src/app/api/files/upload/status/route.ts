import { NextRequest } from 'next/server';
import { ApiError, handler, ok, requirePermission } from '@/lib/api';
import { getOwnedSession } from '@/lib/chunked-upload';

/**
 * GET /api/files/upload/status?uploadId=…
 * Lets a client resume after a page reload: reports which chunks arrived and
 * which index to send next.
 */
export const GET = handler(async (req: NextRequest) => {
  const session = await requirePermission('files:write');
  const uploadId = new URL(req.url).searchParams.get('uploadId');
  if (!uploadId) throw new ApiError(400, 'uploadId is required.', 'bad_request');

  const owned = await getOwnedSession(uploadId, session.id);
  let nextIndex: number | null = null;
  for (let i = 0; i < owned.totalChunks; i += 1) {
    if (!owned.received.includes(i)) {
      nextIndex = i;
      break;
    }
  }

  return ok({
    uploadId: owned.id,
    fileName: owned.fileName,
    declaredSize: owned.declaredSize,
    chunkSize: owned.chunkSize,
    totalChunks: owned.totalChunks,
    received: owned.received,
    receivedCount: owned.received.length,
    complete: nextIndex === null,
    nextIndex,
  });
});

export const dynamic = 'force-dynamic';
