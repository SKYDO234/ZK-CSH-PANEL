import { NextRequest, NextResponse } from 'next/server';
import { handler } from '@/lib/api';
import { authorizeMedia, streamFile } from '@/lib/media';
import { getSession } from '@/lib/auth';

/**
 * GET /api/files/:id/raw
 *
 * Streams a file by id. Access is decided by `authorizeMedia`, which allows the
 * owner, admins, and PUBLIC files (when the platform enables public galleries).
 * Used for dashboard previews, thumbnails and the direct media URL.
 */
export const GET = handler(async (req: NextRequest, context) => {
  const params = await context.params;
  const url = new URL(req.url);
  const wantDownload = url.searchParams.get('download') === '1';
  const session = await getSession();

  const auth = await authorizeMedia({
    fileId: params.id,
    requireDownloadPermission: wantDownload,
    session: session ? { id: session.id, isAdmin: session.isAdmin } : null,
  });

  if (!auth.ok) {
    return new NextResponse(auth.message, {
      status: auth.status,
      headers: { 'Content-Type': 'text/plain; charset=utf-8' },
    });
  }

  return streamFile(req, auth.access, { disposition: wantDownload ? 'attachment' : 'inline' });
});

export const dynamic = 'force-dynamic';
