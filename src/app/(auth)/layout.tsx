import Link from 'next/link';
import { getSettings, toPublicBranding } from '@/lib/settings';
import { Logo } from '@/components/branding/logo';
import { StudioCredit } from '@/components/branding/studio-credit';
import { ThemeToggle } from '@/components/layout/theme-toggle';

export default async function AuthLayout({ children }: { children: React.ReactNode }) {
  const settings = await getSettings();
  const branding = toPublicBranding(settings);
  const background = branding.loginBackgroundUrl;

  return (
    <div className="relative flex min-h-screen flex-col bg-canvas">
      {background ? (
        <div
          className="pointer-events-none absolute inset-0 opacity-25"
          style={{
            backgroundImage: `url(${background})`,
            backgroundSize: 'cover',
            backgroundPosition: 'center',
          }}
          aria-hidden="true"
        />
      ) : null}
      <div
        className="pointer-events-none absolute inset-0 opacity-[0.55] dark:opacity-[0.25]"
        style={{
          background:
            'radial-gradient(60rem 40rem at 15% -10%, rgb(var(--brand) / 0.18), transparent 60%), radial-gradient(50rem 30rem at 110% 110%, rgb(var(--secondary) / 0.15), transparent 60%)',
        }}
        aria-hidden="true"
      />

      <header className="relative z-10 flex items-center justify-between px-6 py-5">
        <Link href="/" aria-label={branding.platformName}>
          <Logo name={branding.platformName} logoUrl={branding.logoUrl} markUrl={branding.markUrl} full />
        </Link>
        {branding.allowUserThemeToggle ? <ThemeToggle compact /> : null}
      </header>

      <main id="main" className="relative z-10 flex flex-1 items-center justify-center px-4 py-8 sm:px-6">
        {children}
      </main>

      <footer className="relative z-10 flex flex-col items-center gap-2.5 px-6 py-5 text-center text-xs text-muted">
        <p>{branding.footerText}</p>
        {branding.showPoweredBy ? <StudioCredit branding={branding} size="md" /> : null}
        {branding.allowUserThemeToggle ? null : <span className="sr-only">Theme switching disabled</span>}
      </footer>
    </div>
  );
}
