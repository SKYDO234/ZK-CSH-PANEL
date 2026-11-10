import { NextRequest } from 'next/server';
import { z } from 'zod';
import { eq } from 'drizzle-orm';
import { db, roles, users } from '@/db';
import { ApiError, created, enforceCsrf, handler, parseBody, readJson } from '@/lib/api';
import { hashPassword, validatePasswordStrength } from '@/lib/crypto';
import { getSettings } from '@/lib/settings';
import { createSession, setSessionCookie } from '@/lib/auth';
import { logActivity } from '@/lib/activity';
import { clientIp, userAgent } from '@/lib/request';
import { hit } from '@/lib/rate-limit';

const schema = z.object({
  name: z.string().trim().min(2, 'Please enter your name').max(120),
  email: z.string().email('Enter a valid email address'),
  password: z.string().min(1, 'Password is required'),
});

/**
 * POST /api/auth/register
 * Only available when the admin enables public registration.
 */
export const POST = handler(async (req: NextRequest) => {
  await enforceCsrf(req);
  const settings = await getSettings();
  const ip = clientIp(req);

  if (!settings.general.registrationEnabled) {
    throw new ApiError(
      403,
      'Public registration is disabled. Ask an administrator for an account.',
      'registration_disabled',
    );
  }

  const limit = hit(`register:${ip}`, 5, 60 * 60_000);
  if (!limit.ok) throw new ApiError(429, 'Too many sign-up attempts. Try again later.', 'rate_limited');

  const body = parseBody(schema, await readJson(req));
  const policyError = validatePasswordStrength(body.password, {
    minLength: settings.security.passwordMinLength,
    requireUpper: settings.security.passwordRequireUpper,
    requireNumber: settings.security.passwordRequireNumber,
    requireSymbol: settings.security.passwordRequireSymbol,
  });
  if (policyError) throw new ApiError(422, policyError, 'weak_password');

  const email = body.email.trim().toLowerCase();
  const existing = await db.select({ id: users.id }).from(users).where(eq(users.email, email)).limit(1);
  if (existing[0]) throw new ApiError(409, 'An account with that email already exists.', 'duplicate_email');

  const roleRows = await db.select().from(roles).where(eq(roles.name, 'USER')).limit(1);
  if (!roleRows[0]) throw new ApiError(500, 'Roles are not configured. Run the seed script.', 'setup_required');

  const [row] = await db
    .insert(users)
    .values({
      email,
      name: body.name,
      passwordHash: await hashPassword(body.password),
      roleId: roleRows[0].id,
      status: settings.general.requireEmailVerification ? 'PENDING' : 'ACTIVE',
      quotaBytes: BigInt(settings.storage.defaultQuotaBytes),
      emailVerified: !settings.general.requireEmailVerification,
    })
    .returning();

  await logActivity({
    action: 'REGISTER',
    actorId: row.id,
    message: `${row.name} created an account`,
    ip,
    userAgent: userAgent(req),
  });

  if (row.status === 'PENDING') {
    return created({ requiresVerification: true, email: row.email });
  }

  const { token, expiresAt } = await createSession({ userId: row.id, ip, userAgent: userAgent(req) });
  await setSessionCookie(token, expiresAt);
  return created({ user: { id: row.id, email: row.email, name: row.name }, redirectTo: '/dashboard' });
});

export const dynamic = 'force-dynamic';
