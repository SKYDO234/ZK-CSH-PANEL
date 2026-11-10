import type { Readable } from 'node:stream';

/**
 * Storage driver contract. The application never talks to a filesystem or a
 * bucket directly — everything goes through this interface, so switching
 * between local disk, Amazon S3, Cloudflare R2, Backblaze B2, MinIO or any
 * other S3-compatible provider is a configuration change only.
 */
export interface StorageDriver {
  readonly name: 'local' | 's3';

  /** Persists a stream. Returns the bytes written. */
  put(key: string, body: Readable | Buffer, options: PutOptions): Promise<PutResult>;

  /** Opens a readable stream for a byte range (or the whole object). */
  getStream(key: string, range?: ByteRange): Promise<GetStreamResult>;

  /** Whole-file buffer (thumbnails, small assets). Avoid for large media. */
  getBuffer(key: string): Promise<Buffer>;

  /** Metadata without downloading the object. */
  stat(key: string): Promise<StatResult>;

  delete(key: string): Promise<void>;

  /** True if the object exists. */
  exists(key: string): Promise<boolean>;

  /**
   * A URL a browser can fetch directly. For S3 this is a presigned URL with a
   * short TTL; for local storage the application streams the bytes itself and
   * this returns null.
   */
  getSignedUrl(key: string, expiresInSeconds: number, options?: SignedUrlOptions): Promise<string | null>;

  /** Public CDN/base URL for a key, if configured. */
  getPublicUrl(key: string): string | null;
}

export type PutOptions = {
  contentType?: string;
  contentLength?: number;
  /** Cache-Control header applied at the object level */
  cacheControl?: string;
  metadata?: Record<string, string>;
  /** Content-Disposition override */
  disposition?: string;
};

export type PutResult = { key: string; size: number; etag?: string };

export type ByteRange = { start: number; end: number };

export type GetStreamResult = {
  stream: Readable;
  /** Bytes in this response (range length or full size) */
  contentLength: number;
  /** Full object size, needed to build Content-Range headers */
  totalSize: number;
  contentType: string;
  etag?: string;
  lastModified?: Date;
  isPartial: boolean;
};

export type StatResult = {
  size: number;
  contentType?: string;
  etag?: string;
  lastModified?: Date;
};

export type SignedUrlOptions = {
  /** Force download with a filename */
  downloadFilename?: string;
  responseContentType?: string;
  responseContentDisposition?: string;
};
