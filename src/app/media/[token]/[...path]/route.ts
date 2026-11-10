import { NextRequest, NextResponse } from 'next/server';
import { handler } from '@/lib/api';
import { authorizeMedia, streamFile } from '@/lib/media';

/**
 * GET /media/:token/:filename
 *
 * The "Direct File URL" used in <img src>, <video src> and CSS backgrounds.
 * The filename segment is cosmetic — authorization always comes from the token
 * and the bytes are resolved through the storage driver, so renaming the URL
 * cannot expose another file.
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
    return new NextResponse(auth.message, {
      status: auth.status,
      headers: { 'Content-Type': 'text/plain; charset=utf-8', 'Cache-Control': 'no-store' },
    });
  }

  const response = await streamFile(req, auth.access, {
    disposition: wantDownload ? 'attachment' : 'inline',
    cacheSeconds: 3600,
  });

  // Public media may be embedded cross-origin; keep CORS permissive for GETs.
  response.headers.set('Access-Control-Allow-Origin', '*');
  response.headers.set('Access-Control-Allow-Methods', 'GET, HEAD, OPTIONS');
  response.headers.set('Timing-Allow-Origin', '*');
  return response;
});

export const HEAD = GET;

export const OPTIONS = handler<{ token: string; path: string[] }>(async () =>
  new NextResponse(null, {
    status: 204,
    headers: {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET, HEAD, OPTIONS',
      'Access-Control-Allow-Headers': 'Range, Content-Type',
      'Access-Control-Max-Age': '86400',
    },
  }),
);

export const dynamic = 'force-dynamic';
