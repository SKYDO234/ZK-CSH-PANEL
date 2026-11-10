import { handler, ok } from '@/lib/api';
import { ensureCsrfToken } from '@/lib/csrf';
import { getSession } from '@/lib/auth';

/**
 * Returns the current session summary and guarantees a CSRF token cookie
 * exists. Client widgets call this once on mount.
 */
export const GET = handler(async () => {
  const session = await getSession();
  const csrfToken = await ensureCsrfToken();
  return ok({
    csrfToken,
    user: session
      ? {
          id: session.id,
          name: session.name,
          email: session.email,
          role: session.role.name,
          isAdmin: session.isAdmin,
          quotaBytes: Number(session.quotaBytes),
          usedBytes: Number(session.usedBytes),
        }
      : null,
  });
});

export const dynamic = 'force-dynamic';
