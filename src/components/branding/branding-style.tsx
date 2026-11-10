import { cssVariablesFromBranding } from '@/lib/theme';
import type { PublicBranding } from '@/lib/settings';

/**
 * Injects the admin-configured palette as CSS variables on <html>. Rendered on
 * the server in the root layout, so the correct colours are present in the very
 * first paint (no flash of default branding).
 */
export function BrandingStyle({ branding }: { branding: PublicBranding }) {
  const vars = cssVariablesFromBranding({
    primaryColor: branding.primaryColor,
    secondaryColor: branding.secondaryColor,
    accentColor: branding.accentColor,
    backgroundTint: branding.backgroundTint,
  });

  const css = `:root{${Object.entries(vars)
    .map(([key, value]) => `${key}:${value}`)
    .join(';')}}${
    branding.customCss ? `\n${branding.customCss}` : ''
  }`;

  return <style id="vaultly-branding" dangerouslySetInnerHTML={{ __html: css }} />;
}

/** Sets the initial theme class before hydration to avoid a flash. */
export function ThemeScript({ defaultTheme }: { defaultTheme: 'light' | 'dark' | 'system' }) {
  const script = `
(function(){
  try {
    var stored = localStorage.getItem('vaultly-theme');
    var mode = stored || ${JSON.stringify(defaultTheme)};
    var isDark = mode === 'dark' || (mode === 'system' && window.matchMedia('(prefers-color-scheme: dark)').matches);
    document.documentElement.classList.toggle('dark', isDark);
    document.documentElement.dataset.themeMode = mode;
  } catch (e) {}
})();
`;
  return <script dangerouslySetInnerHTML={{ __html: script }} />;
}
