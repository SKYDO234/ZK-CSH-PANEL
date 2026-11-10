import { NextRequest } from 'next/server';
import { and, eq, isNull, sql } from 'drizzle-orm';
import { z } from 'zod';
import { db, loginAttempts, roles, users } from '@/db';
import { ApiError, handler, ok, parseBody, readJson } from '@/lib/api';
import { verifyPassword } from '@/lib/crypto';
import { createSession, setSessionCookie } from '@/lib/auth';
import { getSettings } from '@/lib/settings';
import { logActivity } from '@/lib/activity';
import { clientIp, userAgent } from '@/lib/request';
import { hit } from '@/lib/rate-limit';
import { isAdmin } from '@/lib/permissions';

const schema = z.object({
  email: z.string().email('Enter a valid email address'),
  password: z.string().min(1, 'Password is required'),
  rememberMe: z.boolean().optional(),
});

export const POST = handler(async (req: NextRequest) => {
  const settings = await getSettings();
  const ip = clientIp(req);
  const ua = userAgent(req);

  // IP-level throttle before touching the database (cheap DoS guard).
  const ipLimit = hit(`login-ip:${ip}`, settings.security.maxLoginAttempts * 4, 15 * 60_000);
  if (!ipLimit.ok) {
    throw new ApiError(429, 'Too many sign-in attempts. Please try again later.', 'rate_limited');
  }

  const body = parseBody(schema, await readJson(req));
  const email = body.email.trim().toLowerCase();

  const rows = await db
    .select({
      id: users.id,
      email: users.email,
      name: users.name,
      passwordHash: users.passwordHash,
      status: users.status,
      failedLogins: users.failedLogins,
      lockedUntil: users.lockedUntil,
      roleName: roles.name,
      mustChangePass: users.mustChangePass,
    })
    .from(users)
    .innerJoin(roles, eq(roles.id, users.roleId))
    .where(and(eq(users.email, email), isNull(users.deletedAt)))
    .limit(1);

  const user = rows[0];
  const recordFailure = async (reason: string) => {
    await db.insert(loginAttempts).values({ identifier: email, ip, success: false });
    await logActivity({
      action: 'LOGIN_FAILED',
      actorId: user?.id ?? null,
      message: `Failed sign-in for ${email}`,
      metadata: { reason },
      ip,
      userAgent: ua,
    });
  };

  // Constant-ish response: always run a hash comparison to reduce timing signal.
  if (!user) {
    await verifyPassword(body.password, 'scrypt$16384$8$1$AAAAAAAAAAAAAAAAAAAAAA==$AAAA');
    await recordFailure('unknown_account');
    throw new ApiError(401, 'Invalid email or password.', 'invalid_credentials');
  }

  if (user.lockedUntil && user.lockedUntil > new Date()) {
    const minutes = Math.ceil((user.lockedUntil.getTime() - Date.now()) / 60000);
    throw new ApiError(
      423,
      `This account is temporarily locked. Try again in ${minutes} minute${minutes === 1 ? '' : 's'}.`,
      'locked',
    );
  }

  if (user.status === 'SUSPENDED') {
    await recordFailure('suspended');
    throw new ApiError(403, 'This account has been suspended. Contact your administrator.', 'suspended');
  }

  const valid = await verifyPassword(body.password, user.passwordHash);
  if (!valid) {
    const attempts = user.failedLogins + 1;
    const shouldLock = attempts >= settings.security.maxLoginAttempts;
    await db
      .update(users)
      .set({
        failedLogins: attempts,
        lockedUntil: shouldLock
          ? new Date(Date.now() + settings.security.lockoutMinutes * 60_000)
          : null,
      })
      .where(eq(users.id, user.id));
    await recordFailure('bad_password');

    const remaining = Math.max(0, settings.security.maxLoginAttempts - attempts);
    throw new ApiError(
      401,
      shouldLock
        ? `Too many failed attempts. Account locked for ${settings.security.lockoutMinutes} minutes.`
        : `Invalid email or password.${remaining <= 2 ? ` ${remaining} attempt${remaining === 1 ? '' : 's'} remaining.` : ''}`,
      'invalid_credentials',
    );
  }

  // Success
  await db
    .update(users)
    .set({ failedLogins: 0, lockedUntil: null, lastLoginAt: new Date(), lastLoginIp: ip })
    .where(eq(users.id, user.id));
  await db.insert(loginAttempts).values({ identifier: email, ip, success: true });

  // Purge old attempts occasionally, keeping the table small.
  if (Math.random() < 0.05) {
    await db
      .delete(loginAttempts)
      .where(sql`${loginAttempts.createdAt} < now() - interval '7 days'`);
  }

  const { token, expiresAt } = await createSession({
    userId: user.id,
    ip,
    userAgent: ua,
    rememberMe: body.rememberMe,
  });
  await setSessionCookie(token, expiresAt);

  await logActivity({
    action: 'LOGIN',
    actorId: user.id,
    message: `${user.name} signed in`,
    ip,
    userAgent: ua,
  });

  const admin = isAdmin({ role: { name: user.roleName } });
  return ok({
    user: { id: user.id, name: user.name, email: user.email },
    redirectTo: user.mustChangePass ? '/dashboard/settings?force=1' : admin ? '/admin' : '/dashboard',
  });
});

export const dynamic = 'force-dynamic';
