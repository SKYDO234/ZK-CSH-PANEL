import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { resolveShare } from '@/lib/files';
import { getSettings } from '@/lib/settings';
import { cookies } from 'next/headers';
import { verifySignedValue } from '@/lib/crypto';
import { EmbedPlayer } from '@/components/share/embed-player';

export const dynamic = 'force-dynamic';
export const metadata: Metadata = {
  title: 'Embedded video',
  robots: { index: false, follow: false },
};

/**
 * /embed/video/:token
 *
 * A chrome-free player page intended for <iframe> embedding. Framing is allowed
 * for this route only (the rest of the app sends X-Frame-Options: SAMEORIGIN),
 * and only when the owner has left embedding enabled.
 */
export default async function EmbedVideoPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const settings = await getSettings();
  const resolved = await resolveShare(token);

  if (resolved.status !== 'ok') {
    return (
      <div className="flex h-screen items-center justify-center bg-slate-950 p-6 text-center text-sm text-slate-400">
        This video is not available.
      </div>
    );
  }

  const { file, share } = resolved;
  if (file.category !== 'video') notFound();
  if (!share.embeddable || !settings.sharing.allowEmbedding) {
    return (
      <div className="flex h-screen items-center justify-center bg-slate-950 p-6 text-center text-sm text-slate-400">
        Embedding is disabled for this video.
      </div>
    );
  }

  if (share.passwordHash) {
    const cookie = (await cookies()).get(`vaultly_share_${token}`)?.value;
    const verified = cookie ? verifySignedValue(cookie) : { valid: false, payload: null };
    if (!verified.valid || verified.payload !== share.id) {
      return (
        <div className="flex h-screen items-center justify-center bg-slate-950 p-6 text-center text-sm text-slate-400">
          This video is password protected. Open the share link to unlock it.
        </div>
      );
    }
  }

  return (
    <EmbedPlayer
      token={token}
      name={file.name}
      mimeType={file.mimeType}
      hasThumbnail={file.hasThumbnail}
      fileId={file.id}
    />
  );
}
