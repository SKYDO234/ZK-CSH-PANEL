'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { Eye, EyeOff, KeyRound, Loader2, Lock, Mail, ShieldCheck } from 'lucide-react';
import type { PublicBranding } from '@/lib/settings';
import { Logo } from '@/components/branding/logo';

export function LoginForm({
  branding,
  next,
  passwordReset,
}: {
  branding: PublicBranding;
  next?: string;
  passwordReset?: boolean;
}) {
  const router = useRouter();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [rememberMe, setRememberMe] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const csrf = document.cookie.match(/vaultly_csrf=([^;]+)/)?.[1] ?? '';
      const res = await fetch('/api/auth/login', {
        method: 'POST',
        headers: { 'content-type': 'application/json', 'x-csrf-token': decodeURIComponent(csrf) },
        body: JSON.stringify({ email, password, rememberMe }),
      });
      const json = await res.json();
      if (!res.ok) {
        setError(json?.error?.message ?? 'Unable to sign in.');
        setBusy(false);
        return;
      }
      const target = json.data?.redirectTo ?? next ?? '/dashboard';
      router.push(target);
      router.refresh();
    } catch {
      setError('Network error. Please try again.');
      setBusy(false);
    }
  };

  return (
    <div className="w-full max-w-md">
      <div className="card overflow-hidden animate-slide-up">
        <div className="border-b border-line bg-gradient-to-br from-brand/[0.07] to-secondary/[0.05] px-7 pb-7 pt-8">
          <div className="mb-5 lg:hidden">
            <Logo name={branding.platformName} logoUrl={branding.logoUrl} markUrl={branding.markUrl} />
          </div>
          <h1 className="text-2xl font-semibold tracking-tight text-ink">{branding.loginTitle}</h1>
          <p className="mt-1.5 text-sm text-muted">{branding.loginSubtitle}</p>
        </div>

        <form onSubmit={submit} className="space-y-4 px-7 py-6" noValidate>
          {passwordReset ? (
            <div className="flex items-start gap-2 rounded-xl bg-emerald-500/10 p-3 text-xs text-emerald-700 ring-1 ring-inset ring-emerald-500/20 dark:text-emerald-400">
              <ShieldCheck className="mt-0.5 h-4 w-4 shrink-0" />
              <p>Your password has been updated. Sign in with your new password.</p>
            </div>
          ) : null}

          {error ? (
            <div
              role="alert"
              className="rounded-xl bg-red-500/10 px-3.5 py-2.5 text-sm text-red-700 ring-1 ring-inset ring-red-500/20 dark:text-red-400"
            >
              {error}
            </div>
          ) : null}

          <div>
            <label htmlFor="email" className="label">
              Email address
            </label>
            <div className="relative">
              <Mail className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted" />
              <input
                id="email"
                name="email"
                type="email"
                autoComplete="email"
                required
                value={email}
                onChange={(event) => setEmail(event.target.value)}
                className="input pl-9"
                placeholder="you@example.com"
              />
            </div>
          </div>

          <div>
            <div className="mb-1.5 flex items-center justify-between">
              <label htmlFor="password" className="label mb-0">
                Password
              </label>
              <Link href="/forgot-password" className="text-xs font-medium text-brand hover:underline">
                Forgot password?
              </Link>
            </div>
            <div className="relative">
              <Lock className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted" />
              <input
                id="password"
                name="password"
                type={showPassword ? 'text' : 'password'}
                autoComplete="current-password"
                required
                value={password}
                onChange={(event) => setPassword(event.target.value)}
                className="input pl-9 pr-10"
                placeholder="••••••••"
              />
              <button
                type="button"
                onClick={() => setShowPassword((v) => !v)}
                aria-label={showPassword ? 'Hide password' : 'Show password'}
                className="absolute right-2 top-1/2 -translate-y-1/2 rounded-md p-1.5 text-muted transition hover:text-ink"
              >
                {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
              </button>
            </div>
          </div>

          <label className="flex cursor-pointer items-center gap-2 text-sm text-muted">
            <input
              type="checkbox"
              checked={rememberMe}
              onChange={(event) => setRememberMe(event.target.checked)}
              className="h-4 w-4 rounded border-line text-brand focus:ring-brand"
            />
            Keep me signed in
          </label>

          <button type="submit" className="btn-primary w-full" disabled={busy}>
            {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <KeyRound className="h-4 w-4" />}
            {busy ? 'Signing in…' : 'Sign in'}
          </button>

          {branding.registrationEnabled ? (
            <p className="text-center text-sm text-muted">
              No account yet?{' '}
              <Link href="/register" className="font-medium text-brand hover:underline">
                Create one
              </Link>
            </p>
          ) : null}
        </form>
      </div>

      <p className="mt-6 text-center text-xs text-muted">
        {branding.welcomeMessage}
        {branding.supportEmail ? (
          <>
            {' '}
            Need help?{' '}
            <a href={`mailto:${branding.supportEmail}`} className="font-medium text-brand hover:underline">
              {branding.supportEmail}
            </a>
          </>
        ) : null}
      </p>
    </div>
  );
}
