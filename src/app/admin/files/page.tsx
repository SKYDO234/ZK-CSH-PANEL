import type { Metadata } from 'next';
import { requireAdmin } from '@/lib/session';
import { getSettings } from '@/lib/settings';
import { platformFileStats } from '@/lib/files';
import { Topbar } from '@/components/layout/topbar';
import { AdminFilesTable } from '@/components/admin/files-table';
import { formatBytes, formatNumber } from '@/lib/format';

export const metadata: Metadata = { title: 'All files' };
export const dynamic = 'force-dynamic';

export default async function AdminFilesPage() {
  const session = await requireAdmin('/admin/files');
  const settings = await getSettings();
  const stats = await platformFileStats();

  return (
    <>
      <Topbar
        user={{ name: session.name, email: session.email, avatarUrl: session.avatarUrl, roleLabel: session.role.label, isAdmin: true }}
        allowThemeToggle={settings.appearance.allowUserThemeToggle}
      />
      <div className="mx-auto max-w-7xl px-4 py-6 sm:px-6">
        <div className="mb-5">
          <h1 className="text-2xl font-semibold tracking-tight text-ink">All files</h1>
          <p className="mt-1 text-sm text-muted">
            {formatNumber(stats.totalFiles)} files · {formatBytes(stats.totalBytes)} stored across the platform
          </p>
        </div>
        <AdminFilesTable />
      </div>
    </>
  );
}
