'use client';

import { useState } from 'react';
import { Check, Copy, KeyRound, Loader2, RefreshCw } from 'lucide-react';
import { Dialog } from '@/components/ui/dialog';
import { useToast } from '@/components/ui/toast';
import { csrfToken } from '@/lib/upload-client';
import { GB, formatBytes } from '@/lib/format';

const QUOTA_PRESETS = [1, 5, 10, 25, 50, 100, 250, 500];

const generatePassword = () => {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789!@#$%';
  const bytes = crypto.getRandomValues(new Uint8Array(14));
  return Array.from(bytes, (byte) => chars[byte % chars.length]).join('');
};

export function CreateUserDialog({
  open,
  onClose,
  platformName,
}: {
  open: boolean;
  onClose: () => void;
  platformName: string;
}) {
  const { success, error } = useToast();
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState(generatePassword());
  const [roleName, setRoleName] = useState<'USER' | 'ADMIN'>('USER');
  const [quotaGb, setQuotaGb] = useState(5);
  const [customQuota, setCustomQuota] = useState('');
  const [notes, setNotes] = useState('');
  const [sendWelcome, setSendWelcome] = useState(false);
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<{ email: string; password: string } | null>(null);
  const [isSuperAdmin, setIsSuperAdmin] = useState(false);

  const effectiveQuota = customQuota ? Number(customQuota) : quotaGb;

  const submit = async () => {
    setBusy(true);
    const res = await fetch('/api/admin/users', {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'x-csrf-token': csrfToken() },
      body: JSON.stringify({
        name: name.trim(),
        email: email.trim(),
        password,
        roleName,
        quotaGb: effectiveQuota,
        sendWelcomeEmail: sendWelcome,
        notes: notes.trim() || undefined,
      }),
    });
    setBusy(false);
    const json = await res.json().catch(() => null);
    if (res.ok) {
      setResult({ email: email.trim(), password });
      success('Account created', `${name} can now sign in.`);
      setName('');
      setEmail('');
      setNotes('');
      setPassword(generatePassword());
    } else {
      error('Could not create account', json?.error?.message);
    }
  };

  const close = () => {
    setResult(null);
    onClose();
  };

  if (result) {
    return (
      <Dialog
        open={open}
        onClose={close}
        title="Account created"
        description="Share these credentials securely — the user must change their password on first sign-in."
        size="md"
        footer={
          <button type="button" className="btn-primary" onClick={close}>
            Done
          </button>
        }
      >
        <div className="space-y-3">
          <div className="rounded-xl border border-line bg-canvas p-3.5">
            <p className="text-[11px] uppercase tracking-wide text-muted">Email</p>
            <p className="text-sm font-medium text-ink">{result.email}</p>
            <p className="mt-3 text-[11px] uppercase tracking-wide text-muted">Temporary password</p>
            <div className="mt-1 flex items-center gap-2">
              <code className="flex-1 rounded-lg bg-surface px-2.5 py-1.5 font-mono text-xs ring-1 ring-line">
                {result.password}
              </code>
              <button
                type="button"
                className="btn-secondary btn-sm"
                onClick={() => {
                  void navigator.clipboard.writeText(`Email: ${result.email}\nPassword: ${result.password}`);
                  success('Credentials copied');
                }}
              >
                <Copy className="h-3.5 w-3.5" />
              </button>
            </div>
          </div>
          <p className="text-xs text-muted">
            {platformName} login: <span className="font-medium text-ink">/login</span>
          </p>
        </div>
      </Dialog>
    );
  }

  return (
    <Dialog
      open={open}
      onClose={close}
      title="Create storage account"
      description="Provision a new user with a storage quota. Quotas can be changed at any time."
      size="lg"
      footer={
        <>
          <button type="button" className="btn-secondary" onClick={close} disabled={busy}>
            Cancel
          </button>
          <button
            type="button"
            className="btn-primary"
            onClick={() => void submit()}
            disabled={busy || !name.trim() || !email.trim() || !password}
          >
            {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Check className="h-4 w-4" />}
            Create account
          </button>
        </>
      }
    >
      <div className="space-y-4">
        <div className="grid gap-3 sm:grid-cols-2">
          <div>
            <label htmlFor="new-name" className="label">
              Full name
            </label>
            <input
              id="new-name"
              className="input"
              value={name}
              onChange={(event) => setName(event.target.value)}
              placeholder="Jane Cooper"
            />
          </div>
          <div>
            <label htmlFor="new-email" className="label">
              Email address
            </label>
            <input
              id="new-email"
              type="email"
              className="input"
              value={email}
              onChange={(event) => setEmail(event.target.value)}
              placeholder="jane@company.com"
              autoComplete="off"
            />
          </div>
        </div>

        <div>
          <label htmlFor="new-password" className="label">
            Temporary password
          </label>
          <div className="flex gap-2">
            <input
              id="new-password"
              className="input font-mono text-xs"
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              autoComplete="new-password"
            />
            <button
              type="button"
              className="btn-secondary shrink-0"
              onClick={() => setPassword(generatePassword())}
              title="Generate a strong password"
            >
              <RefreshCw className="h-4 w-4" />
            </button>
          </div>
          <p className="hint">The user is prompted to change this on first sign-in.</p>
        </div>

        <fieldset>
          <legend className="label">Storage quota</legend>
          <div className="flex flex-wrap gap-1.5">
            {QUOTA_PRESETS.map((preset) => (
              <button
                key={preset}
                type="button"
                onClick={() => {
                  setQuotaGb(preset);
                  setCustomQuota('');
                }}
                className={
                  !customQuota && quotaGb === preset
                    ? 'rounded-lg bg-brand px-3 py-1.5 text-xs font-semibold text-white'
                    : 'rounded-lg bg-surface px-3 py-1.5 text-xs font-medium text-muted ring-1 ring-inset ring-line hover:text-ink'
                }
              >
                {preset} GB
              </button>
            ))}
            <div className="flex items-center gap-1.5">
              <input
                type="number"
                min={0}
                step={0.5}
                value={customQuota}
                onChange={(event) => setCustomQuota(event.target.value)}
                placeholder="Custom"
                aria-label="Custom quota in GB"
                className="input w-24 py-1.5 text-xs"
              />
              <span className="text-xs text-muted">GB</span>
            </div>
          </div>
          <p className="hint">
            Selected: <span className="font-semibold text-ink">{formatBytes(effectiveQuota * GB)}</span> (
            {effectiveQuota} GB)
          </p>
        </fieldset>

        <div className="grid gap-3 sm:grid-cols-2">
          <div>
            <label htmlFor="new-role" className="label">
              Role
            </label>
            <select
              id="new-role"
              className="input"
              value={roleName}
              onChange={(event) => {
                const value = event.target.value as 'USER' | 'ADMIN' | 'SUPER_ADMIN';
                if (value === 'SUPER_ADMIN') {
                  setIsSuperAdmin(true);
                  setRoleName('ADMIN');
                  return;
                }
                setRoleName(value);
              }}
            >
              <option value="USER">User — own storage only</option>
              <option value="ADMIN">Admin — manage users &amp; files</option>
              <option value="SUPER_ADMIN">Super Admin — full control</option>
            </select>
            {isSuperAdmin ? (
              <p className="hint text-amber-600">
                Super Admin accounts can only be created by another Super Admin from the user detail page.
              </p>
            ) : null}
          </div>
          <div>
            <label htmlFor="new-notes" className="label">
              Internal notes (optional)
            </label>
            <input
              id="new-notes"
              className="input"
              value={notes}
              onChange={(event) => setNotes(event.target.value)}
              placeholder="Client, plan, reference…"
            />
          </div>
        </div>

        <label className="flex cursor-pointer items-start gap-2 text-sm text-ink">
          <input
            type="checkbox"
            checked={sendWelcome}
            onChange={(event) => setSendWelcome(event.target.checked)}
            className="mt-0.5 h-4 w-4 rounded border-line text-brand"
          />
          <span>
            Email the credentials to the user
            <span className="block text-xs text-muted">
              Requires SMTP to be configured in Settings → Email.
            </span>
          </span>
        </label>

        <div className="flex items-center gap-2 rounded-xl bg-canvas px-3.5 py-2.5 text-[11px] text-muted">
          <KeyRound className="h-3.5 w-3.5" />
          Passwords are hashed with scrypt before storage and are never exposed by the API.
        </div>
      </div>
    </Dialog>
  );
}
