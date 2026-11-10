'use client';

import { useMemo, useState } from 'react';
import Link from 'next/link';
import { Download, Eye, ImageOff, Link2, Play } from 'lucide-react';
import type { FileDTO } from '@/lib/serialize';
import { formatBytes, formatDuration, timeAgo } from '@/lib/format';
import { EmptyState } from '@/components/ui/misc';
import { FileRowActions } from './file-row-actions';
import { ShareDialog } from './share-dialog';
import { useCopy } from '@/components/ui/toast';

/** Masonry-style gallery used by the Images and Videos sections. */
export function CategoryGallery({
  files,
  kind,
  emptyAction,
}: {
  files: FileDTO[];
  kind: 'image' | 'video';
  emptyAction?: React.ReactNode;
}) {
  const [shareFile, setShareFile] = useState<FileDTO | null>(null);
  const copy = useCopy();

  const totals = useMemo(
    () => ({ count: files.length, bytes: files.reduce((sum, f) => sum + f.size, 0) }),
    [files],
  );

  if (files.length === 0) {
    return (
      <div className="card">
        <EmptyState
          icon={<ImageOff className="h-6 w-6" />}
          title={kind === 'image' ? 'No images yet' : 'No videos yet'}
          description={
            kind === 'image'
              ? 'Upload JPG, PNG, WEBP, GIF or SVG files to host them and embed them anywhere.'
              : 'Upload MP4 or WebM files to get a streaming player page and embeddable link.'
          }
          action={emptyAction}
        />
      </div>
    );
  }

  return (
    <>
      <p className="mb-3 text-xs text-muted">
        {totals.count} {kind}
        {totals.count === 1 ? '' : 's'} · {formatBytes(totals.bytes)}
      </p>
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
        {files.map((file) => {
          const shareUrl = file.shareToken ? `/share/${file.shareToken}` : `/api/files/${file.id}/raw`;
          return (
            <div key={file.id} className="group card overflow-hidden transition hover:border-brand/40 hover:shadow-pop">
              <a
                href={shareUrl}
                target="_blank"
                rel="noreferrer"
                className="relative block aspect-[4/3] overflow-hidden bg-canvas"
              >
                {kind === 'image' && file.hasThumbnail ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={`/api/files/${file.id}/thumbnail`}
                    alt={file.name}
                    loading="lazy"
                    className="h-full w-full object-cover transition duration-300 group-hover:scale-[1.04]"
                  />
                ) : (
                  <div className="flex h-full w-full flex-col items-center justify-center gap-2 bg-gradient-to-br from-rose-500/10 to-slate-500/5 text-rose-500/70">
                    <Play className="h-8 w-8" />
                    <span className="text-[10px] font-semibold uppercase tracking-wide">Video</span>
                  </div>
                )}
                <div className="absolute inset-0 flex items-center justify-center gap-1.5 bg-slate-950/40 opacity-0 transition group-hover:opacity-100">
                  <span className="rounded-lg bg-white/95 p-2 text-slate-800 shadow-sm">
                    <Eye className="h-4 w-4" />
                  </span>
                </div>
                {file.metadata && typeof file.metadata === 'object' ? (
                  <span className="absolute bottom-2 left-2 rounded bg-black/60 px-1.5 py-0.5 text-[10px] font-medium text-white">
                    {(() => {
                      const meta = file.metadata as { width?: number; height?: number; duration?: number };
                      if (kind === 'video') return formatDuration(meta.duration) || 'Video';
                      return meta.width && meta.height ? `${meta.width}×${meta.height}` : file.mimeType;
                    })()}
                  </span>
                ) : null}
              </a>
              <div className="flex items-start gap-2 p-3">
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium text-ink" title={file.name}>
                    {file.name}
                  </p>
                  <p className="text-xs text-muted">
                    {formatBytes(file.size)} · {timeAgo(file.createdAt)}
                  </p>
                </div>
                <div className="flex shrink-0 items-center gap-0.5">
                  <button
                    type="button"
                    onClick={() =>
                      file.shareToken
                        ? copy(
                            `${window.location.origin}/media/${file.shareToken}/${encodeURIComponent(file.name)}`,
                            'Direct URL copied',
                          )
                        : setShareFile(file)
                    }
                    className="btn-icon h-7 w-7"
                    title="Copy direct URL"
                    aria-label="Copy direct URL"
                  >
                    <Link2 className="h-3 w-3" />
                  </button>
                  <a
                    href={file.shareToken ? `/api/media/${file.shareToken}?download=1` : `/api/files/${file.id}/raw?download=1`}
                    className="btn-icon h-7 w-7"
                    title="Download"
                    aria-label="Download"
                  >
                    <Download className="h-3 w-3" />
                  </a>
                  <FileRowActions file={file} variant="icons" />
                </div>
              </div>
            </div>
          );
        })}
      </div>
      {shareFile ? (
        <ShareDialog file={shareFile} open onClose={() => setShareFile(null)} />
      ) : null}
    </>
  );
}
