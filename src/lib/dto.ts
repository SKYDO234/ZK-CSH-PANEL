import type { FileRow } from '@/db/schema';

/** Shape accepted by toFileDTO() — a file row joined with its share columns. */
export type RawFileLike = FileRow & {
  shareToken: string | null;
  shareExpiresAt: Date | null;
  shareHasPassword: string | null;
  shareMaxDownloads: number | null;
  shareDownloadCount: number;
  shareAllowDownload: boolean;
  shareViewOnly: boolean;
  shareRevokedAt: Date | null;
};
