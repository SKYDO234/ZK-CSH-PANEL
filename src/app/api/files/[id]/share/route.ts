import { NextRequest } from 'next/server';
import { z } from 'zod';
import { eq } from 'drizzle-orm';
import { db, files, shares } from '@/db';
import { ApiError, enforceCsrf, handler, ok, parseBody, readJson, requirePermission } from '@/lib/api';
import { ensureShareToken } from '@/lib/files';
import { hashPassword, randomBase62 } from '@/lib/crypto';
import { logActivity } from '@/lib/activity';
import { clientIp, requestOrigin, userAgent } from '@/lib/request';
import { getSettings } from '@/lib/settings';

async function ownedFile(fileId: string, userId: string, canAdmin: boolean) {
  const rows = await db
    .select()
    .from(files)
    .where(canAdmin ? eq(files.id, fileId) : eq(files.id, fileId))
    .limit(1);
  const file = rows[0];
  if (!file || (file.ownerId !== userId && !canAdmin)) {
    throw new ApiError(404, 'File not found.', 'not_found');
  }
  return file;
}

const createSchema = z.object({
  visibility: z.enum(['PRIVATE', 'LINK', 'PUBLIC']).default('LINK'),
  /** false clears an existing password. */
  password: z.string().min(4).max(100).nullable().optional(),
  expiresInDays: z.number().int().min(1).max(3650).nullable().optional(),
  maxDownloads: z.number().int().min(1).max(1_000_000).nullable().optional(),
  allowDownload: z.boolean().optional(),
  viewOnly: z.boolean().optional(),
  embeddable: z.boolean().optional(),
});

/** POST or PATCH /api/files/:id/share — create or update the share settings. */
async function updateShare(req: NextRequest, context: { params: Promise<{ id: string }> }) {
  await enforceCsrf(req);
  const session = await requirePermission('shares:manage');
  const { id } = await context.params;
  const file = await ownedFile(id, session.id, session.can('files:admin'));
  const body = parseBody(createSchema, await readJson(req).catch(() => ({})));
  const settings = await getSettings();

  if (body.password && !settings.sharing.allowPasswordProtection) {
    throw new ApiError(403, 'Password protection is disabled on this platform.', 'forbidden');
  }
  if (body.expiresInDays && !settings.sharing.allowExpiration) {
    throw new ApiError(403, 'Link expiry is disabled on this platform.', 'forbidden');
  }

  const share = await ensureShareToken(id, file.ownerId, {
    visibility: body.visibility === 'PRIVATE' ? undefined : body.visibility,
    allowDownload: body.allowDownload,
    embeddable: body.embeddable,
    expiresAt:
      body.expiresInDays === undefined
        ? undefined
        : body.expiresInDays === null
          ? null
          : new Date(Date.now() + body.expiresInDays * 86400_000),
  });

  const updates: Partial<typeof shares.$inferInsert> = { updatedAt: new Date() };
  if (body.password !== undefined) {
    updates.passwordHash = body.password ? await hashPassword(body.password) : null;
  }
  if (body.maxDownloads !== undefined) updates.maxDownloads = body.maxDownloads;
  if (body.allowDownload !== undefined) updates.allowDownload = body.allowDownload;
  if (body.viewOnly !== undefined) updates.viewOnly = body.viewOnly;
  if (body.embeddable !== undefined) updates.embeddable = body.embeddable;

  const [updated] = await db.update(shares).set(updates).where(eq(shares.id, share.id)).returning();

  await db
    .update(files)
    .set({ visibility: body.visibility, downloadEnabled: body.allowDownload ?? file.downloadEnabled })
    .where(eq(files.id, id));

  await logActivity({
    action: 'SHARE_CREATE',
    actorId: session.id,
    targetType: 'file',
    targetId: id,
    message: `Shared ${file.name} (${body.visibility})`,
    metadata: { token: updated.token },
    ip: clientIp(req),
    userAgent: userAgent(req),
  });

  const origin = requestOrigin(req);
  return ok({
    share: {
      id: updated.id,
      token: updated.token,
      url: `${origin}/share/${updated.token}`,
      directUrl: `${origin}/media/${updated.token}/${encodeURIComponent(file.name)}`,
      embedUrl: file.category === 'video' ? `${origin}/embed/video/${updated.token}` : null,
      visibility: body.visibility,
      hasPassword: Boolean(updated.passwordHash),
      expiresAt: updated.expiresAt?.toISOString() ?? null,
      maxDownloads: updated.maxDownloads,
      allowDownload: updated.allowDownload,
      viewOnly: updated.viewOnly,
      embeddable: updated.embeddable,
    },
  });
}

export const POST = handler(updateShare);
export const PATCH = handler(updateShare);

/**
 * DELETE /api/files/:id/share
 * ?regenerate=1 issues a brand-new token (old links stop working).
 */
export const DELETE = handler(async (req: NextRequest, context) => {
  await enforceCsrf(req);
  const session = await requirePermission('shares:manage');
  const { id } = await context.params;
  const regenerate = new URL(req.url).searchParams.get('regenerate') === '1';
  const file = await ownedFile(id, session.id, session.can('files:admin'));
  const existing = await db.select().from(shares).where(eq(shares.fileId, id)).limit(1);
  if (!existing[0]) throw new ApiError(404, 'This file has no share link.', 'not_found');

  if (regenerate) {
    const [updated] = await db
      .update(shares)
      .set({ token: randomBase62(12), revokedAt: null, downloadCount: 0, updatedAt: new Date() })
      .where(eq(shares.id, existing[0].id))
      .returning();
    await db.update(files).set({ visibility: 'LINK' }).where(eq(files.id, id));
    await logActivity({
      action: 'SHARE_UPDATE',
      actorId: session.id,
      targetType: 'file',
      targetId: id,
      message: `Regenerated share link for ${file.name}`,
      ip: clientIp(req),
      userAgent: userAgent(req),
    });
    const origin = requestOrigin(req);
    return ok({ share: { token: updated.token, url: `${origin}/share/${updated.token}` } });
  }

  await db
    .update(shares)
    .set({ revokedAt: new Date(), updatedAt: new Date() })
    .where(eq(shares.id, existing[0].id));
  await db.update(files).set({ visibility: 'PRIVATE' }).where(eq(files.id, id));

  await logActivity({
    action: 'SHARE_DELETE',
    actorId: session.id,
    targetType: 'file',
    targetId: id,
    message: `Disabled sharing for ${file.name}`,
    ip: clientIp(req),
    userAgent: userAgent(req),
  });

  return ok({ revoked: true });
});

export const dynamic = 'force-dynamic';
