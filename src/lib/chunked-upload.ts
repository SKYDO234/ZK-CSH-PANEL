import { createHash, randomBytes } from 'node:crypto';
import { mkdir, readdir, rm, stat, writeFile, readFile } from 'node:fs/promises';
import path from 'node:path';
import { Readable } from 'node:stream';
import { ApiError } from './api';

/**
 * Resumable upload sessions.
 *
 * Large files are split by the browser and sent as sequential chunks. Chunks are
 * staged on the web tier (`.data/uploads/<uploadId>`) and assembled into the
 * object store once complete. The session id is an unguessable random token
 * bound to the owner, so one user can never append to another user's upload.
 *
 * Layout:
 *   .data/uploads/<uploadId>/meta.json     session metadata
 *   .data/uploads/<uploadId>/00000.part    received chunks
 */

export const CHUNK_SIZE_BYTES = 8 * 1024 * 1024; // 8 MB
export const MAX_CHUNK_BYTES = 16 * 1024 * 1024; // hard ceiling per request
export const SESSION_TTL_MS = 24 * 60 * 60 * 1000; // abandon after 24h

const ROOT = path.join(process.cwd(), '.data', 'uploads');

export type UploadSession = {
  id: string;
  ownerId: string;
  fileName: string;
  mimeType: string;
  folderId: string | null;
  declaredSize: number;
  chunkSize: number;
  totalChunks: number;
  received: number[];
  createdAt: string;
  updatedAt: string;
};

function sessionDir(id: string) {
  if (!/^[a-f0-9]{32}$/.test(id)) {
    throw new ApiError(400, 'Invalid upload session.', 'invalid_session');
  }
  return path.join(ROOT, id);
}

async function readSession(id: string): Promise<UploadSession> {
  try {
    const raw = await readFile(path.join(sessionDir(id), 'meta.json'), 'utf8');
    return JSON.parse(raw) as UploadSession;
  } catch {
    throw new ApiError(404, 'Upload session not found or expired.', 'session_not_found');
  }
}

async function writeSession(session: UploadSession) {
  session.updatedAt = new Date().toISOString();
  await writeFile(path.join(sessionDir(session.id), 'meta.json'), JSON.stringify(session), 'utf8');
}

export async function createSession(params: {
  ownerId: string;
  fileName: string;
  mimeType: string;
  folderId: string | null;
  declaredSize: number;
  chunkSize?: number;
}): Promise<UploadSession> {
  const chunkSize = Math.min(params.chunkSize ?? CHUNK_SIZE_BYTES, MAX_CHUNK_BYTES);
  const totalChunks = Math.max(1, Math.ceil(params.declaredSize / chunkSize));
  const id = randomBytes(16).toString('hex');

  const session: UploadSession = {
    id,
    ownerId: params.ownerId,
    fileName: params.fileName,
    mimeType: params.mimeType,
    folderId: params.folderId,
    declaredSize: params.declaredSize,
    chunkSize,
    totalChunks,
    received: [],
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };

  await mkdir(sessionDir(id), { recursive: true });
  await writeSession(session);
  return session;
}

/** Returns the session only if the caller owns it. */
export async function getOwnedSession(id: string, ownerId: string): Promise<UploadSession> {
  const session = await readSession(id);
  if (session.ownerId !== ownerId) {
    throw new ApiError(404, 'Upload session not found or expired.', 'session_not_found');
  }
  return session;
}

export async function writeChunk(session: UploadSession, index: number, data: Buffer) {
  if (!Number.isInteger(index) || index < 0 || index >= session.totalChunks) {
    throw new ApiError(422, 'Chunk index out of range.', 'invalid_chunk');
  }
  if (data.length === 0) throw new ApiError(422, 'Empty chunk.', 'invalid_chunk');
  if (data.length > session.chunkSize) {
    throw new ApiError(413, 'Chunk is larger than the negotiated size.', 'chunk_too_large');
  }

  await writeFile(path.join(sessionDir(session.id), `${String(index).padStart(5, '0')}.part`), data);
  if (!session.received.includes(index)) {
    session.received.push(index);
    session.received.sort((a, b) => a - b);
  }
  await writeSession(session);
}

export function isComplete(session: UploadSession) {
  return session.received.length === session.totalChunks;
}

/** Concatenates the staged chunks into a single readable stream. */
export async function assemble(session: UploadSession): Promise<Readable> {
  const parts: Buffer[] = [];
  for (let i = 0; i < session.totalChunks; i += 1) {
    const file = path.join(sessionDir(session.id), `${String(i).padStart(5, '0')}.part`);
    try {
      parts.push(await readFile(file));
    } catch {
      throw new ApiError(422, `Chunk ${i} is missing.`, 'incomplete_upload');
    }
  }
  return Readable.from(Buffer.concat(parts));
}

/** Peek at the first bytes without assembling the whole file. */
export async function headBytes(session: UploadSession, bytes = 4096): Promise<Buffer> {
  const file = path.join(sessionDir(session.id), '00000.part');
  const buffer = await readFile(file);
  return buffer.subarray(0, bytes);
}

export async function discardSession(id: string) {
  await rm(sessionDir(id), { recursive: true, force: true }).catch(() => {});
}

/** Removes sessions that have been idle past their TTL. Returns the count. */
export async function sweepSessions(): Promise<number> {
  let removed = 0;
  let entries: string[] = [];
  try {
    entries = await readdir(ROOT);
  } catch {
    return 0;
  }
  const now = Date.now();
  for (const entry of entries) {
    const dir = path.join(ROOT, entry);
    try {
      const info = await stat(dir);
      if (now - info.mtimeMs > SESSION_TTL_MS) {
        await rm(dir, { recursive: true, force: true });
        removed += 1;
      }
    } catch {
      /* ignore */
    }
  }
  return removed;
}

export function sha256Of(buffer: Buffer) {
  return createHash('sha256').update(buffer).digest('hex');
}
