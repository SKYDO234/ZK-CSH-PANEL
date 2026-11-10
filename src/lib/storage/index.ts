import path from 'node:path';
import { LocalStorageDriver } from './local';
import { S3StorageDriver } from './s3';
import type { StorageDriver } from './types';

export type { StorageDriver } from './types';

let driver: StorageDriver | null = null;

/**
 * Resolves the configured storage driver. `STORAGE_DRIVER=s3` in the
 * environment wins; otherwise the admin setting is honoured. This lets a
 * deployment switch to object storage without a code change.
 */
export function getStorageDriver(override?: 'local' | 's3'): StorageDriver {
  if (driver && !override) return driver;

  const configured = (override ?? process.env.STORAGE_DRIVER ?? 'local') as 'local' | 's3';

  if (configured === 's3') {
    const bucket = process.env.S3_BUCKET;
    const accessKeyId = process.env.S3_ACCESS_KEY_ID;
    const secretAccessKey = process.env.S3_SECRET_ACCESS_KEY;
    if (!bucket || !accessKeyId || !secretAccessKey) {
      throw new Error(
        'STORAGE_DRIVER=s3 requires S3_BUCKET, S3_ACCESS_KEY_ID and S3_SECRET_ACCESS_KEY.',
      );
    }
    const instance = new S3StorageDriver({
      bucket,
      region: process.env.S3_REGION ?? 'auto',
      accessKeyId,
      secretAccessKey,
      endpoint: process.env.S3_ENDPOINT,
      forcePathStyle: process.env.S3_FORCE_PATH_STYLE === 'true',
      publicBaseUrl: process.env.CDN_BASE_URL ?? process.env.S3_PUBLIC_BASE_URL,
    });
    if (!override) driver = instance;
    return instance;
  }

  const root = path.resolve(process.env.STORAGE_LOCAL_DIR ?? './storage/uploads');
  const instance = new LocalStorageDriver(root);
  if (!override) driver = instance;
  return instance;
}

export function resetStorageDriver() {
  driver = null;
}

/** Builds a collision-free, date-sharded storage key: `u/<owner>/2026/11/<uuid>.<ext>` */
export function buildStorageKey(params: {
  ownerId: string;
  extension: string;
  kind?: 'files' | 'thumbnails' | 'avatars' | 'branding';
}): string {
  const now = new Date();
  const year = now.getUTCFullYear();
  const month = String(now.getUTCMonth() + 1).padStart(2, '0');
  const id = globalThis.crypto.randomUUID();
  const ext = params.extension ? `.${params.extension.replace(/^\./, '')}` : '';
  const kind = params.kind ?? 'files';
  if (kind === 'branding') return `branding/${year}${month}/${id}${ext}`;
  return `${params.ownerId.slice(0, 2)}/${params.ownerId}/${kind}/${year}/${month}/${id}${ext}`;
}
