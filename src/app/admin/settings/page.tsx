import type { Metadata } from 'next';
import { requireAdmin } from '@/lib/session';
import { getSettings } from '@/lib/settings';
import { Topbar } from '@/components/layout/topbar';
import { SettingsEditor } from '@/components/admin/settings-editor';

export const metadata: Metadata = { title: 'Settings' };
export const dynamic = 'force-dynamic';

export default async function SettingsPage() {
  const session = await requireAdmin('/admin/settings');
  const settings = await getSettings({ fresh: true });

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
      <div className="mx-auto max-w-5xl px-4 py-6 sm:px-6">
        <div className="mb-5">
          <h1 className="text-2xl font-semibold tracking-tight text-ink">Platform settings</h1>
          <p className="mt-1 text-sm text-muted">
            Storage limits, security policy, sharing defaults, email delivery and system maintenance.
          </p>
        </div>
        <SettingsEditor
          initial={{
            general: settings.general,
            storage: settings.storage,
            security: settings.security,
            sharing: settings.sharing,
            email: settings.email,
            system: settings.system,
          }}
        />
      </div>
    </>
  );
}
