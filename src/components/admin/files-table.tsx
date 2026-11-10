'use client';

import Link from 'next/link';
import { useCallback, useEffect, useState } from 'react';
import { Download, ExternalLink, Loader2, Search, Trash2, RefreshCw } from 'lucide-react';
import { formatBytes, timeAgo } from '@/lib/format';
import { FileTypeIcon } from '@/components/files/file-icon';
import { EmptyState } from '@/components/ui/misc';
import { ConfirmDialog } from '@/components/ui/dialog';
import { useToast } from '@/components/ui/toast';
import { csrfToken } from '@/lib/upload-client';

type AdminFile = {
  id: string;
  name: string;
  category: string;
  mimeType: string;
  size: number;
  visibility: 'PRIVATE' | 'LINK' | 'PUBLIC';
  downloadCount: number;
  viewCount: number;
  createdAt: string;
  ownerId: string;
  ownerName: string;
  ownerEmail: string;
  storageDriver: string;
};

export function AdminFilesTable() {
  const { success, error } = useToast();
  const [files, setFiles] = useState<AdminFile[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [search, setSearch] = useState('');
  const [category, setCategory] = useState('all');
  const [loading, setLoading] = useState(true);
  const [target, setTarget] = useState<AdminFile | null>(null);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    const params = new URLSearchParams({ page: String(page), perPage: '25' });
    if (search.trim()) params.set('search', search.trim());
    if (category !== 'all') params.set('category', category);
    const res = await fetch(`/api/admin/files?${params.toString()}`);
    if (res.ok) {
      const json = await res.json();
      setFiles(json.data.files);
      setTotal(json.data.total);
      setTotalPages(json.data.totalPages);
    }
    setLoading(false);
  }, [page, search, category]);

  useEffect(() => {
    const timer = setTimeout(() => void load(), search ? 300 : 0);
    return () => clearTimeout(timer);
  }, [load, search]);

  const remove = async () => {
    if (!target) return;
    setBusy(true);
    const res = await fetch(`/api/admin/files?id=${target.id}`, {
      method: 'DELETE',
      headers: { 'x-csrf-token': csrfToken() },
    });
    setBusy(false);
    if (res.ok) {
      success('File deleted permanently');
      setTarget(null);
      void load();
    } else {
      error('Could not delete file');
    }
  };

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
            placeholder="Search by file name or owner email…"
            aria-label="Search files"
            className="input pl-9"
          />
        </div>
        <div className="flex items-center gap-2">
          <select
            value={category}
            onChange={(event) => {
              setCategory(event.target.value);
              setPage(1);
            }}
            aria-label="Filter by type"
            className="input w-auto py-2 text-xs"
          >
            <option value="all">All types</option>
            <option value="image">Images</option>
            <option value="video">Videos</option>
            <option value="audio">Audio</option>
            <option value="document">Documents</option>
            <option value="archive">Archives</option>
            <option value="other">Other</option>
          </select>
          <button type="button" className="btn-secondary btn-sm" onClick={() => void load()} disabled={loading}>
            <RefreshCw className={loading ? 'h-3.5 w-3.5 animate-spin' : 'h-3.5 w-3.5'} />
          </button>
        </div>
      </div>

      <p className="text-xs text-muted">{loading ? 'Loading…' : `${total} files`}</p>

      {!loading && files.length === 0 ? (
        <div className="card">
          <EmptyState
            icon={<Search className="h-6 w-6" />}
            title="No files found"
            description="Files uploaded by any user will appear here."
          />
        </div>
      ) : (
        <div className="card overflow-hidden">
          <div className="overflow-x-auto">
            <table className="table-base">
              <thead>
                <tr>
                  <th>File</th>
                  <th className="hidden md:table-cell">Owner</th>
                  <th>Size</th>
                  <th className="hidden lg:table-cell">Access</th>
                  <th className="hidden lg:table-cell">Views</th>
                  <th className="hidden md:table-cell">Uploaded</th>
                  <th className="w-24 text-right">Actions</th>
                </tr>
              </thead>
              <tbody>
                {files.map((file) => (
                  <tr key={file.id}>
                    <td>
                      <div className="flex items-center gap-2.5">
                        <FileTypeIcon category={file.category} extension={file.name.split('.').pop()} size="sm" />
                        <div className="min-w-0">
                          <p className="max-w-[16rem] truncate text-sm font-medium text-ink" title={file.name}>
                            {file.name}
                          </p>
                          <p className="text-[11px] text-muted">{file.mimeType}</p>
                        </div>
                      </div>
                    </td>
                    <td className="hidden md:table-cell">
                      <Link href={`/admin/users/${file.ownerId}`} className="text-sm text-ink hover:text-brand">
                        {file.ownerName}
                      </Link>
                      <p className="text-[11px] text-muted">{file.ownerEmail}</p>
                    </td>
                    <td className="whitespace-nowrap text-sm text-muted">{formatBytes(file.size)}</td>
                    <td className="hidden lg:table-cell">
                      {file.visibility === 'PUBLIC' ? (
                        <span className="badge-green">Public</span>
                      ) : file.visibility === 'LINK' ? (
                        <span className="badge-brand">Link</span>
                      ) : (
                        <span className="badge-neutral">Private</span>
                      )}
                    </td>
                    <td className="hidden text-xs text-muted lg:table-cell">
                      {file.viewCount} / {file.downloadCount} dl
                    </td>
                    <td className="hidden whitespace-nowrap text-xs text-muted md:table-cell">
                      {timeAgo(file.createdAt)}
                    </td>
                    <td>
                      <div className="flex items-center justify-end gap-1">
                        <a
                          href={`/api/files/${file.id}/raw`}
                          target="_blank"
                          rel="noreferrer"
                          className="btn-icon h-8 w-8"
                          title="Open file"
                        >
                          <ExternalLink className="h-3.5 w-3.5" />
                        </a>
                        <a
                          href={`/api/files/${file.id}/raw?download=1`}
                          className="btn-icon h-8 w-8"
                          title="Download"
                        >
                          <Download className="h-3.5 w-3.5" />
                        </a>
                        <button
                          type="button"
                          onClick={() => setTarget(file)}
                          className="btn-icon h-8 w-8 hover:bg-red-500/10 hover:text-red-600"
                          title="Delete permanently"
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {totalPages > 1 ? (
            <div className="flex items-center justify-between border-t border-line px-4 py-3">
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
      )}

      <ConfirmDialog
        open={Boolean(target)}
        onClose={() => setTarget(null)}
        onConfirm={remove}
        busy={busy}
        danger
        title={`Permanently delete “${target?.name ?? ''}”?`}
        description="The file and its thumbnail are removed from storage immediately. Any share links stop working. This cannot be undone."
        confirmLabel="Delete permanently"
      />
    </div>
  );
}
