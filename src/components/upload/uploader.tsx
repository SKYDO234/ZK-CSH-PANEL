'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  AlertCircle,
  CheckCircle2,
  CloudUpload,

  File as FileIcon,
  Link2,
  Loader2,
  Pause,
  Play,
  Plus,
  RotateCcw,
  Trash2,
  X,
} from 'lucide-react';
import { cn } from '@/lib/cn';
import { formatBytes } from '@/lib/format';
import { useToast } from '@/components/ui/toast';
import { ProgressBar } from '@/components/ui/misc';
import {
  UploadController,
  filesFromDataTransfer,
  type UploadItem,
  type UploadResult,
  type UploadState,
} from '@/lib/upload-client';
import { useRouter } from 'next/navigation';

type Props = {
  folderId: string | null;
  maxFileSizeBytes: number;
  allowedExtensions: string[] | null;
  remainingBytes: number;
  onUploaded?: (result: UploadResult) => void;
  compact?: boolean;
};

let idCounter = 0;

export function Uploader({
  folderId,
  maxFileSizeBytes,
  allowedExtensions,
  remainingBytes,
  onUploaded,
  compact = false,
}: Props) {
  const router = useRouter();
  const { success, error: errorToast, info } = useToast();
  const [items, setItems] = useState<UploadItem[]>([]);
  const [dragging, setDragging] = useState(false);
  const [queueRunning, setQueueRunning] = useState(false);
  const controllers = useRef<Map<string, UploadController>>(new Map());
  const inputRef = useRef<HTMLInputElement>(null);
  const dragCounter = useRef(0);
  const pendingQuota = useRef(remainingBytes);

  useEffect(() => {
    pendingQuota.current = remainingBytes;
  }, [remainingBytes]);

  const validate = useCallback(
    (file: File): string | null => {
      if (file.size === 0) return 'File is empty.';
      if (file.size > maxFileSizeBytes) {
        return `Larger than the ${formatBytes(maxFileSizeBytes)} limit.`;
      }
      const ext = file.name.split('.').pop()?.toLowerCase() ?? '';
      if (allowedExtensions && !allowedExtensions.includes(ext)) {
        return `.${ext} files are not allowed on this platform.`;
      }
      return null;
    },
    [maxFileSizeBytes, allowedExtensions],
  );

  const updateItem = useCallback((id: string, patch: Partial<UploadItem>) => {
    setItems((prev) => prev.map((item) => (item.id === id ? { ...item, ...patch } : item)));
  }, []);

  const startItem = useCallback(
    (item: UploadItem) => {
      const controller = new UploadController(item, folderId, {
        onProgress: (percent) => updateItem(item.id, { progress: percent }),
        onState: (state: UploadState, error?: string) => updateItem(item.id, { state, error }),
        onDone: (result) => {
          pendingQuota.current -= result.size;
          updateItem(item.id, {
            result,
            finishedAt: Date.now(),
            uploadedBytes: result.size,
          });
          onUploaded?.(result);
          success(
            'Upload complete',
            result.shareToken ? 'A share link has been created automatically.' : undefined,
          );
          router.refresh();
        },
      });
      controllers.current.set(item.id, controller);
      controller.start();
    },
    [folderId, onUploaded, router, success, updateItem],
  );

  const addFiles = useCallback(
    (fileList: File[]) => {
      const accepted: UploadItem[] = [];
      const rejected: string[] = [];
      let queuedBytes = items
        .filter((i) => i.state === 'queued' || i.state === 'uploading')
        .reduce((sum, i) => sum + i.size, 0);

      for (const file of fileList) {
        const validationError = validate(file);
        if (validationError) {
          rejected.push(`${file.name}: ${validationError}`);
          continue;
        }
        if (queuedBytes + file.size > pendingQuota.current) {
          rejected.push(`${file.name}: not enough storage remaining.`);
          continue;
        }
        queuedBytes += file.size;
        accepted.push({
          id: `u${Date.now()}-${idCounter++}`,
          file,
          name: file.name,
          size: file.size,
          type: file.type,
          progress: 0,
          state: 'queued',
          attempts: 0,
        });
      }

      if (rejected.length > 0) {
        errorToast('Some files were skipped', rejected.slice(0, 3).join(' · '));
      }
      if (accepted.length === 0) return;

      setItems((prev) => [...prev, ...accepted]);
      // Start immediately (max 3 concurrent transfers keeps browsers responsive).
      const running = items.filter((i) => i.state === 'uploading' || i.state === 'processing').length;
      const slots = Math.max(0, 3 - running);
      accepted.slice(0, slots).forEach((item) => startItem(item));
      if (accepted.length > slots) info('Added to queue', `${accepted.length - slots} file(s) waiting.`);
    },
    [items, validate, errorToast, info, startItem],
  );

  const startQueue = useCallback(() => {
    setQueueRunning(true);
    let active = items.filter((i) => i.state === 'uploading' || i.state === 'processing').length;
    const queued = items.filter((i) => i.state === 'queued');
    for (const item of queued) {
      if (active >= 3) break;
      startItem(item);
      active += 1;
    }
    setQueueRunning(false);
  }, [items, startItem]);

  // Keep the pipeline full as transfers finish.
  useEffect(() => {
    const active = items.filter((i) => i.state === 'uploading' || i.state === 'processing').length;
    const queued = items.filter((i) => i.state === 'queued');
    if (active < 3 && queued.length > 0) {
      queued.slice(0, 3 - active).forEach((item) => startItem(item));
    }
  }, [items, startItem]);

  const cancelItem = (id: string) => {
    controllers.current.get(id)?.cancel();
    controllers.current.delete(id);
    updateItem(id, { state: 'cancelled' });
  };

  const retryItem = (id: string) => {
    const item = items.find((i) => i.id === id);
    if (!item) return;
    updateItem(id, { state: 'queued', progress: 0, error: undefined, attempts: item.attempts + 1 });
    setTimeout(() => startItem({ ...item, attempts: item.attempts + 1 }), 50);
  };

  const removeItem = (id: string) => {
    controllers.current.get(id)?.cancel();
    controllers.current.delete(id);
    setItems((prev) => prev.filter((item) => item.id !== id));
  };

  const onDrop = async (event: React.DragEvent) => {
    event.preventDefault();
    dragCounter.current = 0;
    setDragging(false);
    const files = await filesFromDataTransfer(event.dataTransfer);
    addFiles(files);
  };

  const totals = useMemo(() => {
    const done = items.filter((i) => i.state === 'done');
    return {
      count: items.length,
      done: done.length,
      doneBytes: done.reduce((sum, i) => sum + i.size, 0),
      active: items.filter((i) => i.state === 'uploading' || i.state === 'processing').length,
      failed: items.filter((i) => i.state === 'error').length,
    };
  }, [items]);

  return (
    <div className="space-y-4">
      {/* Drop zone */}
      <div
        onDragEnter={(event) => {
          event.preventDefault();
          dragCounter.current += 1;
          setDragging(true);
        }}
        onDragOver={(event) => event.preventDefault()}
        onDragLeave={(event) => {
          event.preventDefault();
          dragCounter.current -= 1;
          if (dragCounter.current <= 0) setDragging(false);
        }}
        onDrop={onDrop}
        onClick={() => inputRef.current?.click()}
        onKeyDown={(event) => {
          if (event.key === 'Enter' || event.key === ' ') inputRef.current?.click();
        }}
        role="button"
        tabIndex={0}
        aria-label="Choose files to upload, or drag and drop them here"
        className={cn(
          'group relative flex cursor-pointer flex-col items-center justify-center rounded-2xl border-2 border-dashed p-8 text-center transition',
          dragging
            ? 'border-brand bg-brand/[0.06] ring-4 ring-brand/10'
            : 'border-line bg-surface hover:border-brand/50 hover:bg-brand/[0.02]',
          compact && 'p-5',
        )}
      >
        <input
          ref={inputRef}
          type="file"
          multiple
          className="sr-only"
          onChange={(event) => {
            addFiles(Array.from(event.target.files ?? []));
            event.target.value = '';
          }}
        />
        <div
          className={cn(
            'mb-3 flex h-12 w-12 items-center justify-center rounded-2xl bg-brand/10 text-brand transition',
            dragging ? 'scale-110' : 'group-hover:scale-105',
          )}
        >
          <CloudUpload className="h-6 w-6" />
        </div>
        <p className="text-sm font-semibold text-ink">
          {dragging ? 'Drop files to upload' : compact ? 'Drop files or click to browse' : 'Drag & drop files here'}
        </p>
        <p className="mt-1 text-xs text-muted">
          Up to {formatBytes(maxFileSizeBytes)} per file · {formatBytes(remainingBytes)} storage remaining
        </p>
        <span className="btn-secondary btn-sm mt-4">
          <Plus className="h-3.5 w-3.5" /> Browse files
        </span>
      </div>

      {/* Queue */}
      {items.length > 0 ? (
        <div className="card overflow-hidden">
          <div className="flex flex-wrap items-center justify-between gap-2 border-b border-line px-4 py-3">
            <div className="text-sm">
              <span className="font-semibold text-ink">
                {totals.done}/{totals.count} uploaded
              </span>
              <span className="ml-2 text-xs text-muted">
                {formatBytes(totals.doneBytes)}
                {totals.active > 0 ? ` · ${totals.active} in progress` : ''}
                {totals.failed > 0 ? ` · ${totals.failed} failed` : ''}
              </span>
            </div>
            <div className="flex items-center gap-2">
              {items.some((i) => i.state === 'queued') ? (
                <button type="button" className="btn-secondary btn-sm" onClick={startQueue} disabled={queueRunning}>
                  <Play className="h-3.5 w-3.5" /> Start queue
                </button>
              ) : null}
              <button
                type="button"
                className="btn-ghost btn-sm"
                onClick={() => {
                  items.forEach((i) => controllers.current.get(i.id)?.cancel());
                  controllers.current.clear();
                  setItems([]);
                }}
              >
                <Trash2 className="h-3.5 w-3.5" /> Clear
              </button>
            </div>
          </div>

          <ul className="divide-y divide-line">
            {items.map((item) => (
              <li key={item.id} className="flex items-center gap-3 px-4 py-3">
                <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-canvas text-muted">
                  <FileIcon className="h-4 w-4" />
                </span>
                <div className="min-w-0 flex-1">
                  <div className="flex items-center justify-between gap-2">
                    <p className="truncate text-sm font-medium text-ink" title={item.name}>
                      {item.name}
                    </p>
                    <span
                      className={cn(
                        'shrink-0 text-xs font-medium',
                        item.state === 'error' ? 'text-red-600 dark:text-red-400' : 'text-muted',
                      )}
                    >
                      {item.state === 'done'
                        ? 'Complete'
                        : item.state === 'error'
                          ? 'Failed'
                          : item.state === 'cancelled'
                            ? 'Cancelled'
                            : `${item.progress}%`}
                    </span>
                  </div>
                  <div className="mt-1.5 flex items-center gap-2">
                    {item.state === 'uploading' || item.state === 'processing' ? (
                      <ProgressBar value={item.progress} max={100} size="sm" className="flex-1" />
                    ) : item.state === 'done' ? (
                      <p className="text-xs text-muted">
                        {formatBytes(item.size)} ·{' '}
                        <span className="text-emerald-600 dark:text-emerald-400">Uploaded</span>
                      </p>
                    ) : item.state === 'error' ? (
                      <p className="truncate text-xs text-red-600 dark:text-red-400">{item.error}</p>
                    ) : (
                      <p className="text-xs text-muted">{formatBytes(item.size)}</p>
                    )}
                  </div>
                </div>

                <div className="flex shrink-0 items-center gap-1">
                  {item.state === 'uploading' || item.state === 'processing' ? (
                    <button
                      type="button"
                      onClick={() => cancelItem(item.id)}
                      className="btn-icon h-8 w-8"
                      aria-label={`Cancel ${item.name}`}
                      title="Cancel upload"
                    >
                      <Pause className="h-3.5 w-3.5" />
                    </button>
                  ) : null}
                  {(item.state === 'error' || item.state === 'cancelled') && item.attempts < 3 ? (
                    <button
                      type="button"
                      onClick={() => retryItem(item.id)}
                      className="btn-icon h-8 w-8"
                      aria-label={`Retry ${item.name}`}
                      title="Retry upload"
                    >
                      <RotateCcw className="h-3.5 w-3.5" />
                    </button>
                  ) : null}
                  {item.state === 'done' && item.result?.shareToken ? (
                    <a
                      href={`/share/${item.result.shareToken}`}
                      target="_blank"
                      rel="noreferrer"
                      className="btn-icon h-8 w-8"
                      title="Open share link"
                    >
                      <Link2 className="h-3.5 w-3.5" />
                    </a>
                  ) : null}
                  {item.state === 'done' ? (
                    <CheckCircle2 className="h-4 w-4 text-emerald-500" />
                  ) : item.state === 'error' ? (
                    <AlertCircle className="h-4 w-4 text-red-500" />
                  ) : null}
                  {item.state === 'done' || item.state === 'error' || item.state === 'cancelled' ? (
                    <button
                      type="button"
                      onClick={() => removeItem(item.id)}
                      className="btn-icon h-8 w-8"
                      aria-label={`Remove ${item.name} from list`}
                    >
                      <X className="h-3.5 w-3.5" />
                    </button>
                  ) : null}
                </div>
              </li>
            ))}
          </ul>
        </div>
      ) : null}
    </div>
  );
}

export function InlineSpinner() {
  return <Loader2 className="h-4 w-4 animate-spin" />;
}


