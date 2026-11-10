import { NextRequest } from 'next/server';
import { z } from 'zod';
import { and, desc, eq, isNull } from 'drizzle-orm';
import { db, apiKeys } from '@/db';
import { ApiError, created, enforceCsrf, handler, ok, parseBody, readJson, requireUser } from '@/lib/api';
import { randomToken, sha256 } from '@/lib/crypto';
import { logActivity } from '@/lib/activity';
import { clientIp, userAgent } from '@/lib/request';

/** GET /api/account/api-keys — list the user's keys (hashes never returned). */
export const GET = handler(async () => {
  const session = await requireUser();
  const rows = await db
    .select({
      id: apiKeys.id,
      name: apiKeys.name,
      prefix: apiKeys.prefix,
      scopes: apiKeys.scopes,
      createdAt: apiKeys.createdAt,
      lastUsedAt: apiKeys.lastUsedAt,
    })
    .from(apiKeys)
    .where(and(eq(apiKeys.userId, session.id), isNull(apiKeys.revokedAt)))
    .orderBy(desc(apiKeys.createdAt))
    .limit(50);

  return ok({
    keys: rows.map((row) => ({
      ...row,
      createdAt: row.createdAt.toISOString(),
      lastUsedAt: row.lastUsedAt?.toISOString() ?? null,
    })),
  });
});

const schema = z.object({ name: z.string().trim().min(1).max(60) });

/** POST /api/account/api-keys — mint a key. The raw value is returned once. */
export const POST = handler(async (req: NextRequest) => {
  await enforceCsrf(req);
  const session = await requireUser();
  const body = parseBody(schema, await readJson(req));

  const raw = `vlt_${randomToken(24)}`;
  const [row] = await db
    .insert(apiKeys)
    .values({
      name: body.name,
      keyHash: sha256(raw),
      prefix: raw.slice(0, 12),
      userId: session.id,
      scopes: ['files:read', 'files:write', 'shares:manage'],
    })
    .returning();

  await logActivity({
    action: 'API_KEY_CREATE',
    actorId: session.id,
    targetType: 'api_key',
    targetId: row.id,
    message: `Created API key “${body.name}”`,
    ip: clientIp(req),
    userAgent: userAgent(req),
  });

  return created({ id: row.id, name: row.name, key: raw });
});

/** DELETE /api/account/api-keys?id=... */
export const DELETE = handler(async (req: NextRequest) => {
  await enforceCsrf(req);
  const session = await requireUser();
  const id = new URL(req.url).searchParams.get('id');
  if (!id) throw new ApiError(400, 'Missing key id.', 'bad_request');

  const result = await db
    .update(apiKeys)
    .set({ revokedAt: new Date() })
    .where(and(eq(apiKeys.id, id), eq(apiKeys.userId, session.id)))
    .returning({ id: apiKeys.id });
  if (result.length === 0) throw new ApiError(404, 'Key not found.', 'not_found');

  await logActivity({
    action: 'API_KEY_REVOKE',
    actorId: session.id,
    targetType: 'api_key',
    targetId: id,
    message: 'Revoked an API key',
    ip: clientIp(req),
    userAgent: userAgent(req),
  });

  return ok({ revoked: true });
});

export const dynamic = 'force-dynamic';
