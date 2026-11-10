'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import {
  Ban,
  CheckCircle2,
  KeyRound,
  Loader2,
  Mail,
  Save,
  ShieldCheck,
  Trash2,
  UserCog,
} from 'lucide-react';
import { useToast } from '@/components/ui/toast';
import { ConfirmDialog } from '@/components/ui/dialog';
import { csrfToken } from '@/lib/upload-client';
import { formatBytes } from '@/lib/format';
import { cn } from '@/lib/cn';

type RoleName = 'SUPER_ADMIN' | 'ADMIN' | 'USER';

export function UserDetailClient({
  user,
  roles,
  quotaPresets,
  isSelf,
  isSuperAdmin,
  canDelete,
}: {
  user: {
    id: string;
    name: string;
    email: string;
    status: 'ACTIVE' | 'SUSPENDED' | 'PENDING';
    roleName: RoleName;
    quotaBytes: number;
    usedBytes: number;
    notes: string | null;
    emailVerified: boolean;
    suspendedReason: string | null;
  };
  roles: Array<{ id: string; name: RoleName; label: string }>;
  quotaPresets: number[];
  isSelf: boolean;
  isSuperAdmin: boolean;
  canDelete: boolean;
}) {
  const router = useRouter();
  const { success, error } = useToast();
  const [name, setName] = useState(user.name);
  const [email, setEmail] = useState(user.email);
  const [notes, setNotes] = useState(user.notes ?? '');
  const [roleName, setRoleName] = useState<RoleName>(user.roleName);
  const [quotaGb, setQuotaGb] = useState(String(Number(user.quotaBytes) / 1024 ** 3));
  const [newPassword, setNewPassword] = useState('');
  const [busy, setBusy] = useState<string | null>(null);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [purge, setPurge] = useState(false);
  const [resetOpen, setResetOpen] = useState(false);

  const patch = async (body: Record<string, unknown>, label: string) => {
    setBusy(label);
    try {
      const res = await fetch(`/api/admin/users/${user.id}`, {
        method: 'PATCH',
        headers: { 'content-type': 'application/json', 'x-csrf-token': csrfToken() },
        body: JSON.stringify(body),
      });
      const json = await res.json().catch(() => null);
      if (!res.ok) throw new Error(json?.error?.message ?? 'Update failed');
      success(`${label} updated`);
      router.refresh();
      return true;
    } catch (err) {
      error(`Could not update ${label.toLowerCase()}`, (err as Error).message);
      return false;
    } finally {
      setBusy(null);
    }
  };

  const resetPassword = async () => {
    const ok = await patch({ newPassword }, 'Password');
    if (ok) {
      setNewPassword('');
      setResetOpen(false);
    }
  };

  const remove = async () => {
    setBusy('Delete');
    const res = await fetch(`/api/admin/users/${user.id}${purge ? '?purge=1' : ''}`, {
      method: 'DELETE',
      headers: { 'x-csrf-token': csrfToken() },
    });
    setBusy(null);
    if (res.ok) {
      success(purge ? 'Account and files deleted' : 'Account deactivated');
      router.push('/admin/users');
    } else {
      const json = await res.json().catch(() => null);
      error('Could not delete account', json?.error?.message);
    }
  };

  return (
    <div className="grid gap-4 lg:grid-cols-2">
      {/* Profile */}
      <div className="card p-5">
        <h2 className="flex items-center gap-2 text-sm font-semibold text-ink">
          <UserCog className="h-4 w-4 text-muted" /> Account details
        </h2>
        <div className="mt-4 space-y-3">
          <div>
            <label htmlFor="ud-name" className="label">
              Full name
            </label>
            <input id="ud-name" className="input" value={name} onChange={(event) => setName(event.target.value)} />
          </div>
          <div>
            <label htmlFor="ud-email" className="label">
              Email address
            </label>
            <div className="relative">
              <Mail className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted" />
              <input
                id="ud-email"
                type="email"
                className="input pl-9"
                value={email}
                onChange={(event) => setEmail(event.target.value)}
              />
            </div>
            {user.emailVerified ? (
              <p className="hint text-emerald-600 dark:text-emerald-400">Email verified</p>
            ) : (
              <p className="hint">Email not verified</p>
            )}
          </div>
          <div>
            <label htmlFor="ud-notes" className="label">
              Internal notes
            </label>
            <textarea
              id="ud-notes"
              className="input min-h-[4.5rem] resize-y"
              value={notes}
              onChange={(event) => setNotes(event.target.value)}
              placeholder="Only visible to admins"
            />
          </div>
          <button
            type="button"
            className="btn-primary"
            disabled={busy !== null}
            onClick={() => void patch({ name, email, notes }, 'Profile')}
          >
            {busy === 'Profile' ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
            Save changes
          </button>
        </div>
      </div>

      {/* Storage + access */}
      <div className="space-y-4">
        <div className="card p-5">
          <h2 className="text-sm font-semibold text-ink">Storage quota</h2>
          <p className="mt-1 text-xs text-muted">
            Currently using {formatBytes(user.usedBytes)} of {formatBytes(user.quotaBytes)}.
          </p>
          <div className="mt-3 flex flex-wrap gap-1.5">
            {quotaPresets.map((preset) => {
              const gb = preset / 1024 ** 3;
              return (
                <button
                  key={preset}
                  type="button"
                  onClick={() => setQuotaGb(String(gb))}
                  className={cn(
                    'rounded-lg px-3 py-1.5 text-xs font-semibold transition',
                    Number(quotaGb) === gb
                      ? 'bg-brand text-white'
                      : 'bg-canvas text-muted ring-1 ring-inset ring-line hover:text-ink',
                  )}
                >
                  {gb} GB
                </button>
              );
            })}
          </div>
          <div className="mt-3 flex items-end gap-2">
            <div className="flex-1">
              <label htmlFor="ud-quota" className="label">
                Quota (GB)
              </label>
              <input
                id="ud-quota"
                type="number"
                min={0}
                step={0.5}
                className="input"
                value={quotaGb}
                onChange={(event) => setQuotaGb(event.target.value)}
              />
            </div>
            <button
              type="button"
              className="btn-primary"
              disabled={busy !== null || Number(quotaGb) === Number(user.quotaBytes) / 1024 ** 3}
              onClick={() => void patch({ quotaGb: Number(quotaGb) }, 'Quota')}
            >
              {busy === 'Quota' ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
              Apply
            </button>
          </div>
          <p className="hint">Quota changes are logged and apply instantly — no re-login required.</p>
        </div>

        <div className="card p-5">
          <h2 className="text-sm font-semibold text-ink">Access & security</h2>
          <div className="mt-3 space-y-3">
            <div>
              <label htmlFor="ud-role" className="label">
                Role
              </label>
              <select
                id="ud-role"
                className="input"
                value={roleName}
                onChange={(event) => setRoleName(event.target.value as RoleName)}
                disabled={isSelf || (!isSuperAdmin && user.roleName !== 'USER')}
              >
                {roles.map((role) => (
                  <option key={role.id} value={role.name} disabled={role.name !== 'USER' && !isSuperAdmin}>
                    {role.label}
                  </option>
                ))}
              </select>
              {isSelf ? <p className="hint">You cannot change your own role.</p> : null}
            </div>

            <div className="flex flex-wrap gap-2">
              <button
                type="button"
                className="btn-secondary btn-sm"
                disabled={busy !== null}
                onClick={() => void patch({ roleName }, 'Role')}
              >
                <ShieldCheck className="h-3.5 w-3.5" /> Save role
              </button>
              <button
                type="button"
                className={user.status === 'ACTIVE' ? 'btn-secondary btn-sm text-red-600' : 'btn-secondary btn-sm'}
                disabled={busy !== null || isSelf}
                onClick={() => void patch({ status: user.status === 'ACTIVE' ? 'SUSPENDED' : 'ACTIVE' }, 'Status')}
              >
                {user.status === 'ACTIVE' ? (
                  <>
                    <Ban className="h-3.5 w-3.5" /> Suspend
                  </>
                ) : (
                  <>
                    <CheckCircle2 className="h-3.5 w-3.5" /> Activate
                  </>
                )}
              </button>
              <button type="button" className="btn-secondary btn-sm" onClick={() => setResetOpen(true)}>
                <KeyRound className="h-3.5 w-3.5" /> Reset password
              </button>
              {canDelete && !isSelf ? (
                <button type="button" className="btn-sm btn-ghost text-red-600" onClick={() => setDeleteOpen(true)}>
                  <Trash2 className="h-3.5 w-3.5" /> Delete
                </button>
              ) : null}
            </div>
            {user.suspendedReason ? (
              <p className="rounded-lg bg-red-500/[0.06] px-3 py-2 text-xs text-red-700 ring-1 ring-inset ring-red-500/20 dark:text-red-400">
                Suspended: {user.suspendedReason}
              </p>
            ) : null}
          </div>
        </div>
      </div>

      {/* Reset password dialog */}
      <ConfirmDialog
        open={resetOpen}
        onClose={() => setResetOpen(false)}
        onConfirm={resetPassword}
        busy={busy === 'Password'}
        title="Reset password"
        description="Set a temporary password. The user must change it on next sign-in and all their sessions are revoked."
        confirmLabel="Reset password"
      >
        <div>
          <label htmlFor="ud-password" className="label">
            New temporary password
          </label>
          <input
            id="ud-password"
            className="input font-mono text-xs"
            value={newPassword}
            onChange={(event) => setNewPassword(event.target.value)}
            placeholder="Minimum 8 characters"
          />
        </div>
      </ConfirmDialog>

      {/* Delete dialog */}
      <ConfirmDialog
        open={deleteOpen}
        onClose={() => setDeleteOpen(false)}
        onConfirm={remove}
        busy={busy === 'Delete'}
        danger
        title={`Delete ${user.name}?`}
        description="The account is deactivated and all sessions are revoked immediately."
        confirmLabel={purge ? 'Delete account and files' : 'Delete account'}
      >
        <label className="flex cursor-pointer items-start gap-2 rounded-lg bg-red-500/[0.06] p-3 text-xs text-red-700 ring-1 ring-inset ring-red-500/20 dark:text-red-400">
          <input
            type="checkbox"
            checked={purge}
            onChange={(event) => setPurge(event.target.checked)}
            className="mt-0.5 h-4 w-4 rounded border-red-300 text-red-600"
          />
          <span>Permanently delete every stored file and its thumbnails. This cannot be undone.</span>
        </label>
      </ConfirmDialog>
    </div>
  );
}
