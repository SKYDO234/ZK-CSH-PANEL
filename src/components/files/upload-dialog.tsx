'use client';

import { Dialog } from '@/components/ui/dialog';
import { Uploader } from '@/components/upload/uploader';

export function UploadDialog({
  open,
  onClose,
  folderId,
  maxFileSizeBytes,
  allowedExtensions,
  remainingBytes,
}: {
  open: boolean;
  onClose: () => void;
  folderId: string | null;
  maxFileSizeBytes: number;
  allowedExtensions: string[] | null;
  remainingBytes: number;
}) {
  return (
    <Dialog
      open={open}
      onClose={onClose}
      title="Upload files"
      description="Files are uploaded in the background with live progress. A share link is created automatically."
      size="lg"
      footer={
        <button type="button" className="btn-primary" onClick={onClose}>
          Done
        </button>
      }
    >
      <Uploader
        folderId={folderId}
        maxFileSizeBytes={maxFileSizeBytes}
        allowedExtensions={allowedExtensions}
        remainingBytes={remainingBytes}
      />
    </Dialog>
  );
}
