'use client';

import { useState } from 'react';
import Link from 'next/link';
import { ArrowRight, CheckCircle2, Copy, ExternalLink, Folder as FolderIcon, Info } from 'lucide-react';
import { Uploader } from './uploader';
import type { FolderDTO } from '@/lib/serialize';
import { formatBytes } from '@/lib/format';
import { useCopy } from '@/components/ui/toast';
import type { UploadResult } from '@/lib/upload-client';

export function UploadPageClient({
  folders,
  maxFileSizeBytes,
  allowedExtensions,
  remainingBytes,
}: {
  folders: FolderDTO[];
  maxFileSizeBytes: number;
  allowedExtensions: string[] | null;
  remainingBytes: number;
}) {
  const [folderId, setFolderId] = useState<string | null>(null);
  const [results, setResults] = useState<UploadResult[]>([]);
  const copy = useCopy();

  return (
    <div className="space-y-5">
      <div className="card p-4">
        <div className="flex flex-wrap items-center gap-3">
          <label htmlFor="upload-folder" className="text-sm font-medium text-ink">
            Upload to
          </label>
          <select
            id="upload-folder"
            className="input w-auto min-w-[12rem] py-2 text-sm"
            value={folderId ?? 'root'}
            onChange={(event) => setFolderId(event.target.value === 'root' ? null : event.target.value)}
          >
            <option value="root">All files (root)</option>
            {folders.map((folder) => (
              <option key={folder.id} value={folder.id}>
                {folder.name}
              </option>
            ))}
          </select>
          <Link href="/dashboard/files" className="btn-ghost btn-sm ml-auto">
            <FolderIcon className="h-3.5 w-3.5" /> Manage folders
          </Link>
        </div>
      </div>

      <Uploader
        folderId={folderId}
        maxFileSizeBytes={maxFileSizeBytes}
        allowedExtensions={allowedExtensions}
        remainingBytes={remainingBytes}
        onUploaded={(result) => setResults((prev) => [result, ...prev].slice(0, 10))}
      />

      {results.length > 0 ? (
        <div className="card">
          <div className="flex items-center gap-2 border-b border-line px-5 py-3.5">
            <CheckCircle2 className="h-4 w-4 text-emerald-500" />
            <h2 className="text-sm font-semibold text-ink">Recently uploaded</h2>
          </div>
          <ul className="divide-y divide-line">
            {results.map((result) => (
              <li key={result.fileId} className="flex flex-wrap items-center gap-2 px-5 py-3">
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium text-ink">{result.name}</p>
                  <p className="text-xs text-muted">{formatBytes(result.size)}</p>
                </div>
                {result.shareToken ? (
                  <>
                    <button
                      type="button"
                      className="btn-secondary btn-sm"
                      onClick={() =>
                        copy(`${window.location.origin}/share/${result.shareToken}`, 'Share link copied')
                      }
                    >
                      <Copy className="h-3.5 w-3.5" /> Copy link
                    </button>
                    <a
                      href={`/share/${result.shareToken}`}
                      target="_blank"
                      rel="noreferrer"
                      className="btn-primary btn-sm"
                    >
                      Open <ExternalLink className="h-3 w-3" />
                    </a>
                  </>
                ) : null}
              </li>
            ))}
          </ul>
        </div>
      ) : null}

      <div className="rounded-xl bg-brand/[0.04] p-4 ring-1 ring-inset ring-brand/15">
        <p className="flex items-center gap-1.5 text-xs font-semibold text-ink">
          <Info className="h-3.5 w-3.5 text-brand" /> Upload limits
        </p>
        <ul className="mt-2 space-y-1 text-xs text-muted">
          <li>Maximum file size: {formatBytes(maxFileSizeBytes)}</li>
          <li>Storage remaining: {formatBytes(remainingBytes)}</li>
          <li>
            {allowedExtensions
              ? `Allowed types: ${allowedExtensions.slice(0, 14).join(', ')}${allowedExtensions.length > 14 ? '…' : ''}`
              : 'All common file types are accepted (executables are always blocked).'}
          </li>
          <li>File contents are verified by signature — renaming an executable will not bypass validation.</li>
        </ul>
        <Link href="/dashboard/files" className="mt-3 inline-flex items-center gap-1 text-xs font-semibold text-brand hover:underline">
          Go to my files <ArrowRight className="h-3 w-3" />
        </Link>
      </div>
    </div>
  );
}
