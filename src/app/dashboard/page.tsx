import Link from 'next/link';
import type { Metadata } from 'next';
import {
  ArrowUpRight,
  Clock,
  FileText,
  FolderPlus,
  HardDrive,
  Image as ImageIcon,
  Link2,
  Upload,
  Video,
  Film,
  Music,
  Archive,
  Files,
} from 'lucide-react';
import { requireSession } from '@/lib/session';
import { getSettings } from '@/lib/settings';
import { getStorageStats, listFolders, recentUploads, countActiveShares } from '@/lib/files';
import { formatBytes, timeAgo, percent } from '@/lib/format';
import { ProgressBar, DonutChart, EmptyState, StatCard } from '@/components/ui/misc';
import { FileTypeIcon } from '@/components/files/file-icon';
import { Topbar } from '@/components/layout/topbar';
import { CATEGORY_COLORS } from '@/lib/theme';
import { FileRowActions } from '@/components/files/file-row-actions';

export const metadata: Metadata = { title: 'Overview' };
export const dynamic = 'force-dynamic';

const CATEGORY_ICONS: Record<string, typeof ImageIcon> = {
  image: ImageIcon,
  video: Video,
  audio: Music,
  document: FileText,
  archive: Archive,
  other: Files,
};

const DONUT_COLORS: Record<string, string> = {
  image: '#8b5cf6',
  video: '#f43f5e',
  audio: '#f59e0b',
  document: '#0ea5e9',
  archive: '#14b8a6',
  other: '#64748b',
};

