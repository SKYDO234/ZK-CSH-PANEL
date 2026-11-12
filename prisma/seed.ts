/**
 * Seed script.
 *
 *   npm run db:seed              # roles + settings + admin (idempotent)
 *   npm run db:seed -- --demo    # also creates demo users, folders and files
 *
 * The admin account is taken from ADMIN_EMAIL / ADMIN_PASSWORD. If the account
 * already exists its password is left untouched unless --reset-admin is passed.
 */
import { loadEnv } from '../scripts/load-env';

loadEnv();

import { and, eq, sql } from 'drizzle-orm';

const GB = 1024 ** 3;

export async function runSeed() {
  const args = process.argv.slice(2);
  const demo = args.includes('--demo');
  const resetAdmin = args.includes('--reset-admin');

  const { db, roles, users, settings: settingsTable, folders } = await import('../src/db');
  const { hashPassword } = await import('../src/lib/crypto');
  const { DEFAULT_SETTINGS, invalidateSettings } = await import('../src/lib/settings');
  const { ROLE_PERMISSIONS } = await import('../src/lib/permissions');

  console.log('[seed] roles');
  const roleDefs = [
    {
      name: 'SUPER_ADMIN' as const,
      label: 'Super Admin',
      description: 'Unrestricted access to every part of the platform.',
    },
    { name: 'ADMIN' as const, label: 'Admin', description: 'Manages users, files and platform settings.' },
    { name: 'USER' as const, label: 'User', description: 'Owns a private storage box with a quota.' },
  ];

  const roleIds: Record<string, string> = {};
  for (const def of roleDefs) {
    const permissions = ROLE_PERMISSIONS[def.name];
    const existing = await db.select().from(roles).where(eq(roles.name, def.name)).limit(1);
    if (existing[0]) {
      roleIds[def.name] = existing[0].id;
      await db
        .update(roles)
        .set({ label: def.label, description: def.description, permissions })
        .where(eq(roles.id, existing[0].id));
    } else {
      const [row] = await db
        .insert(roles)
        .values({ name: def.name, label: def.label, description: def.description, permissions })
        .returning();
      roleIds[def.name] = row.id;
    }
  }

  console.log('[seed] settings');
  for (const [key, value] of Object.entries(DEFAULT_SETTINGS)) {
    const existing = await db
      .select({ key: settingsTable.key })
      .from(settingsTable)
      .where(eq(settingsTable.key, key))
      .limit(1);
    if (!existing[0]) {
      await db.insert(settingsTable).values({ key, value: value as object });
    }
  }
  invalidateSettings();

  console.log('[seed] admin account');
  const adminEmail = (process.env.ADMIN_EMAIL ?? 'admin@gmail.com').toLowerCase();
  const adminPassword = process.env.ADMIN_PASSWORD ?? 'admin123';
  const existingAdmin = await db.select().from(users).where(eq(users.email, adminEmail)).limit(1);

  let adminId: string;
  if (existingAdmin[0]) {
    adminId = existingAdmin[0].id;
    if (resetAdmin) {
      await db
        .update(users)
        .set({ passwordHash: await hashPassword(adminPassword), status: 'ACTIVE' })
        .where(eq(users.id, adminId));
      console.log(`[seed] admin password reset for ${adminEmail}`);
    } else {
      console.log(`[seed] admin ${adminEmail} already exists (use --reset-admin to reset)`);
    }
  } else {
    const [row] = await db
      .insert(users)
      .values({
        email: adminEmail,
        name: process.env.ADMIN_NAME ?? 'Platform Admin',
        passwordHash: await hashPassword(adminPassword),
        roleId: roleIds.SUPER_ADMIN,
        status: 'ACTIVE',
        quotaBytes: BigInt(1024 * GB),
        emailVerified: true,
      })
      .returning();
    adminId = row.id;
    console.log(`[seed] created super admin ${adminEmail}`);
  }

  if (!demo) {
    console.log('[seed] done');
    return;
  }

  console.log('[seed] demo users');
  const demoUsers = [
    { email: 'john@demo.local', name: 'John Carter', quota: 5, role: 'USER' as const },
    { email: 'maya@demo.local', name: 'Maya Patel', quota: 25, role: 'USER' as const },
    { email: 'editor@demo.local', name: 'Elena Ruiz', quota: 50, role: 'ADMIN' as const },
  ];

  const createdIds: string[] = [];
  for (const u of demoUsers) {
    const existing = await db.select().from(users).where(eq(users.email, u.email)).limit(1);
    if (existing[0]) {
      createdIds.push(existing[0].id);
      continue;
    }
    const [row] = await db
      .insert(users)
      .values({
        email: u.email,
        name: u.name,
        passwordHash: await hashPassword('Password123!'),
        roleId: roleIds[u.role],
        status: 'ACTIVE',
        quotaBytes: BigInt(u.quota * GB),
        emailVerified: true,
        createdById: adminId,
      })
      .returning();
    createdIds.push(row.id);
    console.log(`[seed] created demo user ${u.email} (password: Password123!)`);
  }

  console.log('[seed] demo folders');
  const firstUser = createdIds[0];
  const folderNames = ['Photography', 'Client Work', 'Brand Assets'];
  const folderIds: string[] = [];
  for (const name of folderNames) {
    const existing = await db
      .select()
      .from(folders)
      .where(and(eq(folders.ownerId, firstUser), eq(folders.name, name), sql`${folders.parentId} IS NULL`))
      .limit(1);
    if (existing[0]) {
      folderIds.push(existing[0].id);
      continue;
    }
    const [row] = await db.insert(folders).values({ ownerId: firstUser, name }).returning();
    folderIds.push(row.id);
  }

  console.log('[seed] done (demo data ready)');
}

// Executed directly (npm run db:seed)
if (process.argv[1]?.includes('seed')) {
  runSeed()
    .then(() => process.exit(0))
    .catch((err) => {
      console.error('[seed] failed', err);
      process.exit(1);
    });
}
