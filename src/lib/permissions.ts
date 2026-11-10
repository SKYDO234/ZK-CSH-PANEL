export const PERMISSIONS = {
  'files:read': 'View own files',
  'files:write': 'Upload, rename and move files',
  'files:delete': 'Delete own files',
  'shares:manage': 'Create and revoke own share links',
  'users:read': 'View users',
  'users:manage': 'Create and edit users',
  'users:delete': 'Delete users',
  'users:quota': 'Change storage quotas',
  'files:admin': 'Access any user’s files',
  'settings:read': 'View platform settings',
  'settings:write': 'Change platform settings',
  'logs:read': 'View activity logs',
  'system:manage': 'Maintenance, cache and backup operations',
} as const;

export type Permission = keyof typeof PERMISSIONS;

export const ROLE_PERMISSIONS: Record<'SUPER_ADMIN' | 'ADMIN' | 'USER', Permission[]> = {
  SUPER_ADMIN: Object.keys(PERMISSIONS) as Permission[],
  ADMIN: [
    'files:read',
    'files:write',
    'files:delete',
    'shares:manage',
    'users:read',
    'users:manage',
    'users:quota',
    'files:admin',
    'settings:read',
    'settings:write',
    'logs:read',
  ],
  USER: ['files:read', 'files:write', 'files:delete', 'shares:manage'],
};

export type RoleName = 'SUPER_ADMIN' | 'ADMIN' | 'USER';

export function permissionsForRole(role: RoleName): Permission[] {
  return ROLE_PERMISSIONS[role] ?? ROLE_PERMISSIONS.USER;
}

export function hasPermission(
  user: { role: { name: RoleName; permissions?: string[] } | null } | null | undefined,
  permission: Permission,
): boolean {
  if (!user?.role) return false;
  if (user.role.name === 'SUPER_ADMIN') return true;
  const granted =
    user.role.permissions && user.role.permissions.length > 0
      ? user.role.permissions
      : permissionsForRole(user.role.name);
  return granted.includes(permission);
}

export function isAdmin(user: { role: { name: RoleName } | null } | null | undefined): boolean {
  return user?.role?.name === 'ADMIN' || user?.role?.name === 'SUPER_ADMIN';
}
