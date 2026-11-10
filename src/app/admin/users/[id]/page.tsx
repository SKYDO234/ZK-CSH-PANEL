import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import Link from 'next/link';
import { and, count, desc, eq, isNull } from 'drizzle-orm';
import { ArrowLeft } from 'lucide-react';
import { requireAdmin } from '@/lib/session';
import { getSettings } from '@/lib/settings';
import { db, activityLogs, files, quotaChanges as quotas, roles, users, shares } from '@/db';
import { Topbar } from '@/components/layout/topbar';
import { formatBytes, formatDateTime, percent, timeAgo } from '@/lib/format';
import { ProgressBar } from '@/components/ui/misc';
import { UserDetailClient } from '@/components/admin/user-detail';
import { FileTypeIcon } from '@/components/files/file-icon';

export const metadata: Metadata = { title: 'User details' };
export const dynamic = 'force-dynamic';

export default async function AdminUserDetail({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const session = await requireAdmin('/admin/users');
  const settings = await getSettings();

  const rows = await db
    .select({ user: users, role: roles })
    .from(users)
    .innerJoin(roles, eq(roles.id, users.roleId))
    .where(eq(users.id, id))
    .limit(1);
  const row = rows[0];
  if (!row) notFound();

  const [userFiles, activity, shareCount, quotaHistory, roleList] = await Promise.all([
    db
      .select({
        id: files.id,
        name: files.name,
        category: files.category,
        extension: files.extension,
        size: files.size,
        createdAt: files.createdAt,
        deletedAt: files.deletedAt,
        visibility: files.visibility,
      })
      .from(files)
      .where(eq(files.ownerId, id))
      .orderBy(desc(files.createdAt))
      .limit(30),
    db
      .select()
      .from(activityLogs)
      .where(eq(activityLogs.actorId, id))
      .orderBy(desc(activityLogs.createdAt))
      .limit(20),
    db
      .select({ value: count() })
      .from(shares)
      .where(and(eq(shares.ownerId, id), isNull(shares.revokedAt))),
    db.select().from(quotas).where(eq(quotas.userId, id)).orderBy(desc(quotas.createdAt)).limit(10),
    db.select().from(roles),
  ]);

  const user = row.user;
  const usedPct = percent(user.usedBytes, user.quotaBytes);

  return (
    <>
      <Topbar
        user={{
          name: session.name,
          email: session.email,
          avatarUrl: session.avatarUrl,
          roleLabel: session.role.label,
          isAdmin: true,
        }}
        allowThemeToggle={settings.appearance.allowUserThemeToggle}
      />
      <div className="mx-auto max-w-6xl px-4 py-6 sm:px-6">
        <Link href="/admin/users" className="mb-4 inline-flex items-center gap-1.5 text-xs font-medium text-muted hover:text-ink">
          <ArrowLeft className="h-3.5 w-3.5" /> All users
        </Link>

        <div className="card mb-4 p-5">
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div>
              <div className="flex items-center gap-2.5">
                <h1 className="text-xl font-semibold tracking-tight text-ink">{user.name}</h1>
                <span className="badge-brand">{row.role.label}</span>
                <span
                  className={
                    user.status === 'ACTIVE'
                      ? 'badge-green'
                      : user.status === 'SUSPENDED'
                        ? 'badge-red'
                        : 'badge-amber'
                  }
                >
                  {user.status.toLowerCase()}
                </span>
              </div>
              <p className="mt-1 text-sm text-muted">{user.email}</p>
              <p className="mt-1 text-xs text-muted">
                Created {formatDateTime(user.createdAt)} ·{' '}
                {user.lastLoginAt ? `last active ${timeAgo(user.lastLoginAt)}` : 'never signed in'}
              </p>
            </div>
            <div className="min-w-[14rem] flex-1 sm:max-w-xs">
              <div className="mb-1 flex items-center justify-between text-[11px] text-muted">
                <span>Storage used</span>
                <span>
                  {formatBytes(user.usedBytes)} / {formatBytes(user.quotaBytes)}
                </span>
              </div>
              <ProgressBar value={user.usedBytes} max={user.quotaBytes} />
              <div className="mt-1.5 flex items-center justify-between text-[11px] text-muted">
                <span>{usedPct.toFixed(1)}% used</span>
                <span>{formatBytes(Number(user.quotaBytes) - Number(user.usedBytes))} free</span>
              </div>
            </div>
          </div>
        </div>

        <UserDetailClient
          user={{
            id: user.id,
            name: user.name,
            email: user.email,
            status: user.status,
            roleName: row.role.name,
            quotaBytes: Number(user.quotaBytes),
            usedBytes: Number(user.usedBytes),
            notes: user.notes,
            emailVerified: user.emailVerified,
            suspendedReason: user.suspendedReason,
          }}
          roles={roleList.map((entry) => ({ id: entry.id, name: entry.name, label: entry.label }))}
          quotaPresets={settings.storage.quotaPresets}
          isSelf={session.id === user.id}
          isSuperAdmin={session.role.name === 'SUPER_ADMIN'}
          canDelete={session.can('users:delete')}
        />

        <div className="mt-4 grid gap-4 lg:grid-cols-2">
          <div className="card">
            <div className="flex items-center justify-between border-b border-line px-5 py-4">
              <h2 className="text-sm font-semibold text-ink">Files ({userFiles.length})</h2>
              <span className="text-xs text-muted">{Number(shareCount[0]?.value ?? 0)} active links</span>
            </div>
            {userFiles.length === 0 ? (
              <p className="px-5 py-10 text-center text-xs text-muted">This account has no files.</p>
            ) : (
              <ul className="max-h-96 divide-y divide-line overflow-y-auto">
                {userFiles.map((file) => (
                  <li key={file.id} className="flex items-center gap-2.5 px-5 py-2.5">
                    <FileTypeIcon category={file.category} extension={file.extension} size="sm" />
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-[13px] font-medium text-ink">{file.name}</p>
                      <p className="text-[11px] text-muted">
                        {formatBytes(file.size)} · {timeAgo(file.createdAt)}
                        {file.deletedAt ? ' · in trash' : ''}
                      </p>
                    </div>
                    {file.visibility !== 'PRIVATE' && !file.deletedAt ? (
                      <span className="badge-green shrink-0">Shared</span>
                    ) : null}
                  </li>
                ))}
              </ul>
            )}
          </div>

          <div className="space-y-4">
            <div className="card">
              <div className="border-b border-line px-5 py-4">
                <h2 className="text-sm font-semibold text-ink">Account activity</h2>
              </div>
              {activity.length === 0 ? (
                <p className="px-5 py-10 text-center text-xs text-muted">No activity recorded.</p>
              ) : (
                <ul className="max-h-56 divide-y divide-line overflow-y-auto">
                  {activity.map((entry) => (
                    <li key={entry.id} className="px-5 py-2.5">
                      <p className="text-[13px] text-ink">{entry.message}</p>
                      <p className="text-[11px] text-muted">
                        {entry.action} · {timeAgo(entry.createdAt)} · {entry.ip ?? 'unknown IP'}
                      </p>
                    </li>
                  ))}
                </ul>
              )}
            </div>

            <div className="card">
              <div className="border-b border-line px-5 py-4">
                <h2 className="text-sm font-semibold text-ink">Quota history</h2>
              </div>
              {quotaHistory.length === 0 ? (
                <p className="px-5 py-8 text-center text-xs text-muted">No quota changes recorded.</p>
              ) : (
                <ul className="divide-y divide-line">
                  {quotaHistory.map((entry) => (
                    <li key={entry.id} className="flex items-center justify-between px-5 py-2.5 text-xs">
                      <span className="text-muted">
                        {formatBytes(Number(entry.fromBytes))} → {formatBytes(Number(entry.toBytes))}
                      </span>
                      <span className="text-muted">{timeAgo(entry.createdAt)}</span>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </div>
        </div>
      </div>
    </>
  );
}
