'use client';

import { useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import {
  AlertTriangle,
  Copy,
  Code2,
  Download,
  Eye,
  FileText,
  Link2,
  Music,
  Share2,
  Info,
} from 'lucide-react';
import { formatBytes, formatDateTime, formatDuration } from '@/lib/format';
import { useCopy } from '@/components/ui/toast';
import { cn } from '@/lib/cn';
import type { PublicBranding } from '@/lib/settings';
import { FileTypeIcon } from '@/components/files/file-icon';

export type ShareViewModel = {
  token: string;
  branding: PublicBranding;
  ownerName: string;
  file: {
    id: string;
    name: string;
    mimeType: string;
    category: string;
    size: number;
    extension: string | null;
    createdAt: string;
    metadata: Record<string, unknown> | null;
    hasThumbnail: boolean;
  };
  share: {
    allowDownload: boolean;
    viewOnly: boolean;
    embeddable: boolean;
    expiresAt: string | null;
    downloadCount: number;
    maxDownloads: number | null;
  };
};

export function ShareView({ token, file, share, ownerName, branding }: ShareViewModel) {
  const copy = useCopy();
  const [activeTab, setActiveTab] = useState<'preview' | 'embed'>('preview');
  const [textContent, setTextContent] = useState<string | null>(null);
  const [textError, setTextError] = useState<string | null>(null);

  const origin = typeof window !== 'undefined' ? window.location.origin : '';
  const mediaUrl = `/media/${token}/${encodeURIComponent(file.name)}`;
  const downloadUrl = `/api/media/${token}?download=1`;
  const shareUrl = `${origin}/share/${token}`;
  const embedUrl = `${origin}/embed/video/${token}`;

  const isText =
    file.mimeType.startsWith('text/') ||
    ['application/json', 'application/xml', 'text/xml'].includes(file.mimeType);

  // Text previews are fetched (capped) rather than streamed into an iframe.
  useEffect(() => {
    if (!isText || file.size > 512 * 1024) return;
    let cancelled = false;
    fetch(mediaUrl, { headers: { range: 'bytes=0-524287' } })
      .then((res) => (res.ok ? res.text() : Promise.reject(new Error('failed'))))
      .then((text) => {
        if (!cancelled) setTextContent(text.slice(0, 100_000));
      })
      .catch(() => {
        if (!cancelled) setTextError('Preview unavailable. You can download the file instead.');
      });
    return () => {
      cancelled = true;
    };
  }, [isText, file.size, mediaUrl]);

  const embedCode =
    file.category === 'image'
      ? `<img src="${origin}/media/${token}/${encodeURIComponent(file.name)}" alt="${escapeHtml(file.name)}" loading="lazy" />`
      : file.category === 'video'
        ? `<video controls preload="metadata" style="max-width:100%">\n  <source src="${origin}/media/${token}/${encodeURIComponent(file.name)}" type="${file.mimeType}">\n</video>`
        : file.category === 'audio'
          ? `<audio controls preload="metadata">\n  <source src="${origin}/media/${token}/${encodeURIComponent(file.name)}" type="${file.mimeType}">\n</audio>`
          : `<a href="${shareUrl}" target="_blank" rel="noopener">Download ${escapeHtml(file.name)}</a>`;

  const metadata = (file.metadata ?? {}) as { width?: number; height?: number; duration?: number };

  return (
    <div className="mx-auto max-w-6xl">
      <div className="grid gap-5 lg:grid-cols-[1fr_20rem]">
        {/* Preview panel */}
        <div className="card overflow-hidden">
          <div className="flex items-center justify-between gap-3 border-b border-line px-4 py-3">
            <div className="flex min-w-0 items-center gap-2.5">
              <FileTypeIcon category={file.category} extension={file.extension} size="sm" />
              <div className="min-w-0">
                <h1 className="truncate text-sm font-semibold text-ink" title={file.name}>
                  {file.name}
                </h1>
                <p className="text-xs text-muted">
                  {formatBytes(file.size)} · shared by {ownerName}
                </p>
              </div>
            </div>
            <div className="flex shrink-0 items-center gap-1.5">
              <button
                type="button"
                onClick={() => copy(shareUrl, 'Link copied')}
                className="btn-secondary btn-sm"
                title="Copy link"
              >
                <Link2 className="h-3.5 w-3.5" />
                <span className="hidden sm:inline">Copy link</span>
              </button>
              {share.allowDownload ? (
                <a href={downloadUrl} className="btn-primary btn-sm" download>
                  <Download className="h-3.5 w-3.5" />
                  <span className="hidden sm:inline">Download</span>
                </a>
              ) : null}
            </div>
          </div>

          <div className="bg-canvas/60 p-3 sm:p-5">
            {file.category === 'image' ? (
              <figure className="flex min-h-[16rem] items-center justify-center">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={mediaUrl}
                  alt={file.name}
                  className="max-h-[72vh] w-auto max-w-full rounded-lg object-contain shadow-sm"
                  loading="eager"
                />
              </figure>
            ) : file.category === 'video' ? (
              <VideoPlayer src={mediaUrl} mimeType={file.mimeType} name={file.name} poster={`/api/files/${file.id}/thumbnail`} hasThumbnail={file.hasThumbnail} duration={metadata.duration} />
            ) : file.category === 'audio' ? (
              <div className="flex min-h-[12rem] flex-col items-center justify-center gap-4">
                <div className="flex h-20 w-20 items-center justify-center rounded-2xl bg-amber-500/10 text-amber-500">
                  <Music className="h-9 w-9" />
                </div>
                <audio controls preload="metadata" src={mediaUrl} className="w-full max-w-lg">
                  Your browser does not support audio playback.
                </audio>
              </div>
            ) : file.mimeType === 'application/pdf' ? (
              <iframe
                src={mediaUrl}
                title={file.name}
                className="h-[75vh] w-full rounded-lg border border-line bg-white"
              />
            ) : isText ? (
              <div className="min-h-[12rem]">
                {textError ? (
                  <p className="p-4 text-sm text-muted">{textError}</p>
                ) : textContent === null ? (
                  <div className="space-y-2 p-2">
                    <div className="skeleton h-3 w-3/4" />
                    <div className="skeleton h-3 w-full" />
                    <div className="skeleton h-3 w-5/6" />
                  </div>
                ) : (
                  <pre className="max-h-[70vh] overflow-auto rounded-lg bg-surface p-4 text-xs leading-relaxed text-ink ring-1 ring-line">
                    <code>{textContent}</code>
                  </pre>
                )}
              </div>
            ) : (
              <div className="flex min-h-[14rem] flex-col items-center justify-center text-center">
                <FileTypeIcon category={file.category} extension={file.extension} size="lg" />
                <p className="mt-3 text-sm font-medium text-ink">{file.name}</p>
                <p className="mt-1 text-xs text-muted">
                  This file type cannot be previewed in the browser.
                </p>
                {share.allowDownload ? (
                  <a href={downloadUrl} className="btn-primary btn-sm mt-4" download>
                    <Download className="h-3.5 w-3.5" /> Download {formatBytes(file.size)}
                  </a>
                ) : null}
              </div>
            )}
          </div>

          {share.viewOnly ? (
            <div className="flex items-center gap-2 border-t border-line bg-amber-500/[0.07] px-4 py-2.5 text-xs text-amber-700 dark:text-amber-400">
              <Eye className="h-3.5 w-3.5" /> View-only — downloads are disabled for this link.
            </div>
          ) : null}
        </div>

        {/* Sidebar */}
        <aside className="space-y-4">
          <div className="card p-4">
            <div className="mb-3 flex items-center gap-1">
              <button
                type="button"
                onClick={() => setActiveTab('preview')}
                className={cn(
                  'inline-flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-xs font-semibold transition',
                  activeTab === 'preview' ? 'bg-brand/10 text-brand' : 'text-muted hover:text-ink',
                )}
              >
                <Info className="h-3.5 w-3.5" /> Details
              </button>
              {share.embeddable ? (
                <button
                  type="button"
                  onClick={() => setActiveTab('embed')}
                  className={cn(
                    'inline-flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-xs font-semibold transition',
                    activeTab === 'embed' ? 'bg-brand/10 text-brand' : 'text-muted hover:text-ink',
                  )}
                >
                  <Code2 className="h-3.5 w-3.5" /> Embed
                </button>
              ) : null}
            </div>

            {activeTab === 'preview' ? (
              <dl className="space-y-2.5 text-sm">
                <Row label="File" value={<span className="break-all">{file.name}</span>} />
                <Row label="Size" value={formatBytes(file.size)} />
                <Row label="Type" value={file.mimeType} />
                {metadata.width && metadata.height ? (
                  <Row label="Dimensions" value={`${metadata.width} × ${metadata.height}`} />
                ) : null}
                {metadata.duration ? <Row label="Duration" value={formatDuration(metadata.duration)} /> : null}
                <Row label="Uploaded" value={formatDateTime(file.createdAt)} />
                <Row
                  label="Downloads"
                  value={
                    share.maxDownloads
                      ? `${share.downloadCount} of ${share.maxDownloads}`
                      : String(share.downloadCount)
                  }
                />
                {share.expiresAt ? <Row label="Link expires" value={formatDateTime(share.expiresAt)} /> : null}
              </dl>
            ) : (
              <div>
                <p className="mb-2 text-xs text-muted">Paste this into your website or portfolio:</p>
                <pre className="max-h-52 overflow-auto rounded-lg bg-canvas p-3 text-[11px] leading-relaxed text-ink ring-1 ring-line">
                  <code>{embedCode}</code>
                </pre>
                <button
                  type="button"
                  onClick={() => copy(embedCode, 'Embed code copied')}
                  className="btn-secondary btn-sm mt-2 w-full"
                >
                  <Copy className="h-3.5 w-3.5" /> Copy embed code
                </button>
                {file.category === 'video' ? (
                  <button
                    type="button"
                    onClick={() => copy(embedUrl, 'Player URL copied')}
                    className="btn-ghost btn-sm mt-1 w-full"
                  >
                    <Share2 className="h-3.5 w-3.5" /> Copy player URL
                  </button>
                ) : null}
              </div>
            )}
          </div>

          <div className="card p-4">
            <p className="text-xs text-muted">Shared via</p>
            <Link href="/" className="mt-1 flex items-center gap-2 text-sm font-semibold text-ink hover:text-brand">
              {branding.logoUrl ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={branding.logoUrl} alt="" className="h-6 w-6 rounded object-contain" />
              ) : null}
              {branding.platformName}
            </Link>
            <p className="mt-2 text-[11px] leading-relaxed text-muted">
              {branding.supportEmail ? `Questions? Contact ${branding.supportEmail}.` : branding.tagline}
            </p>
          </div>

          {share.viewOnly || !share.allowDownload ? (
            <div className="flex items-start gap-2 rounded-xl bg-amber-500/10 p-3 text-[11px] text-amber-700 ring-1 ring-inset ring-amber-500/20 dark:text-amber-400">
              <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
              <p>The owner has restricted downloading of this file.</p>
            </div>
          ) : null}
        </aside>
      </div>
    </div>
  );
}

