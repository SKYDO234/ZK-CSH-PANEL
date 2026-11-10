import { NextRequest, NextResponse } from 'next/server';
import { Readable } from 'node:stream';
import { handler } from '@/lib/api';
import { getStorageDriver } from '@/lib/storage';

/** GET /api/branding/:key — serves admin-uploaded brand images from storage. */
export const GET = handler<{ key: string[] }>(async (_req: NextRequest, context) => {
  const params = await context.params;
  const key = `branding/${params.key.join('/')}`;
  const storage = getStorageDriver();
  try {
    const result = await storage.getStream(key);
    return new NextResponse(Readable.toWeb(result.stream) as unknown as ReadableStream, {
      headers: {
        'Content-Type': result.contentType || 'image/png',
        'Cache-Control': 'public, max-age=31536000, immutable',
        'X-Content-Type-Options': 'nosniff',
        'Content-Security-Policy': "default-src 'none'; sandbox",
      },
    });
  } catch {
    return new NextResponse(null, { status: 404 });
  }
});

export const dynamic = 'force-dynamic';
