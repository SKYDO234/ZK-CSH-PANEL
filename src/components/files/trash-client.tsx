'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { RotateCcw, Trash2, Flame, Loader2 } from 'lucide-react';
import type { FileDTO } from '@/lib/serialize';
import { formatBytes, timeAgo } from '@/lib/format';
import { EmptyState } from '@/components/ui/misc';
import { ConfirmDialog } from '@/components/ui/dialog';
import { useToast } from '@/components/ui/toast';
import { csrfToken } from '@/lib/upload-client';
import { FileTypeIcon } from './file-icon';

export function TrashClient({
  initialFiles,
  retentionDays,
}: {
  initialFiles: FileDTO[];
  retentionDays: number;
}) {
  const router = useRouter();
  const { success, error } = useToast();
  const [files, setFiles] = useState(initialFiles);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [busy, setBusy] = useState<string | null>(null);
  const [confirmEmpty, setConfirmEmpty] = useState(false);
  const [confirmPurge, setConfirmPurge] = useState(false);

  const call = async (action: 'restore' | 'purge' | 'empty', ids?: string[]) => {
    const res = await fetch('/api/trash', {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'x-csrf-token': csrfToken() },
      body: JSON.stringify({ action, ids }),
    });
    const json = await res.json().catch(() => null);
    if (!res.ok) throw new Error(json?.error?.message ?? 'Action failed');
    return json.data as { restored?: number; purged?: number };
  };

  const restore = async (ids?: string[]) => {
    setBusy('restore');
    try {
      const data = await call('restore', ids ?? Array.from(selected));
      success(
        `${data.restored ?? 0} file(s) restored`,
        data.restored === 0 ? 'Your storage quota may be full.' : undefined,
      );
      setSelected(new Set());
      router.refresh();
      setFiles((prev) => prev.filter((f) => !(ids ?? Array.from(selected)).includes(f.id)));
    } catch (err) {
      error('Could not restore files', (err as Error).message);
    } finally {
      setBusy(null);
    }
  };

  const purge = async () => {
    setBusy('purge');
    try {
      const data = await call('purge', Array.from(selected));
      success(`${data.purged ?? 0} file(s) permanently deleted`);
      setSelected(new Set());
      setConfirmPurge(false);
      router.refresh();
    } catch (err) {
      error('Could not delete files', (err as Error).message);
    } finally {
      setBusy(null);
    }
  };

  const empty = async () => {
    setBusy('empty');
    try {
      const data = await call('empty');
      success(`Trash emptied (${data.purged ?? 0} files)`);
      setFiles([]);
      setConfirmEmpty(false);
      router.refresh();
    } catch (err) {
      error('Could not empty trash', (err as Error).message);
    } finally {
      setBusy(null);
    }
  };

  const toggle = (id: string) =>
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });

  if (files.length === 0) {
    return (
      <div className="card">
        <EmptyState
          icon={<Trash2 className="h-6 w-6" />}
          title="Trash is empty"
          description={`Deleted files appear here for ${retentionDays} days before being removed permanently.`}
        />
      </div>
    );
  }

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-2">
        <button
          type="button"
          className="btn-secondary btn-sm"
          disabled={selected.size === 0 || busy !== null}
          onClick={() => void restore()}
        >
          {busy === 'restore' ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <RotateCcw className="h-3.5 w-3.5" />}
          Restore {selected.size > 0 ? `(${selected.size})` : ''}
        </button>
        <button
          type="button"
          className="btn-secondary btn-sm text-red-600"
          disabled={selected.size === 0 || busy !== null}
          onClick={() => setConfirmPurge(true)}
        >
          <Trash2 className="h-3.5 w-3.5" /> Delete permanently
        </button>
        <button
          type="button"
          className="btn-ghost btn-sm ml-auto text-red-600"
          onClick={() => setConfirmEmpty(true)}
          disabled={busy !== null}
        >
          <Flame className="h-3.5 w-3.5" /> Empty trash
        </button>
      </div>

      <div className="card overflow-hidden">
        <div className="overflow-x-auto">
          <table className="table-base">
            <thead>
              <tr>
                <th className="w-8">
                  <input
                    type="checkbox"
                    aria-label="Select all"
                    checked={selected.size === files.length && files.length > 0}
                    onChange={(event) =>
                      setSelected(event.target.checked ? new Set(files.map((f) => f.id)) : new Set())
                    }
                    className="h-4 w-4 rounded border-line text-brand"
                  />
                </th>
                <th>File</th>
                <th className="hidden sm:table-cell">Size</th>
                <th>Deleted</th>
              </tr>
            </thead>
            <tbody>
              {files.map((file) => (
                <tr key={file.id}>
                  <td>
                    <input
                      type="checkbox"
                      checked={selected.has(file.id)}
                      onChange={() => toggle(file.id)}
                      aria-label={`Select ${file.name}`}
                      className="h-4 w-4 rounded border-line text-brand"
                    />
                  </td>
                  <td>
                    <div className="flex items-center gap-2.5">
                      <FileTypeIcon category={file.category} extension={file.extension} size="sm" />
                      <span className="max-w-[18rem] truncate text-sm font-medium text-ink">{file.name}</span>
                    </div>
                  </td>
                  <td className="hidden whitespace-nowrap text-sm text-muted sm:table-cell">
                    {formatBytes(file.size)}
                  </td>
                  <td className="whitespace-nowrap text-xs text-muted">{timeAgo(file.deletedAt)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      <ConfirmDialog
        open={confirmEmpty}
        onClose={() => setConfirmEmpty(false)}
        onConfirm={empty}
        busy={busy === 'empty'}
        danger
        title="Empty the trash?"
        description="Every file in the trash will be permanently deleted from storage. This cannot be undone."
        confirmLabel="Delete everything"
      />
      <ConfirmDialog
        open={confirmPurge}
        onClose={() => setConfirmPurge(false)}
        onConfirm={purge}
        busy={busy === 'purge'}
        danger
        title={`Permanently delete ${selected.size} file(s)?`}
        description="These files will be removed from storage immediately. This cannot be undone."
        confirmLabel="Delete permanently"
      />
    </div>
  );
}
