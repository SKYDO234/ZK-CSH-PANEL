import {
  S3Client,
  PutObjectCommand,
  GetObjectCommand,
  DeleteObjectCommand,
  HeadObjectCommand,
  CopyObjectCommand,
} from '@aws-sdk/client-s3';
import { getSignedUrl as presign } from '@aws-sdk/s3-request-presigner';
import { Readable } from 'node:stream';
import type {
  ByteRange,
  GetStreamResult,
  PutOptions,
  PutResult,
  SignedUrlOptions,
  StatResult,
  StorageDriver,
} from './types';

/**
 * S3-compatible driver. Works with Amazon S3, Cloudflare R2, Backblaze B2,
 * MinIO, DigitalOcean Spaces, Wasabi, IDrive e2 and friends — anything that
 * speaks the S3 API. Point S3_ENDPOINT at the provider and set
 * S3_FORCE_PATH_STYLE=true for providers that require path-style addressing.
 *
 * Large uploads stream through the API (no full-file buffering). For very large
 * objects on production, put the bucket behind a CDN and enable
 * S3_PUBLIC_BASE_URL / CDN_BASE_URL so media requests bypass the app entirely.
 */
export class S3StorageDriver implements StorageDriver {
  readonly name = 's3' as const;
  private client: S3Client;
  private bucket: string;
  private publicBase?: string;

  constructor(config: {
    bucket: string;
    region: string;
    accessKeyId: string;
    secretAccessKey: string;
    endpoint?: string;
    forcePathStyle?: boolean;
    publicBaseUrl?: string;
  }) {
    this.bucket = config.bucket;
    this.publicBase = config.publicBaseUrl?.replace(/\/+$/, '');
    this.client = new S3Client({
      region: config.region,
      endpoint: config.endpoint || undefined,
      forcePathStyle: config.forcePathStyle ?? Boolean(config.endpoint),
      credentials: {
        accessKeyId: config.accessKeyId,
        secretAccessKey: config.secretAccessKey,
      },
    });
  }

  async put(key: string, body: Readable | Buffer, options: PutOptions): Promise<PutResult> {
    const command = new PutObjectCommand({
      Bucket: this.bucket,
      Key: key,
      Body: body,
      ContentType: options.contentType,
      CacheControl: options.cacheControl,
      ContentDisposition: options.disposition,
      Metadata: options.metadata,
      ContentLength: options.contentLength,
    });
    const result = await this.client.send(command);
    return {
      key,
      size: options.contentLength ?? 0,
      etag: result.ETag?.replaceAll('"', ''),
    };
  }

  async getStream(key: string, range?: ByteRange): Promise<GetStreamResult> {
    const head = await this.stat(key);
    const command = new GetObjectCommand({
      Bucket: this.bucket,
      Key: key,
      Range: range ? `bytes=${range.start}-${range.end}` : undefined,
    });
    const response = await this.client.send(command);
    if (!response.Body) throw new Error('Empty object body');
    return {
      stream: response.Body as Readable,
      contentLength: range ? range.end - range.start + 1 : head.size,
      totalSize: head.size,
      contentType: head.contentType ?? 'application/octet-stream',
      etag: head.etag,
      lastModified: head.lastModified,
      isPartial: Boolean(range),
    };
  }

  async getBuffer(key: string): Promise<Buffer> {
    const response = await this.client.send(
      new GetObjectCommand({ Bucket: this.bucket, Key: key }),
    );
    if (!response.Body) throw new Error('Empty object body');
    const chunks: Buffer[] = [];
    for await (const chunk of response.Body as Readable) chunks.push(Buffer.from(chunk));
    return Buffer.concat(chunks);
  }

  async stat(key: string): Promise<StatResult> {
    const head = await this.client.send(new HeadObjectCommand({ Bucket: this.bucket, Key: key }));
    return {
      size: Number(head.ContentLength ?? 0),
      contentType: head.ContentType,
      etag: head.ETag?.replaceAll('"', ''),
      lastModified: head.LastModified,
    };
  }

  async delete(key: string): Promise<void> {
    await this.client.send(new DeleteObjectCommand({ Bucket: this.bucket, Key: key }));
  }

  async exists(key: string): Promise<boolean> {
    try {
      await this.stat(key);
      return true;
    } catch {
      return false;
    }
  }

  /** Server-side copy, used when regenerating keys or moving between prefixes. */
  async copy(sourceKey: string, destinationKey: string): Promise<void> {
    await this.client.send(
      new CopyObjectCommand({
        Bucket: this.bucket,
        CopySource: `${this.bucket}/${encodeURIComponent(sourceKey)}`,
        Key: destinationKey,
      }),
    );
  }

  async getSignedUrl(
    key: string,
    expiresInSeconds: number,
    options?: SignedUrlOptions,
  ): Promise<string | null> {
    if (this.publicBase) {
      return `${this.publicBase}/${key}`;
    }
    return presign(
      this.client,
      new GetObjectCommand({
        Bucket: this.bucket,
        Key: key,
        ResponseContentType: options?.responseContentType,
        ResponseContentDisposition: options?.responseContentDisposition,
      }),
      { expiresIn: Math.max(5, Math.min(expiresInSeconds, 60 * 60 * 24 * 7)) },
    );
  }

  getPublicUrl(key: string): string | null {
    return this.publicBase ? `${this.publicBase}/${key}` : null;
  }
}
