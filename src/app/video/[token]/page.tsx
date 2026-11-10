import { redirect } from 'next/navigation';
import { resolveShare } from '@/lib/files';

export const dynamic = 'force-dynamic';

/**
 * /video/:token — friendly alias for the video share page.
 * Redirects to the canonical share viewer, which renders the player directly.
 */
export default async function VideoAlias({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const resolved = await resolveShare(token);
  if (resolved.status === 'ok') {
    redirect(`/share/${token}`);
  }
  redirect(`/share/${token}`);
}
