import type { Metadata } from 'next';
import Link from 'next/link';
import { Upload } from 'lucide-react';
import { requireSession } from '@/lib/session';
import { getSettings } from '@/lib/settings';
import { listFiles } from '@/lib/files';
import { Topbar } from '@/components/layout/topbar';
import { CategoryGallery } from '@/components/files/category-gallery';

export const metadata: Metadata = { title: 'Images' };
export const dynamic = 'force-dynamic';

export default async function ImagesPage() {
  const session = await requireSession('/dashboard/images');
  const settings = await getSettings();
  const result = await listFiles({
    ownerId: session.id,
    category: 'image',
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
          <h1 className="text-2xl font-semibold tracking-tight text-ink">Images</h1>
          <p className="mt-1 text-sm text-muted">
            Host images and embed them anywhere with the direct URL or HTML snippet.
          </p>
        </div>
        <CategoryGallery
          files={result.files}
          kind="image"
          emptyAction={
            <Link href="/dashboard/upload" className="btn-primary btn-sm">
              <Upload className="h-3.5 w-3.5" /> Upload images
            </Link>
          }
        />
      </div>
    </>
  );
}
