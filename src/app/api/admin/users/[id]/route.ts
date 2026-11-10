import { NextRequest } from 'next/server';
import { z } from 'zod';
import { and, eq, isNull } from 'drizzle-orm';
import { db, files, quotaChanges, roles, users } from '@/db';
import { ApiError, enforceCsrf, handler, ok, parseBody, readJson, requirePermission } from '@/lib/api';
import { hashPassword } from '@/lib/crypto';
import { logActivity } from '@/lib/activity';
import { clientIp, userAgent } from '@/lib/request';
import { revokeAllSessions } from '@/lib/auth';
import { getStorageDriver } from '@/lib/storage';

import { GB } from '@/lib/format';

async function loadUser(id: string) {
  const rows = await db
    .select({
      user: users,
      role: { id: roles.id, name: roles.name, label: roles.label },
    })
    .from(users)
    .innerJoin(roles, eq(roles.id, users.roleId))
    .where(eq(users.id, id))
    .limit(1);
  if (!rows[0]) throw new ApiError(404, 'User not found.', 'not_found');
  return rows[0];
}

/** GET /api/admin/users/:id — account detail plus recent files. */
export const GET = handler(async (_req: NextRequest, context) => {
  await requirePermission('users:read');
  const { id } = await context.params;
  const row = await loadUser(id);

  const fileRows = await db
    .select({
      id: files.id,
      name: files.name,
      size: files.size,
      category: files.category,
      createdAt: files.createdAt,
      deletedAt: files.deletedAt,
    })
    .from(files)
    .where(eq(files.ownerId, id))
    .orderBy(files.createdAt)
    .limit(50);

  return ok({
    user: {
      ...row.user,
      quotaBytes: Number(row.user.quotaBytes),
      usedBytes: Number(row.user.usedBytes),
      passwordHash: undefined,
      role: row.role,
    },
    files: fileRows.map((file) => ({
      ...file,
      size: Number(file.size),
      createdAt: file.createdAt.toISOString(),
      deletedAt: file.deletedAt?.toISOString() ?? null,
    })),
  });
});

const patchSchema = z.object({
  name: z.string().trim().min(2).max(120).optional(),
  email: z.string().email().optional(),
  status: z.enum(['ACTIVE', 'SUSPENDED', 'PENDING']).optional(),
  roleName: z.enum(['SUPER_ADMIN', 'ADMIN', 'USER']).optional(),
  quotaGb: z.number().min(0).max(1_048_576).optional(),
  notes: z.string().max(2000).nullable().optional(),
  suspendedReason: z.string().max(500).nullable().optional(),
  emailVerified: z.boolean().optional(),
  mustChangePass: z.boolean().optional(),
  newPassword: z.string().min(1).max(200).optional(),
});

/**
 * PATCH /api/admin/users/:id
 *
 * Quota changes take effect immediately; the new quota cannot be set below the
 * account's current usage (the admin is prompted to free space first).
 */
