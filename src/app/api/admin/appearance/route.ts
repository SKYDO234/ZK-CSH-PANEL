import { NextRequest } from 'next/server';
import { z } from 'zod';
import { enforceCsrf, handler, ok, parseBody, readJson, requirePermission } from '@/lib/api';
import { getSettings, invalidateSettings, saveSettingsGroup, toPublicBranding } from '@/lib/settings';
import { logActivity } from '@/lib/activity';
import { clientIp, userAgent } from '@/lib/request';

const hex = z.string().regex(/^#([0-9a-fA-F]{3}|[0-9a-fA-F]{6})$/, 'Use a hex colour like #4f46e5');

const appearanceSchema = z
  .object({
    platformName: z.string().trim().min(1).max(60).optional(),
    tagline: z.string().max(160).optional(),
    logoUrl: z.string().max(2000).nullable().optional(),
    markUrl: z.string().max(2000).nullable().optional(),
    studioLogoUrl: z.string().max(2000).nullable().optional(),
    studioName: z.string().trim().max(60).optional(),
    faviconUrl: z.string().max(2000).nullable().optional(),
    primaryColor: hex.optional(),
    secondaryColor: hex.optional(),
    accentColor: hex.optional(),
    backgroundTint: hex.optional(),
    loginTitle: z.string().max(80).optional(),
    loginSubtitle: z.string().max(200).optional(),
    loginBackgroundUrl: z.string().max(2000).nullable().optional(),
    welcomeMessage: z.string().max(300).optional(),
    footerText: z.string().max(300).optional(),
    supportEmail: z.string().email().or(z.literal('')).optional(),
    showPoweredBy: z.boolean().optional(),
    sidebarStyle: z.enum(['dark', 'light']).optional(),
    defaultTheme: z.enum(['light', 'dark', 'system']).optional(),
    allowUserThemeToggle: z.boolean().optional(),
    emailBrandColor: hex.optional(),
    emailFooterText: z.string().max(400).optional(),
    customCss: z.string().max(8000).optional(),
    customDomain: z.string().max(200).nullable().optional(),
  })
  .strict();

/** POST /api/admin/appearance — save branding (supports a dry-run preview). */
export const POST = handler(async (req: NextRequest) => {
  await enforceCsrf(req);
  const session = await requirePermission('settings:write');
  const url = new URL(req.url);
  const isPreview = url.searchParams.get('preview') === '1';

  const body = parseBody(appearanceSchema, await readJson(req));

  if (isPreview) {
    const current = await getSettings();
    const merged = { ...current.appearance, ...body };
    return ok({ preview: merged, branding: toPublicBranding({ ...current, appearance: merged }) });
  }

  const saved = await saveSettingsGroup('appearance', body, session.id);
  invalidateSettings();

  await logActivity({
    action: 'SETTINGS_UPDATE',
    actorId: session.id,
    message: `${session.name} updated platform branding`,
    metadata: { fields: Object.keys(body) },
    ip: clientIp(req),
    userAgent: userAgent(req),
  });

  return ok({ appearance: saved, branding: toPublicBranding(await getSettings({ fresh: true })) });
});

export const dynamic = 'force-dynamic';
