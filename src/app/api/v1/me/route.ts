import { handler, ok } from '@/lib/api';
import { authenticateApi } from '@/lib/api-auth';
import { getStorageStats } from '@/lib/files';

/** GET /api/v1/me — identity + quota for the authenticated principal. */
export const GET = handler(async (req) => {
  const principal = await authenticateApi(req);
  const stats = await getStorageStats(principal.userId);
  return ok({
    user: {
      id: principal.userId,
      name: principal.name,
      email: principal.email,
      role: principal.roleName,
      scopes: principal.scopes,
    },
    storage: stats,
  });
});

export const dynamic = 'force-dynamic';