function Row({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="flex items-start justify-between gap-3">
      <dt className="shrink-0 text-muted">{label}</dt>
      <dd className="text-right text-[13px] font-medium text-ink">{value}</dd>
    </div>
  );
}

function escapeHtml(value: string) {
  return value.replace(/[&<>"']/g, (char) =>
    ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[char] ?? char,
  );
}

/**
 * Custom-skinned HTML5 video player.
 *
 * Uses the native player surface for maximum device compatibility (including
 * iOS fullscreen and AirPlay) with visible native controls, plus a custom
 * playback-speed control and error/loading states.
 */
function VideoPlayer({
  src,
  mimeType,
  name,
  poster,
  hasThumbnail,
  duration,
}: {
  src: string;
  mimeType: string;
  name: string;
  poster: string;
  hasThumbnail: boolean;
  duration?: number;
}) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const [speed, setSpeed] = useState(1);
  const [error, setError] = useState<string | null>(null);
  const [ready, setReady] = useState(false);

  const applySpeed = (value: number) => {
    setSpeed(value);
    if (videoRef.current) videoRef.current.playbackRate = value;
  };

  if (error) {
    return (
      <div className="flex min-h-[16rem] flex-col items-center justify-center rounded-lg bg-surface p-6 text-center ring-1 ring-line">
        <AlertTriangle className="h-8 w-8 text-amber-500" />
        <p className="mt-3 text-sm font-medium text-ink">This video could not be played</p>
        <p className="mt-1 max-w-sm text-xs text-muted">{error}</p>
        <a href={src} className="btn-secondary btn-sm mt-4" download>
          <Download className="h-3.5 w-3.5" /> Download instead
        </a>
      </div>
    );
  }

  return (
    <div className="overflow-hidden rounded-xl bg-black shadow-sm">
      <video
        ref={videoRef}
        controls
        playsInline
        preload="metadata"
        poster={hasThumbnail ? poster : undefined}
        className="max-h-[72vh] w-full bg-black"
        onError={() =>
          setError(
            `Your browser may not support the ${mimeType} format. Try converting to MP4 (H.264) or download the file.`,
          )
        }
        onLoadedMetadata={(event) => {
          setReady(true);
          const element = event.currentTarget;
          if (duration && Number.isFinite(element.duration)) {
            // keep speed preference when metadata loads
            element.playbackRate = speed;
          }
        }}
      >
        <source src={src} type={mimeType} />
        <track kind="captions" />
        Your browser does not support the video tag.
      </video>
      <div className="flex flex-wrap items-center justify-between gap-2 bg-slate-950 px-3 py-2 text-xs text-slate-300">
        <span className="truncate">{name}</span>
        <div className="flex items-center gap-1">
          <span className="mr-1 text-slate-500">Speed</span>
          {[0.5, 1, 1.25, 1.5, 2].map((value) => (
            <button
              key={value}
              type="button"
              onClick={() => applySpeed(value)}
              className={cn(
                'rounded px-1.5 py-0.5 font-medium transition',
                speed === value ? 'bg-white text-slate-900' : 'hover:bg-white/10',
              )}
            >
              {value}×
            </button>
          ))}
          {!ready ? <span className="ml-2 text-slate-500">loading…</span> : null}
        </div>
      </div>
    </div>
  );
}
