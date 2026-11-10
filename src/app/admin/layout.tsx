import { redirect } from 'next/navigation';
import { requireSession } from '@/lib/session';
import { getSettings, toPublicBranding } from '@/lib/settings';
import { Sidebar } from '@/components/layout/sidebar';
import { AdminBanner } from '@/components/admin/admin-banner';

export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  const session = await requireSession('/admin');
  if (!session.isAdmin) redirect('/dashboard');

  const settings = await getSettings();
  const branding = toPublicBranding(settings);

  return (
    <div className="min-h-screen bg-canvas">
      <Sidebar
        variant="admin"
        branding={branding}
        user={{
          name: session.name,
          email: session.email,
          roleLabel: session.role.label,
          quotaBytes: Number(session.quotaBytes),
          usedBytes: Number(session.usedBytes),
          isAdmin: true,
        }}
      />
      <div className="lg:pl-64">
        {settings.general.maintenanceMode ? (
          <AdminBanner
            message={`Maintenance mode is ON — regular users see: “${settings.general.maintenanceMessage}”`}
          />
        ) : null}
        <main id="main" className="min-h-screen">
          {children}
        </main>
      </div>
    </div>
  );
}
