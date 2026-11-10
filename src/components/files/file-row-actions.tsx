'use client';

import { useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import {
  Copy,
  Download,
  ExternalLink,
  Eye,
  Info,
  Link2,
  MoreVertical,
  Pencil,
  Share2,
  Trash2,
} from 'lucide-react';
import type { FileDTO } from '@/lib/serialize';
import { cn } from '@/lib/cn';
import { useCopy, useToast } from '@/components/ui/toast';
import { ConfirmDialog, Dialog } from '@/components/ui/dialog';
import { csrfToken } from '@/lib/upload-client';
import { FileDetailsDialog } from './file-details';
import { ShareDialog } from './share-dialog';

type Props = {
  file: FileDTO;
  variant?: 'menu' | 'icons';
  onChanged?: () => void;
};

export function FileRowActions({ file, variant = 'menu', onChanged }: Props) {
  const router = useRouter();
  const copy = useCopy();
  const { success, error } = useToast();
  const [open, setOpen] = useState(false);
  const [renameOpen, setRenameOpen] = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [detailsOpen, setDetailsOpen] = useState(false);
  const [shareOpen, setShareOpen] = useState(false);
  const [name, setName] = useState(file.name);
  const [busy, setBusy] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onClick = (event: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(event.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', onClick);
    return () => document.removeEventListener('mousedown', onClick);
  }, [open]);

  const refresh = () => {
    onChanged?.();
    router.refresh();
  };

  const rename = async () => {
    setBusy(true);
    const res = await fetch(`/api/files/${file.id}`, {
      method: 'PATCH',
      headers: { 'content-type': 'application/json', 'x-csrf-token': csrfToken() },
      body: JSON.stringify({ name }),
    });
    setBusy(false);
    if (res.ok) {
      success('File renamed');
      setRenameOpen(false);
      refresh();
    } else {
      const json = await res.json().catch(() => null);
      error('Could not rename', json?.error?.message);
    }
  };

  const remove = async () => {
    setBusy(true);
    const res = await fetch(`/api/files/${file.id}`, {
      method: 'DELETE',
      headers: { 'x-csrf-token': csrfToken() },
    });
    setBusy(false);
    if (res.ok) {
      success('Moved to trash', 'You can restore it from Trash for 30 days.');
      setDeleteOpen(false);
      refresh();
    } else {
      error('Could not delete file');
    }
  };

  const disableSharing = async () => {
    const res = await fetch(`/api/files/${file.id}/share`, {
      method: 'DELETE',
      headers: { 'x-csrf-token': csrfToken() },
    });
    if (res.ok) {
      success('Sharing disabled', 'The link no longer works.');
      refresh();
    } else {
      error('Could not disable sharing');
    }
  };

  const previewHref =
    file.category === 'image' || file.category === 'video' || file.category === 'audio' || file.mimeType === 'application/pdf'
      ? file.shareToken
        ? `/share/${file.shareToken}`
        : `/api/files/${file.id}/raw`
      : null;

  const copyLink = () => {
    if (!file.shareToken) {
      setShareOpen(true);
      return;
    }
    void copy(`${window.location.origin}/share/${file.shareToken}`, 'Share link copied');
  };

  const copyDirect = () => {
    if (!file.shareToken) {
      setShareOpen(true);
      return;
    }
    void copy(
      `${window.location.origin}/media/${file.shareToken}/${encodeURIComponent(file.name)}`,
      'Direct URL copied',
    );
  };

  const items = [
    { label: 'Preview', icon: Eye, href: previewHref, show: Boolean(previewHref) },
    { label: 'Copy share link', icon: Link2, onClick: copyLink, show: true },
    { label: 'Copy direct URL', icon: Copy, onClick: copyDirect, show: true },
    { label: 'Share settings', icon: Share2, onClick: () => setShareOpen(true), show: true },
    { label: 'Rename', icon: Pencil, onClick: () => setRenameOpen(true), show: true },
    { label: 'File information', icon: Info, onClick: () => setDetailsOpen(true), show: true },
    {
      label: 'Download',
      icon: Download,
      href: file.shareToken
        ? `/api/media/${file.shareToken}?download=1`
        : `/api/files/${file.id}/raw?download=1`,
      show: file.downloadEnabled,
    },
  ].filter((item) => item.show);

  return (
    <div className="relative" ref={menuRef}>
      {variant === 'icons' ? (
        <div className="flex items-center gap-1">
          <button
            type="button"
            onClick={copyLink}
            className="btn-icon h-8 w-8"
            title="Copy share link"
            aria-label={`Copy share link for ${file.name}`}
          >
            <Link2 className="h-3.5 w-3.5" />
          </button>
          <button
            type="button"
            onClick={() => setOpen((v) => !v)}
            className="btn-icon h-8 w-8"
            aria-label={`More actions for ${file.name}`}
            aria-expanded={open}
          >
            <MoreVertical className="h-3.5 w-3.5" />
          </button>
        </div>
      ) : (
        <button
          type="button"
          onClick={() => setOpen((v) => !v)}
          className="btn-icon"
          aria-label={`More actions for ${file.name}`}
          aria-haspopup="menu"
          aria-expanded={open}
        >
          <MoreVertical className="h-4 w-4" />
        </button>
      )}

      {open ? (
        <div
          role="menu"
          className="absolute right-0 z-30 mt-1 w-56 animate-scale-in overflow-hidden rounded-xl border border-line bg-surface p-1 shadow-pop"
        >
          {items.map((item) =>
            item.href ? (
              <a
                key={item.label}
                role="menuitem"
                href={item.href}
                target="_blank"
                rel="noreferrer"
                onClick={() => setOpen(false)}
                className="flex items-center gap-2.5 rounded-lg px-3 py-2 text-sm text-ink transition hover:bg-canvas"
              >
                <item.icon className="h-4 w-4 text-muted" />
                {item.label}
                <ExternalLink className="ml-auto h-3 w-3 text-muted/60" />
              </a>
            ) : (
              <button
                key={item.label}
                role="menuitem"
                type="button"
                onClick={() => {
                  setOpen(false);
                  item.onClick?.();
                }}
                className="flex w-full items-center gap-2.5 rounded-lg px-3 py-2 text-sm text-ink transition hover:bg-canvas"
              >
                <item.icon className="h-4 w-4 text-muted" />
                {item.label}
              </button>
            ),
          )}
          {file.shareToken ? (
            <button
              role="menuitem"
              type="button"
              onClick={() => {
                setOpen(false);
                void disableSharing();
              }}
              className="flex w-full items-center gap-2.5 rounded-lg px-3 py-2 text-sm text-amber-600 transition hover:bg-amber-500/10"
            >
              <Link2 className="h-4 w-4" /> Disable sharing
            </button>
          ) : null}
          <div className="my-1 border-t border-line" />
          <button
            role="menuitem"
            type="button"
            onClick={() => {
              setOpen(false);
              setDeleteOpen(true);
            }}
            className="flex w-full items-center gap-2.5 rounded-lg px-3 py-2 text-sm text-red-600 transition hover:bg-red-500/10"
          >
            <Trash2 className="h-4 w-4" /> Move to trash
          </button>
        </div>
      ) : null}

      <Dialog
        open={renameOpen}
        onClose={() => setRenameOpen(false)}
        title="Rename file"
        size="sm"
        footer={
          <>
            <button className="btn-secondary" onClick={() => setRenameOpen(false)} disabled={busy}>
              Cancel
            </button>
            <button className="btn-primary" onClick={() => void rename()} disabled={busy || !name.trim()}>
              {busy ? 'Saving…' : 'Save'}
            </button>
          </>
        }
      >
        <label htmlFor="rename-input" className="label">
          File name
        </label>
        <input
          id="rename-input"
          className="input"
          value={name}
          onChange={(event) => setName(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === 'Enter') void rename();
          }}
        />
      </Dialog>

      <ConfirmDialog
        open={deleteOpen}
        onClose={() => setDeleteOpen(false)}
        onConfirm={remove}
        busy={busy}
        danger
        title={`Move “${file.name}” to trash?`}
        description="The file will be moved to Trash and its share links will stop working. You can restore it within 30 days."
        confirmLabel="Move to trash"
      />

      <FileDetailsDialog file={file} open={detailsOpen} onClose={() => setDetailsOpen(false)} />
      <ShareDialog file={file} open={shareOpen} onClose={() => setShareOpen(false)} onChanged={refresh} />
    </div>
  );
}
