import Link from 'next/link';
import { Logo } from '@/components/branding/logo';
import type { PublicBranding } from '@/lib/settings';

export function ShareShell({
  children,
  branding,
  shareToken,
}: {
  children: React.ReactNode;
  branding: PublicBranding;
  shareToken?: string;
}) {
  return (
    <div className="flex min-h-screen flex-col bg-canvas">
      <header className="border-b border-line bg-surface/80 backdrop-blur">
        <div className="mx-auto flex h-16 max-w-6xl items-center justify-between px-4 sm:px-6">
          <Link href="/" aria-label={branding.platformName}>
            <Logo name={branding.platformName} logoUrl={branding.logoUrl} />
          </Link>
          <div className="flex items-center gap-2">
            <Link href="/login" className="btn-secondary btn-sm">
              Sign in
            </Link>
            {shareToken ? (
              <Link href="/dashboard" className="btn-primary btn-sm">
                My storage
              </Link>
            ) : null}
          </div>
        </div>
      </header>
      <main id="main" className="flex-1 px-4 py-6 sm:px-6 lg:py-10">
        {children}
      </main>
      <footer className="border-t border-line px-4 py-5 text-center text-xs text-muted">
        {branding.footerText}
      </footer>
    </div>
  );
}
