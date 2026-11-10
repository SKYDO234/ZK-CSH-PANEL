import type { Metadata } from 'next';
import { requireSession } from '@/lib/session';
import { getSettings } from '@/lib/settings';
import { getStorageStats } from '@/lib/files';
import { Topbar } from '@/components/layout/topbar';
import { AccountSettings } from '@/components/account/account-settings';
import { formatBytes, formatDateTime } from '@/lib/format';
import { ProgressBar } from '@/components/ui/misc';

export const metadata: Metadata = { title: 'Account' };
export const dynamic = 'force-dynamic';

export default async function AccountPage({
  searchParams,
}: {
  searchParams: Promise<{ force?: string }>;
}) {
  const session = await requireSession('/dashboard/settings');
  const params = await searchParams;
  const settings = await getSettings();
  const stats = await getStorageStats(session.id);

  return (
    <>
      <Topbar
        user={{ name: session.name, email: session.email, avatarUrl: session.avatarUrl, roleLabel: session.role.label, isAdmin: session.isAdmin }}
        allowThemeToggle={settings.appearance.allowUserThemeToggle}
      />
      <div className="mx-auto max-w-4xl px-4 py-6 sm:px-6">
        <div className="mb-5">
          <h1 className="text-2xl font-semibold tracking-tight text-ink">Account settings</h1>
          <p className="mt-1 text-sm text-muted">Manage your profile, password and active sessions.</p>
        </div>

        {params.force === '1' || session.mustChangePass ? (
          <div className="mb-4 rounded-xl bg-amber-500/10 px-4 py-3 text-sm text-amber-700 ring-1 ring-inset ring-amber-500/20 dark:text-amber-400">
            Your administrator requires you to set a new password before continuing.
          </div>
        ) : null}

        <div className="card mb-4 p-5">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <p className="text-sm font-semibold text-ink">Storage plan</p>
              <p className="text-xs text-muted">
                {formatBytes(stats.usedBytes)} of {formatBytes(stats.totalBytes)} used ·{' '}
                {stats.fileCount} files
              </p>
            </div>
            <span className="badge-brand">{formatBytes(stats.availableBytes)} free</span>
          </div>
          <div className="mt-3">
            <ProgressBar value={stats.usedBytes} max={stats.totalBytes} />
          </div>
          <p className="mt-3 text-[11px] text-muted">
            Quotas are managed by your administrator. Contact{' '}
            <a href={`mailto:${settings.appearance.supportEmail}`} className="font-medium text-brand hover:underline">
              {settings.appearance.supportEmail}
            </a>{' '}
            to request more space.
          </p>
        </div>

        <AccountSettings
          user={{
            name: session.name,
            email: session.email,
            roleLabel: session.role.label,
            emailVerified: session.emailVerified,
            createdAt: formatDateTime(new Date()),
          }}
          passwordPolicy={{
            minLength: settings.security.passwordMinLength,
            requireUpper: settings.security.passwordRequireUpper,
            requireNumber: settings.security.passwordRequireNumber,
            requireSymbol: settings.security.passwordRequireSymbol,
          }}
          allowApiKeys={settings.security.allowApiKeys}
          allowThemeToggle={settings.appearance.allowUserThemeToggle}
        />
      </div>
    </>
  );
}
