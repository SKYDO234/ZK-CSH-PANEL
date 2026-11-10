'use client';

import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ArrowDownAZ,
  ArrowUpDown,
  CheckSquare,
  Copy,
  Download,
  Eye,
  FileText,
  Folder as FolderIcon,
  FolderPlus,
  Grid2X2,
  Image as ImageIcon,
  Link2,
  List,
  Loader2,
  Music,
  Package,
  Search,
  Share2,
  Trash2,
  Upload,
  Video,
  X,
} from 'lucide-react';
import type { FileDTO, FolderDTO } from '@/lib/serialize';
import { formatBytes, timeAgo } from '@/lib/format';
import { cn } from '@/lib/cn';
import { EmptyState, Segmented, Spinner } from '@/components/ui/misc';
import { Dialog, ConfirmDialog } from '@/components/ui/dialog';
import { useCopy, useToast } from '@/components/ui/toast';
import { csrfToken } from '@/lib/upload-client';
import { FileTypeIcon } from './file-icon';
import { FileRowActions } from './file-row-actions';
import { ShareDialog } from './share-dialog';
import { UploadDialog } from './upload-dialog';

type SortKey = 'date' | 'name' | 'size' | 'type';
type ViewMode = 'grid' | 'list';

const CATEGORIES = [
  { value: 'all', label: 'All files', icon: FolderIcon },
  { value: 'image', label: 'Images', icon: ImageIcon },
  { value: 'video', label: 'Videos', icon: Video },
  { value: 'audio', label: 'Audio', icon: Music },
  { value: 'document', label: 'Documents', icon: FileText },
  { value: 'archive', label: 'Archives', icon: Package },
];

