import type { Metadata, Viewport } from 'next';
import './globals.css';
import { getSettings, toPublicBranding } from '@/lib/settings';
import { BrandingStyle, ThemeScript } from '@/components/branding/branding-style';
import { ToastProvider } from '@/components/ui/toast';

export async function generateMetadata(): Promise<Metadata> {
  try {
    const settings = await getSettings();
    const branding = toPublicBranding(settings);
    return {
      title: {
        default: `${branding.platformName} — Secure cloud storage`,
        template: `%s · ${branding.platformName}`,
      },
      description: branding.tagline,
      icons: branding.faviconUrl ? { icon: branding.faviconUrl } : undefined,
      openGraph: {
        title: branding.platformName,
        description: branding.tagline,
        siteName: branding.platformName,
      },
      robots: { index: true, follow: true },
    };
  } catch {
    return { title: 'Vaultly' };
  }
}

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  themeColor: '#0f172a',
};

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  const settings = await getSettings();
  const branding = toPublicBranding(settings);

  return (
    <html lang="en" suppressHydrationWarning>
      <head>
        <BrandingStyle branding={branding} />
        <ThemeScript defaultTheme={branding.defaultTheme} />
        {branding.faviconUrl ? <link rel="icon" href={branding.faviconUrl} /> : null}
      </head>
      <body>
        <a
          href="#main"
          className="sr-only focus:not-sr-only focus:fixed focus:left-4 focus:top-4 focus:z-[200] focus:rounded-lg focus:bg-brand focus:px-4 focus:py-2 focus:text-white"
        >
          Skip to content
        </a>
        <ToastProvider>{children}</ToastProvider>
      </body>
    </html>
  );
}
