import { eq, inArray } from 'drizzle-orm';
import { db, settings as settingsTable } from '@/db';
import { GB } from './format';

/**
 * Platform settings live in the database (one JSON document per group) so the
 * admin can rebrand and reconfigure the panel without a redeploy. Every read
 * falls back to the defaults below, so a fresh install works immediately.
 */

export type AppearanceSettings = {
  platformName: string;
  tagline: string;
  logoUrl: string | null;
  faviconUrl: string | null;
  primaryColor: string;
  secondaryColor: string;
  accentColor: string;
  backgroundTint: string;
  loginTitle: string;
  loginSubtitle: string;
  loginBackgroundUrl: string | null;
  welcomeMessage: string;
  footerText: string;
  supportEmail: string;
  showPoweredBy: boolean;
  sidebarStyle: 'dark' | 'light';
  defaultTheme: 'light' | 'dark' | 'system';
  allowUserThemeToggle: boolean;
  emailBrandColor: string;
  emailFooterText: string;
  customCss: string;
  /** optional company/domain branding */
  customDomain: string | null;
};

export type GeneralSettings = {
  platformName: string;
  locale: string;
  timezone: string;
  dateFormat: 'relative' | 'ISO' | 'locale';
  registrationEnabled: boolean;
  requireEmailVerification: boolean;
  maintenanceMode: boolean;
  maintenanceMessage: string;
  supportUrl: string | null;
};

export type StorageSettings = {
  maxFileSizeBytes: number;
  allowedExtensions: string[] | null; // null = allow all
  defaultQuotaBytes: number;
  quotaPresets: number[];
  maxQuotaBytes: number;
  allowUserFolders: boolean;
  trashRetentionDays: number;
  storageDriver: 'local' | 's3';
  generateThumbnails: boolean;
};

export type SecuritySettings = {
  sessionTimeoutMinutes: number;
  rememberMeDays: number;
  passwordMinLength: number;
  passwordRequireUpper: boolean;
  passwordRequireNumber: boolean;
  passwordRequireSymbol: boolean;
  maxLoginAttempts: number;
  lockoutMinutes: number;
  rateLimitPerMinute: number;
  allowApiKeys: boolean;
  forceHttps: boolean;
  maxConcurrentSessions: number;
};

export type SharingSettings = {
  defaultVisibility: 'PRIVATE' | 'LINK' | 'PUBLIC';
  autoCreateShareOnUpload: boolean;
  defaultLinkExpiryDays: number | null;
  requirePasswordByDefault: boolean;
  allowPasswordProtection: boolean;
  allowExpiration: boolean;
  allowDownloadControl: boolean;
  allowDownloadByDefault: boolean;
  maxDownloadLimit: number | null;
  allowEmbedding: boolean;
  allowPublicGallery: boolean;
  blockHotlinking: boolean;
};

export type EmailSettings = {
  enabled: boolean;
  provider: 'smtp' | 'console';
  fromName: string;
  fromEmail: string;
  smtpHost: string;
  smtpPort: number;
  smtpSecure: boolean;
  smtpUser: string;
  smtpPassword: string;
  notifyOnUpload: boolean;
  notifyOnQuotaWarning: boolean;
  quotaWarningPercent: number;
  welcomeEmailEnabled: boolean;
};

export type SystemSettings = {
  cacheTtlSeconds: number;
  logRetentionDays: number;
  backupEnabled: boolean;
  backupFrequency: 'daily' | 'weekly' | 'manual';
  scanUploads: boolean;
  malwareScanMode: 'off' | 'extension' | 'mime' | 'external';
  externalScanUrl: string | null;
};

export type PlatformSettings = {
  appearance: AppearanceSettings;
  general: GeneralSettings;
  storage: StorageSettings;
  security: SecuritySettings;
  sharing: SharingSettings;
  email: EmailSettings;
  system: SystemSettings;
};

