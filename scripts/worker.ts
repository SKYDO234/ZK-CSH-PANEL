/**
 * Background worker.
 *
 *   npm run worker            # long-running loop
 *   npm run worker -- --once  # single pass (useful for cron)
 *
 * Jobs performed on every pass:
 *   1. thumbnails  — generate missing image thumbnails and image metadata
 *   2. trash purge — permanently delete files soft-deleted longer ago than the
 *                    configured retention window
 *   3. rate limits — drop expired rate-limit buckets
 *   4. sessions    — delete expired session rows
 *
 * Everything is idempotent, so a crash mid-pass simply resumes next tick.
 *
 * Note: this script is executed by Next's own runtime (`next dev`/`next start`
 * via /api/admin/worker) or directly by `tsx`. Media processing is imported
 * lazily so a failure in one job never stops the others.
 */
import path from 'node:path';
import { loadEnv } from './load-env';

loadEnv(path.join(process.cwd(), '.env'));
loadEnv(path.join(process.cwd(), '.env.local'));

const ONCE = process.argv.includes('--once');
const INTERVAL_MS = Number(process.env.WORKER_INTERVAL_MS ?? 60_000);

export type WorkerStats = {
  thumbnails: number;
  purged: number;
  rateLimits: number;
  sessions: number;
  startedAt: string;
  durationMs: number;
  errors: string[];
};

/** One idempotent maintenance pass. Safe to call from cron or an API route. */
export async function runPass(): Promise<WorkerStats> {
  const startedAt = new Date();
  const started = Date.now();
  const stats: WorkerStats = {
    thumbnails: 0,
    purged: 0,
    rateLimits: 0,
    sessions: 0,
    startedAt: startedAt.toISOString(),
    durationMs: 0,
    errors: [],
  };

  const { and, eq, isNotNull, lt, sql } = await import('drizzle-orm');
  const { db } = await import('../src/db/index');
  const { files, sessions } = await import('../src/db/schema');
  const { getSettings } = await import('../src/lib/settings');
  const { sweep } = await import('../src/lib/rate-limit');

  const settings = await getSettings({ fresh: true });

  // 1 — thumbnails + metadata for images lacking them
  try {
    const { processUploadedFile } = await import('../src/lib/upload-service');
    const pending = await db
      .select({ id: files.id })
      .from(files)
      .where(
        and(
          eq(files.status, 'READY'),
          eq(files.category, 'image'),
          eq(files.hasThumbnail, false),
          sql`${files.deletedAt} IS NULL`,
        ),
      )
      .limit(25);

    for (const row of pending) {
      try {
        await processUploadedFile(row.id);
        stats.thumbnails += 1;
      } catch (err) {
        stats.errors.push(`thumbnail ${row.id}: ${(err as Error).message}`);
      }
    }
  } catch (err) {
    stats.errors.push(`thumbnail job: ${(err as Error).message}`);
  }

  // 2 — purge files that have been in the trash past the retention window
  try {
    const retentionDays = settings.storage.trashRetentionDays ?? 30;
    if (retentionDays > 0) {
      const cutoff = new Date(Date.now() - retentionDays * 86400_000);
      const expired = await db
        .select()
        .from(files)
        .where(and(isNotNull(files.deletedAt), lt(files.deletedAt, cutoff)))
        .limit(100);

      if (expired.length > 0) {
        const { getStorageDriver } = await import('../src/lib/storage');
        const { releaseQuota } = await import('../src/lib/files');
        for (const file of expired) {
          try {
            const storage = getStorageDriver(file.storageDriver as 'local' | 's3');
            await storage.delete(file.storageKey).catch(() => {});
            if (file.thumbnailKey) await storage.delete(file.thumbnailKey).catch(() => {});
            await db.delete(files).where(eq(files.id, file.id));
            await releaseQuota(file.ownerId, file.size);
            stats.purged += 1;
          } catch (err) {
            stats.errors.push(`purge ${file.id}: ${(err as Error).message}`);
          }
        }
      }
    }
  } catch (err) {
    stats.errors.push(`purge job: ${(err as Error).message}`);
  }

  // 3 — expired in-memory rate-limit buckets
  try {
    sweep();
    stats.rateLimits = 1;
  } catch (err) {
    stats.errors.push(`rate limit sweep: ${(err as Error).message}`);
  }

  // 4 — expired sessions
  try {
    const removed = await db
      .delete(sessions)
      .where(lt(sessions.expiresAt, new Date()))
      .returning({ id: sessions.id });
    stats.sessions = removed.length;
  } catch (err) {
    stats.errors.push(`session cleanup: ${(err as Error).message}`);
  }

  stats.durationMs = Date.now() - started;
  return stats;
}

async function main() {
  console.log(`Vaultly worker started (${ONCE ? 'single pass' : `every ${INTERVAL_MS / 1000}s`})`);
  let stopping = false;
  const stop = () => {
    stopping = true;
    console.log('\nWorker shutting down after current pass…');
  };
  process.on('SIGINT', stop);
  process.on('SIGTERM', stop);

  while (!stopping) {
    const stats = await runPass();
    const summary = [
      stats.thumbnails ? `thumbnails=${stats.thumbnails}` : '',
      stats.purged ? `purged=${stats.purged}` : '',
      stats.sessions ? `sessions=${stats.sessions}` : '',
    ]
      .filter(Boolean)
      .join(' ');
    console.log(`[${stats.startedAt}] pass in ${stats.durationMs}ms · ${summary || 'nothing to do'}`);
    for (const message of stats.errors) console.warn(`  ! ${message}`);

    if (ONCE || stopping) break;
    await new Promise((resolve) => setTimeout(resolve, INTERVAL_MS));
  }

  const { pool } = await import('../src/db/index');
  await pool.end().catch(() => {});
  process.exit(0);
}

if (process.argv[1] && /worker\.(ts|mts)$/.test(process.argv[1])) {
  main().catch((err) => {
    console.error('Worker crashed:', err);
    process.exit(1);
  });
}
