import { and, asc, count, desc, eq, gt, ilike, inArray, isNull, isNotNull, or, sql, sum } from 'drizzle-orm';
import { db, files, folders, shares, users } from '@/db';
import type { FileRow } from '@/db/schema';
import { randomBase62 } from './crypto';
import { getSettings } from './settings';
import type { FileDTO, FolderDTO } from './serialize';
import type { RawFileLike } from './dto';
import { iso, num } from './serialize';

export type FileWithShare = FileRow & {
  shareToken: string | null;
  shareExpiresAt: Date | null;
  shareHasPassword: boolean;
  shareMaxDownloads: number | null;
  shareDownloadCount: number | null;
  shareAllowDownload: boolean | null;
  shareViewOnly: boolean | null;
  shareRevokedAt: Date | null;
};

const fileSelection = {
  id: files.id,
  ownerId: files.ownerId,
  folderId: files.folderId,
  name: files.name,
  originalName: files.originalName,
  mimeType: files.mimeType,
  category: files.category,
  size: files.size,
  hash: files.hash,
  extension: files.extension,
  storageDriver: files.storageDriver,
  storageKey: files.storageKey,
  metadata: files.metadata,
  thumbnailKey: files.thumbnailKey,
  hasThumbnail: files.hasThumbnail,
  status: files.status,
  visibility: files.visibility,
  downloadEnabled: files.downloadEnabled,
  downloadCount: files.downloadCount,
  viewCount: files.viewCount,
  bytesServed: files.bytesServed,
  ipAddress: files.ipAddress,
  userAgent: files.userAgent,
  deletedAt: files.deletedAt,
  createdAt: files.createdAt,
  updatedAt: files.updatedAt,
  shareToken: shares.token,
  shareExpiresAt: shares.expiresAt,
  shareHasPassword: shares.passwordHash,
  shareMaxDownloads: shares.maxDownloads,
  shareDownloadCount: shares.downloadCount,
  shareAllowDownload: shares.allowDownload,
  shareViewOnly: shares.viewOnly,
  shareRevokedAt: shares.revokedAt,
};

type RawFileRow = FileRow & {
  shareToken: string | null;
  shareExpiresAt: Date | null;
  shareHasPassword: string | null;
  shareMaxDownloads?: number | null;
  shareDownloadCount?: number | null;
  shareAllowDownload?: boolean | null;
  shareViewOnly?: boolean | null;
  shareRevokedAt?: Date | null;
};

export function toFileDTO(row: RawFileRow): FileDTO {
  const shareActive = Boolean(row.shareToken) && !row.shareRevokedAt;
  return {
    id: row.id,
    name: row.name,
    originalName: row.originalName,
    mimeType: row.mimeType,
    category: row.category,
    size: num(row.size),
    extension: row.extension,
    folderId: row.folderId,
    visibility: row.visibility,
    downloadEnabled: row.downloadEnabled,
    hasThumbnail: row.hasThumbnail,
    metadata: (row.metadata as Record<string, unknown> | null) ?? null,
    downloadCount: row.downloadCount,
    viewCount: row.viewCount,
    createdAt: iso(row.createdAt)!,
    updatedAt: iso(row.updatedAt)!,
    deletedAt: iso(row.deletedAt),
    shareToken: shareActive ? row.shareToken : null,
    shareExpiresAt: iso(row.shareExpiresAt),
    shareHasPassword: Boolean(row.shareHasPassword),
    shareMaxDownloads: row.shareMaxDownloads ?? null,
    shareDownloadCount: row.shareDownloadCount ?? 0,
    shareAllowDownload: row.shareAllowDownload ?? true,
    shareViewOnly: row.shareViewOnly ?? false,
  };
}

export type FileListQuery = {
  ownerId?: string;
  folderId?: string | null;
  category?: string;
  search?: string;
  sort?: 'name' | 'size' | 'date' | 'type';
  direction?: 'asc' | 'desc';
  status?: 'active' | 'trashed' | 'all';
  page?: number;
  perPage?: number;
  visibility?: 'shared' | 'private';
};

