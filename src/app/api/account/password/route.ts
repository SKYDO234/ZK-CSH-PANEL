import { NextRequest } from 'next/server';
import { z } from 'zod';
import { eq } from 'drizzle-orm';
import { db, users } from '@/db';
import { ApiError, enforceCsrf, handler, ok, parseBody, readJson, requireUser } from '@/lib/api';
import { hashPassword, validatePasswordStrength, verifyPassword } from '@/lib/crypto';
import { getSettings } from '@/lib/settings';
import { revokeAllSessions } from '@/lib/auth';
import { logActivity } from '@/lib/activity';
import { clientIp, userAgent } from '@/lib/request';

const schema = z.object({
  currentPassword: z.string().min(1),
  newPassword: z.string().min(1),
});

/** POST /api/account/password — change own password. */
export const POST = handler(async (req: NextRequest) => {
  await enforceCsrf(req);
  const session = await requireUser();
  const settings = await getSettings();
  const body = parseBody(schema, await readJson(req));

  const rows = await db.select({ passwordHash: users.passwordHash }).from(users).where(eq(users.id, session.id)).limit(1);
  if (!rows[0]) throw new ApiError(404, 'Account not found.', 'not_found');

  const valid = await verifyPassword(body.currentPassword, rows[0].passwordHash);
  if (!valid) throw new ApiError(401, 'Your current password is incorrect.', 'invalid_password');

  const policyError = validatePasswordStrength(body.newPassword, {
    minLength: settings.security.passwordMinLength,
    requireUpper: settings.security.passwordRequireUpper,
    requireNumber: settings.security.passwordRequireNumber,
    requireSymbol: settings.security.passwordRequireSymbol,
  });
  if (policyError) throw new ApiError(422, policyError, 'weak_password');

  await db
    .update(users)
    .set({
      passwordHash: await hashPassword(body.newPassword),
      mustChangePass: false,
      updatedAt: new Date(),
    })
    .where(eq(users.id, session.id));

  // Rotate other sessions; the current one stays valid.
  await revokeAllSessions(session.id, session.sessionId);

  await logActivity({
    action: 'PASSWORD_CHANGE',
    actorId: session.id,
    message: `${session.name} changed their password`,
    ip: clientIp(req),
    userAgent: userAgent(req),
  });

  return ok({ changed: true });
});

export const dynamic = 'force-dynamic';
