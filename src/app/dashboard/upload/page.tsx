import type { Metadata } from 'next';
import { requireSession } from '@/lib/session';
import { getSettings } from '@/lib/settings';
import { getStorageStats, listFolders } from '@/lib/files';
import { Topbar } from '@/components/layout/topbar';
import { formatBytes } from '@/lib/format';
import { UploadPageClient } from '@/components/upload/upload-page-client';
import { ProgressBar } from '@/components/ui/misc';

export const metadata: Metadata = { title: 'Upload' };
export const dynamic = 'force-dynamic';

export default async function UploadPage() {
  const session = await requireSession('/dashboard/upload');
  const settings = await getSettings();
  const [stats, folders] = await Promise.all([getStorageStats(session.id), listFolders(session.id)]);

  return (
    <>
      <Topbar
        user={{
          name: session.name,
          email: session.email,
          avatarUrl: session.avatarUrl,
          roleLabel: session.role.label,
          isAdmin: session.isAdmin,
        }}
        allowThemeToggle={settings.appearance.allowUserThemeToggle}
      />
      <div className="mx-auto max-w-4xl px-4 py-6 sm:px-6 lg:py-8">
        <div className="mb-5 flex flex-wrap items-end justify-between gap-3">
          <div>
            <h1 className="text-2xl font-semibold tracking-tight text-ink">Upload files</h1>
            <p className="mt-1 text-sm text-muted">
              Drag and drop anywhere, or browse. Every upload gets a share link automatically.
            </p>
          </div>
          <div className="min-w-[13rem]">
            <div className="mb-1 flex items-center justify-between text-[11px] text-muted">
              <span>Storage</span>
              <span>
                {formatBytes(stats.usedBytes)} / {formatBytes(stats.totalBytes)}
              </span>
            </div>
            <ProgressBar value={stats.usedBytes} max={stats.totalBytes} size="sm" />
          </div>
        </div>

        <UploadPageClient
          folders={folders}
          maxFileSizeBytes={settings.storage.maxFileSizeBytes}
          allowedExtensions={settings.storage.allowedExtensions}
          remainingBytes={stats.availableBytes}
        />
      </div>
    </>
  );
}