export async function listFiles(query: FileListQuery) {
  const page = Math.max(1, query.page ?? 1);
  const perPage = Math.min(100, Math.max(1, query.perPage ?? 24));
  const search = query.search?.trim();

  const filters = [];
  if (query.ownerId) filters.push(eq(files.ownerId, query.ownerId));
  if (query.status === 'trashed') filters.push(isNotNull(files.deletedAt));
  else if (query.status !== 'all') filters.push(isNull(files.deletedAt));
  filters.push(eq(files.status, 'READY'));

  if (query.folderId !== undefined) {
    filters.push(query.folderId === null ? isNull(files.folderId) : eq(files.folderId, query.folderId));
  }
  if (query.category && query.category !== 'all') filters.push(eq(files.category, query.category));
  if (search) {
    filters.push(or(ilike(files.name, `%${search}%`), ilike(files.originalName, `%${search}%`)));
  }
  if (query.visibility === 'shared') {
    filters.push(and(isNotNull(shares.token), isNull(shares.revokedAt), eq(files.visibility, 'LINK')));
  }
  if (query.visibility === 'private') {
    filters.push(or(isNull(shares.token), isNull(files.visibility), eq(files.visibility, 'PRIVATE')));
  }

  const where = and(...filters);
  const dir = query.direction === 'asc' ? asc : desc;
  const orderBy = (() => {
    switch (query.sort) {
      case 'name':
        return [dir(files.name)];
      case 'size':
        return [dir(files.size)];
      case 'type':
        return [dir(files.category), desc(files.createdAt)];
      default:
        return [dir(files.createdAt)];
    }
  })();

  const [rows, totalRows] = await Promise.all([
    db
      .select(fileSelection)
      .from(files)
      .leftJoin(shares, eq(shares.fileId, files.id))
      .where(where)
      .orderBy(...orderBy)
      .limit(perPage)
      .offset((page - 1) * perPage),
    db
      .select({ value: count() })
      .from(files)
      .leftJoin(shares, eq(shares.fileId, files.id))
      .where(where),
  ]);

  const total = Number(totalRows[0]?.value ?? 0);
  return {
    files: rows.map((row) => toFileDTO(row as unknown as RawFileRow)),
    total,
    page,
    perPage,
    totalPages: Math.max(1, Math.ceil(total / perPage)),
  };
}

export async function getFileForOwner(fileId: string, ownerId: string) {
  const rows = await db
    .select(fileSelection)
    .from(files)
    .leftJoin(shares, eq(shares.fileId, files.id))
    .where(and(eq(files.id, fileId), eq(files.ownerId, ownerId)))
    .limit(1);
  return rows[0] ? toFileDTO(rows[0] as unknown as RawFileRow) : null;
}

/** Full row including storage keys — server-side use only. */
export async function getFileRow(fileId: string) {
  const rows = await db.select().from(files).where(eq(files.id, fileId)).limit(1);
  return rows[0] ?? null;
}

export type StorageStats = {
  totalBytes: number;
  usedBytes: number;
  availableBytes: number;
  fileCount: number;
  byCategory: Record<string, { count: number; bytes: number }>;
};

export async function getStorageStats(ownerId: string): Promise<StorageStats> {
  const [usageRows, categoryRows, userRow] = await Promise.all([
    db
      .select({ bytes: sum(files.size), files: count() })
      .from(files)
      .where(and(eq(files.ownerId, ownerId), isNull(files.deletedAt), eq(files.status, 'READY'))),
    db
      .select({ category: files.category, bytes: sum(files.size), files: count() })
      .from(files)
      .where(and(eq(files.ownerId, ownerId), isNull(files.deletedAt), eq(files.status, 'READY')))
      .groupBy(files.category),
    db.select({ quotaBytes: users.quotaBytes, usedBytes: users.usedBytes }).from(users).where(eq(users.id, ownerId)).limit(1),
  ]);

  const byCategory: StorageStats['byCategory'] = {};
  for (const row of categoryRows) {
    byCategory[row.category] = { count: Number(row.files), bytes: Number(row.bytes ?? 0) };
  }

  const totalBytes = num(userRow[0]?.quotaBytes ?? 0);
  const usedBytes = Number(usageRows[0]?.bytes ?? 0);
  return {
    totalBytes,
    usedBytes,
    availableBytes: Math.max(0, totalBytes - usedBytes),
    fileCount: Number(usageRows[0]?.files ?? 0),
    byCategory,
  };
}

