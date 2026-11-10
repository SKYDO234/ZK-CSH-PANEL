'use client';

import Link from 'next/link';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import {
  ArrowUpRight,
  Ban,
  CheckCircle2,
  Gauge,
  Loader2,
  MoreVertical,
  Plus,
  Search,
  ShieldCheck,
  Trash2,
  UserCog,
  Users,
} from 'lucide-react';
import { formatBytes, formatDateTime, initials, percent, timeAgo } from '@/lib/format';
import { ProgressBar, EmptyState } from '@/components/ui/misc';
import { Dialog, ConfirmDialog } from '@/components/ui/dialog';
import { useToast } from '@/components/ui/toast';
import { csrfToken } from '@/lib/upload-client';
import { cn } from '@/lib/cn';
import { CreateUserDialog } from './create-user-dialog';

type AdminUser = {
  id: string;
  name: string;
  email: string;
  status: 'ACTIVE' | 'SUSPENDED' | 'PENDING';
  roleId: string;
  roleName: 'SUPER_ADMIN' | 'ADMIN' | 'USER';
  roleLabel: string;
  quotaBytes: number;
  usedBytes: number;
  fileCount: number;
  avatarUrl: string | null;
  emailVerified: boolean;
  lastLoginAt: string | null;
  createdAt: string;
  notes: string | null;
};

