import type { Metadata } from 'next';
import { requireAdmin } from '@/lib/session';
import { getSettings } from '@/lib/settings';
import { Topbar } from '@/components/layout/topbar';
import { ActivityLog } from '@/components/admin/activity-log';

export const metadata: Metadata = { title: 'Activity log' };
export const dynamic = 'force-dynamic';

export default async function ActivityPage() {
  const session = await requireAdmin('/admin/activity');
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
      <div className="mx-auto max-w-6xl px-4 py-6 sm:px-6">
        <div className="mb-5">
          <h1 className="text-2xl font-semibold tracking-tight text-ink">Activity log</h1>
          <p className="mt-1 text-sm text-muted">
            Every sign-in, upload, share and administrative action is recorded for auditing.
          </p>
        </div>
        <ActivityLog />
      </div>
    </>
  );
}