export async function listFolders(ownerId: string, options?: { trashed?: boolean }): Promise<FolderDTO[]> {
  const rows = await db
    .select({
      id: folders.id,
      name: folders.name,
      parentId: folders.parentId,
      createdAt: folders.createdAt,
      fileCount: sql<number>`(
        SELECT count(*) FROM ${files}
        WHERE ${files.folderId} = ${folders.id} AND ${files.deletedAt} IS NULL
      )`,
    })
    .from(folders)
    .where(and(eq(folders.ownerId, ownerId), isNull(folders.deletedAt)))
    .orderBy(asc(folders.name));

  return rows.map((row) => ({
    id: row.id,
    name: row.name,
    parentId: row.parentId,
    createdAt: iso(row.createdAt)!,
    fileCount: Number(row.fileCount ?? 0),
  }));
}

export async function recentUploads(ownerId: string, limit = 6) {
  const rows = await db
    .select(fileSelection)
    .from(files)
    .leftJoin(shares, eq(shares.fileId, files.id))
    .where(and(eq(files.ownerId, ownerId), isNull(files.deletedAt), eq(files.status, 'READY')))
    .orderBy(desc(files.createdAt))
    .limit(limit);
  return rows.map((row) => toFileDTO(row as unknown as RawFileRow));
}

/**
 * Ensures a file has an active share token. Existing tokens are preserved so
 * previously distributed links never break unless explicitly regenerated.
 */
export async function ensureShareToken(
  fileId: string,
  ownerId: string,
  options?: {
    visibility?: 'LINK' | 'PUBLIC';
    allowDownload?: boolean;
    embeddable?: boolean;
    expiresAt?: Date | null;
  },
) {
  const existing = await db.select().from(shares).where(eq(shares.fileId, fileId)).limit(1);
  const settings = await getSettings();

  if (existing[0] && !existing[0].revokedAt) {
    if (options?.visibility) {
      await db
        .update(files)
        .set({ visibility: options.visibility, updatedAt: new Date() })
        .where(eq(files.id, fileId));
    }
    return existing[0];
  }

  if (existing[0]?.revokedAt) {
    // Re-enable a revoked share with a fresh token.
    const [updated] = await db
      .update(shares)
      .set({
        token: randomBase62(12),
        revokedAt: null,
        expiresAt: options?.expiresAt ?? null,
        updatedAt: new Date(),
      })
      .where(eq(shares.id, existing[0].id))
      .returning();
    return updated;
  }

  const expiry =
    options?.expiresAt !== undefined
      ? options.expiresAt
      : settings.sharing.defaultLinkExpiryDays
        ? new Date(Date.now() + settings.sharing.defaultLinkExpiryDays * 86400_000)
        : null;

  const [createdShare] = await db
    .insert(shares)
    .values({
      token: randomBase62(12),
      fileId,
      ownerId,
      allowDownload: options?.allowDownload ?? settings.sharing.allowDownloadByDefault,
      embeddable: options?.embeddable ?? settings.sharing.allowEmbedding,
      expiresAt: expiry,
    })
    .returning();

  await db
    .update(files)
    .set({ visibility: options?.visibility ?? settings.sharing.defaultVisibility, updatedAt: new Date() })
    .where(eq(files.id, fileId));

  return createdShare;
}

/** Resolves a share token to its file + owner, honouring revocation/expiry. */
export async function resolveShare(token: string) {
  const rows = await db
    .select({
      share: shares,
      file: files,
      owner: {
        id: users.id,
        name: users.name,
        status: users.status,
      },
    })
    .from(shares)
    .innerJoin(files, eq(files.id, shares.fileId))
    .innerJoin(users, eq(users.id, files.ownerId))
    .where(eq(shares.token, token))
    .limit(1);

  const row = rows[0];
  if (!row) return { status: 'not_found' as const };

  if (row.share.revokedAt) return { status: 'revoked' as const };
  if (row.file.deletedAt) return { status: 'deleted' as const };
  if (row.file.status !== 'READY') return { status: 'not_ready' as const };
  if (row.owner.status === 'SUSPENDED') return { status: 'owner_suspended' as const };
  if (row.share.expiresAt && row.share.expiresAt.getTime() < Date.now()) {
    return { status: 'expired' as const };
  }
  if (row.share.maxDownloads !== null && row.share.downloadCount >= row.share.maxDownloads) {
    return { status: 'download_limit' as const };
  }
  return { status: 'ok' as const, share: row.share, file: row.file, owner: row.owner };
}

