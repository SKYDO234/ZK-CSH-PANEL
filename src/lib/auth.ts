import { and, eq, gt, isNull, sql } from 'drizzle-orm';
import { cookies } from 'next/headers';
import { db, roles, sessions, users } from '@/db';
import { randomToken, sha256 } from './crypto';
import { getSettings } from './settings';
import { clientIp, userAgent } from './request';
import type { Permission, RoleName } from './permissions';
import { hasPermission, isAdmin } from './permissions';

export const SESSION_COOKIE = 'vaultly_session';
export const CSRF_COOKIE = 'vaultly_csrf';

export type SessionUser = {
  id: string;
  email: string;
  name: string;
  avatarUrl: string | null;
  status: 'ACTIVE' | 'SUSPENDED' | 'PENDING';
  quotaBytes: bigint;
  usedBytes: bigint;
  mustChangePass: boolean;
  emailVerified: boolean;
  sessionId: string;
  role: { id: string; name: RoleName; label: string; permissions: string[] };
};

export type SessionContext = SessionUser & {
  can: (permission: Permission) => boolean;
  isAdmin: boolean;
};

/** Creates a session row and returns the raw token (stored only in the cookie). */
export async function createSession(params: {
  userId: string;
  ip?: string;
  userAgent?: string;
  rememberMe?: boolean;
}): Promise<{ token: string; expiresAt: Date }> {
  const settings = await getSettings();
  const ttlDays = params.rememberMe
    ? settings.security.rememberMeDays
    : Math.max(1, Math.round(settings.security.sessionTimeoutMinutes / (60 * 24)));
  const expiresAt = new Date(Date.now() + ttlDays * 24 * 60 * 60 * 1000);
  const token = randomToken(32);

  // Enforce the concurrent session cap (oldest sessions are revoked first).
  const existing = await db
    .select({ id: sessions.id })
    .from(sessions)
    .where(and(eq(sessions.userId, params.userId), isNull(sessions.revokedAt), gt(sessions.expiresAt, new Date())))
    .orderBy(sessions.createdAt)
    .limit(100);
  const cap = settings.security.maxConcurrentSessions;
  if (existing.length >= cap) {
    const toRevoke = existing.slice(0, existing.length - cap + 1).map((s) => s.id);
    for (const id of toRevoke) {
      await db.update(sessions).set({ revokedAt: new Date() }).where(eq(sessions.id, id));
    }
  }

  await db.insert(sessions).values({
    tokenHash: sha256(token),
    userId: params.userId,
    ip: params.ip ?? null,
    userAgent: params.userAgent ?? null,
    expiresAt,
  });

  return { token, expiresAt };
}

export async function setSessionCookie(token: string, expiresAt: Date) {
  const store = await cookies();
  store.set(SESSION_COOKIE, token, {
    httpOnly: true,
    sameSite: 'lax',
    secure: process.env.NODE_ENV === 'production',
    path: '/',
    expires: expiresAt,
  });
}

export async function clearSessionCookie() {
  const store = await cookies();
  store.set(SESSION_COOKIE, '', { httpOnly: true, path: '/', maxAge: 0 });
}

/** Reads the session cookie and resolves the current user, or null. */
export async function getSession(): Promise<SessionContext | null> {
  const store = await cookies();
  const token = store.get(SESSION_COOKIE)?.value;
  if (!token) return null;

  const tokenHash = sha256(token);
  const rows = await db
    .select({
      sessionId: sessions.id,
      expiresAt: sessions.expiresAt,
      lastSeenAt: sessions.lastSeenAt,
      user: {
        id: users.id,
        email: users.email,
        name: users.name,
        avatarUrl: users.avatarUrl,
        status: users.status,
        quotaBytes: users.quotaBytes,
        usedBytes: users.usedBytes,
        mustChangePass: users.mustChangePass,
        emailVerified: users.emailVerified,
        deletedAt: users.deletedAt,
      },
      role: {
        id: roles.id,
        name: roles.name,
        label: roles.label,
        permissions: roles.permissions,
      },
    })
    .from(sessions)
    .innerJoin(users, eq(users.id, sessions.userId))
    .innerJoin(roles, eq(roles.id, users.roleId))
    .where(and(eq(sessions.tokenHash, tokenHash), isNull(sessions.revokedAt), gt(sessions.expiresAt, new Date())))
    .limit(1);

  const row = rows[0];
  if (!row || row.user.deletedAt || row.user.status === 'SUSPENDED') return null;

  // Touch last-seen at most once per 5 minutes to avoid write amplification.
  if (Date.now() - new Date(row.lastSeenAt).getTime() > 5 * 60 * 1000) {
    db.update(sessions)
      .set({ lastSeenAt: new Date() })
      .where(eq(sessions.id, row.sessionId))
      .catch(() => {});
  }

  const user: SessionContext = {
    ...row.user,
    sessionId: row.sessionId,
    role: { ...row.role, name: row.role.name as RoleName },
    can: (permission: Permission) => hasPermission({ role: row.role as never }, permission),
    isAdmin: isAdmin({ role: { name: row.role.name as RoleName } }),
  };
  return user;
}

export async function revokeSession(sessionId: string) {
  await db.update(sessions).set({ revokedAt: new Date() }).where(eq(sessions.id, sessionId));
}

export async function revokeAllSessions(userId: string, exceptSessionId?: string) {
  await db
    .update(sessions)
    .set({ revokedAt: new Date() })
    .where(
      exceptSessionId
        ? and(eq(sessions.userId, userId), sql`${sessions.id} <> ${exceptSessionId}`)
        : eq(sessions.userId, userId),
    );
}

/** Extracts the bearer token from an API request (for the public REST API). */
export function bearerToken(req: Request): string | null {
  const header = req.headers.get('authorization') ?? '';
  const match = header.match(/^Bearer\s+(.+)$/i);
  return match?.[1]?.trim() ?? null;
}

export { clientIp, userAgent };