export const DEFAULT_SETTINGS: PlatformSettings = {
  appearance: {
    platformName: 'Vaultly',
    tagline: 'Private cloud storage, under your control.',
    logoUrl: null,
    faviconUrl: null,
    primaryColor: '#4f46e5',
    secondaryColor: '#0ea5e9',
    accentColor: '#8b5cf6',
    backgroundTint: '#f8fafc',
    loginTitle: 'Welcome back',
    loginSubtitle: 'Sign in to access your storage vault.',
    loginBackgroundUrl: null,
    welcomeMessage: 'Everything you upload stays private until you choose to share it.',
    footerText: 'Vaultly — self-hosted cloud storage.',
    supportEmail: 'support@example.com',
    showPoweredBy: true,
    sidebarStyle: 'dark',
    defaultTheme: 'system',
    allowUserThemeToggle: true,
    emailBrandColor: '#4f46e5',
    emailFooterText: 'You are receiving this email because you have an account with us.',
    customCss: '',
    customDomain: null,
  },
  general: {
    platformName: 'Vaultly',
    locale: 'en',
    timezone: 'UTC',
    dateFormat: 'relative',
    registrationEnabled: false,
    requireEmailVerification: false,
    maintenanceMode: false,
    maintenanceMessage: 'We are performing scheduled maintenance. Please check back shortly.',
    supportUrl: null,
  },
  storage: {
    maxFileSizeBytes: 2 * GB,
    allowedExtensions: null,
    defaultQuotaBytes: 5 * GB,
    quotaPresets: [1, 5, 10, 25, 50, 100].map((n) => n * GB),
    maxQuotaBytes: 1024 * GB,
    allowUserFolders: true,
    trashRetentionDays: 30,
    storageDriver: 'local',
    generateThumbnails: true,
  },
  security: {
    sessionTimeoutMinutes: 60 * 24 * 7,
    rememberMeDays: 30,
    passwordMinLength: 8,
    passwordRequireUpper: true,
    passwordRequireNumber: true,
    passwordRequireSymbol: false,
    maxLoginAttempts: 5,
    lockoutMinutes: 15,
    rateLimitPerMinute: 120,
    allowApiKeys: true,
    forceHttps: false,
    maxConcurrentSessions: 10,
  },
  sharing: {
    defaultVisibility: 'LINK',
    autoCreateShareOnUpload: true,
    defaultLinkExpiryDays: null,
    requirePasswordByDefault: false,
    allowPasswordProtection: true,
    allowExpiration: true,
    allowDownloadControl: true,
    allowDownloadByDefault: true,
    maxDownloadLimit: null,
    allowEmbedding: true,
    allowPublicGallery: true,
    blockHotlinking: false,
  },
  email: {
    enabled: false,
    provider: 'console',
    fromName: 'Vaultly',
    fromEmail: 'no-reply@example.com',
    smtpHost: '',
    smtpPort: 587,
    smtpSecure: true,
    smtpUser: '',
    smtpPassword: '',
    notifyOnUpload: false,
    notifyOnQuotaWarning: true,
    quotaWarningPercent: 90,
    welcomeEmailEnabled: true,
  },
  system: {
    cacheTtlSeconds: 30,
    logRetentionDays: 90,
    backupEnabled: false,
    backupFrequency: 'manual',
    scanUploads: true,
    malwareScanMode: 'mime',
    externalScanUrl: null,
  },
};

type SettingsKey = keyof PlatformSettings;

type CacheEntry = { value: PlatformSettings; expires: number };
const globalForSettings = globalThis as unknown as { __vaultlySettings?: CacheEntry };

function mergeDefaults<K extends SettingsKey>(key: K, value: unknown): PlatformSettings[K] {
  const defaults = DEFAULT_SETTINGS[key];
  if (!value || typeof value !== 'object') return defaults;
  return { ...defaults, ...(value as object) } as PlatformSettings[K];
}

/**
 * Loads every settings group, merged over defaults. Cached for a few seconds
 * (configurable) to avoid a query on every request; `invalidateSettings()`
 * clears the cache immediately after an admin saves.
 */
export async function getSettings(options?: { fresh?: boolean }): Promise<PlatformSettings> {
  const ttl = (DEFAULT_SETTINGS.system.cacheTtlSeconds || 30) * 1000;
  const cached = globalForSettings.__vaultlySettings;
  if (!options?.fresh && cached && cached.expires > Date.now()) return cached.value;

  const keys = Object.keys(DEFAULT_SETTINGS) as SettingsKey[];
  let rows: { key: string; value: unknown }[] = [];
  try {
    rows = await db
      .select({ key: settingsTable.key, value: settingsTable.value })
      .from(settingsTable)
      .where(inArray(settingsTable.key, keys));
  } catch (err) {
    // DB not migrated yet — defaults keep the app bootable.
    console.warn('[settings] falling back to defaults:', (err as Error).message);
  }

  const byKey = new Map(rows.map((r) => [r.key, r.value]));
  const merged = {} as PlatformSettings;
  for (const key of keys) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (merged as any)[key] = mergeDefaults(key, byKey.get(key));
  }

  globalForSettings.__vaultlySettings = { value: merged, expires: Date.now() + ttl };
  return merged;
}

