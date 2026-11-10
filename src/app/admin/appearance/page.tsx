import type { Metadata } from 'next';
import { requireAdmin } from '@/lib/session';
import { getSettings } from '@/lib/settings';
import { Topbar } from '@/components/layout/topbar';
import { AppearanceEditor } from '@/components/admin/appearance-editor';

export const metadata: Metadata = { title: 'Appearance' };
export const dynamic = 'force-dynamic';

export default async function AppearancePage() {
  const session = await requireAdmin('/admin/appearance');
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
      <div className="mx-auto max-w-7xl px-4 py-6 sm:px-6">
        <div className="mb-5">
          <h1 className="text-2xl font-semibold tracking-tight text-ink">Appearance</h1>
          <p className="mt-1 text-sm text-muted">
            Rebrand the entire platform — name, colours, logo and copy — without redeploying. Every
            change is stored in the database and applied live.
          </p>
        </div>
        <AppearanceEditor initial={settings.appearance} />
      </div>
    </>
  );
}
