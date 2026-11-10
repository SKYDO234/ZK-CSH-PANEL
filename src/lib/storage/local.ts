import { createReadStream, createWriteStream } from 'node:fs';
import { mkdir, rm, stat, access, readFile, rename } from 'node:fs/promises';
import { dirname, join, normalize, resolve, sep } from 'node:path';
import { randomUUID } from 'node:crypto';
import { pipeline } from 'node:stream/promises';
import { Readable } from 'node:stream';
import type {
  ByteRange,
  GetStreamResult,
  PutOptions,
  PutResult,
  StatResult,
  StorageDriver,
} from './types';
import { mimeForExtension } from '../file-types';

/**
 * Local filesystem driver — the default for development and small single-server
 * deployments. Files live outside the web root and are only ever served through
 * the application (which enforces authorization and byte ranges), never by a
 * static file server, so private files cannot be fetched by guessing paths.
 */
export class LocalStorageDriver implements StorageDriver {
  readonly name = 'local' as const;
  private readonly root: string;

  constructor(rootDir: string) {
    this.root = resolve(rootDir);
  }

  /** Resolves a storage key to an absolute path, refusing traversal. */
  private pathFor(key: string): string {
    const normalised = normalize(key).replace(/^([.]{2}[/\\])+/, '');
    if (normalised.startsWith('..') || normalised.includes(`..${sep}`)) {
      throw new Error('Invalid storage key');
    }
    const full = join(this.root, normalised);
    if (!full.startsWith(this.root + sep) && full !== this.root) {
      throw new Error('Invalid storage key');
    }
    return full;
  }

  async put(key: string, body: Readable | Buffer, options: PutOptions): Promise<PutResult> {
    const target = this.pathFor(key);
    await mkdir(dirname(target), { recursive: true });
    // Write to a temp file then rename: uploads are atomic, so a cancelled
    // upload never leaves a truncated object behind under the final key.
    const temp = `${target}.${randomUUID()}.part`;
    try {
      if (Buffer.isBuffer(body)) {
        const { writeFile } = await import('node:fs/promises');
        await writeFile(temp, body);
      } else {
        await pipeline(body, createWriteStream(temp));
      }
      await rename(temp, target);
    } catch (err) {
      await rm(temp, { force: true }).catch(() => {});
      throw err;
    }
    const info = await stat(target);
    return { key, size: info.size };
  }

  async getStream(key: string, range?: ByteRange): Promise<GetStreamResult> {
    const target = this.pathFor(key);
    const info = await stat(target);
    const contentType = mimeForExtension(key.split('.').pop() ?? '');
    const isPartial = Boolean(range);
    const stream = range
      ? createReadStream(target, { start: range.start, end: range.end })
      : createReadStream(target);
    return {
      stream,
      contentLength: range ? range.end - range.start + 1 : info.size,
      totalSize: info.size,
      contentType,
      lastModified: info.mtime,
      isPartial,
    };
  }

  async getBuffer(key: string): Promise<Buffer> {
    return readFile(this.pathFor(key));
  }

  async stat(key: string): Promise<StatResult> {
    const info = await stat(this.pathFor(key));
    return {
      size: info.size,
      contentType: mimeForExtension(key.split('.').pop() ?? ''),
      lastModified: info.mtime,
    };
  }

  async delete(key: string): Promise<void> {
    await rm(this.pathFor(key), { force: true });
  }

  async exists(key: string): Promise<boolean> {
    try {
      await access(this.pathFor(key));
      return true;
    } catch {
      return false;
    }
  }

  async getSignedUrl(): Promise<string | null> {
    // Local files are streamed by the app itself; no direct URL exists.
    return null;
  }

  getPublicUrl(): string | null {
    return null;
  }
}