export function FileBrowser({
  initialFiles,
  initialTotal,
  initialPage,
  initialTotalPages,
  folders,
  currentFolderId,
  maxFileSizeBytes,
  allowedExtensions,
  remainingBytes,
  canUpload,
}: {
  initialFiles: FileDTO[];
  initialTotal: number;
  initialPage: number;
  initialTotalPages: number;
  folders: FolderDTO[];
  currentFolderId: string | null;
  maxFileSizeBytes: number;
  allowedExtensions: string[] | null;
  remainingBytes: number;
  canUpload: boolean;
}) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const copy = useCopy();
  const { success, error } = useToast();

  const [files, setFiles] = useState(initialFiles);
  const [total, setTotal] = useState(initialTotal);
  const [page, setPage] = useState(initialPage);
  const [totalPages, setTotalPages] = useState(initialTotalPages);
  const [loading, setLoading] = useState(false);
  const [search, setSearch] = useState(searchParams.get('search') ?? '');
  const [category, setCategory] = useState(searchParams.get('category') ?? 'all');
  const [sort, setSort] = useState<SortKey>((searchParams.get('sort') as SortKey) ?? 'date');
  const [direction, setDirection] = useState<'asc' | 'desc'>(
    (searchParams.get('direction') as 'asc' | 'desc') ?? 'desc',
  );
  const [view, setView] = useState<ViewMode>('grid');
  const [recentOnly, setRecentOnly] = useState(false);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [selectionMode, setSelectionMode] = useState(false);
  const [newFolderOpen, setNewFolderOpen] = useState(false);
  const [folderName, setFolderName] = useState('');
  const [uploadOpen, setUploadOpen] = useState(false);
  const [shareFile, setShareFile] = useState<FileDTO | null>(null);
  const [deleteTargets, setDeleteTargets] = useState<FileDTO[] | null>(null);
  const [busy, setBusy] = useState(false);
  const [renameFolder, setRenameFolder] = useState<FolderDTO | null>(null);
  const [renameValue, setRenameValue] = useState('');
  const abortRef = useRef<AbortController | null>(null);

  // Persisted view preference
  useEffect(() => {
    const stored = localStorage.getItem('vaultly-view');
    if (stored === 'grid' || stored === 'list') setView(stored);
  }, []);
  const changeView = (next: ViewMode) => {
    setView(next);
    localStorage.setItem('vaultly-view', next);
  };

  const fetchPage = useCallback(
    async (options?: { page?: number; append?: boolean }) => {
      abortRef.current?.abort();
      const controller = new AbortController();
      abortRef.current = controller;
      setLoading(true);
      try {
        const params = new URLSearchParams();
        if (currentFolderId) params.set('folder', currentFolderId);
        if (search.trim()) params.set('search', search.trim());
        if (category !== 'all') params.set('category', category);
        params.set('sort', sort);
        params.set('direction', direction);
        params.set('page', String(options?.page ?? 1));
        params.set('perPage', '48');

        const res = await fetch(`/api/files?${params.toString()}`, { signal: controller.signal });
        if (!res.ok) throw new Error('Failed to load files');
        const json = await res.json();
        const nextFiles: FileDTO[] = json.data.files;
        setFiles(options?.append ? [...files, ...nextFiles] : nextFiles);
        setTotal(json.data.total);
        setPage(json.data.page);
        setTotalPages(json.data.totalPages);
      } catch (err) {
        if ((err as Error).name !== 'AbortError') error('Could not load files');
      } finally {
        setLoading(false);
      }
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [currentFolderId, search, category, sort, direction],
  );

  // Debounced refetch when filters change
  useEffect(() => {
    const timer = setTimeout(() => {
      void fetchPage({ page: 1 });
    }, search ? 320 : 0);
    return () => clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [search, category, sort, direction, currentFolderId]);

  const refresh = () => router.refresh();

  const visibleFiles = useMemo(
    () => (recentOnly ? files.slice(0, 8) : files),
    [files, recentOnly],
  );

  const childFolders = useMemo(
    () => folders.filter((folder) => (folder.parentId ?? null) === currentFolderId),
    [folders, currentFolderId],
  );
  const breadcrumbs = useMemo(() => {
    const chain: FolderDTO[] = [];
    let current: FolderDTO | undefined = folders.find((f) => f.id === currentFolderId);
    const guard = new Set<string>();
    while (current && !guard.has(current.id)) {
      guard.add(current.id);
      chain.unshift(current);
      const parentId = current.parentId;
      current = parentId ? folders.find((f) => f.id === parentId) : undefined;
    }
    return chain;
  }, [folders, currentFolderId]);

  const createFolder = async () => {
    if (!folderName.trim()) return;
    setBusy(true);
    const res = await fetch('/api/folders', {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'x-csrf-token': csrfToken() },
      body: JSON.stringify({ name: folderName.trim(), parentId: currentFolderId }),
    });
    setBusy(false);
    const json = await res.json().catch(() => null);
    if (res.ok) {
      success('Folder created');
      setFolderName('');
      setNewFolderOpen(false);
      refresh();
    } else {
      error('Could not create folder', json?.error?.message);
    }
  };

  const doRenameFolder = async () => {
    if (!renameFolder || !renameValue.trim()) return;
    setBusy(true);
    const res = await fetch('/api/folders', {
      method: 'PATCH',
      headers: { 'content-type': 'application/json', 'x-csrf-token': csrfToken() },
      body: JSON.stringify({ id: renameFolder.id, name: renameValue.trim() }),
    });
    setBusy(false);
    if (res.ok) {
      success('Folder renamed');
      setRenameFolder(null);
      refresh();
    } else {
      error('Could not rename folder');
    }
  };

  const deleteFolder = async (folder: FolderDTO) => {
    const res = await fetch(`/api/folders?id=${folder.id}`, {
      method: 'DELETE',
      headers: { 'x-csrf-token': csrfToken() },
    });
    if (res.ok) {
      success('Folder deleted', 'Its files were moved to trash.');
      refresh();
    } else {
      error('Could not delete folder');
    }
  };

  const toggleSelect = (id: string) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const bulkDelete = async () => {
    if (!deleteTargets) return;
    setBusy(true);
    const results = await Promise.all(
      deleteTargets.map((file) =>
        fetch(`/api/files/${file.id}`, { method: 'DELETE', headers: { 'x-csrf-token': csrfToken() } }),
      ),
    );
    setBusy(false);
    const okCount = results.filter((r) => r.ok).length;
    if (okCount > 0) success(`${okCount} file${okCount === 1 ? '' : 's'} moved to trash`);
    if (okCount < deleteTargets.length) error('Some files could not be deleted');
    setDeleteTargets(null);
    setSelected(new Set());
    void fetchPage({ page });
    refresh();
  };

  const folderPath = currentFolderId ? `?folder=${currentFolderId}` : '';

  return (
    <div className="space-y-4">
      {/* Toolbar */}
      <div className="flex flex-col gap-3">
        <div className="flex flex-wrap items-center gap-2">
          <div className="relative min-w-[12rem] flex-1">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted" />
            <input
              type="search"
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder="Search files by name…"
              aria-label="Search files"
              className="input pl-9 pr-9"
            />
            {loading ? (
              <Loader2 className="absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 animate-spin text-muted" />
            ) : null}
          </div>

          <div className="flex items-center gap-1.5">
            <select
              value={`${sort}:${direction}`}
              onChange={(event) => {
                const [nextSort, nextDirection] = event.target.value.split(':');
                setSort(nextSort as SortKey);
                setDirection(nextDirection as 'asc' | 'desc');
              }}
              aria-label="Sort files"
              className="input w-auto py-2 text-xs"
            >
              <option value="date:desc">Newest first</option>
              <option value="date:asc">Oldest first</option>
              <option value="name:asc">Name A–Z</option>
              <option value="name:desc">Name Z–A</option>
              <option value="size:desc">Largest first</option>
              <option value="size:asc">Smallest first</option>
              <option value="type:asc">Type</option>
            </select>

            <Segmented
              ariaLabel="View mode"
              value={view}
              onChange={changeView}
              options={[
                { value: 'grid', label: <Grid2X2 className="h-3.5 w-3.5" />, title: 'Grid view' },
                { value: 'list', label: <List className="h-3.5 w-3.5" />, title: 'List view' },
              ]}
            />

            <button
              type="button"
              className={cn('btn-secondary btn-sm', selectionMode && 'bg-brand/10 text-brand')}
              onClick={() => {
                setSelectionMode((v) => !v);
                setSelected(new Set());
              }}
            >
              <CheckSquare className="h-3.5 w-3.5" /> Select
            </button>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <div className="no-scrollbar flex flex-1 items-center gap-1 overflow-x-auto">
            {CATEGORIES.map((entry) => (
              <button
                key={entry.value}
                type="button"
                onClick={() => setCategory(entry.value)}
                className={cn(
                  'inline-flex shrink-0 items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-xs font-medium transition',
                  category === entry.value
                    ? 'bg-brand text-white'
                    : 'bg-surface text-muted ring-1 ring-inset ring-line hover:text-ink',
                )}
              >
                <entry.icon className="h-3.5 w-3.5" />
                {entry.label}
              </button>
            ))}
          </div>
          <div className="flex items-center gap-2">
            {canUpload ? (
              <>
                <button type="button" className="btn-secondary btn-sm" onClick={() => setNewFolderOpen(true)}>
                  <FolderPlus className="h-3.5 w-3.5" /> Folder
                </button>
                <button type="button" className="btn-primary btn-sm" onClick={() => setUploadOpen(true)}>
                  <Upload className="h-3.5 w-3.5" /> Upload
                </button>
              </>
            ) : null}
          </div>
        </div>
      </div>

      {/* Breadcrumbs */}
      {currentFolderId ? (
        <nav aria-label="Breadcrumb" className="flex items-center gap-1.5 text-sm">
          <Link href={`/dashboard/files${category !== 'all' ? `?category=${category}` : ''}`} className="text-muted hover:text-brand">
            All files
          </Link>
          {breadcrumbs.map((crumb) => (
            <span key={crumb.id} className="flex items-center gap-1.5">
              <span className="text-muted">/</span>
              <Link href={`/dashboard/files?folder=${crumb.id}`} className="font-medium text-ink hover:text-brand">
                {crumb.name}
              </Link>
            </span>
          ))}
        </nav>
      ) : null}

      {/* Selection bar */}
      {selectionMode && selected.size > 0 ? (
        <div className="flex flex-wrap items-center gap-2 rounded-xl border border-brand/30 bg-brand/[0.04] px-3 py-2">
          <span className="text-xs font-semibold text-ink">{selected.size} selected</span>
          <div className="ml-auto flex flex-wrap items-center gap-1.5">
            <button
              type="button"
              className="btn-secondary btn-sm"
              onClick={() => {
                void copy(
                  files
                    .filter((f) => selected.has(f.id) && f.shareToken)
                    .map((f) => `${window.location.origin}/share/${f.shareToken}`)
                    .join('\n'),
                  'Share links copied',
                );
              }}
            >
              <Link2 className="h-3.5 w-3.5" /> Copy links
            </button>
            <button
              type="button"
              className="btn-danger btn-sm"
              onClick={() => setDeleteTargets(files.filter((f) => selected.has(f.id)))}
            >
              <Trash2 className="h-3.5 w-3.5" /> Delete
            </button>
            <button
              type="button"
              className="btn-ghost btn-sm"
              onClick={() => {
                setSelected(new Set());
                setSelectionMode(false);
              }}
            >
              <X className="h-3.5 w-3.5" /> Cancel
            </button>
          </div>
        </div>
      ) : null}

      {/* Folders */}
      {childFolders.length > 0 ? (
        <section aria-label="Folders">
          <h2 className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted">Folders</h2>
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5">
            {childFolders.map((folder) => (
              <div key={folder.id} className="group card relative p-3.5 transition hover:border-brand/40">
                <Link href={`/dashboard/files?folder=${folder.id}`} className="block">
                  <FolderIcon className="h-8 w-8 text-brand" fill="currentColor" fillOpacity={0.15} />
                  <p className="mt-2 truncate text-sm font-medium text-ink">{folder.name}</p>
                  <p className="text-xs text-muted">{folder.fileCount ?? 0} items</p>
                </Link>
                <div className="absolute right-1.5 top-1.5 flex items-center gap-0.5 opacity-0 transition group-hover:opacity-100">
                  <button
                    type="button"
                    className="rounded-md p-1.5 text-muted hover:bg-canvas hover:text-ink"
                    onClick={() => {
                      setRenameFolder(folder);
                      setRenameValue(folder.name);
                    }}
                    aria-label={`Rename folder ${folder.name}`}
                  >
                    <ArrowDownAZ className="h-3.5 w-3.5" />
                  </button>
                  <button
                    type="button"
                    className="rounded-md p-1.5 text-muted hover:bg-red-500/10 hover:text-red-600"
                    onClick={() => void deleteFolder(folder)}
                    aria-label={`Delete folder ${folder.name}`}
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </button>
                </div>
              </div>
            ))}
          </div>
        </section>
      ) : null}

      {/* Files */}
      {loading && files.length === 0 ? (
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5">
          {Array.from({ length: 8 }).map((_, index) => (
            <div key={index} className="card p-3">
              <div className="skeleton aspect-[4/3] w-full" />
              <div className="mt-3 space-y-2">
                <div className="skeleton h-3 w-3/4" />
                <div className="skeleton h-2.5 w-1/2" />
              </div>
            </div>
          ))}
        </div>
      ) : visibleFiles.length === 0 ? (
        <div className="card">
          <EmptyState
            icon={<Upload className="h-6 w-6" />}
            title={search ? 'No files match your search' : 'Nothing here yet'}
            description={
              search
                ? 'Try a different search term or clear the filters.'
                : 'Upload images, videos, documents or archives. Drag files anywhere on this page or use the upload button.'
            }
            action={
              search ? (
                <button type="button" className="btn-secondary btn-sm" onClick={() => setSearch('')}>
                  Clear search
                </button>
              ) : canUpload ? (
                <button type="button" className="btn-primary btn-sm" onClick={() => setUploadOpen(true)}>
                  <Upload className="h-3.5 w-3.5" /> Upload files
                </button>
              ) : null
            }
          />
        </div>
      ) : view === 'grid' ? (
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5">
          {visibleFiles.map((file) => (
            <FileCard
              key={file.id}
              file={file}
              selected={selected.has(file.id)}
              selectionMode={selectionMode}
              onToggle={() => toggleSelect(file.id)}
              onShare={() => setShareFile(file)}
              onChanged={() => void fetchPage({ page })}
            />
          ))}
        </div>
      ) : (
        <div className="card overflow-hidden">
          <div className="overflow-x-auto">
            <table className="table-base">
              <thead>
                <tr>
                  {selectionMode ? <th className="w-8" /> : null}
                  <th>Name</th>
                  <th className="hidden sm:table-cell">Type</th>
                  <th>Size</th>
                  <th className="hidden md:table-cell">Shared</th>
                  <th className="hidden lg:table-cell">Modified</th>
                  <th className="w-24 text-right">Actions</th>
                </tr>
              </thead>
              <tbody>
                {visibleFiles.map((file) => (
                  <tr key={file.id} className={cn(selected.has(file.id) && 'bg-brand/[0.04]')}>
                    {selectionMode ? (
                      <td>
                        <input
                          type="checkbox"
                          checked={selected.has(file.id)}
                          onChange={() => toggleSelect(file.id)}
                          aria-label={`Select ${file.name}`}
                          className="h-4 w-4 rounded border-line text-brand"
                        />
                      </td>
                    ) : null}
                    <td>
                      <div className="flex items-center gap-2.5">
                        <FileTypeIcon category={file.category} extension={file.extension} size="sm" />
                        <div className="min-w-0">
                          <button
                            type="button"
                            onClick={() => setShareFile(file)}
                            className="block max-w-[16rem] truncate text-left text-sm font-medium text-ink hover:text-brand"
                            title={file.name}
                          >
                            {file.name}
                          </button>
                          <span className="text-[11px] text-muted sm:hidden">{formatBytes(file.size)}</span>
                        </div>
                      </div>
                    </td>
                    <td className="hidden capitalize text-muted sm:table-cell">{file.category}</td>
                    <td className="whitespace-nowrap text-sm text-muted">{formatBytes(file.size)}</td>
                    <td className="hidden md:table-cell">
                      {file.shareToken ? (
                        <span className="badge-green">
                          <Link2 className="h-3 w-3" /> Link
                        </span>
                      ) : (
                        <span className="badge-neutral">Private</span>
                      )}
                    </td>
                    <td className="hidden whitespace-nowrap text-xs text-muted lg:table-cell">
                      {timeAgo(file.createdAt)}
                    </td>
                    <td>
                      <div className="flex items-center justify-end gap-1">
                        <a
                          href={
                            file.shareToken
                              ? `/share/${file.shareToken}`
                              : `/api/files/${file.id}/raw`
                          }
                          target="_blank"
                          rel="noreferrer"
                          className="btn-icon h-8 w-8"
                          title="Preview"
                        >
                          <Eye className="h-3.5 w-3.5" />
                        </a>
                        <FileRowActions file={file} variant="icons" onChanged={() => void fetchPage({ page })} />
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Pagination */}
      {totalPages > 1 ? (
        <div className="flex items-center justify-between gap-3 pt-2">
          <p className="text-xs text-muted">
            Page {page} of {totalPages} · {total} file{total === 1 ? '' : 's'}
          </p>
          <div className="flex items-center gap-2">
            <button
              type="button"
              className="btn-secondary btn-sm"
              disabled={page <= 1 || loading}
              onClick={() => void fetchPage({ page: page - 1 })}
            >
              Previous
            </button>
            <button
              type="button"
              className="btn-secondary btn-sm"
              disabled={page >= totalPages || loading}
              onClick={() => void fetchPage({ page: page + 1 })}
            >
              Next
            </button>
          </div>
        </div>
      ) : null}

      {/* Dialogs */}
      <Dialog
        open={newFolderOpen}
        onClose={() => setNewFolderOpen(false)}
        title="New folder"
        size="sm"
        footer={
          <>
            <button className="btn-secondary" onClick={() => setNewFolderOpen(false)}>
              Cancel
            </button>
            <button className="btn-primary" onClick={() => void createFolder()} disabled={busy || !folderName.trim()}>
              {busy ? 'Creating…' : 'Create folder'}
            </button>
          </>
        }
      >
        <label htmlFor="folder-name" className="label">
          Folder name
        </label>
        <input
          id="folder-name"
          className="input"
          value={folderName}
          onChange={(event) => setFolderName(event.target.value)}
          onKeyDown={(event) => event.key === 'Enter' && void createFolder()}
          placeholder="e.g. Client Work"
        />
      </Dialog>

      <Dialog
        open={Boolean(renameFolder)}
        onClose={() => setRenameFolder(null)}
        title="Rename folder"
        size="sm"
        footer={
          <>
            <button className="btn-secondary" onClick={() => setRenameFolder(null)}>
              Cancel
            </button>
            <button className="btn-primary" onClick={() => void doRenameFolder()} disabled={busy}>
              Save
            </button>
          </>
        }
      >
        <label htmlFor="folder-rename" className="label">
          Folder name
        </label>
        <input
          id="folder-rename"
          className="input"
          value={renameValue}
          onChange={(event) => setRenameValue(event.target.value)}
        />
      </Dialog>

      <ConfirmDialog
        open={Boolean(deleteTargets)}
        onClose={() => setDeleteTargets(null)}
        onConfirm={bulkDelete}
        busy={busy}
        danger
        title={`Move ${deleteTargets?.length ?? 0} file(s) to trash?`}
        description="Share links will stop working immediately. Files can be restored from Trash for 30 days."
        confirmLabel="Move to trash"
      />

      {uploadOpen ? (
        <UploadDialog
          open={uploadOpen}
          onClose={() => {
            setUploadOpen(false);
            void fetchPage({ page: 1 });
            refresh();
          }}
          folderId={currentFolderId}
          maxFileSizeBytes={maxFileSizeBytes}
          allowedExtensions={allowedExtensions}
          remainingBytes={remainingBytes}
        />
      ) : null}

      {shareFile ? (
        <ShareDialog
          file={shareFile}
          open
          onClose={() => setShareFile(null)}
          onChanged={() => void fetchPage({ page })}
        />
      ) : null}

      {folderPath ? <span className="sr-only">Folder view</span> : null}
    </div>
  );
}

function FileCard({
  file,
  selected,
  selectionMode,
  onToggle,
  onShare,
  onChanged,
}: {
  file: FileDTO;
  selected: boolean;
  selectionMode: boolean;
  onToggle: () => void;
  onShare: () => void;
  onChanged: () => void;
}) {
  const isImage = file.category === 'image';
  const isVideo = file.category === 'video';
  const previewHref = file.shareToken ? `/share/${file.shareToken}` : `/api/files/${file.id}/raw`;

  return (
    <div
      className={cn(
        'group card relative overflow-hidden transition',
        selected ? 'ring-2 ring-brand' : 'hover:border-brand/40 hover:shadow-pop',
      )}
    >
      <button
        type="button"
        onClick={selectionMode ? onToggle : undefined}
        className="block w-full text-left"
        aria-label={selectionMode ? `Select ${file.name}` : undefined}
      >
        <div className="relative aspect-[4/3] overflow-hidden bg-canvas">
          {isImage && file.hasThumbnail ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={`/api/files/${file.id}/thumbnail`}
              alt={file.name}
              loading="lazy"
              className="h-full w-full object-cover transition duration-300 group-hover:scale-[1.03]"
            />
          ) : isVideo ? (
            <div
              className="flex h-full w-full flex-col items-center justify-center bg-gradient-to-br from-rose-500/10 to-slate-500/5 text-rose-500/70"
            >
              <Video className="h-8 w-8" />
              <span className="mt-1 text-[10px] font-medium uppercase tracking-wide">Video</span>
            </div>
          ) : (
            <div className="flex h-full w-full items-center justify-center">
              <FileTypeIcon category={file.category} extension={file.extension} size="lg" />
            </div>
          )}

          <div className="absolute inset-0 flex items-center justify-center gap-1.5 bg-slate-950/45 opacity-0 backdrop-blur-[1px] transition group-hover:opacity-100">
            <a
              href={previewHref}
              target="_blank"
              rel="noreferrer"
              className="rounded-lg bg-white/95 p-2 text-slate-800 shadow-sm transition hover:bg-white"
              aria-label={`Preview ${file.name}`}
              title="Preview"
            >
              <Eye className="h-4 w-4" />
            </a>
            <button
              type="button"
              onClick={onShare}
              className="rounded-lg bg-white/95 p-2 text-slate-800 shadow-sm transition hover:bg-white"
              aria-label={`Share ${file.name}`}
              title="Share & embed"
            >
              <Share2 className="h-4 w-4" />
            </button>
            <a
              href={file.shareToken ? `/api/media/${file.shareToken}?download=1` : `/api/files/${file.id}/raw?download=1`}
              className="rounded-lg bg-white/95 p-2 text-slate-800 shadow-sm transition hover:bg-white"
              aria-label={`Download ${file.name}`}
              title="Download"
            >
              <Download className="h-4 w-4" />
            </a>
          </div>

          {selectionMode ? (
            <input
              type="checkbox"
              checked={selected}
              onChange={onToggle}
              onClick={(event) => event.stopPropagation()}
              aria-label={`Select ${file.name}`}
              className="absolute left-2 top-2 h-4 w-4 rounded border-white/70 text-brand shadow"
            />
          ) : null}

          {file.shareToken ? (
            <span className="absolute right-2 top-2 rounded-full bg-white/90 px-1.5 py-0.5 text-[10px] font-semibold text-emerald-700 shadow-sm">
              Shared
            </span>
          ) : null}
        </div>

        <div className="p-3">
          <p className="truncate text-sm font-medium text-ink" title={file.name}>
            {file.name}
          </p>
          <p className="mt-0.5 text-xs text-muted">
            {formatBytes(file.size)} · {timeAgo(file.createdAt)}
          </p>
        </div>
      </button>

      <div className="absolute bottom-2.5 right-2">
        <FileRowActions file={file} variant="icons" onChanged={onChanged} />
      </div>
    </div>
  );
}
