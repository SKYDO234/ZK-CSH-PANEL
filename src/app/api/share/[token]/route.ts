import { NextRequest } from 'next/server';
import { z } from 'zod';
import { eq } from 'drizzle-orm';
import { db, shares } from '@/db';
import { ApiError, handler, ok, parseBody, readJson } from '@/lib/api';
import { resolveShare } from '@/lib/files';
import { verifyPassword } from '@/lib/crypto';
import { requestOrigin } from '@/lib/request';
import { hit } from '@/lib/rate-limit';
import { clientIp } from '@/lib/request';

/** GET /api/share/:token — public metadata for a share link. */
export const GET = handler(async (req: NextRequest, context) => {
  const { token } = await context.params;
  const resolved = await resolveShare(token);
  if (resolved.status !== 'ok') {
    throw new ApiError(resolved.status === 'expired' ? 410 : 404, 'This link is not available.', resolved.status);
  }
  const { file, share, owner } = resolved;
  const unlocked = !share.passwordHash || Boolean(req.cookies.get(`vaultly_share_${token}`)?.value);
  const origin = requestOrigin(req);

  return ok({
    share: {
      token: share.token,
      visibility: file.visibility,
      hasPassword: Boolean(share.passwordHash),
      unlocked,
      expiresAt: share.expiresAt?.toISOString() ?? null,
      allowDownload: share.allowDownload && !share.viewOnly && file.downloadEnabled,
      viewOnly: share.viewOnly,
      embeddable: share.embeddable,
      maxDownloads: share.maxDownloads,
      downloadCount: share.downloadCount,
      createdAt: share.createdAt.toISOString(),
    },
    owner: { name: owner.name },
    file: {
      id: file.id,
      name: file.name,
      mimeType: file.mimeType,
      category: file.category,
      size: Number(file.size),
      extension: file.extension,
      createdAt: file.createdAt.toISOString(),
      metadata: file.metadata,
      hasThumbnail: file.hasThumbnail,
    },
    urls: {
      share: `${origin}/share/${token}`,
      media: `${origin}/media/${token}/${encodeURIComponent(file.name)}`,
      download: `${origin}/api/media/${token}?download=1`,
      embed: file.category === 'video' ? `${origin}/embed/video/${token}` : null,
      embedImage: file.category === 'image' ? `${origin}/media/${token}/${encodeURIComponent(file.name)}` : null,
    },
  });
});

const passwordSchema = z.object({ password: z.string().min(1).max(200) });

/** POST /api/share/:token — unlock a password-protected link. */
export const POST = handler(async (req: NextRequest, context) => {
  const { token } = await context.params;
  const limit = hit(`share-pw:${token}:${clientIp(req)}`, 10, 10 * 60_000);
  if (!limit.ok) throw new ApiError(429, 'Too many attempts. Try again later.', 'rate_limited');

  const body = parseBody(passwordSchema, await readJson(req));
  const resolved = await resolveShare(token);
  if (resolved.status !== 'ok') throw new ApiError(404, 'This link is not available.', resolved.status);

  const { share } = resolved;
  if (!share.passwordHash) return ok({ unlocked: true });

  const valid = await verifyPassword(body.password, share.passwordHash);
  if (!valid) throw new ApiError(401, 'Incorrect password.', 'invalid_password');

  // The cookie stores the signed share id; media routes verify it with HMAC.
  const { signValue } = await import('@/lib/crypto');
  const cookieValue = signValue(share.id);
  const res = ok({ unlocked: true });
  res.cookies.set(`vaultly_share_${token}`, cookieValue, {
    httpOnly: true,
    sameSite: 'lax',
    secure: process.env.NODE_ENV === 'production',
    path: '/',
    maxAge: 60 * 60 * 12,
  });
  await db.update(shares).set({ lastAccessAt: new Date() }).where(eq(shares.token, token));
  return res;
});

export const dynamic = 'force-dynamic';
