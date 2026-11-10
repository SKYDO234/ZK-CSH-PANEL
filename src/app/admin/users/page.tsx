import type { Metadata } from 'next';
import { requireAdmin } from '@/lib/session';
import { getSettings } from '@/lib/settings';
import { Topbar } from '@/components/layout/topbar';
import { UserTable } from '@/components/admin/user-table';

export const metadata: Metadata = { title: 'Users' };
export const dynamic = 'force-dynamic';

export default async function AdminUsersPage() {
  const session = await requireAdmin('/admin/users');
  const settings = await getSettings();

  return (
    <>
      <Topbar
        user={{
          name: session.name,
          email: session.email,
          avatarUrl: session.avatarUrl,
          roleLabel: session.role.label,
          isAdmin: true,
        }}
        allowThemeToggle={settings.appearance.allowUserThemeToggle}
      />
      <div className="mx-auto max-w-7xl px-4 py-6 sm:px-6">
        <div className="mb-5">
          <h1 className="text-2xl font-semibold tracking-tight text-ink">Users</h1>
          <p className="mt-1 text-sm text-muted">
            Create storage accounts, adjust quotas and manage access. Changes apply instantly.
          </p>
        </div>
        <UserTable
          platformName={settings.appearance.platformName}
          quotaPresets={settings.storage.quotaPresets}
          currentUserId={session.id}
          canDelete={session.can('users:delete')}
        />
      </div>
    </>
  );
}
