import { NextRequest } from 'next/server';
import { handler, ok } from '@/lib/api';
import { clearSessionCookie, getSession, revokeSession } from '@/lib/auth';
import { logActivity } from '@/lib/activity';
import { clientIp, userAgent } from '@/lib/request';

export const POST = handler(async (req: NextRequest) => {
  const session = await getSession();
  if (session) {
    await revokeSession(session.sessionId);
    await logActivity({
      action: 'LOGOUT',
      actorId: session.id,
      message: `${session.name} signed out`,
      ip: clientIp(req),
      userAgent: userAgent(req),
    });
  }
  await clearSessionCookie();
  return ok({ signedOut: true });
});

export const dynamic = 'force-dynamic';
