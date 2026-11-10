import { NextRequest, NextResponse } from 'next/server';
import { handler } from '@/lib/api';
import { authorizeMedia, streamFile } from '@/lib/media';
import { getSession } from '@/lib/auth';

/**
 * GET /api/media/:token            → inline media for a share token
 * GET /api/media/:token?download=1 → forced download
 *
 * Used by the public share pages and by the Direct URL / embed snippets.
 * Supports HTTP Range so video scrubbing works.
 */
export const GET = handler(async (req: NextRequest, context) => {
  const params = await context.params;
  const token = params.token;
  const url = new URL(req.url);
  const wantDownload = url.searchParams.get('download') === '1';

  const passwordCookie = req.cookies.get(`vaultly_share_${token}`)?.value;

  const auth = await authorizeMedia({
    token,
    passwordCookie,
    requireDownloadPermission: wantDownload,
  });

  if (!auth.ok) {
    return new NextResponse(auth.message, {
      status: auth.status,
      headers: { 'Content-Type': 'text/plain; charset=utf-8', 'Cache-Control': 'no-store' },
    });
  }

  const session = await getSession();
  const disposition = wantDownload ? 'attachment' : 'inline';
  return streamFile(req, auth.access, {
    disposition,
    cacheSeconds: session ? 0 : 300,
  });
});

export const dynamic = 'force-dynamic';
