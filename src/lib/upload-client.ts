'use client';

/**
 * Browser upload engine.
 *
 * Uses XMLHttpRequest (not fetch) because it reports upload progress events and
 * exposes an abort handle — both required by the spec. Each file is uploaded as
 * a raw body stream (application/octet-stream) with metadata in headers, which
 * keeps the server path streaming and avoids multipart buffering.
 */

export type UploadState = 'queued' | 'uploading' | 'processing' | 'done' | 'error' | 'cancelled';

export type UploadItem = {
  id: string;
  file: File;
  name: string;
  size: number;
  type: string;
  progress: number;
  state: UploadState;
  error?: string;
  result?: {
    fileId: string;
    shareToken: string | null;
    name: string;
    size: number;
  };
  /** For resumable uploads */
  uploadedBytes?: number;
  attempts: number;
  startedAt?: number;
  finishedAt?: number;
};

export type UploadResult = NonNullable<UploadItem['result']>;

export function csrfToken(): string {
  const match = document.cookie.match(/(?:^|;\s*)vaultly_csrf=([^;]+)/);
  return match ? decodeURIComponent(match[1]) : '';
}

/** Files above this size use the resumable chunked pipeline instead of one shot. */
export const DIRECT_UPLOAD_LIMIT = 24 * 1024 * 1024;

type ApiEnvelope = {
  ok?: boolean;
  data?: unknown;
  error?: { message?: string };
};

export class UploadController {
  private xhr: XMLHttpRequest | null = null;
  private aborted = false;
  private chunkAbort: AbortController | null = null;

  constructor(
    private readonly item: UploadItem,
    private readonly folderId: string | null,
    private readonly handlers: {
      onProgress: (percent: number) => void;
      onState: (state: UploadState, error?: string) => void;
      onDone: (result: UploadResult) => void;
    },
  ) {}

  start() {
    this.aborted = false;
    this.handlers.onState('uploading');

    if (this.item.file.size > DIRECT_UPLOAD_LIMIT) {
      void this.startResumable();
      return;
    }

    const xhr = new XMLHttpRequest();
    this.xhr = xhr;

    xhr.open('POST', '/api/files/upload', true);
    xhr.setRequestHeader('x-csrf-token', csrfToken());
    xhr.setRequestHeader('content-type', 'application/octet-stream');
    xhr.setRequestHeader('x-file-name', encodeURIComponent(this.item.file.name));
    xhr.setRequestHeader('x-file-type', this.item.file.type || 'application/octet-stream');
    if (this.folderId) xhr.setRequestHeader('x-folder-id', this.folderId);
    xhr.setRequestHeader('content-length', String(this.item.file.size));

    xhr.upload.onprogress = (event) => {
      if (!event.lengthComputable) return;
      const percent = Math.min(99, Math.round((event.loaded / event.total) * 100));
      this.handlers.onProgress(percent);
    };

    xhr.upload.onload = () => {
      // Bytes are with the server; it is now validating + generating previews.
      this.handlers.onProgress(99);
      this.handlers.onState('processing');
    };

    xhr.onerror = () => {
      if (this.aborted) return;
      this.handlers.onState('error', 'Network error — check your connection and retry.');
    };

    xhr.onabort = () => {
      this.handlers.onState('cancelled');
    };

    xhr.onload = () => {
      let payload: { ok?: boolean; data?: { file?: { id: string; name: string; size: number }; shareToken?: string | null }; error?: { message?: string } } = {};
      try {
        payload = JSON.parse(xhr.responseText);
      } catch {
        /* ignore */
      }
      if (xhr.status >= 200 && xhr.status < 300 && payload.ok && payload.data?.file) {
        this.handlers.onProgress(100);
        this.handlers.onDone({
          fileId: payload.data.file.id,
          shareToken: payload.data.shareToken ?? null,
          name: payload.data.file.name,
          size: payload.data.file.size,
        });
        this.handlers.onState('done');
      } else {
        this.handlers.onState('error', payload?.error?.message ?? `Upload failed (${xhr.status}).`);
      }
    };

    xhr.send(this.item.file);
  }

  cancel() {
    this.aborted = true;
    this.chunkAbort?.abort();
    this.chunkAbort = null;
    this.xhr?.abort();
    this.xhr = null;
  }