export async function getSettingsGroup<K extends SettingsKey>(key: K): Promise<PlatformSettings[K]> {
  const all = await getSettings();
  return all[key];
}

export async function saveSettingsGroup<K extends SettingsKey>(
  key: K,
  value: Partial<PlatformSettings[K]>,
  updatedBy?: string | null,
): Promise<PlatformSettings[K]> {
  const merged = mergeDefaults(key, value);
  await db
    .insert(settingsTable)
    .values({ key, value: merged as object, updatedBy: updatedBy ?? null, updatedAt: new Date() })
    .onConflictDoUpdate({
      target: settingsTable.key,
      set: { value: merged as object, updatedBy: updatedBy ?? null, updatedAt: new Date() },
    });
  invalidateSettings();
  return merged;
}

export async function replaceSettings(
  patch: Partial<PlatformSettings>,
  updatedBy?: string | null,
): Promise<PlatformSettings> {
  const entries = Object.entries(patch) as [SettingsKey, Partial<PlatformSettings[SettingsKey]>][];
  for (const [key, value] of entries) {
    if (!(key in DEFAULT_SETTINGS) || !value) continue;
    const merged = mergeDefaults(key, value);
    await db
      .insert(settingsTable)
      .values({ key, value: merged as object, updatedBy: updatedBy ?? null, updatedAt: new Date() })
      .onConflictDoUpdate({
        target: settingsTable.key,
        set: { value: merged as object, updatedBy: updatedBy ?? null, updatedAt: new Date() },
      });
  }
  invalidateSettings();
  return getSettings({ fresh: true });
}

export function invalidateSettings() {
  globalForSettings.__vaultlySettings = undefined;
}

/** Browser-safe subset injected into the document for instant theming. */
export type PublicBranding = {
  platformName: string;
  tagline: string;
  logoUrl: string | null;
  faviconUrl: string | null;
  primaryColor: string;
  secondaryColor: string;
  accentColor: string;
  backgroundTint: string;
  footerText: string;
  supportEmail: string;
  showPoweredBy: boolean;
  loginTitle: string;
  loginSubtitle: string;
  loginBackgroundUrl: string | null;
  welcomeMessage: string;
  defaultTheme: 'light' | 'dark' | 'system';
  allowUserThemeToggle: boolean;
  sidebarStyle: 'dark' | 'light';
  customCss: string;
  registrationEnabled: boolean;
  maintenanceMode: boolean;
  maintenanceMessage: string;
  allowEmbedding: boolean;
  customDomain: string | null;
};

export function toPublicBranding(s: PlatformSettings): PublicBranding {
  return {
    platformName: s.appearance.platformName || s.general.platformName,
    tagline: s.appearance.tagline,
    logoUrl: s.appearance.logoUrl,
    faviconUrl: s.appearance.faviconUrl,
    primaryColor: s.appearance.primaryColor,
    secondaryColor: s.appearance.secondaryColor,
    accentColor: s.appearance.accentColor,
    backgroundTint: s.appearance.backgroundTint,
    footerText: s.appearance.footerText,
    supportEmail: s.appearance.supportEmail,
    showPoweredBy: s.appearance.showPoweredBy,
    loginTitle: s.appearance.loginTitle,
    loginSubtitle: s.appearance.loginSubtitle,
    loginBackgroundUrl: s.appearance.loginBackgroundUrl,
    welcomeMessage: s.appearance.welcomeMessage,
    defaultTheme: s.appearance.defaultTheme,
    allowUserThemeToggle: s.appearance.allowUserThemeToggle,
    sidebarStyle: s.appearance.sidebarStyle,
    customCss: s.appearance.customCss,
    registrationEnabled: s.general.registrationEnabled,
    maintenanceMode: s.general.maintenanceMode,
    maintenanceMessage: s.general.maintenanceMessage,
    allowEmbedding: s.sharing.allowEmbedding,
    customDomain: s.appearance.customDomain,
  };
}

/** Converts a #rrggbb colour to "r g b" for Tailwind-style CSS variables. */
export function hexToRgbTriplet(hex: string): string {
  const clean = hex.replace('#', '').trim();
  const full =
    clean.length === 3
      ? clean
          .split('')
          .map((c) => c + c)
          .join('')
      : clean;
  if (!/^[0-9a-fA-F]{6}$/.test(full)) return '79 70 229';
  return [
    parseInt(full.slice(0, 2), 16),
    parseInt(full.slice(2, 4), 16),
    parseInt(full.slice(4, 6), 16),
  ].join(' ');
}
