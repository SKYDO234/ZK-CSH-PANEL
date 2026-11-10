import { NextRequest } from 'next/server';
import { and, count, desc, eq, gte, ilike, or } from 'drizzle-orm';
import { db, activityLogs, users } from '@/db';
import { handler, ok, requirePermission } from '@/lib/api';

/** GET /api/admin/activity — searchable audit log with pagination. */
export const GET = handler(async (req: NextRequest) => {
  await requirePermission('logs:read');
  const url = new URL(req.url);
  const page = Math.max(1, Number(url.searchParams.get('page') ?? 1));
  const perPage = Math.min(100, Math.max(1, Number(url.searchParams.get('perPage') ?? 30)));
  const search = url.searchParams.get('search')?.trim();
  const action = url.searchParams.get('action');
  const days = Number(url.searchParams.get('days') ?? 0);

  const filters = [];
  if (search) {
    filters.push(
      or(ilike(activityLogs.message, `%${search}%`), ilike(users.email, `%${search}%`), ilike(users.name, `%${search}%`))!,
    );
  }
  if (action && action !== 'all') filters.push(eq(activityLogs.action, action as 'LOGIN'));
  if (days > 0) filters.push(gte(activityLogs.createdAt, new Date(Date.now() - days * 86400_000)));
  const where = filters.length > 0 ? and(...filters) : undefined;

  const [rows, totalRows] = await Promise.all([
    db
      .select({
        id: activityLogs.id,
        action: activityLogs.action,
        message: activityLogs.message,
        targetType: activityLogs.targetType,
        targetId: activityLogs.targetId,
        metadata: activityLogs.metadata,
        ip: activityLogs.ip,
        createdAt: activityLogs.createdAt,
        actorId: users.id,
        actorName: users.name,
        actorEmail: users.email,
      })
      .from(activityLogs)
      .leftJoin(users, eq(users.id, activityLogs.actorId))
      .where(where)
      .orderBy(desc(activityLogs.createdAt))
      .limit(perPage)
      .offset((page - 1) * perPage),
    db.select({ value: count() }).from(activityLogs).leftJoin(users, eq(users.id, activityLogs.actorId)).where(where),
  ]);

  const total = Number(totalRows[0]?.value ?? 0);
  return ok({
    entries: rows.map((row) => ({ ...row, createdAt: row.createdAt.toISOString() })),
    total,
    page,
    perPage,
    totalPages: Math.max(1, Math.ceil(total / perPage)),
  });
});

export const dynamic = 'force-dynamic';
