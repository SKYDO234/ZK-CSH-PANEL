import { handler, ok, requirePermission } from '@/lib/api';
import { platformStats } from '@/lib/admin-stats';

/** GET /api/admin/stats — live platform metrics. */
export const GET = handler(async () => {
  await requirePermission('users:read');
  return ok(await platformStats());
});

export const dynamic = 'force-dynamic';
