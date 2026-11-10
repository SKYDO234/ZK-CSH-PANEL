'use client';

import { useCallback, useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import {
  Check,
  Copy,
  Eye,
  EyeOff,
  KeyRound,
  Loader2,
  LogOut,
  Monitor,
  Plus,
  ShieldCheck,
  Smartphone,
  Trash2,
  User,
} from 'lucide-react';
import { useToast } from '@/components/ui/toast';
import { csrfToken } from '@/lib/upload-client';
import { ThemeToggle } from '@/components/layout/theme-toggle';
import { formatDateTime, timeAgo, initials } from '@/lib/format';
import { ConfirmDialog } from '@/components/ui/dialog';
import { cn } from '@/lib/cn';

type SessionRow = {
  id: string;
  ip: string | null;
  userAgent: string | null;
  createdAt: string;
  lastSeenAt: string;
  expiresAt: string;
  current: boolean;
};

type ApiKeyRow = {
  id: string;
  name: string;
  prefix: string;
  createdAt: string;
  lastUsedAt: string | null;
  scopes: string[];
};

export function AccountSettings({
  user,
  passwordPolicy,
  allowApiKeys,
  allowThemeToggle,
}: {
  user: { name: string; email: string; roleLabel: string; emailVerified: boolean; createdAt: string };
  passwordPolicy: { minLength: number; requireUpper: boolean; requireNumber: boolean; requireSymbol: boolean };
  allowApiKeys: boolean;
  allowThemeToggle: boolean;
}) {
  const router = useRouter();
  const { success, error } = useToast();
  const [tab, setTab] = useState<'profile' | 'security' | 'sessions' | 'api'>('profile');

  const tabs = [
    { id: 'profile' as const, label: 'Profile', icon: User },
    { id: 'security' as const, label: 'Password', icon: KeyRound },
    { id: 'sessions' as const, label: 'Sessions', icon: Monitor },
    ...(allowApiKeys ? [{ id: 'api' as const, label: 'API keys', icon: ShieldCheck }] : []),
  ];

  return (
    <div className="card overflow-hidden">
      <div className="flex overflow-x-auto border-b border-line px-2 pt-2">
        {tabs.map((entry) => (
          <button
            key={entry.id}
            type="button"
            onClick={() => setTab(entry.id)}
            className={cn(
              'flex shrink-0 items-center gap-1.5 rounded-t-lg px-3.5 py-2.5 text-sm font-medium transition',
              tab === entry.id
                ? 'border-b-2 border-brand text-brand'
                : 'border-b-2 border-transparent text-muted hover:text-ink',
            )}
          >
            <entry.icon className="h-4 w-4" /> {entry.label}
          </button>
        ))}
      </div>

      <div className="p-5">
        {tab === 'profile' ? (
          <div className="space-y-5">
            <div className="flex items-center gap-4">
              <div className="flex h-16 w-16 items-center justify-center rounded-2xl bg-brand/10 text-xl font-semibold text-brand">
                {initials(user.name)}
              </div>
              <div>
                <p className="text-base font-semibold text-ink">{user.name}</p>
                <p className="text-sm text-muted">{user.email}</p>
                <div className="mt-1 flex items-center gap-2">
                  <span className="badge-brand">{user.roleLabel}</span>
                  {user.emailVerified ? <span className="badge-green">Verified</span> : null}
                </div>
              </div>
            </div>

            <dl className="grid gap-3 sm:grid-cols-2">
              <div className="rounded-xl bg-canvas p-3.5">
                <dt className="text-[11px] uppercase tracking-wide text-muted">Account</dt>
                <dd className="mt-1 text-sm font-medium text-ink">Member since {user.createdAt}</dd>
              </div>
              <div className="rounded-xl bg-canvas p-3.5">
                <dt className="text-[11px] uppercase tracking-wide text-muted">Appearance</dt>
                <dd className="mt-1.5 flex items-center gap-2">
                  {allowThemeToggle ? (
                    <ThemeToggle />
                  ) : (
                    <span className="text-xs text-muted">Theme is controlled by the administrator.</span>
                  )}
                </dd>
              </div>
            </dl>

            <div className="rounded-xl border border-line p-4">
              <p className="text-sm font-semibold text-ink">Need to update your details?</p>
              <p className="mt-1 text-xs text-muted">
                Name and email changes are handled by an administrator to keep the platform audit
                trail accurate. Open a request with your admin team.
              </p>
            </div>
          </div>
        ) : null}

        {tab === 'security' ? <PasswordForm policy={passwordPolicy} /> : null}
        {tab === 'sessions' ? <SessionsPanel /> : null}
        {tab === 'api' && allowApiKeys ? <ApiKeysPanel /> : null}
      </div>
    </div>
  );
}

function PasswordForm({
  policy,
}: {
  policy: { minLength: number; requireUpper: boolean; requireNumber: boolean; requireSymbol: boolean };
}) {
  const { success, error } = useToast();
  const [currentPassword, setCurrent] = useState('');
  const [newPassword, setNew] = useState('');
  const [confirm, setConfirm] = useState('');
  const [show, setShow] = useState(false);
  const [busy, setBusy] = useState(false);

  const strength = (() => {
    let score = 0;
    if (newPassword.length >= policy.minLength) score += 1;
    if (newPassword.length >= 12) score += 1;
    if (/[A-Z]/.test(newPassword)) score += 1;
    if (/[0-9]/.test(newPassword)) score += 1;
    if (/[^A-Za-z0-9]/.test(newPassword)) score += 1;
    return Math.min(score, 5);
  })();

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    if (newPassword !== confirm) {
      error('Passwords do not match');
      return;
    }
    setBusy(true);
    const res = await fetch('/api/account/password', {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'x-csrf-token': csrfToken() },
      body: JSON.stringify({ currentPassword, newPassword }),
    });
    setBusy(false);
    const json = await res.json().catch(() => null);
    if (res.ok) {
      success('Password updated', 'Other devices have been signed out.');
      setCurrent('');
      setNew('');
      setConfirm('');
    } else {
      error('Could not update password', json?.error?.message);
    }
  };

  return (
    <form onSubmit={submit} className="max-w-md space-y-4">
      <div>
        <label htmlFor="current-pw" className="label">
          Current password
        </label>
        <input
          id="current-pw"
          type="password"
          className="input"
          value={currentPassword}
          onChange={(event) => setCurrent(event.target.value)}
          autoComplete="current-password"
          required
        />
      </div>
      <div>
        <label htmlFor="new-pw" className="label">
          New password
        </label>
        <div className="relative">
          <input
            id="new-pw"
            type={show ? 'text' : 'password'}
            className="input pr-10"
            value={newPassword}
            onChange={(event) => setNew(event.target.value)}
            autoComplete="new-password"
            required
          />
          <button
            type="button"
            onClick={() => setShow((v) => !v)}
            className="absolute right-2 top-1/2 -translate-y-1/2 rounded-md p-1.5 text-muted hover:text-ink"
            aria-label={show ? 'Hide password' : 'Show password'}
          >
            {show ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
          </button>
        </div>
        <div className="mt-2 flex gap-1" aria-hidden="true">
          {Array.from({ length: 5 }).map((_, index) => (
            <span
              key={index}
              className={cn(
                'h-1 flex-1 rounded-full transition',
                index < strength
                  ? strength <= 2
                    ? 'bg-red-500'
                    : strength <= 3
                      ? 'bg-amber-500'
                      : 'bg-emerald-500'
                  : 'bg-line',
              )}
            />
          ))}
        </div>
        <ul className="mt-2 space-y-1 text-[11px] text-muted">
          <li className={newPassword.length >= policy.minLength ? 'text-emerald-600 dark:text-emerald-400' : ''}>
            At least {policy.minLength} characters
          </li>
          {policy.requireUpper ? (
            <li className={/[A-Z]/.test(newPassword) ? 'text-emerald-600 dark:text-emerald-400' : ''}>
              Contains an uppercase letter
            </li>
          ) : null}
          {policy.requireNumber ? (
            <li className={/[0-9]/.test(newPassword) ? 'text-emerald-600 dark:text-emerald-400' : ''}>
              Contains a number
            </li>
          ) : null}
          {policy.requireSymbol ? (
            <li className={/[^A-Za-z0-9]/.test(newPassword) ? 'text-emerald-600 dark:text-emerald-400' : ''}>
              Contains a symbol
            </li>
          ) : null}
        </ul>
      </div>
      <div>
        <label htmlFor="confirm-pw" className="label">
          Confirm new password
        </label>
        <input
          id="confirm-pw"
          type="password"
          className="input"
          value={confirm}
          onChange={(event) => setConfirm(event.target.value)}
          autoComplete="new-password"
          required
        />
      </div>
      <button type="submit" className="btn-primary" disabled={busy}>
        {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Check className="h-4 w-4" />}
        Update password
      </button>
    </form>
  );
}

