import type { Metadata } from 'next';
import Link from 'next/link';
import { Upload } from 'lucide-react';
import { requireSession } from '@/lib/session';
import { getSettings } from '@/lib/settings';
import { listFiles } from '@/lib/files';
import { Topbar } from '@/components/layout/topbar';
import { CategoryGallery } from '@/components/files/category-gallery';

export const metadata: Metadata = { title: 'Videos' };
export const dynamic = 'force-dynamic';

export default async function VideosPage() {
  const session = await requireSession('/dashboard/videos');
  const settings = await getSettings();
  const result = await listFiles({
    ownerId: session.id,
    category: 'video',
    perPage: 60,
    sort: 'date',
    direction: 'desc',
  });

  return (
    <>
      <Topbar
        user={{ name: session.name, email: session.email, avatarUrl: session.avatarUrl, roleLabel: session.role.label, isAdmin: session.isAdmin }}
        allowThemeToggle={settings.appearance.allowUserThemeToggle}
      />
      <div className="mx-auto max-w-7xl px-4 py-6 sm:px-6">
        <div className="mb-5">
          <h1 className="text-2xl font-semibold tracking-tight text-ink">Videos</h1>
          <p className="mt-1 text-sm text-muted">
            Streaming playback with HTTP range support, plus an embeddable player for your website.
          </p>
        </div>
        <CategoryGallery
          files={result.files}
          kind="video"
          emptyAction={
            <Link href="/dashboard/upload" className="btn-primary btn-sm">
              <Upload className="h-3.5 w-3.5" /> Upload videos
            </Link>
          }
        />
      </div>
    </>
  );
}
