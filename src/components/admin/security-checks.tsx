import { AlertTriangle, CheckCircle2, MinusCircle } from 'lucide-react';

type Check = { label: string; description: string; level: 'ok' | 'warn' | 'info' };

export function SecurityChecks({
  checks,
}: {
  checks: {
    httpsConfigured: boolean;
    authSecretStrong: boolean;
    scanningEnabled: boolean;
    rateLimitEnabled: boolean;
    passwordPolicyStrong: boolean;
    emailConfigured: boolean;
    publicFilesDisabled: boolean;
    s3Storage: boolean;
  };
}) {
  const items: Check[] = [
    {
      label: 'HTTPS configured',
      description: checks.httpsConfigured
        ? 'APP_URL uses https:// — cookies are marked Secure in production.'
        : 'Set APP_URL to your https:// domain and terminate TLS at the proxy.',
      level: checks.httpsConfigured ? 'ok' : 'warn',
    },
    {
      label: 'Strong AUTH_SECRET',
      description: checks.authSecretStrong
        ? 'AUTH_SECRET is 32+ characters.'
        : 'AUTH_SECRET should be a random string of at least 32 characters (openssl rand -base64 48).',
      level: checks.authSecretStrong ? 'ok' : 'warn',
    },
    {
      label: 'Upload content scanning',
      description: checks.scanningEnabled
        ? 'Magic-byte validation is enabled for every upload.'
        : 'Enable "Scan uploads" in Settings → System.',
      level: checks.scanningEnabled ? 'ok' : 'warn',
    },
    {
      label: 'Rate limiting',
      description: checks.rateLimitEnabled
        ? `Enabled at ${''}the configured per-IP limit.`
        : 'Set a non-zero API rate limit in Settings → Security.',
      level: checks.rateLimitEnabled ? 'ok' : 'warn',
    },
    {
      label: 'Password policy',
      description: checks.passwordPolicyStrong
        ? 'Minimum length and complexity requirements are enforced.'
        : 'Raise the minimum length to 8+ and require a number.',
      level: checks.passwordPolicyStrong ? 'ok' : 'warn',
    },
    {
      label: 'Token-less public files',
      description: checks.publicFilesDisabled
        ? 'Disabled — every file requires its unguessable token.'
        : 'Public files can be fetched without a token. Fine for a portfolio, stricter for private data.',
      level: checks.publicFilesDisabled ? 'ok' : 'info',
    },
    {
      label: 'Object storage',
      description: checks.s3Storage
        ? 'Using S3-compatible storage — scales beyond a single server.'
        : 'Local storage is fine for one server; switch to S3/R2 for horizontal scaling.',
      level: checks.s3Storage ? 'ok' : 'info',
    },
    {
      label: 'Email delivery',
      description: checks.emailConfigured
        ? 'SMTP is configured, so password resets and invites can be delivered.'
        : 'Configure SMTP to enable password reset emails and user invitations.',
      level: checks.emailConfigured ? 'ok' : 'info',
    },
  ];

  return (
    <div className="card">
      <div className="border-b border-line px-5 py-4">
        <h2 className="text-sm font-semibold text-ink">Configuration checklist</h2>
      </div>
      <ul className="divide-y divide-line">
        {items.map((item) => {
          const Icon = item.level === 'ok' ? CheckCircle2 : item.level === 'warn' ? AlertTriangle : MinusCircle;
          return (
            <li key={item.label} className="flex items-start gap-2.5 px-5 py-2.5">
              <Icon
                className={
                  item.level === 'ok'
                    ? 'mt-0.5 h-4 w-4 shrink-0 text-emerald-500'
                    : item.level === 'warn'
                      ? 'mt-0.5 h-4 w-4 shrink-0 text-amber-500'
                      : 'mt-0.5 h-4 w-4 shrink-0 text-muted'
                }
              />
              <div>
                <p className="text-[13px] font-medium text-ink">{item.label}</p>
                <p className="text-[11px] leading-relaxed text-muted">{item.description}</p>
              </div>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
