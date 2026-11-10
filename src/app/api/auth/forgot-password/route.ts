import { NextRequest } from 'next/server';
import { z } from 'zod';
import { eq } from 'drizzle-orm';
import { db, passwordResetTokens, users } from '@/db';
import { enforceCsrf, handler, ok, parseBody, readJson } from '@/lib/api';
import { randomToken, sha256 } from '@/lib/crypto';
import { getSettings } from '@/lib/settings';
import { sendMail, emailLayout, passwordResetTemplate } from '@/lib/mailer';
import { logActivity } from '@/lib/activity';
import { clientIp, requestOrigin, userAgent } from '@/lib/request';
import { hit } from '@/lib/rate-limit';

const schema = z.object({ email: z.string().email() });

/**
 * POST /api/auth/forgot-password
 * Always returns success to avoid leaking which emails have accounts.
 */
export const POST = handler(async (req: NextRequest) => {
  await enforceCsrf(req);
  const settings = await getSettings();
  const ip = clientIp(req);
  const limit = hit(`forgot:${ip}`, 5, 15 * 60_000);
  if (!limit.ok) return ok({ sent: true });

  const body = parseBody(schema, await readJson(req));
  const email = body.email.trim().toLowerCase();

  const rows = await db
    .select({ id: users.id, name: users.name, status: users.status })
    .from(users)
    .where(eq(users.email, email))
    .limit(1);

  if (rows[0] && rows[0].status !== 'SUSPENDED') {
    const token = randomToken(32);
    await db.insert(passwordResetTokens).values({
      tokenHash: sha256(token),
      userId: rows[0].id,
      expiresAt: new Date(Date.now() + 60 * 60_000),
    });

    const resetUrl = `${requestOrigin(req)}/reset-password?token=${token}`;
    await sendMail({
      to: email,
      subject: `Reset your ${settings.appearance.platformName} password`,
      html: emailLayout({
        brandColor: settings.appearance.emailBrandColor,
        platformName: settings.appearance.platformName,
        footerText: settings.appearance.emailFooterText,
        body: passwordResetTemplate({
          name: rows[0].name,
          platformName: settings.appearance.platformName,
          resetUrl,
          expiresMinutes: 60,
        }),
      }),
    });

    await logActivity({
      action: 'PASSWORD_RESET_REQUEST',
      actorId: rows[0].id,
      message: `Password reset requested for ${email}`,
      ip,
      userAgent: userAgent(req),
    });
  }

  return ok({ sent: true });
});

export const dynamic = 'force-dynamic';
