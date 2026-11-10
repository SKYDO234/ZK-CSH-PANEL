import { NextRequest, NextResponse } from 'next/server';
import { handler } from '@/lib/api';
import { authorizeMedia, streamFile } from '@/lib/media';

/**
 * GET /api/media/:token/:filename
 * Alternate direct URL shape for tooling that expects an /api prefix.
 */
export const GET = handler<{ token: string; path: string[] }>(async (req: NextRequest, context) => {
  const params = await context.params;
  const token = params.token;
  const wantDownload = new URL(req.url).searchParams.get('download') === '1';
  const passwordCookie = req.cookies.get(`vaultly_share_${token}`)?.value;

  const auth = await authorizeMedia({
    token,
    passwordCookie,
    requireDownloadPermission: wantDownload,
  });
  if (!auth.ok) {
    return new NextResponse(auth.message, { status: auth.status, headers: { 'Content-Type': 'text/plain' } });
  }
  return streamFile(req, auth.access, { disposition: wantDownload ? 'attachment' : 'inline' });
});

export const HEAD = GET;

export const dynamic = 'force-dynamic';
