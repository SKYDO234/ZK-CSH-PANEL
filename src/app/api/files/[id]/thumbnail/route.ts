import { NextRequest } from 'next/server';
import { handler } from '@/lib/api';
import { streamThumbnail } from '@/lib/media';

/** GET /api/files/:id/thumbnail — cached WebP preview. */
export const GET = handler(async (_req: NextRequest, context) => {
  const params = await context.params;
  return streamThumbnail(params.id);
});

export const dynamic = 'force-dynamic';
