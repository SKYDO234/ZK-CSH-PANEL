'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Loader2, Lock } from 'lucide-react';
import type { PublicBranding } from '@/lib/settings';

export function PasswordGate({
  token,
  fileName,
  branding,
}: {
  token: string;
  fileName: string;
  branding: PublicBranding;
}) {
  const router = useRouter();
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    setBusy(true);
    setError(null);
    const csrf = document.cookie.match(/(?:^|;\s*)vaultly_csrf=([^;]+)/)?.[1] ?? '';
    const res = await fetch(`/api/share/${token}`, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'x-csrf-token': decodeURIComponent(csrf),
      },
      body: JSON.stringify({ password }),
    });
    setBusy(false);
    if (res.ok) {
      router.refresh();
    } else {
      const json = await res.json().catch(() => null);
      setError(json?.error?.message ?? 'Incorrect password.');
    }
  };

  return (
    <div className="card mx-auto max-w-md p-8">
      <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-2xl bg-brand/10 text-brand">
        <Lock className="h-6 w-6" />
      </div>
      <h1 className="mt-4 text-center text-lg font-semibold text-ink">This link is protected</h1>
      <p className="mt-1.5 text-center text-sm text-muted">
        Enter the password to view <span className="font-medium text-ink">{fileName}</span>.
      </p>
      <form onSubmit={submit} className="mt-6 space-y-3">
        {error ? (
          <div
            role="alert"
            className="rounded-xl bg-red-500/10 px-3.5 py-2.5 text-sm text-red-700 ring-1 ring-inset ring-red-500/20 dark:text-red-400"
          >
            {error}
          </div>
        ) : null}
        <label htmlFor="share-password" className="sr-only">
          Password
        </label>
        <input
          id="share-password"
          type="password"
          autoFocus
          value={password}
          onChange={(event) => setPassword(event.target.value)}
          className="input"
          placeholder="Password"
          autoComplete="off"
          required
        />
        <button type="submit" className="btn-primary w-full" disabled={busy || !password}>
          {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
          Unlock file
        </button>
      </form>
      <p className="mt-4 text-center text-[11px] text-muted">
        Protected content on {branding.platformName}
      </p>
    </div>
  );
}
