import type { Metadata } from 'next';
import { and, count, desc, eq, gte, isNotNull, sql } from 'drizzle-orm';
import { requireAdmin } from '@/lib/session';
import { getSettings } from '@/lib/settings';
import { db, activityLogs, loginAttempts, sessions, users } from '@/db';
import { Topbar } from '@/components/layout/topbar';
import { formatDateTime, formatNumber, timeAgo } from '@/lib/format';
import {
  AlertTriangle,
  CheckCircle2,
  KeyRound,
  Lock,
  ShieldAlert,
  ShieldCheck,
  UserX,
} from 'lucide-react';
import { StatCard } from '@/components/ui/misc';
import { SecurityChecks } from '@/components/admin/security-checks';

export const metadata: Metadata = { title: 'Security' };
export const dynamic = 'force-dynamic';

export default async function SecurityPage() {
  const session = await requireAdmin('/admin/security');
  const settings = await getSettings({ fresh: true });
  const dayAgo = new Date(Date.now() - 86400_000);

  const [failedLogins, lockedAccounts, activeSessions, suspicious, recentFailed] = await Promise.all([
    db
      .select({ value: count() })
      .from(loginAttempts)
      .where(and(eq(loginAttempts.success, false), gte(loginAttempts.createdAt, dayAgo))),
    db
      .select({ value: count() })
      .from(users)
      .where(and(isNotNull(users.lockedUntil), gte(users.lockedUntil, new Date()))),
    db
      .select({ value: count() })
      .from(sessions)
      .where(and(sql`${sessions.revokedAt} IS NULL`, gte(sessions.expiresAt, new Date()))),
    db
      .select({ ip: loginAttempts.ip, value: count() })
      .from(loginAttempts)
      .where(and(eq(loginAttempts.success, false), gte(loginAttempts.createdAt, dayAgo)))
      .groupBy(loginAttempts.ip)
      .having(sql`count(*) >= 5`)
      .orderBy(desc(count()))
      .limit(5),
    db
      .select({
        id: activityLogs.id,
        message: activityLogs.message,
        ip: activityLogs.ip,
        createdAt: activityLogs.createdAt,
      })
      .from(activityLogs)
      .where(and(eq(activityLogs.action, 'LOGIN_FAILED'), gte(activityLogs.createdAt, new Date(Date.now() - 7 * 86400_000))))
      .orderBy(desc(activityLogs.createdAt))
      .limit(10),
  ]);

  const checks = {
    httpsConfigured: (process.env.APP_URL ?? '').startsWith('https://'),
    authSecretStrong: (process.env.AUTH_SECRET ?? '').length >= 32,
    scanningEnabled: settings.system.scanUploads,
    rateLimitEnabled: settings.security.rateLimitPerMinute > 0,
    passwordPolicyStrong: settings.security.passwordMinLength >= 8 && settings.security.passwordRequireNumber,
    emailConfigured: settings.email.enabled && settings.email.provider === 'smtp',
    publicFilesDisabled: !settings.sharing.allowPublicGallery,
    s3Storage: (process.env.STORAGE_DRIVER ?? settings.storage.storageDriver) === 's3',
  };

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
        <div className="mb-5">
          <h1 className="text-2xl font-semibold tracking-tight text-ink">Security</h1>
          <p className="mt-1 text-sm text-muted">
            Sign-in protection status, configuration checks and recent threats.
          </p>
        </div>

        <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
          <StatCard
            label="Failed logins (24h)"
            value={formatNumber(Number(failedLogins[0]?.value ?? 0))}
            icon={<ShieldAlert className="h-4 w-4" />}
            tone={Number(failedLogins[0]?.value ?? 0) > 20 ? 'rose' : 'green'}
          />
          <StatCard
            label="Locked accounts"
            value={formatNumber(Number(lockedAccounts[0]?.value ?? 0))}
            icon={<Lock className="h-4 w-4" />}
            tone="amber"
          />
          <StatCard
            label="Active sessions"
            value={formatNumber(Number(activeSessions[0]?.value ?? 0))}
            icon={<ShieldCheck className="h-4 w-4" />}
            tone="sky"
          />
          <StatCard
            label="Rate limit"
            value={`${settings.security.rateLimitPerMinute}/min`}
            icon={<KeyRound className="h-4 w-4" />}
          />
        </div>

        <div className="mt-4 grid gap-4 lg:grid-cols-2">
          <SecurityChecks checks={checks} />

          <div className="card">
            <div className="border-b border-line px-5 py-4">
              <h2 className="text-sm font-semibold text-ink">Suspicious IPs (24h)</h2>
            </div>
            {suspicious.length === 0 ? (
              <p className="px-5 py-10 text-center text-xs text-muted">
                No IP has produced 5+ failed attempts in the last 24 hours.
              </p>
            ) : (
              <ul className="divide-y divide-line">
                {suspicious.map((row) => (
                  <li key={row.ip ?? 'unknown'} className="flex items-center justify-between px-5 py-2.5">
                    <span className="font-mono text-xs text-ink">{row.ip ?? 'unknown'}</span>
                    <span className="badge-red">
                      <AlertTriangle className="h-3 w-3" /> {String(row.value)} attempts
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>

        <div className="card mt-4">
          <div className="border-b border-line px-5 py-4">
            <h2 className="flex items-center gap-2 text-sm font-semibold text-ink">
              <UserX className="h-4 w-4 text-red-500" /> Recent failed sign-ins (7 days)
            </h2>
          </div>
          {recentFailed.length === 0 ? (
            <p className="px-5 py-10 text-center text-xs text-muted">No failed sign-in attempts.</p>
          ) : (
            <ul className="divide-y divide-line">
              {recentFailed.map((entry) => (
                <li key={entry.id} className="flex flex-wrap items-center justify-between gap-2 px-5 py-2.5">
                  <span className="text-[13px] text-ink">{entry.message}</span>
                  <span className="text-[11px] text-muted">
                    {entry.ip ?? 'unknown IP'} · {timeAgo(entry.createdAt)} ·{' '}
                    <span title={formatDateTime(entry.createdAt)}>{formatDateTime(entry.createdAt)}</span>
                  </span>
                </li>
              ))}
            </ul>
          )}
        </div>

        <div className="mt-4 flex items-start gap-2 rounded-xl bg-brand/[0.04] p-4 text-xs text-muted ring-1 ring-inset ring-brand/15">
          <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-brand" />
          <div>
            <p className="font-semibold text-ink">Built-in protections always on</p>
            <ul className="mt-1.5 space-y-1">
              <li>· scrypt password hashing with per-user salts and timing-safe comparison</li>
              <li>· HTTP-only, SameSite=Lax session cookies; only token hashes are stored</li>
              <li>· CSRF double-submit tokens on every state-changing request</li>
              <li>· Parameterised SQL everywhere (no string-concatenated queries)</li>
              <li>· Content sniffing on upload with executable extensions hard-blocked</li>
              <li>· Media served with <code>nosniff</code> + sandbox CSP so uploads never execute</li>
            </ul>
          </div>
        </div>
      </div>
    </>
  );
}
