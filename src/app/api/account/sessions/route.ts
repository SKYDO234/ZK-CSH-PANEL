import { NextRequest } from 'next/server';
import { and, desc, eq, isNull, gt } from 'drizzle-orm';
import { db, sessions } from '@/db';
import { ApiError, enforceCsrf, handler, ok, requireUser } from '@/lib/api';
import { revokeAllSessions, revokeSession } from '@/lib/auth';

/** GET /api/account/sessions — list active sessions for the current user. */
export const GET = handler(async () => {
  const session = await requireUser();
  const rows = await db
    .select({
      id: sessions.id,
      ip: sessions.ip,
      userAgent: sessions.userAgent,
      createdAt: sessions.createdAt,
      lastSeenAt: sessions.lastSeenAt,
      expiresAt: sessions.expiresAt,
    })
    .from(sessions)
    .where(
      and(eq(sessions.userId, session.id), isNull(sessions.revokedAt), gt(sessions.expiresAt, new Date())),
    )
    .orderBy(desc(sessions.lastSeenAt))
    .limit(50);

  return ok({
    sessions: rows.map((row) => ({
      ...row,
      current: row.id === session.sessionId,
      createdAt: row.createdAt.toISOString(),
      lastSeenAt: row.lastSeenAt.toISOString(),
      expiresAt: row.expiresAt.toISOString(),
    })),
  });
});

/** DELETE /api/account/sessions?id=... or ?all=1 */
export const DELETE = handler(async (req: NextRequest) => {
  await enforceCsrf(req);
  const session = await requireUser();
  const url = new URL(req.url);

  if (url.searchParams.get('all') === '1') {
    await revokeAllSessions(session.id, session.sessionId);
    return ok({ revoked: 'all' });
  }
  const id = url.searchParams.get('id');
  if (!id) throw new ApiError(400, 'Missing session id.', 'bad_request');
  if (id === session.sessionId) throw new ApiError(400, 'You cannot revoke the current session.', 'bad_request');

  await revokeSession(id);
  return ok({ revoked: id });
});

export const dynamic = 'force-dynamic';
