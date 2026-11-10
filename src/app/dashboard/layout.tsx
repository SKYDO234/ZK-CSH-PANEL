import { redirect } from 'next/navigation';
import { getSession } from '@/lib/auth';
import { getSettings, toPublicBranding } from '@/lib/settings';
import { Sidebar } from '@/components/layout/sidebar';
import { OfflineGuard } from '@/components/layout/offline-guard';

export default async function DashboardLayout({ children }: { children: React.ReactNode }) {
  const session = await getSession();
  if (!session) redirect('/login?next=/dashboard');

  const settings = await getSettings();
  const branding = toPublicBranding(settings);

  if (settings.general.maintenanceMode && !session.isAdmin) {
    return <OfflineGuard message={settings.general.maintenanceMessage} branding={branding} />;
  }

  return (
    <div className="min-h-screen bg-canvas">
      <Sidebar
        branding={branding}
        user={{
          name: session.name,
          email: session.email,
          roleLabel: session.role.label,
          quotaBytes: Number(session.quotaBytes),
          usedBytes: Number(session.usedBytes),
          isAdmin: session.isAdmin,
        }}
      />
      <div className="lg:pl-64">
        <main id="main" className="min-h-screen">
          {children}
        </main>
        <footer className="border-t border-line px-6 py-5 text-center text-xs text-muted">
          {branding.footerText}
        </footer>
      </div>
    </div>
  );
}
