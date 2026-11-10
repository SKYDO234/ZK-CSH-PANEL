'use client';

import { useCallback, useEffect, useState } from 'react';
import {
  AlertTriangle,
  Download,
  FileUp,
  KeyRound,
  Link2,
  LogIn,
  RefreshCw,
  Search,
  Settings,
  ShieldCheck,
  Trash2,
  UserCog,
} from 'lucide-react';
import { formatDateTime, timeAgo } from '@/lib/format';
import { EmptyState } from '@/components/ui/misc';
import { cn } from '@/lib/cn';

type Entry = {
  id: string;
  action: string;
  message: string;
  targetType: string | null;
  targetId: string | null;
  metadata: Record<string, unknown> | null;
  ip: string | null;
  createdAt: string;
  actorId: string | null;
  actorName: string | null;
  actorEmail: string | null;
};

const ACTION_GROUPS: Array<{ value: string; label: string }> = [
  { value: 'all', label: 'All activity' },
  { value: 'LOGIN', label: 'Sign-ins' },
  { value: 'UPLOAD', label: 'Uploads' },
  { value: 'DOWNLOAD', label: 'Downloads' },
  { value: 'DELETE', label: 'Deletions' },
  { value: 'SHARE_CREATE', label: 'Shares created' },
  { value: 'SETTINGS_UPDATE', label: 'Settings' },
  { value: 'USER_CREATE', label: 'User created' },
  { value: 'QUOTA_CHANGE', label: 'Quota changes' },
  { value: 'LOGIN_FAILED', label: 'Failed logins' },
];

function iconFor(action: string) {
  if (action.startsWith('LOGIN_FAILED')) return { icon: AlertTriangle, tone: 'text-red-500 bg-red-500/10' };
  if (action.startsWith('LOGIN')) return { icon: LogIn, tone: 'text-emerald-500 bg-emerald-500/10' };
  if (action === 'UPLOAD') return { icon: FileUp, tone: 'text-violet-500 bg-violet-500/10' };
  if (action === 'DOWNLOAD') return { icon: Download, tone: 'text-sky-500 bg-sky-500/10' };
  if (action.startsWith('DELETE') || action === 'FOLDER_DELETE') return { icon: Trash2, tone: 'text-red-500 bg-red-500/10' };
  if (action.startsWith('SHARE')) return { icon: Link2, tone: 'text-teal-500 bg-teal-500/10' };
  if (action.startsWith('SETTINGS')) return { icon: Settings, tone: 'text-amber-500 bg-amber-500/10' };
  if (action.startsWith('USER') || action === 'QUOTA_CHANGE') return { icon: UserCog, tone: 'text-brand bg-brand/10' };
  if (action.startsWith('PASSWORD') || action.startsWith('API_KEY')) return { icon: KeyRound, tone: 'text-slate-500 bg-slate-500/10' };
  return { icon: ShieldCheck, tone: 'text-muted bg-canvas' };
}

export function ActivityLog() {
  const [entries, setEntries] = useState<Entry[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [search, setSearch] = useState('');
  const [action, setAction] = useState('all');
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    const params = new URLSearchParams({ page: String(page), perPage: '40' });
    if (search.trim()) params.set('search', search.trim());
    if (action !== 'all') params.set('action', action);
    const res = await fetch(`/api/admin/activity?${params.toString()}`);
    if (res.ok) {
      const json = await res.json();
      setEntries(json.data.entries);
      setTotal(json.data.total);
      setTotalPages(json.data.totalPages);
    }
    setLoading(false);
  }, [page, search, action]);

  useEffect(() => {
    const timer = setTimeout(() => void load(), search ? 300 : 0);
    return () => clearTimeout(timer);
  }, [load, search]);

  return (
    <div className="space-y-4">
      <div className="flex flex-col gap-2 sm:flex-row">
        <div className="relative flex-1">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted" />
          <input
            type="search"
            value={search}
            onChange={(event) => {
              setSearch(event.target.value);
              setPage(1);
            }}
            placeholder="Search messages, users and emails…"
            aria-label="Search activity"
            className="input pl-9"
          />
        </div>
        <div className="flex items-center gap-2">
          <select
            value={action}
            onChange={(event) => {
              setAction(event.target.value);
              setPage(1);
            }}
            aria-label="Filter by action"
            className="input w-auto py-2 text-xs"
          >
            {ACTION_GROUPS.map((group) => (
              <option key={group.value} value={group.value}>
                {group.label}
              </option>
            ))}
          </select>
          <button type="button" className="btn-secondary btn-sm" onClick={() => void load()} disabled={loading}>
            <RefreshCw className={cn('h-3.5 w-3.5', loading && 'animate-spin')} /> Refresh
          </button>
        </div>
      </div>

      <p className="text-xs text-muted">{loading ? 'Loading…' : `${total} entries`}</p>

      {entries.length === 0 && !loading ? (
        <div className="card">
          <EmptyState
            icon={<ShieldCheck className="h-6 w-6" />}
            title="No activity found"
            description="Actions across the platform will appear here as users upload, share and sign in."
          />
        </div>
      ) : (
        <div className="card divide-y divide-line">
          {entries.map((entry) => {
            const { icon: Icon, tone } = iconFor(entry.action);
            return (
              <div key={entry.id} className="flex items-start gap-3 px-4 py-3">
                <span className={cn('mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-lg', tone)}>
                  <Icon className="h-4 w-4" />
                </span>
                <div className="min-w-0 flex-1">
                  <p className="text-[13px] text-ink">{entry.message}</p>
                  <p className="mt-0.5 flex flex-wrap items-center gap-x-2 text-[11px] text-muted">
                    <span className="font-medium">{entry.actorName ?? 'System'}</span>
                    {entry.actorEmail ? <span className="truncate">({entry.actorEmail})</span> : null}
                    <span>·</span>
                    <span title={formatDateTime(entry.createdAt)}>{timeAgo(entry.createdAt)}</span>
                    {entry.ip ? (
                      <>
                        <span>·</span>
                        <span className="font-mono">{entry.ip}</span>
                      </>
                    ) : null}
                  </p>
                </div>
                <span className="shrink-0 rounded-md bg-canvas px-1.5 py-0.5 font-mono text-[10px] text-muted">
                  {entry.action}
                </span>
              </div>
            );
          })}
        </div>
      )}

      {totalPages > 1 ? (
        <div className="flex items-center justify-between">
          <p className="text-xs text-muted">
            Page {page} of {totalPages}
          </p>
          <div className="flex gap-2">
            <button
              type="button"
              className="btn-secondary btn-sm"
              disabled={page <= 1 || loading}
              onClick={() => setPage((p) => p - 1)}
            >
              Previous
            </button>
            <button
              type="button"
              className="btn-secondary btn-sm"
              disabled={page >= totalPages || loading}
              onClick={() => setPage((p) => p + 1)}
            >
              Next
            </button>
          </div>
        </div>
      ) : null}
    </div>
  );
}
