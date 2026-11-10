import type { Metadata } from 'next';
import { requireSession } from '@/lib/session';
import { getSettings } from '@/lib/settings';
import { listFiles } from '@/lib/files';
import { Topbar } from '@/components/layout/topbar';
import { TrashClient } from '@/components/files/trash-client';

export const metadata: Metadata = { title: 'Trash' };
export const dynamic = 'force-dynamic';

export default async function TrashPage() {
  const session = await requireSession('/dashboard/trash');
  const settings = await getSettings();
  const result = await listFiles({
    ownerId: session.id,
    status: 'trashed',
    perPage: 100,
    sort: 'date',
    direction: 'desc',
  });

  return (
    <>
      <Topbar
        user={{ name: session.name, email: session.email, avatarUrl: session.avatarUrl, roleLabel: session.role.label, isAdmin: session.isAdmin }}
        allowThemeToggle={settings.appearance.allowUserThemeToggle}
      />
      <div className="mx-auto max-w-5xl px-4 py-6 sm:px-6">
        <div className="mb-5">
          <h1 className="text-2xl font-semibold tracking-tight text-ink">Trash</h1>
          <p className="mt-1 text-sm text-muted">
            Deleted files are kept for {settings.storage.trashRetentionDays} days. Restoring them
            requires enough available storage.
          </p>
        </div>
        <TrashClient
          initialFiles={result.files}
          retentionDays={settings.storage.trashRetentionDays}
        />
      </div>
    </>
  );
}
