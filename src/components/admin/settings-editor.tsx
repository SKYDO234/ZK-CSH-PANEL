'use client';

import { useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import {
  AlertTriangle,
  Bell,
  Database,
  Globe,
  Loader2,
  Lock,
  Mail,
  Save,
  Settings2,
  Share2,
  HardDrive,
} from 'lucide-react';
import type {
  EmailSettings,
  GeneralSettings,
  SecuritySettings,
  SharingSettings,
  StorageSettings,
  SystemSettings,
} from '@/lib/settings';
import { GB, MB, formatBytes } from '@/lib/format';
import { useToast } from '@/components/ui/toast';
import { csrfToken } from '@/lib/upload-client';
import { cn } from '@/lib/cn';
import { ConfirmDialog } from '@/components/ui/dialog';

type AllSettings = {
  general: GeneralSettings;
  storage: StorageSettings;
  security: SecuritySettings;
  sharing: SharingSettings;
  email: EmailSettings;
  system: SystemSettings;
};

type Group = keyof AllSettings;

const GROUPS: Array<{ id: Group; label: string; icon: typeof Globe; description: string }> = [
  { id: 'general', label: 'General', icon: Globe, description: 'Platform behaviour, registration and maintenance' },
  { id: 'storage', label: 'Storage', icon: HardDrive, description: 'Upload limits, quotas and file types' },
  { id: 'security', label: 'Security', icon: Lock, description: 'Passwords, sessions and rate limiting' },
  { id: 'sharing', label: 'Sharing', icon: Share2, description: 'Defaults for share links and downloads' },
  { id: 'email', label: 'Email', icon: Mail, description: 'SMTP delivery and notifications' },
  { id: 'system', label: 'System', icon: Settings2, description: 'Logs, cache, backups and scanning' },
];

function Toggle({
  checked,
  onChange,
  label,
  hint,
}: {
  checked: boolean;
  onChange: (value: boolean) => void;
  label: string;
  hint?: string;
}) {
  return (
    <label className="flex cursor-pointer items-start justify-between gap-4 rounded-xl border border-line p-3.5 transition hover:bg-canvas/60">
      <span className="min-w-0">
        <span className="block text-sm font-medium text-ink">{label}</span>
        {hint ? <span className="mt-0.5 block text-xs leading-relaxed text-muted">{hint}</span> : null}
      </span>
      <span className="relative mt-0.5 shrink-0">
        <input
          type="checkbox"
          className="peer sr-only"
          checked={checked}
          onChange={(event) => onChange(event.target.checked)}
        />
        <span className="block h-6 w-11 rounded-full bg-line transition peer-checked:bg-brand peer-focus-visible:outline peer-focus-visible:outline-2 peer-focus-visible:outline-offset-2 peer-focus-visible:outline-brand" />
        <span className="pointer-events-none absolute left-0.5 top-0.5 h-5 w-5 rounded-full bg-white shadow transition peer-checked:translate-x-5" />
      </span>
    </label>
  );
}

export function SettingsEditor({ initial }: { initial: AllSettings }) {
  const router = useRouter();
  const { success, error } = useToast();
  const [draft, setDraft] = useState<AllSettings>(initial);
  const [group, setGroup] = useState<Group>('general');
  const [busy, setBusy] = useState(false);
  const [maintenanceConfirm, setMaintenanceConfirm] = useState(false);
  const [extensionsText, setExtensionsText] = useState(
    initial.storage.allowedExtensions?.join(', ') ?? '',
  );

  const dirtyGroups = useMemo(
    () => (Object.keys(draft) as Group[]).filter((key) => JSON.stringify(draft[key]) !== JSON.stringify(initial[key])),
    [draft, initial],
  );

  const patchGroup = <G extends Group>(key: G, patch: Partial<AllSettings[G]>) => {
    setDraft((prev) => ({ ...prev, [key]: { ...prev[key], ...patch } }));
  };

  const save = async () => {
    setBusy(true);
    const payload = structuredClone(draft);
    payload.storage.allowedExtensions = extensionsText.trim()
      ? extensionsText
          .split(/[,\s]+/)
          .map((value) => value.trim().replace(/^\./, '').toLowerCase())
          .filter(Boolean)
      : null;

    const res = await fetch('/api/admin/settings', {
      method: 'PATCH',
      headers: { 'content-type': 'application/json', 'x-csrf-token': csrfToken() },
      body: JSON.stringify(payload),
    });
    setBusy(false);
    const json = await res.json().catch(() => null);
    if (res.ok) {
      success('Settings saved', 'Changes apply immediately.');
      router.refresh();
    } else {
      error('Could not save settings', json?.error?.message);
    }
  };

  const runMaintenance = async (action: string) => {
    setBusy(true);
    const res = await fetch('/api/admin/system', {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'x-csrf-token': csrfToken() },
      body: JSON.stringify({ action }),
    });
    setBusy(false);
    const json = await res.json().catch(() => null);
    if (res.ok) success('Done', json.data.message);
    else error('Action failed', json?.error?.message);
  };

  return (
    <div className="grid gap-4 lg:grid-cols-[14rem_1fr]">
      {/* Nav */}
      <nav aria-label="Settings sections" className="card h-fit p-2">
        {GROUPS.map((entry) => {
          const changed = dirtyGroups.includes(entry.id);
          return (
            <button
              key={entry.id}
              type="button"
              onClick={() => setGroup(entry.id)}
              className={cn(
                'flex w-full items-start gap-2.5 rounded-lg px-3 py-2.5 text-left transition',
                group === entry.id ? 'bg-brand/10 text-brand' : 'text-muted hover:bg-canvas hover:text-ink',
              )}
            >
              <entry.icon className="mt-0.5 h-4 w-4 shrink-0" />
              <span className="min-w-0">
                <span className="flex items-center gap-1.5 text-sm font-medium">
                  {entry.label}
                  {changed ? <span className="h-1.5 w-1.5 rounded-full bg-amber-500" /> : null}
                </span>
                <span className="mt-0.5 block text-[11px] leading-snug opacity-80">{entry.description}</span>
              </span>
            </button>
          );
        })}
      </nav>

      <div className="space-y-4">
        <div className="card p-5">
          {group === 'general' ? (
            <div className="space-y-4">
              <div className="grid gap-4 sm:grid-cols-2">
                <div>
                  <label htmlFor="set-locale" className="label">
                    Default language
                  </label>
                  <select
                    id="set-locale"
                    className="input"
                    value={draft.general.locale}
                    onChange={(event) => patchGroup('general', { locale: event.target.value })}
                  >
                    <option value="en">English</option>
                    <option value="es">Español</option>
                    <option value="fr">Français</option>
                    <option value="de">Deutsch</option>
                    <option value="pt">Português</option>
                    <option value="hi">हिन्दी</option>
                    <option value="bn">বাংলা</option>
                  </select>
                  <p className="hint">Interface copy ships in English; this sets date/number formatting.</p>
                </div>
                <div>
                  <label htmlFor="set-timezone" className="label">
                    Timezone
                  </label>
                  <input
                    id="set-timezone"
                    className="input"
                    value={draft.general.timezone}
                    onChange={(event) => patchGroup('general', { timezone: event.target.value })}
                    placeholder="UTC"
                  />
                </div>
              </div>

              <Toggle
                label="Allow public registration"
                hint="When off, only administrators can create accounts (recommended)."
                checked={draft.general.registrationEnabled}
                onChange={(value) => patchGroup('general', { registrationEnabled: value })}
              />
              <Toggle
                label="Require email verification"
                hint="New accounts must confirm their email address before signing in. Needs SMTP."
                checked={draft.general.requireEmailVerification}
                onChange={(value) => patchGroup('general', { requireEmailVerification: value })}
              />
              <Toggle
                label="Maintenance mode"
                hint="Blocks the dashboard for non-admins and shows your maintenance message."
                checked={draft.general.maintenanceMode}
                onChange={(value) => {
                  if (value) setMaintenanceConfirm(true);
                  else patchGroup('general', { maintenanceMode: false });
                }}
              />
              <div>
                <label htmlFor="set-maintenance-msg" className="label">
                  Maintenance message
                </label>
                <input
                  id="set-maintenance-msg"
                  className="input"
                  value={draft.general.maintenanceMessage}
                  onChange={(event) => patchGroup('general', { maintenanceMessage: event.target.value })}
                />
              </div>
            </div>
          ) : null}

          {group === 'storage' ? (
            <div className="space-y-4">
              <div className="grid gap-4 sm:grid-cols-2">
                <div>
                  <label htmlFor="set-max-file" className="label">
                    Maximum file size (MB)
                  </label>
                  <input
                    id="set-max-file"
                    type="number"
                    min={1}
                    max={512000}
                    className="input"
                    value={Math.round(draft.storage.maxFileSizeBytes / MB)}
                    onChange={(event) =>
                      patchGroup('storage', { maxFileSizeBytes: Number(event.target.value) * MB })
                    }
                  />
                  <p className="hint">Currently {formatBytes(draft.storage.maxFileSizeBytes)} per file.</p>
                </div>
                <div>
                  <label htmlFor="set-default-quota" className="label">
                    Default quota for new users (GB)
                  </label>
                  <input
                    id="set-default-quota"
                    type="number"
                    min={0.5}
                    step={0.5}
                    className="input"
                    value={Math.round((draft.storage.defaultQuotaBytes / GB) * 10) / 10}
                    onChange={(event) =>
                      patchGroup('storage', { defaultQuotaBytes: Number(event.target.value) * GB })
                    }
                  />
                </div>
              </div>

              <div>
                <label htmlFor="set-quota-presets" className="label">
                  Quota presets (GB, comma separated)
                </label>
                <input
                  id="set-quota-presets"
                  className="input"
                  value={draft.storage.quotaPresets.map((value) => value / GB).join(', ')}
                  onChange={(event) =>
                    patchGroup('storage', {
                      quotaPresets: event.target.value
                        .split(',')
                        .map((value) => Number(value.trim()))
                        .filter((value) => Number.isFinite(value) && value > 0)
                        .map((value) => value * GB),
                    })
                  }
                />
                <p className="hint">Shown as one-click buttons when creating users or changing quotas.</p>
              </div>

              <div>
                <label htmlFor="set-extensions" className="label">
                  Allowed file extensions
                </label>
                <textarea
                  id="set-extensions"
                  className="input min-h-[5rem] resize-y font-mono text-xs"
                  value={extensionsText}
                  onChange={(event) => setExtensionsText(event.target.value)}
                  placeholder="Leave empty to allow all common types"
                />
                <p className="hint">
                  Comma separated, without dots. Executables (exe, sh, php…) are always blocked regardless
                  of this list, and contents are validated by signature.
                </p>
              </div>

              <div className="grid gap-4 sm:grid-cols-2">
                <div>
                  <label htmlFor="set-driver" className="label">
                    Storage driver
                  </label>
                  <select
                    id="set-driver"
                    className="input"
                    value={draft.storage.storageDriver}
                    onChange={(event) =>
                      patchGroup('storage', { storageDriver: event.target.value as 'local' | 's3' })
                    }
                  >
                    <option value="local">Local filesystem</option>
                    <option value="s3">S3-compatible object storage</option>
                  </select>
                  <p className="hint">
                    The STORAGE_DRIVER environment variable overrides this when set.
                  </p>
                </div>
                <div>
                  <label htmlFor="set-trash" className="label">
                    Trash retention (days)
                  </label>
                  <input
                    id="set-trash"
                    type="number"
                    min={1}
                    max={365}
                    className="input"
                    value={draft.storage.trashRetentionDays}
                    onChange={(event) =>
                      patchGroup('storage', { trashRetentionDays: Number(event.target.value) })
                    }
                  />
                </div>
              </div>

              <Toggle
                label="Generate thumbnails"
                hint="Creates optimised WebP previews for images. Uses more CPU during upload."
                checked={draft.storage.generateThumbnails}
                onChange={(value) => patchGroup('storage', { generateThumbnails: value })}
              />
            </div>
          ) : null}

          {group === 'security' ? (
            <div className="space-y-4">
              <div className="grid gap-4 sm:grid-cols-2">
                <div>
                  <label htmlFor="set-session" className="label">
                    Session timeout (minutes)
                  </label>
                  <input
                    id="set-session"
                    type="number"
                    min={5}
                    max={525600}
                    className="input"
                    value={draft.security.sessionTimeoutMinutes}
                    onChange={(event) =>
                      patchGroup('security', { sessionTimeoutMinutes: Number(event.target.value) })
                    }
                  />
                </div>
                <div>
                  <label htmlFor="set-remember" className="label">
                    “Remember me” duration (days)
                  </label>
                  <input
                    id="set-remember"
                    type="number"
                    min={1}
                    max={365}
                    className="input"
                    value={draft.security.rememberMeDays}
                    onChange={(event) =>
                      patchGroup('security', { rememberMeDays: Number(event.target.value) })
                    }
                  />
                </div>
                <div>
                  <label htmlFor="set-pwlen" className="label">
                    Minimum password length
                  </label>
                  <input
                    id="set-pwlen"
                    type="number"
                    min={6}
                    max={72}
                    className="input"
                    value={draft.security.passwordMinLength}
                    onChange={(event) =>
                      patchGroup('security', { passwordMinLength: Number(event.target.value) })
                    }
                  />
                </div>
                <div>
                  <label htmlFor="set-attempts" className="label">
                    Max failed logins before lockout
                  </label>
                  <input
                    id="set-attempts"
                    type="number"
                    min={3}
                    max={50}
                    className="input"
                    value={draft.security.maxLoginAttempts}
                    onChange={(event) =>
                      patchGroup('security', { maxLoginAttempts: Number(event.target.value) })
                    }
                  />
                </div>
                <div>
                  <label htmlFor="set-lockout" className="label">
                    Lockout duration (minutes)
                  </label>
                  <input
                    id="set-lockout"
                    type="number"
                    min={1}
                    max={1440}
                    className="input"
                    value={draft.security.lockoutMinutes}
                    onChange={(event) =>
                      patchGroup('security', { lockoutMinutes: Number(event.target.value) })
                    }
                  />
                </div>
                <div>
                  <label htmlFor="set-ratelimit" className="label">
                    API rate limit (requests / minute)
                  </label>
                  <input
                    id="set-ratelimit"
                    type="number"
                    min={10}
                    max={100000}
                    className="input"
                    value={draft.security.rateLimitPerMinute}
                    onChange={(event) =>
                      patchGroup('security', { rateLimitPerMinute: Number(event.target.value) })
                    }
                  />
                </div>
                <div>
                  <label htmlFor="set-sessions" className="label">
                    Max concurrent sessions
                  </label>
                  <input
                    id="set-sessions"
                    type="number"
                    min={1}
                    max={100}
                    className="input"
                    value={draft.security.maxConcurrentSessions}
                    onChange={(event) =>
                      patchGroup('security', { maxConcurrentSessions: Number(event.target.value) })
                    }
                  />
                </div>
              </div>

              <div className="space-y-2">
                <Toggle
                  label="Require an uppercase letter"
                  checked={draft.security.passwordRequireUpper}
                  onChange={(value) => patchGroup('security', { passwordRequireUpper: value })}
                />
                <Toggle
                  label="Require a number"
                  checked={draft.security.passwordRequireNumber}
                  onChange={(value) => patchGroup('security', { passwordRequireNumber: value })}
                />
                <Toggle
                  label="Require a symbol"
                  checked={draft.security.passwordRequireSymbol}
                  onChange={(value) => patchGroup('security', { passwordRequireSymbol: value })}
                />
                <Toggle
                  label="Allow API keys"
                  hint="Lets users mint bearer tokens for the REST API."
                  checked={draft.security.allowApiKeys}
                  onChange={(value) => patchGroup('security', { allowApiKeys: value })}
                />
              </div>
            </div>
          ) : null}

          {group === 'sharing' ? (
            <div className="space-y-4">
              <div className="grid gap-4 sm:grid-cols-2">
                <div>
                  <label htmlFor="set-visibility" className="label">
                    Default visibility for new uploads
                  </label>
                  <select
                    id="set-visibility"
                    className="input"
                    value={draft.sharing.defaultVisibility}
                    onChange={(event) =>
                      patchGroup('sharing', {
                        defaultVisibility: event.target.value as 'PRIVATE' | 'LINK' | 'PUBLIC',
                      })
                    }
                  >
                    <option value="PRIVATE">Private — owner only</option>
                    <option value="LINK">Link — anyone with the token</option>
                    <option value="PUBLIC">Public — token-less access</option>
                  </select>
                </div>
                <div>
                  <label htmlFor="set-expiry" className="label">
                    Default link expiry (days, empty = never)
                  </label>
                  <input
                    id="set-expiry"
                    type="number"
                    min={1}
                    max={3650}
                    className="input"
                    value={draft.sharing.defaultLinkExpiryDays ?? ''}
                    onChange={(event) =>
                      patchGroup('sharing', {
                        defaultLinkExpiryDays: event.target.value ? Number(event.target.value) : null,
                      })
                    }
                  />
                </div>
                <div>
                  <label htmlFor="set-max-dl" className="label">
                    Maximum download limit (empty = unlimited)
                  </label>
                  <input
                    id="set-max-dl"
                    type="number"
                    min={1}
                    className="input"
                    value={draft.sharing.maxDownloadLimit ?? ''}
                    onChange={(event) =>
                      patchGroup('sharing', {
                        maxDownloadLimit: event.target.value ? Number(event.target.value) : null,
                      })
                    }
                  />
                </div>
              </div>

              <div className="space-y-2">
                <Toggle
                  label="Auto-create a share link on upload"
                  hint="Every new file immediately gets an unguessable /share/:token URL."
                  checked={draft.sharing.autoCreateShareOnUpload}
                  onChange={(value) => patchGroup('sharing', { autoCreateShareOnUpload: value })}
                />
                <Toggle
                  label="Allow downloads by default"
                  checked={draft.sharing.allowDownloadByDefault}
                  onChange={(value) => patchGroup('sharing', { allowDownloadByDefault: value })}
                />
                <Toggle
                  label="Allow password-protected links"
                  checked={draft.sharing.allowPasswordProtection}
                  onChange={(value) => patchGroup('sharing', { allowPasswordProtection: value })}
                />
                <Toggle
                  label="Allow link expiration"
                  checked={draft.sharing.allowExpiration}
                  onChange={(value) => patchGroup('sharing', { allowExpiration: value })}
                />
                <Toggle
                  label="Allow download limits & view-only mode"
                  checked={draft.sharing.allowDownloadControl}
                  onChange={(value) => patchGroup('sharing', { allowDownloadControl: value })}
                />
                <Toggle
                  label="Allow embedding"
                  hint="Enables /embed/video/:token iframe players and permissive CORS on media."
                  checked={draft.sharing.allowEmbedding}
                  onChange={(value) => patchGroup('sharing', { allowEmbedding: value })}
                />
                <Toggle
                  label="Allow public (token-less) files"
                  checked={draft.sharing.allowPublicGallery}
                  onChange={(value) => patchGroup('sharing', { allowPublicGallery: value })}
                />
              </div>
            </div>
          ) : null}

          {group === 'email' ? (
            <div className="space-y-4">
              <Toggle
                label="Enable email delivery"
                hint="When off, emails are written to the server log instead of being sent."
                checked={draft.email.enabled}
                onChange={(value) => patchGroup('email', { enabled: value })}
              />
              <div className="grid gap-4 sm:grid-cols-2">
                <div>
                  <label htmlFor="set-from-name" className="label">
                    From name
                  </label>
                  <input
                    id="set-from-name"
                    className="input"
                    value={draft.email.fromName}
                    onChange={(event) => patchGroup('email', { fromName: event.target.value })}
                  />
                </div>
                <div>
                  <label htmlFor="set-from-email" className="label">
                    From address
                  </label>
                  <input
                    id="set-from-email"
                    type="email"
                    className="input"
                    value={draft.email.fromEmail}
                    onChange={(event) => patchGroup('email', { fromEmail: event.target.value })}
                  />
                </div>
                <div>
                  <label htmlFor="set-smtp-host" className="label">
                    SMTP host
                  </label>
                  <input
                    id="set-smtp-host"
                    className="input"
                    value={draft.email.smtpHost}
                    onChange={(event) => patchGroup('email', { smtpHost: event.target.value })}
                    placeholder="smtp.postmarkapp.com"
                  />
                </div>
                <div>
                  <label htmlFor="set-smtp-port" className="label">
                    SMTP port
                  </label>
                  <input
                    id="set-smtp-port"
                    type="number"
                    className="input"
                    value={draft.email.smtpPort}
                    onChange={(event) => patchGroup('email', { smtpPort: Number(event.target.value) })}
                  />
                </div>
                <div>
                  <label htmlFor="set-smtp-user" className="label">
                    SMTP username
                  </label>
                  <input
                    id="set-smtp-user"
                    className="input"
                    autoComplete="off"
                    value={draft.email.smtpUser}
                    onChange={(event) => patchGroup('email', { smtpUser: event.target.value })}
                  />
                </div>
                <div>
                  <label htmlFor="set-smtp-pass" className="label">
                    SMTP password
                  </label>
                  <input
                    id="set-smtp-pass"
                    type="password"
                    className="input"
                    autoComplete="new-password"
                    value={draft.email.smtpPassword}
                    onChange={(event) => patchGroup('email', { smtpPassword: event.target.value })}
                    placeholder="••••••••"
                  />
                  <p className="hint">Prefer SMTP_* environment variables for production.</p>
                </div>
              </div>
              <Toggle
                label="Use TLS (SMTPS)"
                checked={draft.email.smtpSecure}
                onChange={(value) => patchGroup('email', { smtpSecure: value })}
              />
              <div className="space-y-2">
                <Toggle
                  label="Send a welcome email to new users"
                  checked={draft.email.welcomeEmailEnabled}
                  onChange={(value) => patchGroup('email', { welcomeEmailEnabled: value })}
                />
                <Toggle
                  label="Notify users when they near their quota"
                  checked={draft.email.notifyOnQuotaWarning}
                  onChange={(value) => patchGroup('email', { notifyOnQuotaWarning: value })}
                />
              </div>
              <div>
                <label htmlFor="set-quota-warning" className="label">
                  Quota warning threshold (%)
                </label>
                <input
                  id="set-quota-warning"
                  type="number"
                  min={50}
                  max={100}
                  className="input max-w-[10rem]"
                  value={draft.email.quotaWarningPercent}
                  onChange={(event) =>
                    patchGroup('email', { quotaWarningPercent: Number(event.target.value) })
                  }
                />
              </div>
            </div>
          ) : null}

          {group === 'system' ? (
            <div className="space-y-4">
              <div className="grid gap-4 sm:grid-cols-3">
                <div>
                  <label htmlFor="set-cache" className="label">
                    Settings cache (seconds)
                  </label>
                  <input
                    id="set-cache"
                    type="number"
                    min={0}
                    max={3600}
                    className="input"
                    value={draft.system.cacheTtlSeconds}
                    onChange={(event) =>
                      patchGroup('system', { cacheTtlSeconds: Number(event.target.value) })
                    }
                  />
                </div>
                <div>
                  <label htmlFor="set-logret" className="label">
                    Log retention (days)
                  </label>
                  <input
                    id="set-logret"
                    type="number"
                    min={1}
                    max={3650}
                    className="input"
                    value={draft.system.logRetentionDays}
                    onChange={(event) =>
                      patchGroup('system', { logRetentionDays: Number(event.target.value) })
                    }
                  />
                </div>
                <div>
                  <label htmlFor="set-scan" className="label">
                    Malware scanning mode
                  </label>
                  <select
                    id="set-scan"
                    className="input"
                    value={draft.system.malwareScanMode}
                    onChange={(event) =>
                      patchGroup('system', {
                        malwareScanMode: event.target.value as SystemSettings['malwareScanMode'],
                      })
                    }
                  >
                    <option value="mime">MIME + signature validation (built-in)</option>
                    <option value="extension">Extension allow/block list only</option>
                    <option value="external">External scanner (webhook)</option>
                    <option value="off">Off (not recommended)</option>
                  </select>
                </div>
              </div>

              <Toggle
                label="Scan uploads"
                hint="Validates the real content type by magic bytes. Strongly recommended."
                checked={draft.system.scanUploads}
                onChange={(value) => patchGroup('system', { scanUploads: value })}
              />

              <div>
                <label htmlFor="set-scan-url" className="label">
                  External scanner endpoint (optional)
                </label>
                <input
                  id="set-scan-url"
                  className="input"
                  value={draft.system.externalScanUrl ?? ''}
                  onChange={(event) =>
                    patchGroup('system', { externalScanUrl: event.target.value || null })
                  }
                  placeholder="https://scanner.internal/scan"
                />
                <p className="hint">
                  A POST with the file stream is sent before the object is committed. Return 2xx to accept.
                </p>
              </div>

              <div className="grid gap-4 sm:grid-cols-2">
                <div>
                  <label htmlFor="set-backup" className="label">
                    Backup frequency
                  </label>
                  <select
                    id="set-backup"
                    className="input"
                    value={draft.system.backupFrequency}
                    onChange={(event) =>
                      patchGroup('system', {
                        backupFrequency: event.target.value as SystemSettings['backupFrequency'],
                      })
                    }
                  >
                    <option value="manual">Manual (pg_dump)</option>
                    <option value="daily">Daily</option>
                    <option value="weekly">Weekly</option>
                  </select>
                  <p className="hint">Runs via cron — see the deployment guide for the command.</p>
                </div>
                <div className="flex items-end">
                  <Toggle
                    label="Enable scheduled backups"
                    checked={draft.system.backupEnabled}
                    onChange={(value) => patchGroup('system', { backupEnabled: value })}
                  />
                </div>
              </div>

              <div className="rounded-xl border border-line p-3.5">
                <p className="text-sm font-medium text-ink">Maintenance tools</p>
                <p className="mt-0.5 text-xs text-muted">Run these safely at any time.</p>
                <div className="mt-3 flex flex-wrap gap-2">
                  <button type="button" className="btn-secondary btn-sm" onClick={() => void runMaintenance('clear-cache')} disabled={busy}>
                    Clear settings cache
                  </button>
                  <button type="button" className="btn-secondary btn-sm" onClick={() => void runMaintenance('cleanup-sessions')} disabled={busy}>
                    Purge expired sessions
                  </button>
                  <button type="button" className="btn-secondary btn-sm" onClick={() => void runMaintenance('cleanup-logs')} disabled={busy}>
                    Trim old activity logs
                  </button>
                  <button type="button" className="btn-secondary btn-sm" onClick={() => void runMaintenance('test-storage')} disabled={busy}>
                    Test storage driver
                  </button>
                </div>
              </div>

              <div className="flex items-start gap-2 rounded-xl bg-amber-500/10 p-3.5 text-xs text-amber-700 ring-1 ring-inset ring-amber-500/20 dark:text-amber-400">
                <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
                <p>
                  Back up the Postgres database and your object storage bucket together — files in the
                  database reference storage keys, so a partial restore breaks links.
                </p>
              </div>
            </div>
          ) : null}
        </div>

        <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-line bg-surface px-4 py-3">
          <p className="flex items-center gap-2 text-xs text-muted">
            <Database className="h-3.5 w-3.5" />
            {dirtyGroups.length === 0
              ? 'All settings saved'
              : `${dirtyGroups.length} section${dirtyGroups.length === 1 ? '' : 's'} changed: ${dirtyGroups.join(', ')}`}
          </p>
          <div className="flex items-center gap-2">
            <button type="button" className="btn-secondary btn-sm" onClick={() => setDraft(initial)} disabled={dirtyGroups.length === 0}>
              Discard
            </button>
            <button type="button" className="btn-primary btn-sm" onClick={() => void save()} disabled={busy || dirtyGroups.length === 0}>
              {busy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Save className="h-3.5 w-3.5" />}
              Save settings
            </button>
          </div>
        </div>
      </div>

      <ConfirmDialog
        open={maintenanceConfirm}
        onClose={() => setMaintenanceConfirm(false)}
        onConfirm={() => {
          patchGroup('general', { maintenanceMode: true });
          setMaintenanceConfirm(false);
        }}
        title="Enable maintenance mode?"
        description="Regular users will be locked out of their dashboards until you turn it off. Public share links keep working."
        confirmLabel="Enable maintenance"
      />
    </div>
  );
}
