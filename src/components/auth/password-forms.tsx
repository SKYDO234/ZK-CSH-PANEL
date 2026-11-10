'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { CheckCircle2, Loader2, Mail, UserPlus, Lock } from 'lucide-react';

function csrf() {
  const match = document.cookie.match(/(?:^|;\s*)vaultly_csrf=([^;]+)/);
  return match ? decodeURIComponent(match[1]) : '';
}

export function RegisterForm() {
  const router = useRouter();
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [pending, setPending] = useState(false);

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    setBusy(true);
    setError(null);
    const res = await fetch('/api/auth/register', {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'x-csrf-token': csrf() },
      body: JSON.stringify({ name, email, password }),
    });
    const json = await res.json().catch(() => null);
    setBusy(false);
    if (!res.ok) {
      setError(json?.error?.message ?? 'Could not create your account.');
      return;
    }
    if (json.data?.requiresVerification) {
      setPending(true);
      return;
    }
    router.push('/dashboard');
    router.refresh();
  };

  if (pending) {
    return (
      <div className="card max-w-md p-8 text-center">
        <CheckCircle2 className="mx-auto h-10 w-10 text-emerald-500" />
        <h1 className="mt-4 text-lg font-semibold text-ink">Check your inbox</h1>
        <p className="mt-2 text-sm text-muted">
          We sent a verification link to <strong className="text-ink">{email}</strong>. Confirm your
          address, then sign in.
        </p>
        <Link href="/login" className="btn-primary btn-sm mt-5">
          Go to sign in
        </Link>
      </div>
    );
  }

  return (
    <div className="card w-full max-w-md p-7">
      <h1 className="text-xl font-semibold tracking-tight text-ink">Create your account</h1>
      <p className="mt-1 text-sm text-muted">You’ll get your own private storage box.</p>
      <form onSubmit={submit} className="mt-5 space-y-4">
        {error ? (
          <div role="alert" className="rounded-xl bg-red-500/10 px-3.5 py-2.5 text-sm text-red-700 ring-1 ring-inset ring-red-500/20 dark:text-red-400">
            {error}
          </div>
        ) : null}
        <div>
          <label htmlFor="reg-name" className="label">
            Full name
          </label>
          <input id="reg-name" className="input" value={name} onChange={(e) => setName(e.target.value)} required />
        </div>
        <div>
          <label htmlFor="reg-email" className="label">
            Email address
          </label>
          <input
            id="reg-email"
            type="email"
            className="input"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            autoComplete="email"
            required
          />
        </div>
        <div>
          <label htmlFor="reg-password" className="label">
            Password
          </label>
          <input
            id="reg-password"
            type="password"
            className="input"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            autoComplete="new-password"
            required
          />
        </div>
        <button type="submit" className="btn-primary w-full" disabled={busy}>
          {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <UserPlus className="h-4 w-4" />}
          Create account
        </button>
      </form>
      <p className="mt-4 text-center text-sm text-muted">
        Already have an account?{' '}
        <Link href="/login" className="font-medium text-brand hover:underline">
          Sign in
        </Link>
      </p>
    </div>
  );
}

export function ForgotPasswordForm() {
  const [email, setEmail] = useState('');
  const [sent, setSent] = useState(false);
  const [busy, setBusy] = useState(false);

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    setBusy(true);
    await fetch('/api/auth/forgot-password', {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'x-csrf-token': csrf() },
      body: JSON.stringify({ email }),
    });
    setBusy(false);
    setSent(true);
  };

  return (
    <div className="card w-full max-w-md p-7">
      <h1 className="text-xl font-semibold tracking-tight text-ink">Reset your password</h1>
      <p className="mt-1 text-sm text-muted">
        Enter your email and we’ll send a link to choose a new password.
      </p>
      {sent ? (
        <div className="mt-5 rounded-xl bg-emerald-500/10 px-3.5 py-3 text-sm text-emerald-700 ring-1 ring-inset ring-emerald-500/20 dark:text-emerald-400">
          If an account exists for that address, a reset link is on its way.
        </div>
      ) : (
        <form onSubmit={submit} className="mt-5 space-y-4">
          <div>
            <label htmlFor="forgot-email" className="label">
              Email address
            </label>
            <div className="relative">
              <Mail className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted" />
              <input
                id="forgot-email"
                type="email"
                className="input pl-9"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
              />
            </div>
          </div>
          <button type="submit" className="btn-primary w-full" disabled={busy}>
            {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : null} Send reset link
          </button>
        </form>
      )}
      <Link href="/login" className="mt-4 block text-center text-sm font-medium text-brand hover:underline">
        Back to sign in
      </Link>
    </div>
  );
}

export function ResetPasswordForm({ token }: { token: string }) {
  const router = useRouter();
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState(false);

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    if (password !== confirm) {
      setError('Passwords do not match.');
      return;
    }
    setBusy(true);
    setError(null);
    const res = await fetch('/api/auth/reset-password', {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'x-csrf-token': csrf() },
      body: JSON.stringify({ token, password }),
    });
    const json = await res.json().catch(() => null);
    setBusy(false);
    if (!res.ok) {
      setError(json?.error?.message ?? 'Could not reset your password.');
      return;
    }
    setDone(true);
    setTimeout(() => router.push('/login?reset=1'), 1200);
  };

  if (!token) {
    return (
      <div className="card max-w-md p-8 text-center">
        <h1 className="text-lg font-semibold text-ink">Invalid reset link</h1>
        <p className="mt-2 text-sm text-muted">Request a new password reset email to continue.</p>
        <Link href="/forgot-password" className="btn-primary btn-sm mt-5">
          Request a new link
        </Link>
      </div>
    );
  }

  return (
    <div className="card w-full max-w-md p-7">
      <h1 className="text-xl font-semibold tracking-tight text-ink">Choose a new password</h1>
      {done ? (
        <div className="mt-5 rounded-xl bg-emerald-500/10 px-3.5 py-3 text-sm text-emerald-700 ring-1 ring-inset ring-emerald-500/20 dark:text-emerald-400">
          Password updated. Redirecting to sign in…
        </div>
      ) : (
        <form onSubmit={submit} className="mt-5 space-y-4">
          {error ? (
            <div role="alert" className="rounded-xl bg-red-500/10 px-3.5 py-2.5 text-sm text-red-700 ring-1 ring-inset ring-red-500/20 dark:text-red-400">
              {error}
            </div>
          ) : null}
          <div>
            <label htmlFor="reset-pw" className="label">
              New password
            </label>
            <div className="relative">
              <Lock className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted" />
              <input
                id="reset-pw"
                type="password"
                className="input pl-9"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                autoComplete="new-password"
                required
              />
            </div>
          </div>
          <div>
            <label htmlFor="reset-confirm" className="label">
              Confirm password
            </label>
            <input
              id="reset-confirm"
              type="password"
              className="input"
              value={confirm}
              onChange={(e) => setConfirm(e.target.value)}
              autoComplete="new-password"
              required
            />
          </div>
          <button type="submit" className="btn-primary w-full" disabled={busy}>
            {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : null} Update password
          </button>
        </form>
      )}
    </div>
  );
}
