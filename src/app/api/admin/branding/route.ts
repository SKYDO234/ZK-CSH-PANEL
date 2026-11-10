import { NextRequest } from 'next/server';
import { enforceCsrf, handler, ok, requirePermission } from '@/lib/api';
import { getStorageDriver, buildStorageKey } from '@/lib/storage';
import { extensionOf, mimeForExtension } from '@/lib/file-types';
import { saveSettingsGroup } from '@/lib/settings';
import { ApiError } from '@/lib/api';
import { logActivity } from '@/lib/activity';
import { clientIp, userAgent } from '@/lib/request';
import { validateUpload } from '@/lib/storage/validation';
import { MB } from '@/lib/format';

/**
 * POST /api/admin/branding — upload a logo or favicon.
 * Returns a public URL served from the /api/branding/:key route.
 */
export const POST = handler(async (req: NextRequest) => {
  await enforceCsrf(req);
  const session = await requirePermission('settings:write');
  const form = await req.formData();
  const file = form.get('file');
  const kind = String(form.get('kind') ?? 'logo');

  if (!(file instanceof File)) throw new ApiError(400, 'No file provided.', 'missing_file');
  if (file.size > 2 * MB) throw new ApiError(413, 'Images must be smaller than 2 MB.', 'file_too_large');

  const buffer = Buffer.from(await file.arrayBuffer());
  const validation = await validateUpload({
    filename: file.name,
    claimedMime: file.type,
    size: file.size,
    head: buffer.subarray(0, 4096),
    policy: { allowedExtensions: ['png', 'jpg', 'jpeg', 'svg', 'webp', 'ico', 'gif'], maxFileSizeBytes: 2 * MB, scanUploads: true },
  });
  if (!validation.ok || validation.category !== 'image') {
    throw new ApiError(422, validation.error ?? 'Only PNG, JPG, SVG or WEBP images are supported.', 'invalid_file');
  }

  const storage = getStorageDriver();
  const key = buildStorageKey({ ownerId: 'branding', extension: validation.extension || extensionOf(file.name), kind: 'branding' });
  await storage.put(key, buffer, {
    contentType: validation.detectedMime || mimeForExtension(extensionOf(file.name)),
    cacheControl: 'public, max-age=31536000, immutable',
  });

  const url = `/api/branding/${encodeURIComponent(key.split('/').slice(1).join('/'))}`;

  if (kind === 'logo' || kind === 'favicon' || kind === 'login') {
    const patch =
      kind === 'logo'
        ? { logoUrl: url }
        : kind === 'favicon'
          ? { faviconUrl: url }
          : { loginBackgroundUrl: url };
    await saveSettingsGroup('appearance', patch, session.id);
  }

  await logActivity({
    action: 'SETTINGS_UPDATE',
    actorId: session.id,
    message: `Uploaded ${kind} image`,
    ip: clientIp(req),
    userAgent: userAgent(req),
  });

  return ok({ url });
});

export const dynamic = 'force-dynamic';
