import { NextRequest } from 'next/server';
import { handler, ok, requirePermission } from '@/lib/api';
import { logActivity } from '@/lib/activity';

/**
 * POST /api/admin/worker — run one background maintenance pass now.
 *
 * On a serverless host (Vercel) there is no long-lived process, so the same
 * idempotent pass that `npm run worker` loops over can be triggered here by a
 * cron job hitting this endpoint (protected by an admin session or CRON_SECRET).
 */
export const POST = handler(async (req: NextRequest) => {
  const secret = process.env.CRON_SECRET;
  const authorization = req.headers.get('authorization');
  let actor: string | null = null;

  if (secret && authorization === `Bearer ${secret}`) {
    actor = null;
  } else {
    const session = await requirePermission('settings:write');
    actor = session.id;
  }

  const { runPass } = await import('../../../../../scripts/worker');
  const stats = await runPass();

  if (actor) {
    await logActivity({
      action: 'MAINTENANCE',
      actorId: actor,
      message: `Ran background maintenance pass (${stats.thumbnails} thumbnails, ${stats.purged} purged)`,
      metadata: stats,
    });
  }

  return ok(stats);
});

export const maxDuration = 300;
export const dynamic = 'force-dynamic';
