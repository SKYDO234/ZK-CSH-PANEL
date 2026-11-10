'use client';

import { useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Check, Code2, Copy, Globe, Link2, Loader2, Lock, RefreshCw, ShieldOff } from 'lucide-react';
import { Dialog } from '@/components/ui/dialog';
import { useCopy, useToast } from '@/components/ui/toast';
import { csrfToken } from '@/lib/upload-client';
import type { FileDTO } from '@/lib/serialize';
import { cn } from '@/lib/cn';

type ShareSettings = {
  visibility: 'PRIVATE' | 'LINK' | 'PUBLIC';
  password: string;
  expiresInDays: string;
  maxDownloads: string;
  allowDownload: boolean;
  viewOnly: boolean;
  embeddable: boolean;
};

const EXPIRY_OPTIONS = [
  { value: '', label: 'Never expires' },
  { value: '1', label: '1 day' },
  { value: '7', label: '7 days' },
  { value: '30', label: '30 days' },
  { value: '90', label: '90 days' },
  { value: '365', label: '1 year' },
];

export function ShareDialog({
  file,
  open,
  onClose,
  onChanged,
}: {
  file: FileDTO;
  open: boolean;
  onClose: () => void;
  onChanged?: () => void;
}) {
  const router = useRouter();
  const copy = useCopy();
  const { success, error } = useToast();
  const [busy, setBusy] = useState(false);
  const [settings, setSettings] = useState<ShareSettings>({
    visibility: file.visibility === 'PRIVATE' ? 'LINK' : file.visibility,
    password: '',
    expiresInDays: '',
    maxDownloads: file.shareMaxDownloads ? String(file.shareMaxDownloads) : '',
    allowDownload: file.shareAllowDownload,
    viewOnly: file.shareViewOnly,
    embeddable: true,
  });
  const [token, setToken] = useState<string | null>(file.shareToken);
  const [hasPassword, setHasPassword] = useState(file.shareHasPassword);
  const [tab, setTab] = useState<'link' | 'embed'>('link');

  useEffect(() => {
    setToken(file.shareToken);
    setHasPassword(file.shareHasPassword);
    setSettings({
      visibility: file.visibility === 'PRIVATE' ? 'LINK' : file.visibility,
      password: '',
      expiresInDays: '',
      maxDownloads: file.shareMaxDownloads ? String(file.shareMaxDownloads) : '',
      allowDownload: file.shareAllowDownload,
      viewOnly: file.shareViewOnly,
      embeddable: true,
    });
  }, [file]);

  const origin = typeof window !== 'undefined' ? window.location.origin : '';
  const shareUrl = token ? `${origin}/share/${token}` : '';
  const directUrl = token ? `${origin}/media/${token}/${encodeURIComponent(file.name)}` : '';
  const embedUrl = token ? `${origin}/embed/video/${token}` : '';

  const embedCode = useMemo(() => {
    if (!token) return '';
    if (file.category === 'image') {
      return `<img src="${directUrl}" alt="${file.name}" loading="lazy" />`;
    }
    if (file.category === 'video') {
      return `<video controls preload="metadata" poster="${origin}/api/files/${file.id}/thumbnail">\n  <source src="${directUrl}" type="${file.mimeType}">\n  Your browser does not support video.\n</video>`;
    }
    if (file.category === 'audio') {
      return `<audio controls preload="metadata">\n  <source src="${directUrl}" type="${file.mimeType}">\n</audio>`;
    }
    return `<iframe src="${origin}/embed/video/${token}" width="640" height="360" frameborder="0" allowfullscreen></iframe>`;
  }, [token, file, directUrl, origin]);

  const save = async () => {
    setBusy(true);
    const payload: Record<string, unknown> = {
      visibility: settings.visibility,
      allowDownload: settings.allowDownload,
      viewOnly: settings.viewOnly,
      embeddable: settings.embeddable,
      maxDownloads: settings.maxDownloads ? Number(settings.maxDownloads) : null,
      expiresInDays: settings.expiresInDays ? Number(settings.expiresInDays) : null,
    };
    if (settings.password) payload.password = settings.password;
    else if (hasPassword) payload.password = null;

    const res = await fetch(`/api/files/${file.id}/share`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'x-csrf-token': csrfToken() },
      body: JSON.stringify(payload),
    });
    setBusy(false);
    const json = await res.json().catch(() => null);
    if (res.ok) {
      setToken(json.data.share.token);
      setHasPassword(Boolean(json.data.share.hasPassword));
      setSettings((prev) => ({ ...prev, password: '' }));
      success('Share settings saved');
      onChanged?.();
      router.refresh();
    } else {
      error('Could not update sharing', json?.error?.message);
    }
  };

  const regenerate = async () => {
    setBusy(true);
    const res = await fetch(`/api/files/${file.id}/share?regenerate=1`, {
      method: 'DELETE',
      headers: { 'x-csrf-token': csrfToken() },
    });
    setBusy(false);
    const json = await res.json().catch(() => null);
    if (res.ok) {
      setToken(json.data.share.token);
      success('New link generated', 'The previous link no longer works.');
      onChanged?.();
      router.refresh();
    } else {
      error('Could not regenerate link');
    }
  };

  const revoke = async () => {
    setBusy(true);
    const res = await fetch(`/api/files/${file.id}/share`, {
      method: 'DELETE',
      headers: { 'x-csrf-token': csrfToken() },
    });
    setBusy(false);
    if (res.ok) {
      setToken(null);
      success('Sharing disabled');
      onChanged?.();
      router.refresh();
    } else {
      error('Could not disable sharing');
    }
  };

  const visibilityOptions = [
    {
      value: 'PRIVATE' as const,
      icon: Lock,
      title: 'Private',
      description: 'Only you can access this file.',
    },
    {
      value: 'LINK' as const,
      icon: Link2,
      title: 'Anyone with the link',
      description: 'The share link and direct URL work for anyone who has them.',
    },
    {
      value: 'PUBLIC' as const,
      icon: Globe,
      title: 'Public',
      description: 'Accessible without a link token and may appear in the public gallery.',
    },
  ];

  return (
    <Dialog
      open={open}
      onClose={onClose}
      title="Share & embed"
      description={file.name}
      size="lg"
      footer={
        <>
          {token ? (
            <button type="button" className="btn-ghost mr-auto text-xs" onClick={() => void revoke()} disabled={busy}>
              <ShieldOff className="h-3.5 w-3.5" /> Disable sharing
            </button>
          ) : null}
          <button className="btn-secondary" onClick={onClose}>
            Close
          </button>
          <button className="btn-primary" onClick={() => void save()} disabled={busy}>
            {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Check className="h-4 w-4" />}
            Save settings
          </button>
        </>
      }
    >
      <div className="space-y-5">
        {/* Visibility */}
        <fieldset>
          <legend className="label">Who can access this file</legend>
          <div className="space-y-2">
            {visibilityOptions.map((option) => (
              <label
                key={option.value}
                className={cn(
                  'flex cursor-pointer items-start gap-3 rounded-xl border p-3 transition',
                  settings.visibility === option.value
                    ? 'border-brand bg-brand/[0.04] ring-1 ring-brand/20'
                    : 'border-line hover:bg-canvas',
                )}
              >
                <input
                  type="radio"
                  name="visibility"
                  className="mt-1 h-4 w-4 text-brand focus:ring-brand"
                  checked={settings.visibility === option.value}
                  onChange={() => setSettings((prev) => ({ ...prev, visibility: option.value }))}
                />
                <span className="min-w-0">
                  <span className="flex items-center gap-1.5 text-sm font-medium text-ink">
                    <option.icon className="h-3.5 w-3.5 text-muted" />
                    {option.title}
                  </span>
                  <span className="mt-0.5 block text-xs text-muted">{option.description}</span>
                </span>
              </label>
            ))}
          </div>
        </fieldset>

        {/* Protections */}
        <div className="grid gap-3 sm:grid-cols-2">
          <div>
            <label htmlFor="share-password" className="label">
              Password {hasPassword ? <span className="text-brand">(set)</span> : null}
            </label>
            <input
              id="share-password"
              type="password"
              className="input"
              placeholder={hasPassword ? 'Leave blank to keep current' : 'No password'}
              value={settings.password}
              onChange={(event) => setSettings((prev) => ({ ...prev, password: event.target.value }))}
              autoComplete="new-password"
            />
          </div>
          <div>
            <label htmlFor="share-expiry" className="label">
              Link expiry
            </label>
            <select
              id="share-expiry"
              className="input"
              value={settings.expiresInDays}
              onChange={(event) => setSettings((prev) => ({ ...prev, expiresInDays: event.target.value }))}
            >
              {EXPIRY_OPTIONS.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label htmlFor="share-max" className="label">
              Download limit
            </label>
            <input
              id="share-max"
              type="number"
              min={1}
              className="input"
              placeholder="Unlimited"
              value={settings.maxDownloads}
              onChange={(event) => setSettings((prev) => ({ ...prev, maxDownloads: event.target.value }))}
            />
          </div>
          <div className="space-y-2 pt-1">
            <label className="flex cursor-pointer items-center gap-2 text-sm text-ink">
              <input
                type="checkbox"
                className="h-4 w-4 rounded border-line text-brand focus:ring-brand"
                checked={settings.allowDownload}
                onChange={(event) =>
                  setSettings((prev) => ({ ...prev, allowDownload: event.target.checked }))
                }
              />
              Allow downloads
            </label>
            <label className="flex cursor-pointer items-center gap-2 text-sm text-ink">
              <input
                type="checkbox"
                className="h-4 w-4 rounded border-line text-brand focus:ring-brand"
                checked={settings.viewOnly}
                onChange={(event) => setSettings((prev) => ({ ...prev, viewOnly: event.target.checked }))}
              />
              View-only mode
            </label>
          </div>
        </div>

        {/* Links */}
        {token ? (
          <div className="rounded-xl border border-line bg-canvas/60 p-4">
            <div className="mb-3 flex items-center gap-1">
              <button
                type="button"
                onClick={() => setTab('link')}
                className={cn(
                  'rounded-lg px-2.5 py-1 text-xs font-semibold transition',
                  tab === 'link' ? 'bg-surface text-ink shadow-sm ring-1 ring-line' : 'text-muted',
                )}
              >
                Links
              </button>
              <button
                type="button"
                onClick={() => setTab('embed')}
                className={cn(
                  'rounded-lg px-2.5 py-1 text-xs font-semibold transition',
                  tab === 'embed' ? 'bg-surface text-ink shadow-sm ring-1 ring-line' : 'text-muted',
                )}
              >
                Embed
              </button>
              <button
                type="button"
                onClick={() => void regenerate()}
                className="ml-auto inline-flex items-center gap-1 text-xs font-medium text-muted transition hover:text-ink"
                disabled={busy}
              >
                <RefreshCw className="h-3 w-3" /> Regenerate
              </button>
            </div>

            {tab === 'link' ? (
              <div className="space-y-2.5">
                <CopyRow label="Share link" value={shareUrl} onCopy={() => copy(shareUrl, 'Share link copied')} />
                <CopyRow label="Direct URL" value={directUrl} onCopy={() => copy(directUrl, 'Direct URL copied')} />
                {file.category === 'video' ? (
                  <CopyRow label="Embed player" value={embedUrl} onCopy={() => copy(embedUrl, 'Player URL copied')} />
                ) : null}
              </div>
            ) : (
              <div>
                <div className="mb-1.5 flex items-center justify-between">
                  <span className="text-[11px] font-medium uppercase tracking-wide text-muted">
                    HTML embed code
                  </span>
                  <button
                    type="button"
                    onClick={() => copy(embedCode, 'Embed code copied')}
                    className="inline-flex items-center gap-1 text-xs font-medium text-brand hover:underline"
                  >
                    <Copy className="h-3 w-3" /> Copy
                  </button>
                </div>
                <pre className="max-h-40 overflow-auto rounded-lg bg-surface p-3 text-[11px] leading-relaxed text-ink ring-1 ring-line">
                  <code>{embedCode}</code>
                </pre>
                <p className="mt-2 flex items-center gap-1 text-[11px] text-muted">
                  <Code2 className="h-3 w-3" /> Paste this into any website or portfolio page.
                </p>
              </div>
            )}
          </div>
        ) : (
          <div className="rounded-xl border border-dashed border-line p-4 text-center text-sm text-muted">
            Sharing is currently disabled for this file. Save the settings above to create a link.
          </div>
        )}
      </div>
    </Dialog>
  );
}

export function CopyRow({
  label,
  value,
  onCopy,
}: {
  label: string;
  value: string;
  onCopy: () => void;
}) {
  return (
    <div>
      <span className="mb-1 block text-[11px] font-medium uppercase tracking-wide text-muted">{label}</span>
      <div className="flex items-center gap-2">
        <input
          readOnly
          value={value}
          onFocus={(event) => event.target.select()}
          className="input truncate font-mono text-[11px]"
          aria-label={label}
        />
        <button type="button" onClick={onCopy} className="btn-secondary btn-sm shrink-0" aria-label={`Copy ${label}`}>
          <Copy className="h-3.5 w-3.5" />
        </button>
      </div>
    </div>
  );
}
