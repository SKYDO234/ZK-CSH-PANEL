import { sql } from 'drizzle-orm';
import {
  bigint,
  boolean,
  index,
  integer,
  jsonb,
  pgEnum,
  pgTable,
  primaryKey,
  text,
  timestamp,
  uniqueIndex,
} from 'drizzle-orm/pg-core';

/**
 * Vaultly database schema (PostgreSQL).
 *
 * Binary file content NEVER lives here — only metadata. Bytes live behind the
 * storage driver abstraction (local filesystem / S3-compatible object storage).
 */

export const roleNameEnum = pgEnum('role_name', ['SUPER_ADMIN', 'ADMIN', 'USER']);
export const userStatusEnum = pgEnum('user_status', ['ACTIVE', 'SUSPENDED', 'PENDING']);
export const visibilityEnum = pgEnum('visibility', ['PRIVATE', 'LINK', 'PUBLIC']);
export const uploadStatusEnum = pgEnum('upload_status', ['PENDING', 'READY', 'FAILED']);
export const activityActionEnum = pgEnum('activity_action', [
  'LOGIN',
  'LOGIN_FAILED',
  'LOGOUT',
  'REGISTER',
  'PASSWORD_RESET_REQUEST',
  'PASSWORD_RESET',
  'PASSWORD_CHANGE',
  'UPLOAD',
  'DOWNLOAD',
  'DELETE',
  'RESTORE',
  'RENAME',
  'MOVE',
  'FOLDER_CREATE',
  'FOLDER_DELETE',
  'SHARE_CREATE',
  'SHARE_UPDATE',
  'SHARE_DELETE',
  'QUOTA_CHANGE',
  'USER_CREATE',
  'USER_UPDATE',
  'USER_DELETE',
  'USER_SUSPEND',
  'USER_ACTIVATE',
  'SETTINGS_UPDATE',
  'ADMIN_ACTION',
  'API_KEY_CREATE',
  'API_KEY_REVOKE',
  'MAINTENANCE',
]);

/** Generic `id`, `created_at`, `updated_at` helpers. */
const id = () =>
  text('id')
    .primaryKey()
    // Postgres generates unguessable UUIDv4 text ids, so raw SQL inserts and
    // any external tooling also work without the ORM supplying the value.
    .default(sql`gen_random_uuid()::text`);
const createdAt = () => timestamp('created_at', { withTimezone: true }).notNull().defaultNow();
const updatedAt = () => timestamp('updated_at', { withTimezone: true }).notNull().defaultNow();

/** Settings groups stored as editable JSON documents. */
export const settings = pgTable('settings', {
  key: text('key').primaryKey(),
  value: jsonb('value').notNull(),
  updatedBy: text('updated_by'),
  updatedAt: updatedAt(),
});

export const roles = pgTable(
  'roles',
  {
    id: id(),
    name: roleNameEnum('name').notNull(),
    label: text('label').notNull(),
    description: text('description'),
    permissions: text('permissions').array().notNull().default(sql`ARRAY[]::text[]`),
    /** true for the three built-in roles that cannot be deleted */
    isSystem: boolean('is_system').notNull().default(true),
    createdAt: createdAt(),
  },
  (t) => [uniqueIndex('roles_name_key').on(t.name)],
);

export const users = pgTable(
  'users',
  {
    id: id(),
    email: text('email').notNull(),
    name: text('name').notNull(),
    passwordHash: text('password_hash').notNull(),
    roleId: text('role_id')
      .notNull()
      .references(() => roles.id, { onDelete: 'restrict' }),
    status: userStatusEnum('status').notNull().default('ACTIVE'),
    /** Storage quota in bytes — admin controlled. */
    quotaBytes: bigint('quota_bytes', { mode: 'bigint' }).notNull().default(sql`5368709120`),
    /** Denormalised counter of live (non-deleted, READY) file bytes. */
    usedBytes: bigint('used_bytes', { mode: 'bigint' }).notNull().default(sql`0`),
    avatarUrl: text('avatar_url'),
    phone: text('phone'),
    company: text('company'),
    notes: text('notes'),
    timezone: text('timezone'),
    locale: text('locale'),
    emailVerified: boolean('email_verified').notNull().default(false),
    mustChangePass: boolean('must_change_pass').notNull().default(false),
    lastLoginAt: timestamp('last_login_at', { withTimezone: true }),
    lastLoginIp: text('last_login_ip'),
    suspendedAt: timestamp('suspended_at', { withTimezone: true }),
    suspendedReason: text('suspended_reason'),
    failedLogins: integer('failed_logins').notNull().default(0),
    lockedUntil: timestamp('locked_until', { withTimezone: true }),
    createdById: text('created_by_id'),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
    deletedAt: timestamp('deleted_at', { withTimezone: true }),
  },
  (t) => [
    uniqueIndex('users_email_key').on(t.email),
    index('users_status_idx').on(t.status),
    index('users_role_idx').on(t.roleId),
    index('users_created_idx').on(t.createdAt),
  ],
);