export default async function DashboardPage() {
  const session = await requireSession();
  const settings = await getSettings();

  const [stats, folders, recent, activeShares] = await Promise.all([
    getStorageStats(session.id),
    listFolders(session.id),
    recentUploads(session.id, 6),
    countActiveShares(session.id),
  ]);

  const usedPct = percent(stats.usedBytes, stats.totalBytes);
  const donutSegments = Object.entries(stats.byCategory)
    .filter(([, value]) => value.bytes > 0)
    .map(([category, value]) => ({
      label: category,
      value: value.bytes,
      color: DONUT_COLORS[category] ?? DONUT_COLORS.other,
    }));

  return (
    <>
      <Topbar
        user={{
          name: session.name,
          email: session.email,
          avatarUrl: session.avatarUrl,
          roleLabel: session.role.label,
          isAdmin: session.isAdmin,
        }}
        allowThemeToggle={settings.appearance.allowUserThemeToggle}
      />

      <div className="mx-auto max-w-7xl space-y-6 px-4 py-6 sm:px-6 lg:py-8">
        {/* Header */}
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h1 className="text-2xl font-semibold tracking-tight text-ink">
              Welcome back, {session.name.split(' ')[0]}
            </h1>
            <p className="mt-1 text-sm text-muted">{settings.appearance.welcomeMessage}</p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <Link href="/dashboard/files" className="btn-secondary">
              <FolderPlus className="h-4 w-4" /> New folder
            </Link>
            <Link href="/dashboard/upload" className="btn-primary">
              <Upload className="h-4 w-4" /> Upload files
            </Link>
          </div>
        </div>

        {/* Storage hero + stats */}
        <div className="grid gap-4 lg:grid-cols-3">
          <div className="card relative overflow-hidden p-6 lg:col-span-2">
            <div
              className="pointer-events-none absolute -right-16 -top-16 h-56 w-56 rounded-full opacity-[0.07]"
              style={{ background: 'radial-gradient(circle, rgb(var(--brand)), transparent 70%)' }}
            />
            <div className="flex flex-wrap items-start justify-between gap-4">
              <div>
                <p className="text-[13px] font-medium text-muted">My storage</p>
                <div className="mt-1 flex items-baseline gap-2">
                  <span className="text-3xl font-semibold tracking-tight text-ink">
                    {formatBytes(stats.usedBytes)}
                  </span>
                  <span className="text-sm text-muted">of {formatBytes(stats.totalBytes)} used</span>
                </div>
                <p className="mt-1 text-xs text-muted">
                  {formatBytes(stats.availableBytes)} available · {stats.fileCount} file
                  {stats.fileCount === 1 ? '' : 's'}
                </p>
              </div>
              <span className="badge-brand">{usedPct.toFixed(0)}% used</span>
            </div>

            <div className="mt-5">
              <ProgressBar value={stats.usedBytes} max={stats.totalBytes} size="lg" />
            </div>

            <div className="mt-6 grid grid-cols-2 gap-3 sm:grid-cols-4">
              {(
                [
                  ['image', ImageIcon],
                  ['video', Video],
                  ['document', FileText],
                  ['archive', Archive],
                ] as const
              ).map(([category, Icon]) => {
                const entry = stats.byCategory[category];
                return (
                  <Link
                    key={category}
                    href={`/dashboard/files?category=${category}`}
                    className="group rounded-xl border border-line bg-canvas/60 p-3 transition hover:border-brand/40 hover:bg-brand/[0.03]"
                  >
                    <div className="flex items-center justify-between">
                      <Icon className="h-4 w-4 text-muted transition group-hover:text-brand" />
                      <ArrowUpRight className="h-3 w-3 text-muted opacity-0 transition group-hover:opacity-100" />
                    </div>
                    <p className="mt-2 text-lg font-semibold text-ink">{entry?.count ?? 0}</p>
                    <p className="text-[11px] capitalize text-muted">
                      {category}s · {formatBytes(entry?.bytes ?? 0)}
                    </p>
                  </Link>
                );
              })}
            </div>

            {usedPct > 85 ? (
              <div className="mt-4 rounded-xl bg-amber-500/10 px-3.5 py-2.5 text-xs text-amber-700 ring-1 ring-inset ring-amber-500/20 dark:text-amber-400">
                You are close to your storage limit. Free up space or contact an administrator to
                increase your quota.
              </div>
            ) : null}
          </div>

          <div className="card flex flex-col items-center justify-center p-6">
            <p className="mb-4 self-start text-[13px] font-medium text-muted">Usage by type</p>
            {donutSegments.length > 0 ? (
              <>
                <DonutChart
                  segments={donutSegments}
                  centerLabel={formatBytes(stats.usedBytes)}
                  centerSubLabel="of storage"
                />
                <ul className="mt-5 w-full space-y-2">
                  {donutSegments
                    .sort((a, b) => b.value - a.value)
                    .slice(0, 4)
                    .map((segment) => (
                      <li key={segment.label} className="flex items-center gap-2 text-xs">
                        <span
                          className="h-2.5 w-2.5 shrink-0 rounded-full"
                          style={{ background: segment.color }}
                        />
                        <span className="flex-1 capitalize text-muted">{segment.label}</span>
                        <span className="font-medium text-ink">{formatBytes(segment.value)}</span>
                      </li>
                    ))}
                </ul>
              </>
            ) : (
              <div className="flex flex-1 flex-col items-center justify-center py-6 text-center">
                <HardDrive className="h-8 w-8 text-muted/50" />
                <p className="mt-2 text-xs text-muted">No files yet</p>
              </div>
            )}
          </div>
        </div>

        {/* KPI row */}
        <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
          <StatCard
            label="Total files"
            value={stats.fileCount}
            sub="Across all folders"
            icon={<Files className="h-4 w-4" />}
          />
          <StatCard
            label="Images"
            value={stats.byCategory.image?.count ?? 0}
            sub={formatBytes(stats.byCategory.image?.bytes ?? 0)}
            icon={<ImageIcon className="h-4 w-4" />}
            tone="violet"
          />
          <StatCard
            label="Videos"
            value={stats.byCategory.video?.count ?? 0}
            sub={formatBytes(stats.byCategory.video?.bytes ?? 0)}
            icon={<Film className="h-4 w-4" />}
            tone="rose"
          />
          <StatCard
            label="Active links"
            value={activeShares}
            sub={
              <Link href="/dashboard/links" className="font-medium text-brand hover:underline">
                Manage sharing
              </Link>
            }
            icon={<Link2 className="h-4 w-4" />}
            tone="sky"
          />
        </div>

        <div className="grid gap-4 lg:grid-cols-3">
          {/* Recent uploads */}
          <div className="card lg:col-span-2">
            <div className="flex items-center justify-between border-b border-line px-5 py-4">
              <h2 className="text-sm font-semibold text-ink">Recent uploads</h2>
              <Link href="/dashboard/files" className="text-xs font-medium text-brand hover:underline">
                View all
              </Link>
            </div>
            {recent.length === 0 ? (
              <EmptyState
                icon={<Upload className="h-6 w-6" />}
                title="No uploads yet"
                description="Drag files into the upload area to get started. Every upload gets a shareable link automatically."
                action={
                  <Link href="/dashboard/upload" className="btn-primary btn-sm">
                    <Upload className="h-3.5 w-3.5" /> Upload now
                  </Link>
                }
              />
            ) : (
              <ul className="divide-y divide-line">
                {recent.map((file) => (
                  <li key={file.id} className="flex items-center gap-3 px-5 py-3">
                    <FileTypeIcon category={file.category} extension={file.extension} size="sm" />
                    <div className="min-w-0 flex-1">
                      <Link
                        href={`/dashboard/files?search=${encodeURIComponent(file.name)}`}
                        className="block truncate text-sm font-medium text-ink hover:text-brand"
                      >
                        {file.name}
                      </Link>
                      <p className="text-xs text-muted">
                        {formatBytes(file.size)} · {timeAgo(file.createdAt)}
                      </p>
                    </div>
                    {file.visibility === 'LINK' && file.shareToken ? (
                      <span className="badge-green hidden sm:inline-flex">
                        <Link2 className="h-3 w-3" /> Shared
                      </span>
                    ) : (
                      <span className="badge-neutral hidden sm:inline-flex">Private</span>
                    )}
                    <FileRowActions file={file} variant="icons" />
                  </li>
                ))}
              </ul>
            )}
          </div>

          {/* Folders + quick actions */}
          <div className="space-y-4">
            <div className="card">
              <div className="flex items-center justify-between border-b border-line px-5 py-4">
                <h2 className="text-sm font-semibold text-ink">Folders</h2>
                <Link href="/dashboard/files" className="text-xs font-medium text-brand hover:underline">
                  Manage
                </Link>
              </div>
              {folders.length === 0 ? (
                <div className="px-5 py-8 text-center">
                  <FolderPlus className="mx-auto h-7 w-7 text-muted/50" />
                  <p className="mt-2 text-xs text-muted">Create a folder to organise your files.</p>
                </div>
              ) : (
                <ul className="divide-y divide-line">
                  {folders.slice(0, 5).map((folder) => (
                    <li key={folder.id}>
                      <Link
                        href={`/dashboard/files?folder=${folder.id}`}
                        className="flex items-center justify-between px-5 py-3 text-sm transition hover:bg-canvas/70"
                      >
                        <span className="flex min-w-0 items-center gap-2.5">
                          <FolderPlus className="h-4 w-4 shrink-0 text-brand" />
                          <span className="truncate text-ink">{folder.name}</span>
                        </span>
                        <span className="text-xs text-muted">{folder.fileCount ?? 0}</span>
                      </Link>
                    </li>
                  ))}
                </ul>
              )}
            </div>

            <div className="card p-5">
              <h2 className="text-sm font-semibold text-ink">Quota</h2>
              <dl className="mt-3 space-y-2.5 text-sm">
                <div className="flex items-center justify-between">
                  <dt className="text-muted">Allocated</dt>
                  <dd className="font-medium text-ink">{formatBytes(stats.totalBytes)}</dd>
                </div>
                <div className="flex items-center justify-between">
                  <dt className="text-muted">Used</dt>
                  <dd className="font-medium text-ink">{formatBytes(stats.usedBytes)}</dd>
                </div>
                <div className="flex items-center justify-between">
                  <dt className="text-muted">Available</dt>
                  <dd className="font-medium text-emerald-600 dark:text-emerald-400">
                    {formatBytes(stats.availableBytes)}
                  </dd>
                </div>
              </dl>
              <div className="mt-4 flex items-center gap-2 rounded-lg bg-canvas px-3 py-2 text-[11px] text-muted">
                <Clock className="h-3.5 w-3.5" />
                Need more space? Ask your administrator to raise your quota.
              </div>
            </div>
          </div>
        </div>
      </div>
    </>
  );
}