  /**
   * Resumable pipeline for large files.
   *
   * Opens a session, then uploads 8 MB chunks one at a time. Progress is
   * reported per chunk, and a failed chunk is retried in place (a flaky
   * connection resumes rather than restarting a multi-gigabyte transfer).
   */
  private async startResumable() {
    const file = this.item.file;
    const controller = new AbortController();
    this.chunkAbort = controller;

    const headers = {
      'x-csrf-token': csrfToken(),
      'content-type': 'application/json',
    };

    try {
      const initRes = await fetch('/api/files/upload/chunk', {
        method: 'POST',
        headers,
        signal: controller.signal,
        body: JSON.stringify({
          op: 'init',
          fileName: file.name,
          mimeType: file.type || 'application/octet-stream',
          size: file.size,
          folderId: this.folderId,
        }),
      });
      const init = (await initRes.json()) as ApiEnvelope & {
        data?: { uploadId: string; chunkSize: number; totalChunks: number };
      };
      if (!initRes.ok || !init.data) {
        throw new Error(init.error?.message ?? 'Could not start the upload.');
      }

      const { uploadId, chunkSize, totalChunks } = init.data;
      let sent = 0;

      for (let index = 0; index < totalChunks; index += 1) {
        if (this.aborted) throw new DOMException('Aborted', 'AbortError');

        const start = index * chunkSize;
        const blob = file.slice(start, Math.min(start + chunkSize, file.size));

        let lastError: unknown = null;
        for (let attempt = 1; attempt <= 3; attempt += 1) {
          try {
            const res = await fetch(
              `/api/files/upload/chunk?uploadId=${uploadId}&index=${index}`,
              {
                method: 'PUT',
                headers: { 'x-csrf-token': csrfToken(), 'content-type': 'application/octet-stream' },
                signal: controller.signal,
                body: blob,
              },
            );
            if (!res.ok && res.status !== 409) {
              const payload = (await res.json().catch(() => ({}))) as ApiEnvelope;
              throw new Error(payload.error?.message ?? `Chunk ${index + 1} failed.`);
            }
            lastError = null;
            break;
          } catch (err) {
            if (err instanceof DOMException && err.name === 'AbortError') throw err;
            lastError = err;
            await new Promise((resolve) => setTimeout(resolve, 400 * attempt));
          }
        }
        if (lastError) throw lastError;

        sent += blob.size;
        this.handlers.onProgress(Math.min(98, Math.round((sent / file.size) * 98)));
        this.handlers.onState('uploading');
      }

      this.handlers.onProgress(99);
      this.handlers.onState('processing');

      const doneRes = await fetch('/api/files/upload/complete', {
        method: 'POST',
        headers,
        signal: controller.signal,
        body: JSON.stringify({ uploadId }),
      });
      const done = (await doneRes.json()) as ApiEnvelope & {
        data?: { file?: { id: string; name: string; size: number }; shareToken?: string | null };
      };
      if (!doneRes.ok || !done.data?.file) {
        throw new Error(done.error?.message ?? 'The upload could not be finalised.');
      }

      this.handlers.onProgress(100);
      this.handlers.onDone({
        fileId: done.data.file.id,
        shareToken: done.data.shareToken ?? null,
        name: done.data.file.name,
        size: done.data.file.size,
      });
      this.handlers.onState('done');
    } catch (err) {
      if (this.aborted || (err instanceof DOMException && err.name === 'AbortError')) {
        this.handlers.onState('cancelled');
        return;
      }
      this.handlers.onState('error', err instanceof Error ? err.message : 'Upload failed.');
    }
  }
}

export function isAbortError(error: unknown): boolean {
  return error instanceof DOMException && error.name === 'AbortError';
}

/** Extracts files from a DataTransfer, including dropped folders. */
export async function filesFromDataTransfer(dataTransfer: DataTransfer): Promise<File[]> {
  const items = Array.from(dataTransfer.items ?? []);
  const entries = items
    .map((item) => (item.webkitGetAsEntry ? item.webkitGetAsEntry() : null))
    .filter(Boolean) as FileSystemEntry[];

  if (entries.length === 0) return Array.from(dataTransfer.files ?? []);

  const files: File[] = [];
  const readEntry = async (entry: FileSystemEntry): Promise<void> => {
    if (entry.isFile) {
      const file = await new Promise<File | null>((resolve) => {
        (entry as FileSystemFileEntry).file(resolve, () => resolve(null));
      });
      if (file) files.push(file);
      return;
    }
    if (entry.isDirectory) {
      const reader = (entry as FileSystemDirectoryEntry).createReader();
      const readBatch = (): Promise<FileSystemEntry[]> =>
        new Promise((resolve) => reader.readEntries((result) => resolve(result), () => resolve([])));
      let batch = await readBatch();
      while (batch.length > 0) {
        for (const child of batch) await readEntry(child);
        batch = await readBatch();
      }
    }
  };

  for (const entry of entries) await readEntry(entry);
  return files.length > 0 ? files : Array.from(dataTransfer.files ?? []);
}
