import { Wrench } from 'lucide-react';
import type { PublicBranding } from '@/lib/settings';
import { Logo } from '@/components/branding/logo';

/** Full-screen screen shown to non-admins while maintenance mode is on. */
export function OfflineGuard({ message, branding }: { message: string; branding: PublicBranding }) {
  return (
    <div className="flex min-h-screen flex-col items-center justify-center bg-canvas px-6 text-center">
      <Logo name={branding.platformName} logoUrl={branding.logoUrl} size="lg" />
      <div className="mt-8 flex h-14 w-14 items-center justify-center rounded-2xl bg-amber-500/10 text-amber-600">
        <Wrench className="h-6 w-6" />
      </div>
      <h1 className="mt-5 text-xl font-semibold text-ink">Scheduled maintenance</h1>
      <p className="mt-2 max-w-md text-sm leading-relaxed text-muted">{message}</p>
    </div>
  );
}
