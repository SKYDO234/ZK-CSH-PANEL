import { and, count, desc, eq, gte, isNull, sql, sum } from 'drizzle-orm';
import { db, activityLogs, files, shares, users } from '@/db';
import { num } from './serialize';

/** Aggregated platform metrics for the admin dashboard. */
export async function platformStats() {
  const startOfDay = new Date();
  startOfDay.setUTCHours(0, 0, 0, 0);
  const weekAgo = new Date(Date.now() - 7 * 86400_000);

  const [userTotals, usersByStatus, storageTotals, fileTotals, shareTotals, bandwidth, signupWeek, uploadsWeek] =
    await Promise.all([
      db.select({ value: count() }).from(users).where(isNull(users.deletedAt)),
      db
        .select({ status: users.status, value: count() })
        .from(users)
        .where(isNull(users.deletedAt))
        .groupBy(users.status),
      db
        .select({ allocated: sum(users.quotaBytes), used: sum(users.usedBytes) })
        .from(users)
        .where(isNull(users.deletedAt)),
      db
        .select({ value: count(), bytes: sum(files.size) })
        .from(files)
        .where(and(isNull(files.deletedAt), eq(files.status, 'READY'))),
      db.select({ value: count() }).from(shares).where(isNull(shares.revokedAt)),
      db
        .select({ bytes: sum(files.bytesServed), downloads: sum(files.downloadCount) })
        .from(files)
        .where(isNull(files.deletedAt)),
      db.select({ value: count() }).from(users).where(and(isNull(users.deletedAt), gte(users.createdAt, weekAgo))),
      db
        .select({ value: count(), bytes: sum(files.size) })
        .from(files)
        .where(and(isNull(files.deletedAt), gte(files.createdAt, weekAgo))),
    ]);

  const byCategory = await db
    .select({ category: files.category, value: count(), bytes: sum(files.size) })
    .from(files)
    .where(and(isNull(files.deletedAt), eq(files.status, 'READY')))
    .groupBy(files.category);

  const recentUploads = await db
    .select({
      id: files.id,
      name: files.name,
      category: files.category,
      size: files.size,
      createdAt: files.createdAt,
      ownerName: users.name,
      ownerId: users.id,
      ownerEmail: users.email,
    })
    .from(files)
    .innerJoin(users, eq(users.id, files.ownerId))
    .where(and(isNull(files.deletedAt), eq(files.status, 'READY')))
    .orderBy(desc(files.createdAt))
    .limit(8);

  const activity = await db
    .select({
      id: activityLogs.id,
      action: activityLogs.action,
      message: activityLogs.message,
      createdAt: activityLogs.createdAt,
      actorName: users.name,
      actorEmail: users.email,
    })
    .from(activityLogs)
    .leftJoin(users, eq(users.id, activityLogs.actorId))
    .orderBy(desc(activityLogs.createdAt))
    .limit(12);

  const topUsers = await db
    .select({
      id: users.id,
      name: users.name,
      email: users.email,
      quotaBytes: users.quotaBytes,
      usedBytes: users.usedBytes,
      fileCount: sql<number>`(
        SELECT count(*) FROM ${files}
        WHERE ${files.ownerId} = ${users.id} AND ${files.deletedAt} IS NULL
      )`,
    })
    .from(users)
    .where(isNull(users.deletedAt))
    .orderBy(desc(users.usedBytes))
    .limit(5);

  const categories: Record<string, { count: number; bytes: number }> = {};
  for (const row of byCategory) {
    categories[row.category] = { count: Number(row.value), bytes: Number(row.bytes ?? 0) };
  }

  const statusMap: Record<string, number> = {};
  for (const row of usersByStatus) statusMap[row.status] = Number(row.value);

  return {
    totalUsers: Number(userTotals[0]?.value ?? 0),
    activeUsers: statusMap.ACTIVE ?? 0,
    suspendedUsers: statusMap.SUSPENDED ?? 0,
    pendingUsers: statusMap.PENDING ?? 0,
    newUsersThisWeek: Number(signupWeek[0]?.value ?? 0),
    allocatedBytes: num(userTotals[0] ? (storageTotals[0]?.allocated ?? 0) : 0),
    usedBytes: num(storageTotals[0]?.used ?? 0),
    totalFiles: Number(fileTotals[0]?.value ?? 0),
    storedBytes: num(fileTotals[0]?.bytes ?? 0),
    totalShares: Number(shareTotals[0]?.value ?? 0),
    bandwidthBytes: num(bandwidth[0]?.bytes ?? 0),
    totalDownloads: num(bandwidth[0]?.downloads ?? 0),
    uploadsThisWeek: Number(uploadsWeek[0]?.value ?? 0),
    uploadsThisWeekBytes: num(uploadsWeek[0]?.bytes ?? 0),
    byCategory: categories,
    recentUploads: recentUploads.map((row) => ({
      ...row,
      size: Number(row.size),
      createdAt: row.createdAt.toISOString(),
    })),
    activity: activity.map((row) => ({ ...row, createdAt: row.createdAt.toISOString() })),
    topUsers: topUsers.map((row) => ({
      ...row,
      quotaBytes: Number(row.quotaBytes),
      usedBytes: Number(row.usedBytes),
      fileCount: Number(row.fileCount ?? 0),
    })),
    generatedAt: new Date().toISOString(),
    startOfDay: startOfDay.toISOString(),
  };
}
