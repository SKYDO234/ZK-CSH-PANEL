import type { Metadata } from 'next';
import Link from 'next/link';
import { desc, and, eq, isNull, isNotNull } from 'drizzle-orm';
import { requireSession } from '@/lib/session';
import { getSettings } from '@/lib/settings';
import { db, files, shares } from '@/db';
import { Topbar } from '@/components/layout/topbar';
import { formatBytes, formatDateTime, timeAgo } from '@/lib/format';
import { EmptyState } from '@/components/ui/misc';
import { Link2, Lock, Upload, CalendarClock } from 'lucide-react';
import { FileTypeIcon } from '@/components/files/file-icon';
import { SharedLinkRow } from '@/components/files/shared-link-row';
import type { FileDTO } from '@/lib/serialize';
import { num, iso } from '@/lib/serialize';

export const metadata: Metadata = { title: 'Shared links' };
export const dynamic = 'force-dynamic';

export default async function LinksPage() {
  const session = await requireSession('/dashboard/links');
  const settings = await getSettings();

  const rows = await db
    .select({
      file: files,
      share: shares,
    })
    .from(shares)
    .innerJoin(files, eq(files.id, shares.fileId))
    .where(and(eq(shares.ownerId, session.id), isNull(shares.revokedAt), isNull(files.deletedAt)))
    .orderBy(desc(shares.updatedAt))
    .limit(100);

  const items = rows.map((row) => ({
    file: {
      id: row.file.id,
      name: row.file.name,
      originalName: row.file.originalName,
      mimeType: row.file.mimeType,
      category: row.file.category,
      size: num(row.file.size),
      extension: row.file.extension,
      folderId: row.file.folderId,
      visibility: row.file.visibility,
      downloadEnabled: row.file.downloadEnabled,
      hasThumbnail: row.file.hasThumbnail,
      metadata: row.file.metadata as Record<string, unknown> | null,
      downloadCount: row.file.downloadCount,
      viewCount: row.file.viewCount,
      createdAt: iso(row.file.createdAt)!,
      updatedAt: iso(row.file.updatedAt)!,
      deletedAt: null,
      shareToken: row.share.token,
      shareExpiresAt: iso(row.share.expiresAt),
      shareHasPassword: Boolean(row.share.passwordHash),
      shareMaxDownloads: row.share.maxDownloads,
      shareDownloadCount: row.share.downloadCount,
      shareAllowDownload: row.share.allowDownload,
      shareViewOnly: row.share.viewOnly,
    } satisfies FileDTO,
    stats: {
      views: row.file.viewCount,
      downloads: row.share.downloadCount,
      lastAccess: iso(row.share.lastAccessAt),
      expiresAt: iso(row.share.expiresAt),
      hasPassword: Boolean(row.share.passwordHash),
      viewOnly: row.share.viewOnly,
      embeddable: row.share.embeddable,
      maxDownloads: row.share.maxDownloads,
    },
  }));

  const totalDownloads = items.reduce((sum, item) => sum + item.stats.downloads, 0);
  const expiringSoon = (
    await db
      .select({ id: shares.id })
      .from(shares)
      .where(
        and(
          eq(shares.ownerId, session.id),
          isNull(shares.revokedAt),
          isNotNull(shares.expiresAt),
        ),
      )
      .limit(200)
  ).filter((_, index) => index < 0).length;

  return (
    <>
      <Topbar
        user={{ name: session.name, email: session.email, avatarUrl: session.avatarUrl, roleLabel: session.role.label, isAdmin: session.isAdmin }}
        allowThemeToggle={settings.appearance.allowUserThemeToggle}
      />
      <div className="mx-auto max-w-6xl px-4 py-6 sm:px-6">
        <div className="mb-5 flex flex-wrap items-end justify-between gap-3">
          <div>
            <h1 className="text-2xl font-semibold tracking-tight text-ink">Shared links</h1>
            <p className="mt-1 text-sm text-muted">
              {items.length} active link{items.length === 1 ? '' : 's'} · {totalDownloads} download
              {totalDownloads === 1 ? '' : 's'} served
            </p>
          </div>
          <Link href="/dashboard/files" className="btn-secondary btn-sm">
            <Link2 className="h-3.5 w-3.5" /> Manage files
          </Link>
        </div>

        {items.length === 0 ? (
          <div className="card">
            <EmptyState
              icon={<Link2 className="h-6 w-6" />}
              title="No active share links"
              description="Share links are created automatically when you upload, or from the Share menu on any file."
              action={
                <Link href="/dashboard/upload" className="btn-primary btn-sm">
                  <Upload className="h-3.5 w-3.5" /> Upload a file
                </Link>
              }
            />
          </div>
        ) : (
          <div className="card overflow-hidden">
            <div className="overflow-x-auto">
              <table className="table-base">
                <thead>
                  <tr>
                    <th>File</th>
                    <th className="hidden sm:table-cell">Protection</th>
                    <th className="hidden md:table-cell">Activity</th>
                    <th className="hidden lg:table-cell">Expires</th>
                    <th className="w-24 text-right">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {items.map((item) => (
                    <tr key={item.file.id}>
                      <td>
                        <div className="flex items-center gap-2.5">
                          <FileTypeIcon category={item.file.category} extension={item.file.extension} size="sm" />
                          <div className="min-w-0">
                            <a
                              href={`/share/${item.file.shareToken}`}
                              target="_blank"
                              rel="noreferrer"
                              className="block max-w-[15rem] truncate text-sm font-medium text-ink hover:text-brand"
                            >
                              {item.file.name}
                            </a>
                            <p className="text-[11px] text-muted">{formatBytes(item.file.size)}</p>
                          </div>
                        </div>
                      </td>
                      <td className="hidden sm:table-cell">
                        <div className="flex flex-wrap items-center gap-1">
                          {item.stats.hasPassword ? (
                            <span className="badge-amber">
                              <Lock className="h-3 w-3" /> Password
                            </span>
                          ) : (
                            <span className="badge-neutral">Open link</span>
                          )}
                          {item.stats.viewOnly ? <span className="badge-brand">View only</span> : null}
                        </div>
                      </td>
                      <td className="hidden text-xs text-muted md:table-cell">
                        {item.stats.downloads} downloads
                        {item.stats.lastAccess ? ` · ${timeAgo(item.stats.lastAccess)}` : ' · no access yet'}
                      </td>
                      <td className="hidden text-xs text-muted lg:table-cell">
                        {item.stats.expiresAt ? (
                          <span className="inline-flex items-center gap-1">
                            <CalendarClock className="h-3 w-3" /> {formatDateTime(item.stats.expiresAt)}
                          </span>
                        ) : (
                          'Never'
                        )}
                      </td>
                      <td>
                        <div className="flex justify-end">
                          <SharedLinkRow file={item.file} />
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}
        <p className="mt-4 text-[11px] text-muted">
          Tip: use <strong className="font-semibold text-ink">Copy direct URL</strong> for the raw file URL
          (perfect for <code className="rounded bg-canvas px-1">&lt;img&gt;</code> tags) and{' '}
          <strong className="font-semibold text-ink">Copy embed</strong> for the iframe player.
        </p>
        {expiringSoon ? null : null}
      </div>
    </>
  );
}
