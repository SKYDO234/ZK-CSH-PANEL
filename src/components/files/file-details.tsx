'use client';

import { Dialog } from '@/components/ui/dialog';
import type { FileDTO } from '@/lib/serialize';
import { formatBytes, formatDateTime, formatDuration } from '@/lib/format';
import { FileTypeIcon } from './file-icon';

export function FileDetailsDialog({
  file,
  open,
  onClose,
}: {
  file: FileDTO;
  open: boolean;
  onClose: () => void;
}) {
  const metadata = (file.metadata ?? {}) as {
    width?: number;
    height?: number;
    duration?: number;
    format?: string;
  };

  const rows: Array<[string, React.ReactNode]> = [
    ['File name', file.name],
    ['Type', `${file.mimeType}${file.extension ? ` (.${file.extension})` : ''}`],
    ['Category', <span key="c" className="capitalize">{file.category}</span>],
    ['Size', formatBytes(file.size)],
    ['Uploaded', formatDateTime(file.createdAt)],
    ['Last modified', formatDateTime(file.updatedAt)],
    ['Visibility', <span key="v" className="capitalize">{file.visibility.toLowerCase()}</span>],
    ['Downloads', String(file.downloadCount)],
    ['Views', String(file.viewCount)],
  ];

  if (metadata.width && metadata.height) {
    rows.splice(2, 0, ['Dimensions', `${metadata.width} × ${metadata.height}px`]);
  }
  if (metadata.duration) {
    rows.splice(2, 0, ['Duration', formatDuration(metadata.duration)]);
  }
  if (file.shareExpiresAt) {
    rows.push(['Link expires', formatDateTime(file.shareExpiresAt)]);
  }
  if (file.shareMaxDownloads) {
    rows.push(['Download limit', `${file.shareDownloadCount} / ${file.shareMaxDownloads}`]);
  }

  return (
    <Dialog open={open} onClose={onClose} title="File information" size="md">
      <div className="mb-4 flex items-center gap-3 rounded-xl bg-canvas px-4 py-3">
        <FileTypeIcon category={file.category} extension={file.extension} />
        <div className="min-w-0">
          <p className="truncate text-sm font-semibold text-ink">{file.name}</p>
          <p className="text-xs text-muted">{formatBytes(file.size)}</p>
        </div>
      </div>
      <dl className="divide-y divide-line text-sm">
        {rows.map(([label, value]) => (
          <div key={label} className="flex items-start justify-between gap-4 py-2.5">
            <dt className="text-muted">{label}</dt>
            <dd className="max-w-[65%] break-words text-right font-medium text-ink">{value}</dd>
          </div>
        ))}
      </dl>
      {file.category === 'image' && file.hasThumbnail ? (
        <div className="mt-4">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={`/api/files/${file.id}/thumbnail`}
            alt={`${file.name} preview`}
            className="max-h-64 w-full rounded-xl object-contain ring-1 ring-line"
          />
        </div>
      ) : null}
      <p className="mt-4 text-[11px] text-muted">
        File ID: <span className="font-mono">{file.id}</span>
      </p>
    </Dialog>
  );
}
