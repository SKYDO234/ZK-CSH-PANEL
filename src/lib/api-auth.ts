import { and, eq, isNull } from 'drizzle-orm';
import { db, apiKeys, files, roles, users } from '@/db';
import { sha256 } from './crypto';
import { ApiError } from './api';
import { getSession } from './auth';
import { hit } from './rate-limit';
import type { Permission, RoleName } from './permissions';
import { hasPermission } from './permissions';

export type ApiPrincipal = {
  userId: string;
  name: string;
  email: string;
  roleName: RoleName;
  scopes: string[] | null; // null = full session access
  can: (permission: Permission) => boolean;
};

/**
 * Authenticates a REST API request.
 *
 * Accepts either a browser session cookie or `Authorization: Bearer <key>`.
 * Keys are stored as SHA-256 hashes and carry explicit scopes.
 */
export async function authenticateApi(req: Request, required?: Permission): Promise<ApiPrincipal> {
  const header = req.headers.get('authorization') ?? '';
  const token = header.match(/^Bearer\s+(.+)$/i)?.[1]?.trim();

  if (token) {
    const rows = await db
      .select({
        keyId: apiKeys.id,
        scopes: apiKeys.scopes,
        expiresAt: apiKeys.expiresAt,
        userId: users.id,
        name: users.name,
        email: users.email,
        status: users.status,
        roleName: roles.name,
        rolePermissions: roles.permissions,
      })
      .from(apiKeys)
      .innerJoin(users, eq(users.id, apiKeys.userId))
      .innerJoin(roles, eq(roles.id, users.roleId))
      .where(and(eq(apiKeys.keyHash, sha256(token)), isNull(apiKeys.revokedAt)))
      .limit(1);

    const row = rows[0];
    if (!row) throw new ApiError(401, 'Invalid API key.', 'invalid_key');
    if (row.expiresAt && row.expiresAt < new Date()) {
      throw new ApiError(401, 'This API key has expired.', 'expired_key');
    }
    if (row.status !== 'ACTIVE') throw new ApiError(403, 'This account is not active.', 'forbidden');

    const limit = hit(`apikey:${row.keyId}`, 600, 60_000);
    if (!limit.ok) throw new ApiError(429, 'Rate limit exceeded.', 'rate_limited');

    // Best-effort last-used tracking (never blocks the request).
    db.update(apiKeys)
      .set({ lastUsedAt: new Date() })
      .where(eq(apiKeys.id, row.keyId))
      .catch(() => {});

    const principal: ApiPrincipal = {
      userId: row.userId,
      name: row.name,
      email: row.email,
      roleName: row.roleName as RoleName,
      scopes: row.scopes,
      can: (permission: Permission) => {
        const granted =
          row.rolePermissions && row.rolePermissions.length > 0
            ? row.rolePermissions
            : [];
        const roleAllows = hasPermission(
          { role: { name: row.roleName as RoleName, permissions: granted } },
          permission,
        );
        const scopeAllows = row.scopes.length === 0 || row.scopes.includes(permission);
        return roleAllows && scopeAllows;
      },
    };
    assertPermission(principal, required);
    return principal;
  }

  // Fall back to the browser session.
  const session = await getSession();
  if (!session) throw new ApiError(401, 'Authentication required.', 'unauthenticated');
  const principal: ApiPrincipal = {
    userId: session.id,
    name: session.name,
    email: session.email,
    roleName: session.role.name,
    scopes: null,
    can: session.can,
  };
  assertPermission(principal, required);
  return principal;
}

function assertPermission(principal: ApiPrincipal, required?: Permission) {
  if (!required) return;
  if (!principal.can(required)) {
    throw new ApiError(403, `Your API key lacks the “${required}” scope.`, 'forbidden');
  }
}

/** Resolves a file the principal may read (own, or any when they are an admin). */
export async function findAccessibleFile(principal: ApiPrincipal, fileId: string) {
  const rows = await db
    .select()
    .from(files)
    .where(and(eq(files.id, fileId), isNull(files.deletedAt)))
    .limit(1);
  const file = rows[0];
  if (!file) return null;
  if (file.ownerId !== principal.userId && !principal.can('files:admin')) return null;
  return file;
}