export const sessions = pgTable(
  'sessions',
  {
    id: id(),
    /** SHA-256 of the cookie token; raw token never stored. */
    tokenHash: text('token_hash').notNull(),
    userId: text('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    ip: text('ip'),
    userAgent: text('user_agent'),
    createdAt: createdAt(),
    lastSeenAt: timestamp('last_seen_at', { withTimezone: true }).notNull().defaultNow(),
    expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
    revokedAt: timestamp('revoked_at', { withTimezone: true }),
  },
  (t) => [
    uniqueIndex('sessions_token_hash_key').on(t.tokenHash),
    index('sessions_user_idx').on(t.userId),
    index('sessions_expiry_idx').on(t.expiresAt),
  ],
);

export const folders = pgTable(
  'folders',
  {
    id: id(),
    name: text('name').notNull(),
    ownerId: text('owner_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    parentId: text('parent_id'),
    color: text('color'),
    deletedAt: timestamp('deleted_at', { withTimezone: true }),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [
    index('folders_owner_parent_idx').on(t.ownerId, t.parentId),
    uniqueIndex('folders_unique_name_idx').on(t.ownerId, t.parentId, t.name),
  ],
);

export const files = pgTable(
  'files',
  {
    id: id(),
    ownerId: text('owner_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    folderId: text('folder_id').references(() => folders.id, { onDelete: 'set null' }),

    name: text('name').notNull(),
    originalName: text('original_name').notNull(),
    mimeType: text('mime_type').notNull(),
    /** image | video | audio | document | archive | other */
    category: text('category').notNull(),
    size: bigint('size', { mode: 'bigint' }).notNull(),
    hash: text('hash'),
    extension: text('extension'),

    storageDriver: text('storage_driver').notNull().default('local'),
    storageKey: text('storage_key').notNull(),
    metadata: jsonb('metadata'),
    thumbnailKey: text('thumbnail_key'),
    hasThumbnail: boolean('has_thumbnail').notNull().default(false),

    status: uploadStatusEnum('status').notNull().default('PENDING'),
    visibility: visibilityEnum('visibility').notNull().default('PRIVATE'),
    downloadEnabled: boolean('download_enabled').notNull().default(true),

    downloadCount: integer('download_count').notNull().default(0),
    viewCount: integer('view_count').notNull().default(0),
    bytesServed: bigint('bytes_served', { mode: 'bigint' }).notNull().default(sql`0`),

    ipAddress: text('ip_address'),
    userAgent: text('user_agent'),

    deletedAt: timestamp('deleted_at', { withTimezone: true }),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [
    index('files_owner_deleted_created_idx').on(t.ownerId, t.deletedAt, t.createdAt),
    index('files_owner_folder_idx').on(t.ownerId, t.folderId),
    index('files_owner_category_idx').on(t.ownerId, t.category),
    index('files_hash_idx').on(t.hash),
    index('files_status_idx').on(t.status),
    index('files_created_idx').on(t.createdAt),
  ],
);

export const shares = pgTable(
  'shares',
  {
    id: id(),
    /** Unguessable public token used in /share/:token URLs. */
    token: text('token').notNull(),
    fileId: text('file_id')
      .notNull()
      .references(() => files.id, { onDelete: 'cascade' }),
    ownerId: text('owner_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),

    passwordHash: text('password_hash'),
    expiresAt: timestamp('expires_at', { withTimezone: true }),
    maxDownloads: integer('max_downloads'),
    downloadCount: integer('download_count').notNull().default(0),
    allowDownload: boolean('allow_download').notNull().default(true),
    /** View-only mode: rendered inline, download button hidden and blocked. */
    viewOnly: boolean('view_only').notNull().default(false),
    embeddable: boolean('embeddable').notNull().default(true),

    lastAccessAt: timestamp('last_access_at', { withTimezone: true }),
    revokedAt: timestamp('revoked_at', { withTimezone: true }),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [
    uniqueIndex('shares_token_key').on(t.token),
    uniqueIndex('shares_file_key').on(t.fileId),
    index('shares_owner_idx').on(t.ownerId),
  ],
);

export const activityLogs = pgTable(
  'activity_logs',
  {
    id: id(),
    action: activityActionEnum('action').notNull(),
    actorId: text('actor_id').references(() => users.id, { onDelete: 'set null' }),
    targetType: text('target_type'),
    targetId: text('target_id'),
    message: text('message').notNull(),
    metadata: jsonb('metadata'),
    ip: text('ip'),
    userAgent: text('user_agent'),
    createdAt: createdAt(),
  },
  (t) => [
    index('activity_actor_created_idx').on(t.actorId, t.createdAt),
    index('activity_action_created_idx').on(t.action, t.createdAt),
    index('activity_created_idx').on(t.createdAt),
  ],
);

export const quotaChanges = pgTable(
  'quota_changes',
  {
    id: id(),
    userId: text('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    fromBytes: bigint('from_bytes', { mode: 'bigint' }).notNull(),
    toBytes: bigint('to_bytes', { mode: 'bigint' }).notNull(),
    changedBy: text('changed_by'),
    reason: text('reason'),
    createdAt: createdAt(),
  },
  (t) => [index('quota_changes_user_idx').on(t.userId, t.createdAt)],
);

export const apiKeys = pgTable(
  'api_keys',
  {
    id: id(),
    name: text('name').notNull(),
    /** SHA-256 of the key; only the raw key is shown once at creation. */
    keyHash: text('key_hash').notNull(),
    prefix: text('prefix').notNull(),
    userId: text('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    scopes: text('scopes').array().notNull().default(sql`ARRAY[]::text[]`),
    lastUsedAt: timestamp('last_used_at', { withTimezone: true }),
    expiresAt: timestamp('expires_at', { withTimezone: true }),
    revokedAt: timestamp('revoked_at', { withTimezone: true }),
    createdAt: createdAt(),
  },
  (t) => [
    uniqueIndex('api_keys_hash_key').on(t.keyHash),
    index('api_keys_user_idx').on(t.userId),
  ],
);

export const passwordResetTokens = pgTable(
  'password_reset_tokens',
  {
    id: id(),
    tokenHash: text('token_hash').notNull(),
    userId: text('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
    usedAt: timestamp('used_at', { withTimezone: true }),
    createdAt: createdAt(),
  },
  (t) => [
    uniqueIndex('password_reset_hash_key').on(t.tokenHash),
    index('password_reset_user_idx').on(t.userId),
  ],
);

/** Rolling window used by the login rate limiter. */
export const loginAttempts = pgTable(
  'login_attempts',
  {
    id: id(),
    identifier: text('identifier').notNull(),
    ip: text('ip'),
    success: boolean('success').notNull(),
    createdAt: createdAt(),
  },
  (t) => [
    index('login_attempts_identifier_idx').on(t.identifier, t.createdAt),
    index('login_attempts_ip_idx').on(t.ip, t.createdAt),
  ],
);

export type ActivityAction = (typeof activityActionEnum.enumValues)[number];
export type User = typeof users.$inferSelect;
export type NewUser = typeof users.$inferInsert;
export type FileRow = typeof files.$inferSelect;
export type FolderRow = typeof folders.$inferSelect;
export type ShareRow = typeof shares.$inferSelect;
export type RoleRow = typeof roles.$inferSelect;
export type ActivityRow = typeof activityLogs.$inferSelect;