export const PATCH = handler(async (req: NextRequest, context) => {
  await enforceCsrf(req);
  const session = await requirePermission('users:manage');
  const { id } = await context.params;
  const body = parseBody(patchSchema, await readJson(req));
  const existing = await loadUser(id);

  if (existing.role.name === 'SUPER_ADMIN' && session.role.name !== 'SUPER_ADMIN') {
    throw new ApiError(403, 'Only a Super Admin can modify another Super Admin.', 'forbidden');
  }
  if (body.roleName && body.roleName !== 'USER' && session.role.name !== 'SUPER_ADMIN') {
    throw new ApiError(403, 'Only a Super Admin can grant admin roles.', 'forbidden');
  }

  const updates: Partial<typeof users.$inferInsert> = { updatedAt: new Date() };
  const changes: string[] = [];

  if (body.name !== undefined) {
    updates.name = body.name;
    changes.push('name');
  }
  if (body.email !== undefined) {
    const email = body.email.trim().toLowerCase();
    const duplicate = await db
      .select({ id: users.id })
      .from(users)
      .where(and(eq(users.email, email), isNull(users.deletedAt)))
      .limit(1);
    if (duplicate[0] && duplicate[0].id !== id) {
      throw new ApiError(409, 'Another account already uses that email.', 'duplicate_email');
    }
    updates.email = email;
    changes.push('email');
  }
  if (body.status !== undefined) {
    if (id === session.id) throw new ApiError(400, 'You cannot change your own status.', 'bad_request');
    updates.status = body.status;
    updates.suspendedAt = body.status === 'SUSPENDED' ? new Date() : null;
    updates.suspendedReason = body.status === 'SUSPENDED' ? (body.suspendedReason ?? null) : null;
    if (body.status === 'SUSPENDED') await revokeAllSessions(id);
    changes.push(`status:${body.status}`);
  }
  if (body.roleName !== undefined) {
    if (id === session.id) throw new ApiError(400, 'You cannot change your own role.', 'bad_request');
    const roleRow = await db.select().from(roles).where(eq(roles.name, body.roleName)).limit(1);
    if (!roleRow[0]) throw new ApiError(400, 'Role not found.', 'bad_request');
    updates.roleId = roleRow[0].id;
    changes.push(`role:${body.roleName}`);
  }
  if (body.notes !== undefined) updates.notes = body.notes;
  if (body.emailVerified !== undefined) updates.emailVerified = body.emailVerified;
  if (body.mustChangePass !== undefined) updates.mustChangePass = body.mustChangePass;

  if (body.newPassword) {
    updates.passwordHash = await hashPassword(body.newPassword);
    updates.mustChangePass = true;
    updates.failedLogins = 0;
    updates.lockedUntil = null;
    await revokeAllSessions(id);
    changes.push('password reset');
    await logActivity({
      action: 'PASSWORD_RESET',
      actorId: session.id,
      targetType: 'user',
      targetId: id,
      message: `Reset password for ${existing.user.email}`,
      ip: clientIp(req),
      userAgent: userAgent(req),
    });
  }

  // Quota change (with audit trail)
  if (body.quotaGb !== undefined) {
    const nextQuota = BigInt(Math.round(body.quotaGb * GB));
    const currentUsed = BigInt(existing.user.usedBytes);
    if (nextQuota < currentUsed) {
      throw new ApiError(
        422,
        `This account is already using ${Number(currentUsed) / GB} GB. Set a quota at least that large, or free space first.`,
        'quota_below_usage',
      );
    }
    updates.quotaBytes = nextQuota;
    await db.insert(quotaChanges).values({
      userId: id,
      fromBytes: existing.user.quotaBytes,
      toBytes: nextQuota,
      changedBy: session.id,
      reason: 'Admin update',
    });
    changes.push('quota');
    await logActivity({
      action: 'QUOTA_CHANGE',
      actorId: session.id,
      targetType: 'user',
      targetId: id,
      message: `Changed quota for ${existing.user.email} from ${Number(existing.user.quotaBytes) / GB} GB to ${body.quotaGb} GB`,
      metadata: { from: Number(existing.user.quotaBytes), to: Number(nextQuota) },
      ip: clientIp(req),
      userAgent: userAgent(req),
    });
  }

  const [updated] = await db.update(users).set(updates).where(eq(users.id, id)).returning();

  await logActivity({
    action: body.status === 'SUSPENDED' ? 'USER_SUSPEND' : body.status === 'ACTIVE' ? 'USER_ACTIVATE' : 'USER_UPDATE',
    actorId: session.id,
    targetType: 'user',
    targetId: id,
    message: `Updated ${updated.email} (${changes.join(', ') || 'no changes'})`,
    ip: clientIp(req),
    userAgent: userAgent(req),
  });

  return ok({
    user: {
      id: updated.id,
      name: updated.name,
      email: updated.email,
      status: updated.status,
      quotaBytes: Number(updated.quotaBytes),
      usedBytes: Number(updated.usedBytes),
    },
    usageRecalculated: false,
  });
});

/**
 * DELETE /api/admin/users/:id?purge=1
 * Soft-deletes the account; `purge=1` also removes every stored object.
 */
export const DELETE = handler(async (req: NextRequest, context) => {
  await enforceCsrf(req);
  const session = await requirePermission('users:delete');
  const { id } = await context.params;
  const purge = new URL(req.url).searchParams.get('purge') === '1';

  if (id === session.id) throw new ApiError(400, 'You cannot delete your own account.', 'bad_request');
  const existing = await loadUser(id);
  if (existing.role.name === 'SUPER_ADMIN' && session.role.name !== 'SUPER_ADMIN') {
    throw new ApiError(403, 'Only a Super Admin can delete a Super Admin.', 'forbidden');
  }

  await revokeAllSessions(id);

  if (purge) {
    const rows = await db
      .select({ storageKey: files.storageKey, thumbnailKey: files.thumbnailKey, storageDriver: files.storageDriver })
      .from(files)
      .where(eq(files.ownerId, id));
    const storage = getStorageDriver();
    await Promise.all(
      rows.map(async (row) => {
        await storage.delete(row.storageKey).catch(() => {});
        if (row.thumbnailKey) await storage.delete(row.thumbnailKey).catch(() => {});
      }),
    );
    await db.delete(users).where(eq(users.id, id));
  } else {
    await db
      .update(users)
      .set({ deletedAt: new Date(), status: 'SUSPENDED' })
      .where(eq(users.id, id));
  }

  await logActivity({
    action: 'USER_DELETE',
    actorId: session.id,
    targetType: 'user',
    targetId: id,
    message: `${purge ? 'Permanently deleted' : 'Deactivated'} account ${existing.user.email}`,
    ip: clientIp(req),
    userAgent: userAgent(req),
  });

  return ok({ deleted: true, purged: purge });
});

export const dynamic = 'force-dynamic';

