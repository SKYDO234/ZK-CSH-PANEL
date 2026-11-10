import { NextRequest } from 'next/server';
import { z } from 'zod';
import { and, asc, count, desc, eq, ilike, isNull, or, sql, sum } from 'drizzle-orm';
import { db, files, roles, users } from '@/db';
import { ApiError, created, enforceCsrf, handler, ok, parseBody, readJson, requirePermission } from '@/lib/api';
import { hashPassword, validatePasswordStrength } from '@/lib/crypto';
import { getSettings } from '@/lib/settings';
import { logActivity } from '@/lib/activity';
import { clientIp, userAgent } from '@/lib/request';
import { GB } from '@/lib/format';

/** GET /api/admin/users — paginated user directory with live usage figures. */
export const GET = handler(async (req: NextRequest) => {
  await requirePermission('users:read');
  const url = new URL(req.url);
  const page = Math.max(1, Number(url.searchParams.get('page') ?? 1));
  const perPage = Math.min(100, Math.max(1, Number(url.searchParams.get('perPage') ?? 20)));
  const search = url.searchParams.get('search')?.trim();
  const status = url.searchParams.get('status');
  const roleName = url.searchParams.get('role');

  const filters = [isNull(users.deletedAt)];
  if (search) {
    filters.push(
      or(ilike(users.name, `%${search}%`), ilike(users.email, `%${search}%`))!,
    );
  }
  if (status && status !== 'all') {
    filters.push(eq(users.status, status as 'ACTIVE' | 'SUSPENDED' | 'PENDING'));
  }
  if (roleName && roleName !== 'all') {
    filters.push(eq(roles.name, roleName as 'SUPER_ADMIN' | 'ADMIN' | 'USER'));
  }
  const where = and(...filters);

  const [rows, totalRows, roleRows] = await Promise.all([
    db
      .select({
        id: users.id,
        name: users.name,
        email: users.email,
        status: users.status,
        quotaBytes: users.quotaBytes,
        usedBytes: users.usedBytes,
        avatarUrl: users.avatarUrl,
        emailVerified: users.emailVerified,
        lastLoginAt: users.lastLoginAt,
        createdAt: users.createdAt,
        notes: users.notes,
        roleId: roles.id,
        roleName: roles.name,
        roleLabel: roles.label,
        fileCount: sql<number>`(
          SELECT count(*) FROM ${files}
          WHERE ${files.ownerId} = ${users.id} AND ${files.deletedAt} IS NULL
        )`,
      })
      .from(users)
      .innerJoin(roles, eq(roles.id, users.roleId))
      .where(where)
      .orderBy(desc(users.createdAt))
      .limit(perPage)
      .offset((page - 1) * perPage),
    db.select({ value: count() }).from(users).innerJoin(roles, eq(roles.id, users.roleId)).where(where),
    db.select().from(roles).orderBy(asc(roles.name)),
  ]);

  const total = Number(totalRows[0]?.value ?? 0);
  return ok({
    users: rows.map((row) => ({
      ...row,
      quotaBytes: Number(row.quotaBytes),
      usedBytes: Number(row.usedBytes),
      fileCount: Number(row.fileCount ?? 0),
      lastLoginAt: row.lastLoginAt?.toISOString() ?? null,
      createdAt: row.createdAt.toISOString(),
    })),
    roles: roleRows.map((role) => ({ id: role.id, name: role.name, label: role.label })),
    total,
    page,
    perPage,
    totalPages: Math.max(1, Math.ceil(total / perPage)),
  });
});

const createSchema = z.object({
  name: z.string().trim().min(2, 'Name is required').max(120),
  email: z.string().email('Enter a valid email'),
  password: z.string().min(1, 'Password is required'),
  roleName: z.enum(['SUPER_ADMIN', 'ADMIN', 'USER']).optional(),
  quotaGb: z.number().min(0).max(1_048_576).optional(),
  sendWelcomeEmail: z.boolean().optional(),
  notes: z.string().max(1000).optional(),
});

/** POST /api/admin/users — provision a storage account. */
export const POST = handler(async (req: NextRequest) => {
  await enforceCsrf(req);
  const session = await requirePermission('users:manage');
  const settings = await getSettings();
  const body = parseBody(createSchema, await readJson(req));

  const roleName = body.roleName ?? 'USER';
  if (roleName !== 'USER' && session.role.name !== 'SUPER_ADMIN') {
    throw new ApiError(403, 'Only a Super Admin can create admin accounts.', 'forbidden');
  }

  const policyError = validatePasswordStrength(body.password, {
    minLength: settings.security.passwordMinLength,
    requireUpper: settings.security.passwordRequireUpper,
    requireNumber: settings.security.passwordRequireNumber,
    requireSymbol: settings.security.passwordRequireSymbol,
  });
  if (policyError) throw new ApiError(422, policyError, 'weak_password');

  const email = body.email.trim().toLowerCase();
  const existing = await db.select({ id: users.id }).from(users).where(eq(users.email, email)).limit(1);
  if (existing[0]) throw new ApiError(409, 'An account with that email already exists.', 'duplicate_email');

  const roleRows = await db.select().from(roles).where(eq(roles.name, roleName)).limit(1);
  if (!roleRows[0]) throw new ApiError(400, 'Role not found.', 'bad_request');

  const quotaGb = body.quotaGb ?? settings.storage.defaultQuotaBytes / GB;
  const quotaBytes = BigInt(Math.round(quotaGb * GB));
  const [row] = await db
    .insert(users)
    .values({
      email,
      name: body.name,
      passwordHash: await hashPassword(body.password),
      roleId: roleRows[0].id,
      status: 'ACTIVE',
      quotaBytes,
      emailVerified: true,
      mustChangePass: true,
      notes: body.notes ?? null,
      createdById: session.id,
    })
    .returning();

  await logActivity({
    action: 'USER_CREATE',
    actorId: session.id,
    targetType: 'user',
    targetId: row.id,
    message: `Created account for ${row.name} (${row.email}) with ${quotaGb} GB`,
    ip: clientIp(req),
    userAgent: userAgent(req),
  });

  let emailSent = false;
  if (body.sendWelcomeEmail && settings.email.enabled) {
    const { sendMail, welcomeEmailTemplate } = await import('@/lib/mailer');
    const result = await sendMail({
      to: row.email,
      subject: `Your ${settings.appearance.platformName} account`,
      html: welcomeEmailTemplate({
        name: row.name,
        email: row.email,
        password: body.password,
        platformName: settings.appearance.platformName,
        loginUrl: `${process.env.APP_URL ?? ''}/login`,
        quotaGb,
      }),
    });
    emailSent = result.sent;
  }

  return created({
    user: {
      id: row.id,
      name: row.name,
      email: row.email,
      quotaBytes: Number(row.quotaBytes),
      status: row.status,
      roleName,
    },
    emailSent,
  });
});

export const dynamic = 'force-dynamic';
