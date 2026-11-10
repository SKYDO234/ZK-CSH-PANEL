/**
 * BigInt cannot cross the server→client boundary in React Server Components or
 * be JSON-serialised. All DTOs that leave the server go through here.
 */

export type FileDTO = {
  id: string;
  name: string;
  originalName: string;
  mimeType: string;
  category: string;
  size: number;
  extension: string | null;
  folderId: string | null;
  visibility: 'PRIVATE' | 'LINK' | 'PUBLIC';
  downloadEnabled: boolean;
  hasThumbnail: boolean;
  metadata: Record<string, unknown> | null;
  downloadCount: number;
  viewCount: number;
  createdAt: string;
  updatedAt: string;
  deletedAt: string | null;
  shareToken: string | null;
  shareExpiresAt: string | null;
  shareHasPassword: boolean;
  shareMaxDownloads: number | null;
  shareDownloadCount: number;
  shareAllowDownload: boolean;
  shareViewOnly: boolean;
};

export type FolderDTO = {
  id: string;
  name: string;
  parentId: string | null;
  createdAt: string;
  fileCount?: number;
};

export type UserDTO = {
  id: string;
  email: string;
  name: string;
  status: 'ACTIVE' | 'SUSPENDED' | 'PENDING';
  roleId: string;
  roleName: 'SUPER_ADMIN' | 'ADMIN' | 'USER';
  roleLabel: string;
  quotaBytes: number;
  usedBytes: number;
  fileCount: number;
  avatarUrl: string | null;
  emailVerified: boolean;
  lastLoginAt: string | null;
  createdAt: string;
  notes: string | null;
};

export function num(value: bigint | number | string | null | undefined): number {
  if (value === null || value === undefined) return 0;
  if (typeof value === 'bigint') return Number(value);
  if (typeof value === 'string') {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : 0;
  }
  return value;
}

export function iso(value: Date | string | null | undefined): string | null {
  if (!value) return null;
  return value instanceof Date ? value.toISOString() : new Date(value).toISOString();
}
