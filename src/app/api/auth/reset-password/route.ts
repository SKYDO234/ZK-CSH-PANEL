import { NextRequest } from 'next/server';
import { z } from 'zod';
import { and, eq, gt, isNull } from 'drizzle-orm';
import { db, passwordResetTokens, users } from '@/db';
import { ApiError, enforceCsrf, handler, ok, parseBody, readJson } from '@/lib/api';
import { hashPassword, sha256, validatePasswordStrength } from '@/lib/crypto';
import { getSettings } from '@/lib/settings';
import { revokeAllSessions } from '@/lib/auth';
import { logActivity } from '@/lib/activity';
import { clientIp, userAgent } from '@/lib/request';

const schema = z.object({ token: z.string().min(10), password: z.string().min(1) });

/** POST /api/auth/reset-password — consume a reset token and set a new password. */
export const POST = handler(async (req: NextRequest) => {
  await enforceCsrf(req);
  const settings = await getSettings();
  const body = parseBody(schema, await readJson(req));

  const rows = await db
    .select({ id: passwordResetTokens.id, userId: passwordResetTokens.userId })
    .from(passwordResetTokens)
    .where(
      and(
        eq(passwordResetTokens.tokenHash, sha256(body.token)),
        isNull(passwordResetTokens.usedAt),
        gt(passwordResetTokens.expiresAt, new Date()),
      ),
    )
    .limit(1);

  if (!rows[0]) throw new ApiError(400, 'This reset link is invalid or has expired.', 'invalid_token');

  const policyError = validatePasswordStrength(body.password, {
    minLength: settings.security.passwordMinLength,
    requireUpper: settings.security.passwordRequireUpper,
    requireNumber: settings.security.passwordRequireNumber,
    requireSymbol: settings.security.passwordRequireSymbol,
  });
  if (policyError) throw new ApiError(422, policyError, 'weak_password');

  await db
    .update(users)
    .set({
      passwordHash: await hashPassword(body.password),
      mustChangePass: false,
      failedLogins: 0,
      lockedUntil: null,
      updatedAt: new Date(),
    })
    .where(eq(users.id, rows[0].userId));

  await db
    .update(passwordResetTokens)
    .set({ usedAt: new Date() })
    .where(eq(passwordResetTokens.id, rows[0].id));

  await revokeAllSessions(rows[0].userId);

  await logActivity({
    action: 'PASSWORD_RESET',
    actorId: rows[0].userId,
    message: 'Password reset completed',
    ip: clientIp(req),
    userAgent: userAgent(req),
  });

  return ok({ reset: true });
});

export const dynamic = 'force-dynamic';
