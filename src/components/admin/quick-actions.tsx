'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { ClipboardCheck, Loader2, Plus } from 'lucide-react';
import { CreateUserDialog } from './create-user-dialog';
import { useToast } from '@/components/ui/toast';
import { csrfToken } from '@/lib/upload-client';

export function AdminQuickActions({ platformName }: { platformName: string }) {
  const router = useRouter();
  const { success, error } = useToast();
  const [createOpen, setCreateOpen] = useState(false);
  const [busy, setBusy] = useState(false);

  const runHealthCheck = async () => {
    setBusy(true);
    const res = await fetch('/api/admin/system', {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'x-csrf-token': csrfToken() },
      body: JSON.stringify({ action: 'test-storage' }),
    });
    setBusy(false);
    const json = await res.json().catch(() => null);
    if (res.ok) success('Storage healthy', json.data.message);
    else error('Storage check failed', json?.error?.message);
  };

  return (
    <>
      <div className="flex flex-wrap items-center gap-2">
        <button type="button" className="btn-secondary btn-sm" onClick={() => void runHealthCheck()} disabled={busy}>
          {busy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <ClipboardCheck className="h-3.5 w-3.5" />}
          Storage health
        </button>
        <button type="button" className="btn-primary btn-sm" onClick={() => setCreateOpen(true)}>
          <Plus className="h-3.5 w-3.5" /> Create user
        </button>
      </div>
      <CreateUserDialog
        open={createOpen}
        onClose={() => {
          setCreateOpen(false);
          router.refresh();
        }}
        platformName={platformName}
      />
    </>
  );
}
