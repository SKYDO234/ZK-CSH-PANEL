import type { Metadata } from 'next';
import Link from 'next/link';
import {
  Activity,
  ArrowUpRight,
  Download,
  FileText,
  HardDrive,
  Image as ImageIcon,
  Layers,
  Link2,
  Server,
  TrendingUp,
  UserCheck,
  UserPlus,
  Users,
  Video,
} from 'lucide-react';
import { requireAdmin } from '@/lib/session';
import { getSettings } from '@/lib/settings';
import { platformStats } from '@/lib/admin-stats';
import { formatBytes, formatNumber, percent, timeAgo } from '@/lib/format';
import { Topbar } from '@/components/layout/topbar';
import { StatCard, ProgressBar, DonutChart } from '@/components/ui/misc';
import { FileTypeIcon } from '@/components/files/file-icon';
import { AdminQuickActions } from '@/components/admin/quick-actions';

export const metadata: Metadata = { title: 'Admin dashboard' };
export const dynamic = 'force-dynamic';

const DONUT_COLORS: Record<string, string> = {
  image: '#8b5cf6',
  video: '#f43f5e',
  audio: '#f59e0b',
  document: '#0ea5e9',
  archive: '#14b8a6',
  other: '#64748b',
};

export default async function AdminDashboard() {
  const session = await requireAdmin();
  const settings = await getSettings();
  const stats = await platformStats();

  const utilisation = percent(stats.usedBytes, stats.allocatedBytes);
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
          isAdmin: true,
        }}
        allowThemeToggle={settings.appearance.allowUserThemeToggle}
        right={
          <span className="hidden items-center gap-1.5 rounded-lg bg-emerald-500/10 px-2.5 py-1.5 text-[11px] font-semibold text-emerald-700 ring-1 ring-inset ring-emerald-500/20 dark:text-emerald-400 sm:inline-flex">
            <span className="h-1.5 w-1.5 rounded-full bg-emerald-500" /> System healthy
          </span>
        }
      />

      <div className="mx-auto max-w-7xl space-y-6 px-4 py-6 sm:px-6 lg:py-8">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div>
            <h1 className="text-2xl font-semibold tracking-tight text-ink">Platform overview</h1>
            <p className="mt-1 text-sm text-muted">
              {settings.appearance.platformName} · signed in as {session.role.label}
            </p>
          </div>
          <AdminQuickActions platformName={settings.appearance.platformName} />
        </div>

        {/* Primary KPIs */}
        <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
          <StatCard
            label="Total users"
            value={formatNumber(stats.totalUsers)}
            sub={
              <span className="flex items-center gap-1 text-emerald-600 dark:text-emerald-400">
                <UserPlus className="h-3 w-3" /> +{stats.newUsersThisWeek} this week
              </span>
            }
            icon={<Users className="h-4 w-4" />}
          />
          <StatCard
            label="Active users"
            value={formatNumber(stats.activeUsers)}
            sub={`${stats.suspendedUsers} suspended`}
            icon={<UserCheck className="h-4 w-4" />}
            tone="green"
          />
          <StatCard
            label="Storage used"
            value={formatBytes(stats.usedBytes)}
            sub={`of ${formatBytes(stats.allocatedBytes)} allocated`}
            icon={<HardDrive className="h-4 w-4" />}
            tone="sky"
          />
          <StatCard
            label="Total files"
            value={formatNumber(stats.totalFiles)}
            sub={`${formatNumber(stats.uploadsThisWeek)} uploaded this week`}
            icon={<Layers className="h-4 w-4" />}
            tone="violet"
          />
        </div>

        <div className="grid gap-4 lg:grid-cols-3">
          {/* Storage allocation */}
          <div className="card p-5 lg:col-span-2">
            <div className="flex items-start justify-between">
              <div>
                <h2 className="text-sm font-semibold text-ink">Storage allocation</h2>
                <p className="mt-0.5 text-xs text-muted">
                  {formatBytes(stats.usedBytes)} used across {stats.totalUsers} accounts
                </p>
              </div>
              <span className="badge-brand">{utilisation.toFixed(1)}% utilised</span>
            </div>
            <div className="mt-4">
              <ProgressBar value={stats.usedBytes} max={stats.allocatedBytes} size="lg" />
            </div>
            <dl className="mt-5 grid grid-cols-2 gap-4 sm:grid-cols-4">
              <div>
                <dt className="text-[11px] uppercase tracking-wide text-muted">Allocated</dt>
                <dd className="mt-0.5 text-sm font-semibold text-ink">{formatBytes(stats.allocatedBytes)}</dd>
              </div>
              <div>
                <dt className="text-[11px] uppercase tracking-wide text-muted">Used</dt>
                <dd className="mt-0.5 text-sm font-semibold text-ink">{formatBytes(stats.usedBytes)}</dd>
              </div>
              <div>
                <dt className="text-[11px] uppercase tracking-wide text-muted">Downloads</dt>
                <dd className="mt-0.5 text-sm font-semibold text-ink">{formatNumber(stats.totalDownloads)}</dd>
              </div>
              <div>
                <dt className="text-[11px] uppercase tracking-wide text-muted">Bandwidth</dt>
                <dd className="mt-0.5 text-sm font-semibold text-ink">{formatBytes(stats.bandwidthBytes)}</dd>
              </div>
            </dl>

            <div className="mt-6 grid grid-cols-2 gap-3 sm:grid-cols-4">
              {[
                { label: 'Images', key: 'image', icon: ImageIcon, tone: 'text-violet-500' },
                { label: 'Videos', key: 'video', icon: Video, tone: 'text-rose-500' },
                { label: 'Documents', key: 'document', icon: FileText, tone: 'text-sky-500' },
                { label: 'Links', key: 'links', icon: Link2, tone: 'text-emerald-500' },
              ].map((entry) => (
                <div key={entry.key} className="rounded-xl border border-line bg-canvas/60 p-3">
                  <entry.icon className={`h-4 w-4 ${entry.tone}`} />
                  <p className="mt-2 text-lg font-semibold text-ink">
                    {entry.key === 'links'
                      ? formatNumber(stats.totalShares)
                      : formatNumber(stats.byCategory[entry.key]?.count ?? 0)}
                  </p>
                  <p className="text-[11px] text-muted">{entry.label}</p>
                </div>
              ))}
            </div>
          </div>

          <div className="card flex flex-col items-center p-5">
            <h2 className="mb-4 self-start text-sm font-semibold text-ink">Storage by type</h2>
            {donutSegments.length > 0 ? (
              <>
                <DonutChart segments={donutSegments} centerLabel={formatBytes(stats.storedBytes)} centerSubLabel="stored" />
                <ul className="mt-4 w-full space-y-1.5">
                  {donutSegments
                    .sort((a, b) => b.value - a.value)
                    .map((segment) => (
                      <li key={segment.label} className="flex items-center gap-2 text-xs">
                        <span className="h-2 w-2 rounded-full" style={{ background: segment.color }} />
                        <span className="flex-1 capitalize text-muted">{segment.label}</span>
                        <span className="font-medium text-ink">{formatBytes(segment.value)}</span>
                      </li>
                    ))}
                </ul>
              </>
            ) : (
              <p className="py-10 text-xs text-muted">No files uploaded yet.</p>
            )}
          </div>
        </div>

        <div className="grid gap-4 lg:grid-cols-2">
          {/* Recent uploads */}
          <div className="card">
            <div className="flex items-center justify-between border-b border-line px-5 py-4">
              <h2 className="text-sm font-semibold text-ink">Recent uploads</h2>
              <Link href="/admin/files" className="text-xs font-medium text-brand hover:underline">
                All files
              </Link>
            </div>
            {stats.recentUploads.length === 0 ? (
              <p className="px-5 py-10 text-center text-xs text-muted">No uploads yet.</p>
            ) : (
              <ul className="divide-y divide-line">
                {stats.recentUploads.map((upload) => (
                  <li key={upload.id} className="flex items-center gap-3 px-5 py-3">
                    <FileTypeIcon category={upload.category} extension={null} size="sm" />
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-medium text-ink">{upload.name}</p>
                      <p className="truncate text-[11px] text-muted">
                        {upload.ownerName} · {formatBytes(upload.size)} · {timeAgo(upload.createdAt)}
                      </p>
                    </div>
                    <Link
                      href={`/admin/users?search=${encodeURIComponent(upload.ownerEmail)}`}
                      className="shrink-0 text-[11px] font-medium text-brand hover:underline"
                    >
                      Manage
                    </Link>
                  </li>
                ))}
              </ul>
            )}
          </div>

          {/* Activity */}
          <div className="card">
            <div className="flex items-center justify-between border-b border-line px-5 py-4">
              <h2 className="text-sm font-semibold text-ink">System activity</h2>
              <Link href="/admin/activity" className="text-xs font-medium text-brand hover:underline">
                Full log
              </Link>
            </div>
            {stats.activity.length === 0 ? (
              <p className="px-5 py-10 text-center text-xs text-muted">No activity recorded yet.</p>
            ) : (
              <ul className="divide-y divide-line">
                {stats.activity.slice(0, 8).map((entry) => (
                  <li key={entry.id} className="flex items-start gap-2.5 px-5 py-2.5">
                    <Activity className="mt-0.5 h-3.5 w-3.5 shrink-0 text-muted" />
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-[13px] text-ink">{entry.message}</p>
                      <p className="text-[11px] text-muted">
                        {entry.actorName ?? 'System'} · {timeAgo(entry.createdAt)}
                      </p>
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>

        {/* Top consumers */}
        <div className="card overflow-hidden">
          <div className="flex items-center justify-between border-b border-line px-5 py-4">
            <h2 className="flex items-center gap-2 text-sm font-semibold text-ink">
              <TrendingUp className="h-4 w-4 text-brand" /> Top storage consumers
            </h2>
            <Link href="/admin/users" className="text-xs font-medium text-brand hover:underline">
              Manage users
            </Link>
          </div>
          <div className="overflow-x-auto">
            <table className="table-base">
              <thead>
                <tr>
                  <th>User</th>
                  <th>Usage</th>
                  <th className="hidden sm:table-cell">Files</th>
                  <th className="w-24 text-right">Actions</th>
                </tr>
              </thead>
              <tbody>
                {stats.topUsers.map((user) => (
                  <tr key={user.id}>
                    <td>
                      <p className="text-sm font-medium text-ink">{user.name}</p>
                      <p className="text-[11px] text-muted">{user.email}</p>
                    </td>
                    <td className="min-w-[10rem]">
                      <div className="flex items-center gap-2">
                        <ProgressBar value={user.usedBytes} max={user.quotaBytes} size="sm" className="w-24" />
                        <span className="whitespace-nowrap text-[11px] text-muted">
                          {formatBytes(user.usedBytes)} / {formatBytes(user.quotaBytes)}
                        </span>
                      </div>
                    </td>
                    <td className="hidden text-sm text-muted sm:table-cell">{user.fileCount}</td>
                    <td className="text-right">
                      <Link href={`/admin/users/${user.id}`} className="btn-secondary btn-sm">
                        View <ArrowUpRight className="h-3 w-3" />
                      </Link>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

        <div className="grid gap-4 sm:grid-cols-3">
          <div className="card flex items-center gap-3 p-4">
            <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-sky-500/10 text-sky-500">
              <Server className="h-5 w-5" />
            </span>
            <div>
              <p className="text-[11px] uppercase tracking-wide text-muted">Storage driver</p>
              <p className="text-sm font-semibold capitalize text-ink">
                {process.env.STORAGE_DRIVER ?? settings.storage.storageDriver}
              </p>
            </div>
          </div>
          <div className="card flex items-center gap-3 p-4">
            <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-emerald-500/10 text-emerald-500">
              <Download className="h-5 w-5" />
            </span>
            <div>
              <p className="text-[11px] uppercase tracking-wide text-muted">Bandwidth served</p>
              <p className="text-sm font-semibold text-ink">{formatBytes(stats.bandwidthBytes)}</p>
            </div>
          </div>
          <div className="card flex items-center gap-3 p-4">
            <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-violet-500/10 text-violet-500">
              <Link2 className="h-5 w-5" />
            </span>
            <div>
              <p className="text-[11px] uppercase tracking-wide text-muted">Active share links</p>
              <p className="text-sm font-semibold text-ink">{formatNumber(stats.totalShares)}</p>
            </div>
          </div>
        </div>
      </div>
    </>
  );
}
