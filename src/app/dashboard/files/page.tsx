import type { Metadata } from 'next';
import { Suspense } from 'react';
import { requireSession } from '@/lib/session';
import { getSettings } from '@/lib/settings';
import { getStorageStats, listFiles, listFolders } from '@/lib/files';
import { Topbar } from '@/components/layout/topbar';
import { FileBrowser } from '@/components/files/file-browser';
import { Skeleton } from '@/components/ui/misc';

export const metadata: Metadata = { title: 'My files' };
export const dynamic = 'force-dynamic';

export default async function FilesPage({
  searchParams,
}: {
  searchParams: Promise<{ folder?: string; category?: string; search?: string; sort?: string }>;
}) {
  const session = await requireSession('/dashboard/files');
  const params = await searchParams;
  const settings = await getSettings();

  const folderId = params.folder && params.folder !== 'root' ? params.folder : null;

  const [result, folders, stats] = await Promise.all([
    listFiles({
      ownerId: session.id,
      folderId,
      category: params.category,
      search: params.search,
      sort: (params.sort as 'name' | 'size' | 'date' | 'type') ?? 'date',
      direction: 'desc',
      perPage: 48,
    }),
    listFolders(session.id),
    getStorageStats(session.id),
  ]);

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
      <div className="mx-auto max-w-7xl px-4 py-6 sm:px-6">
        <div className="mb-5">
          <h1 className="text-2xl font-semibold tracking-tight text-ink">My files</h1>
          <p className="mt-1 text-sm text-muted">
            Organise, share and embed your files. {result.total} item{result.total === 1 ? '' : 's'} in this view.
          </p>
        </div>

        <Suspense fallback={<Skeleton className="h-64 w-full" />}>
          <FileBrowser
            initialFiles={result.files}
            initialTotal={result.total}
            initialPage={result.page}
            initialTotalPages={result.totalPages}
            folders={folders}
            currentFolderId={folderId}
            maxFileSizeBytes={settings.storage.maxFileSizeBytes}
            allowedExtensions={settings.storage.allowedExtensions}
            remainingBytes={stats.availableBytes}
            canUpload={session.can('files:write')}
          />
        </Suspense>
      </div>
    </>
  );
}