/** Counts files ready for admin dashboards. */
export async function platformFileStats() {
  const [totals, categories, recent] = await Promise.all([
    db
      .select({ files: count(), bytes: sum(files.size) })
      .from(files)
      .where(and(isNull(files.deletedAt), eq(files.status, 'READY'))),
    db
      .select({ category: files.category, files: count(), bytes: sum(files.size) })
      .from(files)
      .where(and(isNull(files.deletedAt), eq(files.status, 'READY')))
      .groupBy(files.category),
    db
      .select({
        id: files.id,
        name: files.name,
        size: files.size,
        category: files.category,
        createdAt: files.createdAt,
        ownerName: users.name,
        ownerId: users.id,
      })
      .from(files)
      .innerJoin(users, eq(users.id, files.ownerId))
      .where(and(isNull(files.deletedAt), eq(files.status, 'READY')))
      .orderBy(desc(files.createdAt))
      .limit(8),
  ]);

  const byCategory: Record<string, { count: number; bytes: number }> = {};
  for (const row of categories) {
    byCategory[row.category] = { count: Number(row.files), bytes: Number(row.bytes ?? 0) };
  }

  return {
    totalFiles: Number(totals[0]?.files ?? 0),
    totalBytes: Number(totals[0]?.bytes ?? 0),
    byCategory,
    recent: recent.map((row) => ({
      ...row,
      size: Number(row.size),
      createdAt: iso(row.createdAt)!,
    })),
  };
}

/** Identifies files whose names already exist in a folder (for duplicate handling). */
export async function existingNames(ownerId: string, folderId: string | null, names: string[]) {
  if (names.length === 0) return new Set<string>();
  const rows = await db
    .select({ name: files.name })
    .from(files)
    .where(
      and(
        eq(files.ownerId, ownerId),
        isNull(files.deletedAt),
        folderId ? eq(files.folderId, folderId) : isNull(files.folderId),
        inArray(files.name, names),
      ),
    );
  return new Set(rows.map((r) => r.name.toLowerCase()));
}

/**
 * Atomic quota reservation.
 *
 * The update only succeeds if the user has enough headroom, which prevents two
 * concurrent uploads from jointly exceeding the quota (a classic race).
 */
export async function reserveQuota(userId: string, bytes: bigint): Promise<boolean> {
  const result = await db
    .update(users)
    .set({ usedBytes: sql`${users.usedBytes} + ${bytes}` })
    .where(and(eq(users.id, userId), sql`${users.usedBytes} + ${bytes} <= ${users.quotaBytes}`))
    .returning({ id: users.id });
  return result.length > 0;
}

export async function releaseQuota(userId: string, bytes: bigint) {
  await db
    .update(users)
    .set({ usedBytes: sql`GREATEST(${users.usedBytes} - ${bytes}, 0)` })
    .where(eq(users.id, userId));
}

/** Recomputes usedBytes from scratch — used by the admin repair action. */
export async function recalculateUsage(userId: string) {
  const rows = await db
    .select({ bytes: sum(files.size) })
    .from(files)
    .where(and(eq(files.ownerId, userId), isNull(files.deletedAt), eq(files.status, 'READY')));
  const used = BigInt(Number(rows[0]?.bytes ?? 0));
  await db.update(users).set({ usedBytes: used }).where(eq(users.id, userId));
  return used;
}

export async function countActiveShares(ownerId: string) {
  const rows = await db
    .select({ value: count() })
    .from(shares)
    .where(and(eq(shares.ownerId, ownerId), isNull(shares.revokedAt)));
  return Number(rows[0]?.value ?? 0);
}

export async function expiringShares(ownerId: string, days = 7) {
  const rows = await db
    .select({ token: shares.token, expiresAt: shares.expiresAt, name: files.name })
    .from(shares)
    .innerJoin(files, eq(files.id, shares.fileId))
    .where(
      and(
        eq(shares.ownerId, ownerId),
        isNull(shares.revokedAt),
        isNotNull(shares.expiresAt),
        gt(shares.expiresAt, new Date()),
        sql`${shares.expiresAt} < now() + (${days} || ' days')::interval`,
      ),
    )
    .limit(5);
  return rows;
}
