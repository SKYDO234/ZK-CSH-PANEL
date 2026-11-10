import Link from 'next/link';
import { Wrench } from 'lucide-react';

export function AdminBanner({ message }: { message: string }) {
  return (
    <div className="flex items-center gap-2 border-b border-amber-500/30 bg-amber-500/10 px-4 py-2.5 text-xs text-amber-700 dark:text-amber-400 sm:px-6">
      <Wrench className="h-3.5 w-3.5 shrink-0" />
      <p className="flex-1 truncate">{message}</p>
      <Link href="/admin/settings" className="font-semibold underline">
        Settings
      </Link>
    </div>
  );
}
