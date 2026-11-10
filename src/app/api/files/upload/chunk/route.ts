import { NextRequest } from 'next/server';
import { z } from 'zod';
import { ApiError, created, enforceCsrf, enforceRateLimit, handler, parseBody, requirePermission } from '@/lib/api';
import { createSession, writeChunk, MAX_CHUNK_BYTES } from '@/lib/chunked-upload';
import { assertFolderOwnership } from '@/lib/upload-service';
import { getSettings } from '@/lib/settings';

/**
 * Chunked / resumable upload — control endpoint.
 *
 *  POST /api/files/upload/chunk
 *    { op: 'init', fileName, mimeType, size, folderId? }  → session + chunk size
 *    { op: 'chunk', uploadId, index, data: base64 }        → progress
 *    { op: 'abort', uploadId }                            → discarded
 *
 * Binary chunk bodies are also accepted on
 * `PUT /api/files/upload/chunk?uploadId=…&index=…` (see `PUT` below) which avoids
 * base64 overhead for very large parts.
 */
const schema = z.discriminatedUnion('op', [
  z.object({
    op: z.literal('init'),
    fileName: z.string().min(1).max(255),
    mimeType: z.string().max(200).optional(),
    size: z.number().int().positive(),
    folderId: z.string().uuid().nullable().optional(),
  }),
  z.object({
    op: z.literal('chunk'),
    uploadId: z.string().min(10),
    index: z.number().int().min(0),
    data: z.string().min(1),
  }),
  z.object({ op: z.literal('abort'), uploadId: z.string().min(10) }),
]);

export const POST = handler(async (req: NextRequest) => {
  await enforceCsrf(req);
  const session = await requirePermission('files:write');
  await enforceRateLimit(req, 'upload-chunk', 600);

  const body = parseBody(schema, await readJsonSafe(req));

  if (body.op === 'init') {
    const settings = await getSettings();
    if (BigInt(body.size) > BigInt(settings.storage.maxFileSizeBytes)) {
      throw new ApiError(413, 'File exceeds the maximum upload size.', 'file_too_large');
    }
    const folderId = body.folderId ?? null;
    await assertFolderOwnership(session.id, folderId);

    const created_ = await createSession({
      ownerId: session.id,
      fileName: body.fileName,
      mimeType: body.mimeType ?? 'application/octet-stream',
      folderId,
      declaredSize: body.size,
    });
    return created({
      uploadId: created_.id,
      chunkSize: created_.chunkSize,
      totalChunks: created_.totalChunks,
    });
  }

  if (body.op === 'abort') {
    const { getOwnedSession, discardSession } = await import('@/lib/chunked-upload');
    const owned = await getOwnedSession(body.uploadId, session.id);
    await discardSession(owned.id);
    return created({ aborted: true });
  }

  const { getOwnedSession, writeChunk: write } = await import('@/lib/chunked-upload');
  const owned = await getOwnedSession(body.uploadId, session.id);
  const buffer = Buffer.from(body.data, 'base64');
  if (buffer.length > MAX_CHUNK_BYTES) {
    throw new ApiError(413, 'Chunk is too large.', 'chunk_too_large');
  }
  await write(owned, body.index, buffer);

  return created({
    uploadId: owned.id,
    received: owned.received.length,
    totalChunks: owned.totalChunks,
    complete: owned.received.length === owned.totalChunks,
    nextIndex: nextMissing(owned.received, owned.totalChunks),
  });
});

/** Binary chunk upload: PUT ?uploadId=…&index=… with the raw bytes as the body. */
export const PUT = handler(async (req: NextRequest) => {
  await enforceCsrf(req);
  const session = await requirePermission('files:write');
  await enforceRateLimit(req, 'upload-chunk', 600);

  const url = new URL(req.url);
  const uploadId = url.searchParams.get('uploadId') ?? '';
  const index = Number(url.searchParams.get('index') ?? '-1');
  if (!uploadId || !Number.isInteger(index) || index < 0) {
    throw new ApiError(400, 'uploadId and index are required.', 'bad_request');
  }

  const { getOwnedSession, writeChunk: write } = await import('@/lib/chunked-upload');
  const owned = await getOwnedSession(uploadId, session.id);

  const buffer = Buffer.from(await req.arrayBuffer());
  await write(owned, index, buffer);

  return created({
    uploadId: owned.id,
    received: owned.received.length,
    totalChunks: owned.totalChunks,
    complete: owned.received.length === owned.totalChunks,
    nextIndex: nextMissing(owned.received, owned.totalChunks),
  });
});

function nextMissing(received: number[], total: number): number | null {
  for (let i = 0; i < total; i += 1) {
    if (!received.includes(i)) return i;
  }
  return null;
}

async function readJsonSafe(req: NextRequest) {
  try {
    return await req.json();
  } catch {
    throw new ApiError(400, 'Invalid JSON body.', 'bad_request');
  }
}

export const dynamic = 'force-dynamic';
export const maxDuration = 300;
