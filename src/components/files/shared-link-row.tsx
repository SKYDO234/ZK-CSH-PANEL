'use client';

import { useState } from 'react';
import { Copy, Link2, Settings2 } from 'lucide-react';
import type { FileDTO } from '@/lib/serialize';
import { useCopy } from '@/components/ui/toast';
import { ShareDialog } from './share-dialog';

export function SharedLinkRow({ file }: { file: FileDTO }) {
  const copy = useCopy();
  const [open, setOpen] = useState(false);

  return (
    <div className="flex items-center gap-1">
      <button
        type="button"
        onClick={() => copy(`${window.location.origin}/share/${file.shareToken}`, 'Share link copied')}
        className="btn-icon h-8 w-8"
        title="Copy share link"
        aria-label={`Copy share link for ${file.name}`}
      >
        <Copy className="h-3.5 w-3.5" />
      </button>
      <a
        href={`/share/${file.shareToken}`}
        target="_blank"
        rel="noreferrer"
        className="btn-icon h-8 w-8"
        title="Open share page"
        aria-label={`Open ${file.name}`}
      >
        <Link2 className="h-3.5 w-3.5" />
      </a>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="btn-icon h-8 w-8"
        title="Link settings"
        aria-label={`Link settings for ${file.name}`}
      >
        <Settings2 className="h-3.5 w-3.5" />
      </button>
      {open ? <ShareDialog file={file} open onClose={() => setOpen(false)} /> : null}
    </div>
  );
}