export function UserTable({
  platformName,
  quotaPresets,
  currentUserId,
  canDelete,
}: {
  platformName: string;
  quotaPresets: number[];
  currentUserId: string;
  canDelete: boolean;
}) {
  const router = useRouter();
  const { success, error } = useToast();
  const [users, setUsers] = useState<AdminUser[]>([]);
  const [roles, setRoles] = useState<Array<{ id: string; name: string; label: string }>>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [status, setStatus] = useState('all');
  const [role, setRole] = useState('all');
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [total, setTotal] = useState(0);
  const [createOpen, setCreateOpen] = useState(false);
  const [quotaUser, setQuotaUser] = useState<AdminUser | null>(null);
  const [quotaValue, setQuotaValue] = useState('');
  const [deleteUser, setDeleteUser] = useState<AdminUser | null>(null);
  const [purgeOnDelete, setPurgeOnDelete] = useState(false);
  const [busy, setBusy] = useState(false);
  const [openMenu, setOpenMenu] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    const params = new URLSearchParams({ page: String(page), perPage: '20' });
    if (search.trim()) params.set('search', search.trim());
    if (status !== 'all') params.set('status', status);
    if (role !== 'all') params.set('role', role);

    const res = await fetch(`/api/admin/users?${params.toString()}`);
    if (res.ok) {
      const json = await res.json();
      setUsers(json.data.users);
      setRoles(json.data.roles);
      setTotal(json.data.total);
      setTotalPages(json.data.totalPages);
    } else {
      error('Could not load users');
    }
    setLoading(false);
  }, [page, search, status, role, error]);

  useEffect(() => {
    const timer = setTimeout(() => void load(), search ? 300 : 0);
    return () => clearTimeout(timer);
  }, [load, search]);

  const patch = async (id: string, body: Record<string, unknown>) => {
    const res = await fetch(`/api/admin/users/${id}`, {
      method: 'PATCH',
      headers: { 'content-type': 'application/json', 'x-csrf-token': csrfToken() },
      body: JSON.stringify(body),
    });
    const json = await res.json().catch(() => null);
    if (!res.ok) throw new Error(json?.error?.message ?? 'Update failed');
    return json.data;
  };

  const toggleStatus = async (user: AdminUser) => {
    setBusy(true);
    try {
      await patch(user.id, { status: user.status === 'ACTIVE' ? 'SUSPENDED' : 'ACTIVE' });
      success(user.status === 'ACTIVE' ? 'Account suspended' : 'Account reactivated');
      void load();
      router.refresh();
    } catch (err) {
      error('Could not update account', (err as Error).message);
    } finally {
      setBusy(false);
      setOpenMenu(null);
    }
  };

  const saveQuota = async () => {
    if (!quotaUser) return;
    setBusy(true);
    try {
      await patch(quotaUser.id, { quotaGb: Number(quotaValue) });
      success('Quota updated', `${quotaUser.name} now has ${quotaValue} GB.`);
      setQuotaUser(null);
      void load();
      router.refresh();
    } catch (err) {
      error('Could not change quota', (err as Error).message);
    } finally {
      setBusy(false);
    }
  };

  const confirmDelete = async () => {
    if (!deleteUser) return;
    setBusy(true);
    const res = await fetch(`/api/admin/users/${deleteUser.id}${purgeOnDelete ? '?purge=1' : ''}`, {
      method: 'DELETE',
      headers: { 'x-csrf-token': csrfToken() },
    });
    setBusy(false);
    if (res.ok) {
      success(purgeOnDelete ? 'Account and files deleted' : 'Account deactivated');
      setDeleteUser(null);
      setPurgeOnDelete(false);
      void load();
      router.refresh();
    } else {
      const json = await res.json().catch(() => null);
      error('Could not delete account', json?.error?.message);
    }
  };

  const stats = useMemo(
    () => ({
      total,
      nearQuota: users.filter((u) => percent(u.usedBytes, u.quotaBytes) > 85).length,
    }),
    [total, users],
  );

  return (
    <div className="space-y-4">
      {/* Filters */}
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
        <div className="relative flex-1">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted" />
          <input
            type="search"
            value={search}
            onChange={(event) => {
              setSearch(event.target.value);
              setPage(1);
            }}
            placeholder="Search by name or email…"
            aria-label="Search users"
            className="input pl-9"
          />
        </div>
        <div className="flex items-center gap-2">
          <select
            value={status}
            onChange={(event) => {
              setStatus(event.target.value);
              setPage(1);
            }}
            aria-label="Filter by status"
            className="input w-auto py-2 text-xs"
          >
            <option value="all">All statuses</option>
            <option value="ACTIVE">Active</option>
            <option value="SUSPENDED">Suspended</option>
            <option value="PENDING">Pending</option>
          </select>
          <select
            value={role}
            onChange={(event) => {
              setRole(event.target.value);
              setPage(1);
            }}
            aria-label="Filter by role"
            className="input w-auto py-2 text-xs"
          >
            <option value="all">All roles</option>
            {roles.map((entry) => (
              <option key={entry.id} value={entry.name}>
                {entry.label}
              </option>
            ))}
          </select>
          <button type="button" className="btn-primary btn-sm shrink-0" onClick={() => setCreateOpen(true)}>
            <Plus className="h-3.5 w-3.5" /> New user
          </button>
        </div>
      </div>

      <p className="text-xs text-muted">
        {loading ? 'Loading…' : `${stats.total} account${stats.total === 1 ? '' : 's'}`}
        {stats.nearQuota > 0 ? ` · ${stats.nearQuota} nearing quota` : ''}
      </p>

      {loading && users.length === 0 ? (
        <div className="card space-y-2 p-4">
          {Array.from({ length: 6 }).map((_, index) => (
            <div key={index} className="skeleton h-14 w-full" />
          ))}
        </div>
      ) : users.length === 0 ? (
        <div className="card">
          <EmptyState
            icon={<Users className="h-6 w-6" />}
            title="No accounts found"
            description={search ? 'Try a different search term.' : 'Create the first storage account for your platform.'}
            action={
              <button type="button" className="btn-primary btn-sm" onClick={() => setCreateOpen(true)}>
                <Plus className="h-3.5 w-3.5" /> Create user
              </button>
            }
          />
        </div>
      ) : (
        <div className="card overflow-visible">
          <div className="overflow-x-auto">
            <table className="table-base">
              <thead>
                <tr>
                  <th>User</th>
                  <th>Role</th>
                  <th className="min-w-[11rem]">Storage</th>
                  <th className="hidden md:table-cell">Status</th>
                  <th className="hidden lg:table-cell">Last active</th>
                  <th className="w-12 text-right" />
                </tr>
              </thead>
              <tbody>
                {users.map((user) => {
                  const used = percent(user.usedBytes, user.quotaBytes);
                  return (
                    <tr key={user.id}>
                      <td>
                        <div className="flex items-center gap-2.5">
                          <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-brand/10 text-[11px] font-semibold text-brand">
                            {initials(user.name)}
                          </span>
                          <div className="min-w-0">
                            <Link
                              href={`/admin/users/${user.id}`}
                              className="block max-w-[14rem] truncate text-sm font-medium text-ink hover:text-brand"
                            >
                              {user.name}
                            </Link>
                            <p className="max-w-[14rem] truncate text-[11px] text-muted">{user.email}</p>
                          </div>
                        </div>
                      </td>
                      <td>
                        <span
                          className={cn(
                            'badge',
                            user.roleName === 'SUPER_ADMIN'
                              ? 'bg-violet-500/10 text-violet-600 ring-1 ring-inset ring-violet-500/20 dark:text-violet-400'
                              : user.roleName === 'ADMIN'
                                ? 'bg-sky-500/10 text-sky-600 ring-1 ring-inset ring-sky-500/20 dark:text-sky-400'
                                : 'bg-canvas text-muted ring-1 ring-inset ring-line',
                          )}
                        >
                          {user.roleName === 'USER' ? null : <ShieldCheck className="h-3 w-3" />}
                          {user.roleLabel}
                        </span>
                      </td>
                      <td>
                        <div className="flex items-center gap-2">
                          <ProgressBar value={user.usedBytes} max={user.quotaBytes} size="sm" className="w-20" />
                          <div className="min-w-0">
                            <p className="whitespace-nowrap text-[11px] font-medium text-ink">
                              {formatBytes(user.usedBytes)} / {formatBytes(user.quotaBytes)}
                            </p>
                            <p className="text-[10px] text-muted">
                              {used.toFixed(0)}% · {user.fileCount} files
                            </p>
                          </div>
                        </div>
                      </td>
                      <td className="hidden md:table-cell">
                        <span
                          className={cn(
                            'badge',
                            user.status === 'ACTIVE'
                              ? 'bg-emerald-500/10 text-emerald-600 ring-1 ring-inset ring-emerald-500/20 dark:text-emerald-400'
                              : user.status === 'SUSPENDED'
                                ? 'bg-red-500/10 text-red-600 ring-1 ring-inset ring-red-500/20 dark:text-red-400'
                                : 'bg-amber-500/10 text-amber-600 ring-1 ring-inset ring-amber-500/20 dark:text-amber-400',
                          )}
                        >
                          {user.status === 'ACTIVE' ? <CheckCircle2 className="h-3 w-3" /> : <Ban className="h-3 w-3" />}
                          {user.status.toLowerCase()}
                        </span>
                      </td>
                      <td className="hidden text-xs text-muted lg:table-cell">
                        {user.lastLoginAt ? timeAgo(user.lastLoginAt) : 'Never'}
                      </td>
                      <td className="relative text-right">
                        <button
                          type="button"
                          className="btn-icon ml-auto h-8 w-8"
                          onClick={() => setOpenMenu(openMenu === user.id ? null : user.id)}
                          aria-label={`Actions for ${user.name}`}
                          aria-expanded={openMenu === user.id}
                        >
                          <MoreVertical className="h-4 w-4" />
                        </button>
                        {openMenu === user.id ? (
                          <>
                            <div className="fixed inset-0 z-20" onClick={() => setOpenMenu(null)} aria-hidden="true" />
                            <div
                              role="menu"
                              className="absolute right-2 top-12 z-30 w-52 animate-scale-in overflow-hidden rounded-xl border border-line bg-surface p-1 text-left shadow-pop"
                            >
                              <Link
                                href={`/admin/users/${user.id}`}
                                className="flex items-center gap-2.5 rounded-lg px-3 py-2 text-sm text-ink hover:bg-canvas"
                                onClick={() => setOpenMenu(null)}
                              >
                                <UserCog className="h-4 w-4 text-muted" /> View account
                              </Link>
                              <button
                                type="button"
                                className="flex w-full items-center gap-2.5 rounded-lg px-3 py-2 text-sm text-ink hover:bg-canvas"
                                onClick={() => {
                                  setQuotaUser(user);
                                  setQuotaValue(String(user.quotaBytes / 1024 ** 3));
                                  setOpenMenu(null);
                                }}
                              >
                                <Gauge className="h-4 w-4 text-muted" /> Change quota
                              </button>
                              {user.id !== currentUserId ? (
                                <button
                                  type="button"
                                  className="flex w-full items-center gap-2.5 rounded-lg px-3 py-2 text-sm text-ink hover:bg-canvas"
                                  onClick={() => void toggleStatus(user)}
                                  disabled={busy}
                                >
                                  {user.status === 'ACTIVE' ? (
                                    <>
                                      <Ban className="h-4 w-4 text-muted" /> Suspend
                                    </>
                                  ) : (
                                    <>
                                      <CheckCircle2 className="h-4 w-4 text-muted" /> Activate
                                    </>
                                  )}
                                </button>
                              ) : null}
                              {canDelete && user.id !== currentUserId ? (
                                <button
                                  type="button"
                                  className="flex w-full items-center gap-2.5 rounded-lg px-3 py-2 text-sm text-red-600 hover:bg-red-500/10"
                                  onClick={() => {
                                    setDeleteUser(user);
                                    setOpenMenu(null);
                                  }}
                                >
                                  <Trash2 className="h-4 w-4" /> Delete account
                                </button>
                              ) : null}
                            </div>
                          </>
                        ) : null}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          {totalPages > 1 ? (
            <div className="flex items-center justify-between border-t border-line px-4 py-3">
              <p className="text-xs text-muted">
                Page {page} of {totalPages}
              </p>
              <div className="flex gap-2">
                <button
                  type="button"
                  className="btn-secondary btn-sm"
                  disabled={page <= 1 || loading}
                  onClick={() => setPage((p) => Math.max(1, p - 1))}
                >
                  Previous
                </button>
                <button
                  type="button"
                  className="btn-secondary btn-sm"
                  disabled={page >= totalPages || loading}
                  onClick={() => setPage((p) => p + 1)}
                >
                  Next
                </button>
              </div>
            </div>
          ) : null}
        </div>
      )}

      {/* Quota dialog */}
      <Dialog
        open={Boolean(quotaUser)}
        onClose={() => setQuotaUser(null)}
        title={`Change quota — ${quotaUser?.name ?? ''}`}
        description="Takes effect immediately. The new quota cannot be smaller than current usage."
        size="sm"
        footer={
          <>
            <button className="btn-secondary" onClick={() => setQuotaUser(null)} disabled={busy}>
              Cancel
            </button>
            <button className="btn-primary" onClick={() => void saveQuota()} disabled={busy || !quotaValue}>
              {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : null} Save quota
            </button>
          </>
        }
      >
        <div className="space-y-3">
          <div className="flex flex-wrap gap-1.5">
            {quotaPresets.map((preset) => (
              <button
                key={preset}
                type="button"
                onClick={() => setQuotaValue(String(preset / 1024 ** 3))}
                className="rounded-lg bg-canvas px-2.5 py-1.5 text-xs font-medium text-muted ring-1 ring-inset ring-line hover:text-ink"
              >
                {preset / 1024 ** 3} GB
              </button>
            ))}
          </div>
          <div>
            <label htmlFor="quota-input" className="label">
              Quota (GB)
            </label>
            <input
              id="quota-input"
              type="number"
              min={0}
              step={0.5}
              className="input"
              value={quotaValue}
              onChange={(event) => setQuotaValue(event.target.value)}
            />
            <p className="hint">
              Currently using {formatBytes(quotaUser?.usedBytes ?? 0)} across {quotaUser?.fileCount ?? 0} files.
            </p>
          </div>
        </div>
      </Dialog>

      {/* Delete dialog */}
      <ConfirmDialog
        open={Boolean(deleteUser)}
        onClose={() => setDeleteUser(null)}
        onConfirm={confirmDelete}
        busy={busy}
        danger
        title={`Delete ${deleteUser?.name ?? 'account'}?`}
        description="The account is deactivated and can no longer sign in."
        confirmLabel={purgeOnDelete ? 'Delete account and files' : 'Delete account'}
      >
        <div className="space-y-3 text-sm text-muted">
          <p>All sessions are revoked immediately.</p>
          <label className="flex cursor-pointer items-start gap-2 rounded-lg bg-red-500/[0.06] p-3 text-xs text-red-700 ring-1 ring-inset ring-red-500/20 dark:text-red-400">
            <input
              type="checkbox"
              checked={purgeOnDelete}
              onChange={(event) => setPurgeOnDelete(event.target.checked)}
              className="mt-0.5 h-4 w-4 rounded border-red-300 text-red-600"
            />
            <span>
              Also permanently delete all {deleteUser?.fileCount ?? 0} files and remove their stored bytes.
              This cannot be undone.
            </span>
          </label>
        </div>
      </ConfirmDialog>

      <CreateUserDialog open={createOpen} onClose={() => setCreateOpen(false)} platformName={platformName} />
    </div>
  );
}
