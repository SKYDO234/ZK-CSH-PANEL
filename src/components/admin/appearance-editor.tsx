'use client';

import { useMemo, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import {
  Check,
  Eye,
  Image as ImageIcon,
  Loader2,
  Monitor,
  Paintbrush,
  RotateCcw,
  Save,
  Smartphone,
  Upload,
  X,
} from 'lucide-react';
import type { AppearanceSettings } from '@/lib/settings';
import { cssVariablesFromBranding, paletteFromHex } from '@/lib/theme';
import { useToast } from '@/components/ui/toast';
import { csrfToken } from '@/lib/upload-client';
import { cn } from '@/lib/cn';
import { PRESET_THEMES } from './preset-themes';
import { Logo } from '@/components/branding/logo';

type Tab = 'brand' | 'colors' | 'content' | 'theme';

export function AppearanceEditor({ initial }: { initial: AppearanceSettings }) {
  const router = useRouter();
  const { success, error, info } = useToast();
  const [draft, setDraft] = useState<AppearanceSettings>(initial);
  const [tab, setTab] = useState<Tab>('brand');
  const [preview, setPreview] = useState(false);
  const [previewDevice, setPreviewDevice] = useState<'desktop' | 'mobile'>('desktop');
  const [busy, setBusy] = useState(false);
  const [uploading, setUploading] = useState<string | null>(null);
  const logoInput = useRef<HTMLInputElement>(null);
  const faviconInput = useRef<HTMLInputElement>(null);
  const loginBgInput = useRef<HTMLInputElement>(null);

  const update = <K extends keyof AppearanceSettings>(key: K, value: AppearanceSettings[K]) => {
    setDraft((prev) => ({ ...prev, [key]: value }));
  };

  const dirty = useMemo(() => JSON.stringify(draft) !== JSON.stringify(initial), [draft, initial]);

  const palette = useMemo(
    () => paletteFromHex(draft.primaryColor),
    [draft.primaryColor],
  );

  const uploadImage = async (file: File, kind: 'logo' | 'favicon' | 'login') => {
    setUploading(kind);
    const body = new FormData();
    body.append('file', file);
    body.append('kind', kind);
    const res = await fetch('/api/admin/branding', {
      method: 'POST',
      headers: { 'x-csrf-token': csrfToken() },
      body,
    });
    setUploading(null);
    const json = await res.json().catch(() => null);
    if (res.ok) {
      const url = json.data.url as string;
      if (kind === 'logo') update('logoUrl', url);
      else if (kind === 'favicon') update('faviconUrl', url);
      else update('loginBackgroundUrl', url);
      success('Image uploaded', 'Save to apply it across the platform.');
    } else {
      error('Upload failed', json?.error?.message);
    }
  };

  const save = async () => {
    setBusy(true);
    const res = await fetch('/api/admin/appearance', {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'x-csrf-token': csrfToken() },
      body: JSON.stringify(draft),
    });
    setBusy(false);
    const json = await res.json().catch(() => null);
    if (res.ok) {
      success('Branding saved', 'Changes are live for every user.');
      router.refresh();
    } else {
      error('Could not save branding', json?.error?.message ?? 'Check the colour values.');
    }
  };

  const tabs: Array<{ id: Tab; label: string; icon: typeof Paintbrush }> = [
    { id: 'brand', label: 'Identity', icon: ImageIcon },
    { id: 'colors', label: 'Colours', icon: Paintbrush },
    { id: 'content', label: 'Copy & content', icon: Monitor },
    { id: 'theme', label: 'Theme & CSS', icon: Smartphone },
  ];

  return (
    <div className="grid gap-4 xl:grid-cols-[1fr_26rem]">
      {/* Editor */}
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

        <div className="space-y-5 p-5">
          {tab === 'brand' ? (
            <>
              <div className="grid gap-4 sm:grid-cols-2">
                <div>
                  <label htmlFor="ap-name" className="label">
                    Platform name
                  </label>
                  <input
                    id="ap-name"
                    className="input"
                    value={draft.platformName}
                    onChange={(event) => update('platformName', event.target.value)}
                    maxLength={60}
                  />
                  <p className="hint">Appears in the sidebar, emails and page titles.</p>
                </div>
                <div>
                  <label htmlFor="ap-tagline" className="label">
                    Tagline
                  </label>
                  <input
                    id="ap-tagline"
                    className="input"
                    value={draft.tagline}
                    onChange={(event) => update('tagline', event.target.value)}
                    maxLength={160}
                  />
                </div>
              </div>

              <div className="grid gap-4 sm:grid-cols-3">
                {(
                  [
                    { key: 'logo' as const, label: 'Logo', field: 'logoUrl' as const, ref: logoInput, value: draft.logoUrl },
                    { key: 'favicon' as const, label: 'Favicon', field: 'faviconUrl' as const, ref: faviconInput, value: draft.faviconUrl },
                    {
                      key: 'login' as const,
                      label: 'Login background',
                      field: 'loginBackgroundUrl' as const,
                      ref: loginBgInput,
                      value: draft.loginBackgroundUrl,
                    },
                  ]
                ).map((entry) => (
                  <div key={entry.key} className="rounded-xl border border-line p-3">
                    <p className="mb-2 text-[13px] font-medium text-ink">{entry.label}</p>
                    <div className="mb-2 flex h-20 items-center justify-center overflow-hidden rounded-lg bg-canvas">
                      {entry.value ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img src={entry.value} alt={`${entry.label} preview`} className="max-h-16 max-w-full object-contain" />
                      ) : (
                        <ImageIcon className="h-6 w-6 text-muted/50" />
                      )}
                    </div>
                    <input
                      ref={entry.ref}
                      type="file"
                      accept="image/png,image/jpeg,image/svg+xml,image/webp,image/x-icon"
                      className="sr-only"
                      onChange={(event) => {
                        const file = event.target.files?.[0];
                        if (file) void uploadImage(file, entry.key);
                        event.target.value = '';
                      }}
                    />
                    <div className="flex gap-1.5">
                      <button
                        type="button"
                        className="btn-secondary btn-sm flex-1"
                        onClick={() => entry.ref.current?.click()}
                        disabled={uploading !== null}
                      >
                        {uploading === entry.key ? (
                          <Loader2 className="h-3.5 w-3.5 animate-spin" />
                        ) : (
                          <Upload className="h-3.5 w-3.5" />
                        )}
                        Upload
                      </button>
                      {entry.value ? (
                        <button
                          type="button"
                          className="btn-ghost btn-sm"
                          onClick={() => update(entry.field, null)}
                          aria-label={`Remove ${entry.label}`}
                        >
                          <X className="h-3.5 w-3.5" />
                        </button>
                      ) : null}
                    </div>
                  </div>
                ))}
              </div>

              <div className="grid gap-4 sm:grid-cols-2">
                <div>
                  <label htmlFor="ap-support" className="label">
                    Support email
                  </label>
                  <input
                    id="ap-support"
                    type="email"
                    className="input"
                    value={draft.supportEmail}
                    onChange={(event) => update('supportEmail', event.target.value)}
                  />
                </div>
                <div>
                  <label htmlFor="ap-domain" className="label">
                    Custom domain (display only)
                  </label>
                  <input
                    id="ap-domain"
                    className="input"
                    value={draft.customDomain ?? ''}
                    onChange={(event) => update('customDomain', event.target.value || null)}
                    placeholder="storage.yourdomain.com"
                  />
                  <p className="hint">Point your DNS at the deployment, then set APP_URL accordingly.</p>
                </div>
              </div>
            </>
          ) : null}

          {tab === 'colors' ? (
            <>
              <div>
                <p className="label">Preset palettes</p>
                <div className="flex flex-wrap gap-2">
                  {PRESET_THEMES.map((preset) => (
                    <button
                      key={preset.id}
                      type="button"
                      onClick={() =>
                        setDraft((prev) => ({
                          ...prev,
                          primaryColor: preset.primaryColor,
                          secondaryColor: preset.secondaryColor,
                          accentColor: preset.accentColor,
                          backgroundTint: preset.backgroundTint,
                        }))
                      }
                      className="group flex items-center gap-2 rounded-xl border border-line p-2 pr-3 transition hover:border-brand/40"
                    >
                      <span className="flex -space-x-1">
                        <span className="h-5 w-5 rounded-full ring-2 ring-surface" style={{ background: preset.primaryColor }} />
                        <span className="h-5 w-5 rounded-full ring-2 ring-surface" style={{ background: preset.secondaryColor }} />
                        <span className="h-5 w-5 rounded-full ring-2 ring-surface" style={{ background: preset.accentColor }} />
                      </span>
                      <span className="text-xs font-medium text-ink">{preset.name}</span>
                    </button>
                  ))}
                </div>
              </div>

              <div className="grid gap-4 sm:grid-cols-2">
                {(
                  [
                    ['primaryColor', 'Primary colour'],
                    ['secondaryColor', 'Secondary colour'],
                    ['accentColor', 'Accent colour'],
                    ['backgroundTint', 'Background tint'],
                  ] as const
                ).map(([key, label]) => (
                  <div key={key}>
                    <label htmlFor={`color-${key}`} className="label">
                      {label}
                    </label>
                    <div className="flex items-center gap-2">
                      <input
                        id={`color-${key}`}
                        type="color"
                        value={draft[key]}
                        onChange={(event) => update(key, event.target.value)}
                        className="h-10 w-12 cursor-pointer rounded-lg border border-line bg-surface p-1"
                      />
                      <input
                        className="input font-mono text-xs uppercase"
                        value={draft[key]}
                        onChange={(event) => update(key, event.target.value)}
                        aria-label={`${label} hex value`}
                      />
                    </div>
                  </div>
                ))}
              </div>

              <div>
                <p className="label">Generated palette</p>
                <div className="flex overflow-hidden rounded-lg ring-1 ring-line">
                  {['50', '100', '200', '300', '400', '500', '600', '700', '800', '900'].map((shade) => {
                    const triplet = palette[shade];
                    return (
                      <div
                        key={shade}
                        className="flex h-12 flex-1 items-end justify-center pb-1 text-[9px] font-medium"
                        style={{
                          background: `rgb(${triplet})`,
                          color: Number(shade) >= 500 ? '#fff' : '#0f172a',
                        }}
                        title={`brand-${shade}`}
                      >
                        {shade}
                      </div>
                    );
                  })}
                </div>
                <p className="hint">
                  Shades 50–900 are derived automatically from the primary colour, so buttons, links and
                  charts always stay in harmony.
                </p>
              </div>
            </>
          ) : null}

          {tab === 'content' ? (
            <div className="space-y-4">
              <div className="grid gap-4 sm:grid-cols-2">
                <div>
                  <label htmlFor="ap-login-title" className="label">
                    Login heading
                  </label>
                  <input
                    id="ap-login-title"
                    className="input"
                    value={draft.loginTitle}
                    onChange={(event) => update('loginTitle', event.target.value)}
                    maxLength={80}
                  />
                </div>
                <div>
                  <label htmlFor="ap-login-sub" className="label">
                    Login subheading
                  </label>
                  <input
                    id="ap-login-sub"
                    className="input"
                    value={draft.loginSubtitle}
                    onChange={(event) => update('loginSubtitle', event.target.value)}
                    maxLength={200}
                  />
                </div>
              </div>
              <div>
                <label htmlFor="ap-welcome" className="label">
                  Dashboard welcome message
                </label>
                <textarea
                  id="ap-welcome"
                  className="input min-h-[3.5rem] resize-y"
                  value={draft.welcomeMessage}
                  onChange={(event) => update('welcomeMessage', event.target.value)}
                  maxLength={300}
                />
              </div>
              <div>
                <label htmlFor="ap-footer" className="label">
                  Footer text
                </label>
                <input
                  id="ap-footer"
                  className="input"
                  value={draft.footerText}
                  onChange={(event) => update('footerText', event.target.value)}
                  maxLength={300}
                />
              </div>
              <div className="grid gap-4 sm:grid-cols-2">
                <div>
                  <label htmlFor="ap-email-footer" className="label">
                    Email footer
                  </label>
                  <input
                    id="ap-email-footer"
                    className="input"
                    value={draft.emailFooterText}
                    onChange={(event) => update('emailFooterText', event.target.value)}
                    maxLength={400}
                  />
                </div>
                <div>
                  <label htmlFor="ap-email-color" className="label">
                    Email brand colour
                  </label>
                  <div className="flex items-center gap-2">
                    <input
                      id="ap-email-color"
                      type="color"
                      value={draft.emailBrandColor}
                      onChange={(event) => update('emailBrandColor', event.target.value)}
                      className="h-10 w-12 cursor-pointer rounded-lg border border-line bg-surface p-1"
                    />
                    <input
                      className="input font-mono text-xs uppercase"
                      value={draft.emailBrandColor}
                      onChange={(event) => update('emailBrandColor', event.target.value)}
                    />
                  </div>
                </div>
              </div>
              <label className="flex cursor-pointer items-center gap-2 text-sm text-ink">
                <input
                  type="checkbox"
                  checked={draft.showPoweredBy}
                  onChange={(event) => update('showPoweredBy', event.target.checked)}
                  className="h-4 w-4 rounded border-line text-brand"
                />
                Show a subtle platform credit in shared pages
              </label>
            </div>
          ) : null}

          {tab === 'theme' ? (
            <div className="space-y-4">
              <div className="grid gap-4 sm:grid-cols-2">
                <div>
                  <label htmlFor="ap-default-theme" className="label">
                    Default theme
                  </label>
                  <select
                    id="ap-default-theme"
                    className="input"
                    value={draft.defaultTheme}
                    onChange={(event) => update('defaultTheme', event.target.value as AppearanceSettings['defaultTheme'])}
                  >
                    <option value="system">Follow system</option>
                    <option value="light">Light</option>
                    <option value="dark">Dark</option>
                  </select>
                </div>
                <div>
                  <label htmlFor="ap-sidebar" className="label">
                    Sidebar style
                  </label>
                  <select
                    id="ap-sidebar"
                    className="input"
                    value={draft.sidebarStyle}
                    onChange={(event) => update('sidebarStyle', event.target.value as 'dark' | 'light')}
                  >
                    <option value="dark">Dark</option>
                    <option value="light">Light</option>
                  </select>
                </div>
              </div>
              <label className="flex cursor-pointer items-center gap-2 text-sm text-ink">
                <input
                  type="checkbox"
                  checked={draft.allowUserThemeToggle}
                  onChange={(event) => update('allowUserThemeToggle', event.target.checked)}
                  className="h-4 w-4 rounded border-line text-brand"
                />
                Let users switch between light and dark mode
              </label>
              <div>
                <label htmlFor="ap-css" className="label">
                  Custom CSS
                </label>
                <textarea
                  id="ap-css"
                  className="input min-h-[8rem] resize-y font-mono text-xs"
                  value={draft.customCss}
                  onChange={(event) => update('customCss', event.target.value)}
                  placeholder={"/* e.g. .card { border-radius: 6px } */"}
                  spellCheck={false}
                />
                <p className="hint">
                  Injected into every page after the design tokens. Use it for small polish — layout
                  changes are better made in code.
                </p>
              </div>
            </div>
          ) : null}
        </div>

        <div className="flex flex-wrap items-center justify-between gap-2 border-t border-line bg-canvas/50 px-5 py-3.5">
          <div className="flex items-center gap-2">
            <button
              type="button"
              className="btn-ghost btn-sm"
              onClick={() => setDraft(initial)}
              disabled={!dirty}
            >
              <RotateCcw className="h-3.5 w-3.5" /> Reset
            </button>
            <button type="button" className="btn-secondary btn-sm" onClick={() => setPreview((v) => !v)}>
              <Eye className="h-3.5 w-3.5" /> {preview ? 'Hide preview' : 'Preview'}
            </button>
            {dirty ? <span className="badge-amber">Unsaved changes</span> : null}
          </div>
          <button type="button" className="btn-primary btn-sm" onClick={() => void save()} disabled={busy || !dirty}>
            {busy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Save className="h-3.5 w-3.5" />}
            Save branding
          </button>
        </div>
      </div>

      {/* Live preview */}
      <div className="space-y-3">
        <div className="flex items-center justify-between">
          <p className="text-sm font-semibold text-ink">Live preview</p>
          <div className="flex items-center gap-0.5 rounded-lg border border-line bg-canvas p-0.5">
            <button
              type="button"
              onClick={() => setPreviewDevice('desktop')}
              className={cn('rounded-md p-1.5', previewDevice === 'desktop' ? 'bg-surface text-ink shadow-sm' : 'text-muted')}
              aria-label="Desktop preview"
            >
              <Monitor className="h-3.5 w-3.5" />
            </button>
            <button
              type="button"
              onClick={() => setPreviewDevice('mobile')}
              className={cn('rounded-md p-1.5', previewDevice === 'mobile' ? 'bg-surface text-ink shadow-sm' : 'text-muted')}
              aria-label="Mobile preview"
            >
              <Smartphone className="h-3.5 w-3.5" />
            </button>
          </div>
        </div>

        <div
          className="overflow-hidden rounded-2xl border border-line bg-canvas shadow-card"
          style={{
            ...Object.fromEntries(
              Object.entries(cssVariablesFromBranding(draft)).map(([key, value]) => [key, value]),
            ),
            maxWidth: previewDevice === 'mobile' ? '320px' : '100%',
            marginInline: previewDevice === 'mobile' ? 'auto' : undefined,
          } as React.CSSProperties}
        >
          {/* Mini app chrome */}
          <div className="flex h-9 items-center gap-1.5 border-b border-line bg-surface px-3">
            <span className="h-2 w-2 rounded-full bg-red-400" />
            <span className="h-2 w-2 rounded-full bg-amber-400" />
            <span className="h-2 w-2 rounded-full bg-emerald-400" />
            <span className="ml-2 truncate text-[10px] text-muted">
              {draft.customDomain || 'storage.example.com'}
            </span>
          </div>

          <div className="flex">
            <div
              className="hidden w-32 shrink-0 p-3 sm:block"
              style={{
                background: draft.sidebarStyle === 'light' ? '#fff' : 'rgb(17 24 39)',
                borderRight: '1px solid rgb(0 0 0 / 0.06)',
              }}
            >
              <Logo
                name={draft.platformName}
                logoUrl={draft.logoUrl}
                size="sm"
                invert={draft.sidebarStyle === 'dark'}
              />
              <div className="mt-3 space-y-1">
                {['Overview', 'My files', 'Upload', 'Shared'].map((item, index) => (
                  <div
                    key={item}
                    className="truncate rounded-md px-2 py-1 text-[9px] font-medium"
                    style={
                      index === 0
                        ? { background: 'rgb(var(--brand))', color: '#fff' }
                        : { color: draft.sidebarStyle === 'light' ? '#64748b' : 'rgb(226 232 240 / 0.65)' }
                    }
                  >
                    {item}
                  </div>
                ))}
              </div>
            </div>

            <div className="min-w-0 flex-1 p-3">
              <div className="text-[11px] font-semibold text-ink">{draft.loginTitle}</div>
              <div className="mt-0.5 line-clamp-2 text-[9px] text-muted">{draft.welcomeMessage}</div>
              <div className="mt-2 rounded-lg border border-line bg-surface p-2">
                <div className="flex items-center justify-between">
                  <span className="text-[9px] font-medium text-ink">My storage</span>
                  <span
                    className="rounded-full px-1.5 py-0.5 text-[8px] font-semibold text-white"
                    style={{ background: 'rgb(var(--brand))' }}
                  >
                    48% used
                  </span>
                </div>
                <div className="mt-1.5 h-1.5 overflow-hidden rounded-full bg-canvas">
                  <div className="h-full rounded-full" style={{ width: '48%', background: 'rgb(var(--brand))' }} />
                </div>
                <div className="mt-2 flex gap-1.5">
                  <span
                    className="rounded-md px-2 py-1 text-[8px] font-semibold text-white"
                    style={{ background: 'rgb(var(--brand))' }}
                  >
                    Upload
                  </span>
                  <span className="rounded-md border border-line px-2 py-1 text-[8px] font-medium text-muted">
                    New folder
                  </span>
                </div>
              </div>
              <div className="mt-2 grid grid-cols-3 gap-1.5">
                {['image', 'video', 'doc'].map((item, index) => (
                  <div key={item} className="rounded-md border border-line bg-surface p-1.5">
                    <div
                      className="h-5 rounded"
                      style={{
                        background: ['rgb(var(--brand) / 0.12)', 'rgb(var(--secondary) / 0.14)', 'rgb(var(--accent) / 0.14)'][index],
                      }}
                    />
                    <div className="mt-1 truncate text-[7px] text-muted">{item}</div>
                  </div>
                ))}
              </div>
              <div className="mt-2 flex items-center justify-between border-t border-line pt-1.5">
                <span className="text-[8px] text-muted">{draft.footerText.slice(0, 40)}</span>
                <Check className="h-2.5 w-2.5 text-emerald-500" />
              </div>
            </div>
          </div>
        </div>

        <div className="card p-4">
          <p className="text-xs font-semibold text-ink">Publishing checklist</p>
          <ul className="mt-2 space-y-1.5 text-[11px] text-muted">
            <li>✓ Changes save to the database — no redeploy needed</li>
            <li>✓ Colours apply to every page, email and embed</li>
            <li>✓ Logo &amp; favicon are stored in your object storage</li>
            <li>✓ Users pick up new branding on their next page load</li>
          </ul>
          <button
            type="button"
            className="btn-ghost btn-sm mt-3 w-full"
            onClick={() => {
              setDraft(initial);
              info('Reverted to saved branding');
            }}
          >
            <RotateCcw className="h-3.5 w-3.5" /> Revert preview
          </button>
        </div>
      </div>
    </div>
  );
}
