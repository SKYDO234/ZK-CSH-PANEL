/**
 * Derives a full brand palette (50–900) from a single admin-chosen hex colour,
 * so any primary colour produces a coherent, accessible scale.
 */

type RGB = [number, number, number];

function hexToRgb(hex: string): RGB {
  const clean = hex.replace('#', '').trim();
  const full =
    clean.length === 3
      ? clean
          .split('')
          .map((c) => c + c)
          .join('')
      : clean;
  if (!/^[0-9a-fA-F]{6}$/.test(full)) return [79, 70, 229];
  return [
    parseInt(full.slice(0, 2), 16),
    parseInt(full.slice(2, 4), 16),
    parseInt(full.slice(4, 6), 16),
  ];
}

function mix(a: RGB, b: RGB, amount: number): RGB {
  return [
    Math.round(a[0] + (b[0] - a[0]) * amount),
    Math.round(a[1] + (b[1] - a[1]) * amount),
    Math.round(a[2] + (b[2] - a[2]) * amount),
  ];
}

const triplet = (rgb: RGB) => rgb.join(' ');

/** Mix ratios toward white (light end) and black (dark end). */
const TINTS: Record<string, number> = {
  '50': 0.94,
  '100': 0.86,
  '200': 0.72,
  '300': 0.5,
  '400': 0.25,
};
const SHADES: Record<string, number> = {
  '600': 0.12,
  '700': 0.26,
  '800': 0.42,
  '900': 0.62,
};

export function paletteFromHex(hex: string): Record<string, string> {
  const base = hexToRgb(hex);
  const palette: Record<string, string> = { '500': triplet(base) };
  for (const [key, amount] of Object.entries(TINTS)) {
    palette[key] = triplet(mix(base, [255, 255, 255], amount));
  }
  for (const [key, amount] of Object.entries(SHADES)) {
    palette[key] = triplet(mix(base, [0, 0, 0], amount));
  }
  return palette;
}

export function cssVariablesFromBranding(branding: {
  primaryColor: string;
  secondaryColor: string;
  accentColor: string;
  backgroundTint: string;
}): Record<string, string> {
  const brand = paletteFromHex(branding.primaryColor);
  const vars: Record<string, string> = {};
  for (const [key, value] of Object.entries(brand)) {
    vars[key === '500' ? '--brand' : `--brand-${key}`] = value;
  }
  vars['--secondary'] = triplet(hexToRgb(branding.secondaryColor));
  vars['--accent'] = triplet(hexToRgb(branding.accentColor));
  vars['--canvas'] = triplet(hexToRgb(branding.backgroundTint));
  return vars;
}

/** Relative luminance, used for automatic contrast decisions. */
export function isLightColor(hex: string): boolean {
  const [r, g, b] = hexToRgb(hex).map((v) => {
    const c = v / 255;
    return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * r + 0.7152 * g + 0.0722 * b > 0.6;
}

/** Colours used to render file-type chips, tinted by the brand palette. */
export const CATEGORY_COLORS: Record<string, { bg: string; text: string; ring: string }> = {
  image: { bg: 'bg-violet-500/10', text: 'text-violet-600 dark:text-violet-400', ring: 'ring-violet-500/20' },
  video: { bg: 'bg-rose-500/10', text: 'text-rose-600 dark:text-rose-400', ring: 'ring-rose-500/20' },
  audio: { bg: 'bg-amber-500/10', text: 'text-amber-600 dark:text-amber-400', ring: 'ring-amber-500/20' },
  document: { bg: 'bg-sky-500/10', text: 'text-sky-600 dark:text-sky-400', ring: 'ring-sky-500/20' },
  archive: { bg: 'bg-teal-500/10', text: 'text-teal-600 dark:text-teal-400', ring: 'ring-teal-500/20' },
  other: { bg: 'bg-slate-500/10', text: 'text-slate-600 dark:text-slate-400', ring: 'ring-slate-500/20' },
};
