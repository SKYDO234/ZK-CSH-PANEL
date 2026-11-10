import { NextRequest } from 'next/server';
import { z } from 'zod';
import { enforceCsrf, handler, ok, requirePermission, ApiError } from '@/lib/api';
import { DEFAULT_SETTINGS, getSettings, replaceSettings } from '@/lib/settings';
import { logActivity } from '@/lib/activity';
import { clientIp, userAgent } from '@/lib/request';

/** GET /api/admin/settings — full settings document (admin only). */
export const GET = handler(async () => {
  await requirePermission('settings:read');
  return ok({ settings: await getSettings({ fresh: true }), defaults: DEFAULT_SETTINGS });
});

/**
 * PATCH /api/admin/settings
 * Body: { general?: {...}, storage?: {...}, security?: {...}, sharing?: {...},
 *         email?: {...}, system?: {...}, appearance?: {...} }
 * Only known keys are merged; everything is validated by shape.
 */
export const PATCH = handler(async (req: NextRequest) => {
  await enforceCsrf(req);
  const session = await requirePermission('settings:write');
  const body = (await req.json().catch(() => null)) as Record<string, unknown> | null;
  if (!body || typeof body !== 'object') throw new ApiError(400, 'Invalid payload.', 'bad_request');

  const allowed = Object.keys(DEFAULT_SETTINGS) as Array<keyof typeof DEFAULT_SETTINGS>;
  const patch: Record<string, unknown> = {};
  for (const key of allowed) {
    if (body[key] && typeof body[key] === 'object') {
      patch[key] = body[key];
    }
  }
  if (Object.keys(patch).length === 0) throw new ApiError(400, 'Nothing to update.', 'bad_request');

  const updated = await replaceSettings(patch as never, session.id);

  await logActivity({
    action: 'SETTINGS_UPDATE',
    actorId: session.id,
    message: `${session.name} updated platform settings (${Object.keys(patch).join(', ')})`,
    metadata: { groups: Object.keys(patch) },
    ip: clientIp(req),
    userAgent: userAgent(req),
  });

  return ok({ settings: updated });
});

export const dynamic = 'force-dynamic';