function SessionsPanel() {
  const { success, error } = useToast();
  const [sessions, setSessions] = useState<SessionRow[] | null>(null);
  const [busy, setBusy] = useState(false);
  const [confirmAll, setConfirmAll] = useState(false);

  const load = useCallback(async () => {
    const res = await fetch('/api/account/sessions');
    if (res.ok) {
      const json = await res.json();
      setSessions(json.data.sessions);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const revoke = async (id: string) => {
    setBusy(true);
    const res = await fetch(`/api/account/sessions?id=${id}`, {
      method: 'DELETE',
      headers: { 'x-csrf-token': csrfToken() },
    });
    setBusy(false);
    if (res.ok) {
      success('Session signed out');
      void load();
    } else {
      error('Could not revoke session');
    }
  };

  const revokeAll = async () => {
    setBusy(true);
    const res = await fetch('/api/account/sessions?all=1', {
      method: 'DELETE',
      headers: { 'x-csrf-token': csrfToken() },
    });
    setBusy(false);
    setConfirmAll(false);
    if (res.ok) {
      success('All other sessions signed out');
      void load();
    } else {
      error('Could not revoke sessions');
    }
  };

  const describe = (userAgent: string | null) => {
    if (!userAgent) return 'Unknown device';
    if (/iphone|android|mobile/i.test(userAgent)) return 'Mobile device';
    if (/mac os/i.test(userAgent)) return 'Mac';
    if (/windows/i.test(userAgent)) return 'Windows';
    if (/linux/i.test(userAgent)) return 'Linux';
    return 'Browser';
  };

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <p className="text-sm text-muted">Devices currently signed in to your account.</p>
        <button type="button" className="btn-secondary btn-sm" onClick={() => setConfirmAll(true)} disabled={busy}>
          <LogOut className="h-3.5 w-3.5" /> Sign out others
        </button>
      </div>
      {sessions === null ? (
        <div className="space-y-2">
          <div className="skeleton h-14 w-full" />
          <div className="skeleton h-14 w-full" />
        </div>
      ) : (
        <ul className="divide-y divide-line rounded-xl border border-line">
          {sessions.map((row) => (
            <li key={row.id} className="flex items-center gap-3 px-4 py-3">
              <span className="flex h-9 w-9 items-center justify-center rounded-lg bg-canvas text-muted">
                {/mobile/i.test(row.userAgent ?? '') ? (
                  <Smartphone className="h-4 w-4" />
                ) : (
                  <Monitor className="h-4 w-4" />
                )}
              </span>
              <div className="min-w-0 flex-1">
                <p className="text-sm font-medium text-ink">
                  {describe(row.userAgent)}
                  {row.current ? <span className="ml-2 badge-green">This device</span> : null}
                </p>
                <p className="text-xs text-muted">
                  {row.ip ?? 'unknown IP'} · active {timeAgo(row.lastSeenAt)}
                </p>
              </div>
              {row.current ? null : (
                <button
                  type="button"
                  onClick={() => void revoke(row.id)}
                  className="btn-ghost btn-sm text-red-600"
                  disabled={busy}
                >
                  Sign out
                </button>
              )}
            </li>
          ))}
        </ul>
      )}
      <ConfirmDialog
        open={confirmAll}
        onClose={() => setConfirmAll(false)}
        onConfirm={revokeAll}
        busy={busy}
        title="Sign out other devices?"
        description="Every other session will be revoked immediately. This device stays signed in."
        confirmLabel="Sign out others"
      />
    </div>
  );
}

function ApiKeysPanel() {
  const { success, error } = useToast();
  const [keys, setKeys] = useState<ApiKeyRow[] | null>(null);
  const [name, setName] = useState('');
  const [createdKey, setCreatedKey] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    const res = await fetch('/api/account/api-keys');
    if (res.ok) {
      const json = await res.json();
      setKeys(json.data.keys);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const create = async () => {
    if (!name.trim()) return;
    setBusy(true);
    const res = await fetch('/api/account/api-keys', {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'x-csrf-token': csrfToken() },
      body: JSON.stringify({ name: name.trim() }),
    });
    setBusy(false);
    const json = await res.json().catch(() => null);
    if (res.ok) {
      setCreatedKey(json.data.key);
      setName('');
      void load();
    } else {
      error('Could not create API key', json?.error?.message);
    }
  };

  const revoke = async (id: string) => {
    const res = await fetch(`/api/account/api-keys?id=${id}`, {
      method: 'DELETE',
      headers: { 'x-csrf-token': csrfToken() },
    });
    if (res.ok) {
      success('API key revoked');
      void load();
    } else {
      error('Could not revoke key');
    }
  };

  return (
    <div className="space-y-4">
      <div className="flex items-start gap-2 rounded-xl bg-brand/[0.04] p-3.5 text-xs text-muted ring-1 ring-inset ring-brand/15">
        <ShieldCheck className="mt-0.5 h-4 w-4 shrink-0 text-brand" />
        <p>
          API keys authenticate requests to <code className="rounded bg-surface px-1">/api/v1/*</code>{' '}
          with an <code className="rounded bg-surface px-1">Authorization: Bearer &lt;key&gt;</code>{' '}
          header. The key is shown once — store it securely.
        </p>
      </div>

      {createdKey ? (
        <div className="rounded-xl border border-emerald-500/30 bg-emerald-500/[0.06] p-3.5">
          <p className="text-xs font-semibold text-emerald-700 dark:text-emerald-400">
            Copy your new API key now
          </p>
          <div className="mt-2 flex items-center gap-2">
            <code className="flex-1 truncate rounded-lg bg-surface px-2.5 py-2 font-mono text-[11px] ring-1 ring-line">
              {createdKey}
            </code>
            <button
              type="button"
              className="btn-secondary btn-sm"
              onClick={() => {
                void navigator.clipboard.writeText(createdKey);
                success('API key copied');
              }}
            >
              <Copy className="h-3.5 w-3.5" />
            </button>
          </div>
        </div>
      ) : null}

      <div className="flex items-end gap-2">
        <div className="flex-1">
          <label htmlFor="key-name" className="label">
            New key name
          </label>
          <input
            id="key-name"
            className="input"
            value={name}
            onChange={(event) => setName(event.target.value)}
            placeholder="e.g. Portfolio site"
          />
        </div>
        <button type="button" className="btn-primary" onClick={() => void create()} disabled={busy || !name.trim()}>
          {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />} Create
        </button>
      </div>

      {keys === null ? (
        <div className="skeleton h-16 w-full" />
      ) : keys.length === 0 ? (
        <p className="rounded-xl border border-dashed border-line p-4 text-center text-xs text-muted">
          No API keys yet.
        </p>
      ) : (
        <ul className="divide-y divide-line rounded-xl border border-line">
          {keys.map((key) => (
            <li key={key.id} className="flex items-center gap-3 px-4 py-3">
              <div className="min-w-0 flex-1">
                <p className="text-sm font-medium text-ink">{key.name}</p>
                <p className="font-mono text-xs text-muted">
                  {key.prefix}••••••• · created {formatDateTime(key.createdAt)}
                  {key.lastUsedAt ? ` · used ${timeAgo(key.lastUsedAt)}` : ' · never used'}
                </p>
              </div>
              <button
                type="button"
                onClick={() => void revoke(key.id)}
                className="btn-ghost btn-sm text-red-600"
                aria-label={`Revoke ${key.name}`}
              >
                <Trash2 className="h-3.5 w-3.5" /> Revoke
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
