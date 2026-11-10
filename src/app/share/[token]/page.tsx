import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import Link from 'next/link';
import { getSettings, toPublicBranding } from '@/lib/settings';
import { resolveShare } from '@/lib/files';
import { ShareView } from '@/components/share/share-view';
import { PasswordGate } from '@/components/share/password-gate';
import { ShareShell } from '@/components/share/share-shell';
import { cookies } from 'next/headers';
import { verifySignedValue } from '@/lib/crypto';

export const dynamic = 'force-dynamic';

export async function generateMetadata({
  params,
}: {
  params: Promise<{ token: string }>;
}): Promise<Metadata> {
  const { token } = await params;
  const resolved = await resolveShare(token);
  if (resolved.status !== 'ok') return { title: 'Link unavailable' };
  const { file } = resolved;
  return {
    title: file.name,
    description: `Shared file · ${file.mimeType}`,
    openGraph: {
      title: file.name,
      images:
        file.category === 'image' && file.hasThumbnail
          ? [`/api/files/${file.id}/thumbnail`]
          : undefined,
    },
    robots: resolved.share.passwordHash ? { index: false, follow: false } : undefined,
  };
}

export default async function SharePage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const settings = await getSettings();
  const branding = toPublicBranding(settings);
  const resolved = await resolveShare(token);

  if (resolved.status === 'not_found') notFound();

  const unavailable = resolved.status !== 'ok';
  if (unavailable) {
    const messages: Record<string, string> = {
      expired: 'This link has expired.',
      revoked: 'This link has been revoked by its owner.',
      deleted: 'This file has been deleted.',
      not_ready: 'This file is still being processed.',
      owner_suspended: 'This content is temporarily unavailable.',
      download_limit: 'This link has reached its download limit.',
    };
    return (
      <ShareShell branding={branding}>
        <div className="card mx-auto max-w-md p-8 text-center">
          <h1 className="text-lg font-semibold text-ink">Link unavailable</h1>
          <p className="mt-2 text-sm text-muted">{messages[resolved.status] ?? 'This link is not available.'}</p>
          <Link href="/" className="btn-secondary btn-sm mt-5">
            Go to {branding.platformName}
          </Link>
        </div>
      </ShareShell>
    );
  }

  const { file, share, owner } = resolved;

  // Password-protected links render a gate instead of the file.
  if (share.passwordHash) {
    const cookie = (await cookies()).get(`vaultly_share_${token}`)?.value;
    const verified = cookie ? verifySignedValue(cookie) : { valid: false, payload: null };
    if (!verified.valid || verified.payload !== share.id) {
      return (
        <ShareShell branding={branding}>
          <PasswordGate token={token} fileName={file.name} branding={branding} />
        </ShareShell>
      );
    }
  }

  return (
    <ShareShell branding={branding} shareToken={token}>
      <ShareView
        token={token}
        branding={branding}
        ownerName={owner.name}
        file={{
          id: file.id,
          name: file.name,
          mimeType: file.mimeType,
          category: file.category,
          size: Number(file.size),
          extension: file.extension,
          createdAt: file.createdAt.toISOString(),
          metadata: (file.metadata as Record<string, unknown> | null) ?? null,
          hasThumbnail: file.hasThumbnail,
        }}
        share={{
          allowDownload: share.allowDownload && !share.viewOnly && file.downloadEnabled,
          viewOnly: share.viewOnly,
          embeddable: share.embeddable,
          expiresAt: share.expiresAt?.toISOString() ?? null,
          downloadCount: share.downloadCount,
          maxDownloads: share.maxDownloads,
        }}
      />
    </ShareShell>
  );
}
