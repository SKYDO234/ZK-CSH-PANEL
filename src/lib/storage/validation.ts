import { Readable } from 'node:stream';
import {
  BLOCKED_EXTENSIONS,
  DEFAULT_ALLOWED_EXTENSIONS,
  extensionOf,
  mimeForExtension,
  type FileCategory,
  categoryFor,
} from '../file-types';

/**
 * Upload validation. Never trusts the client-supplied extension or MIME type:
 *  - the extension is checked against the admin allow-list and hard blocklist
 *  - the first 4 KB of the actual bytes are sniffed for a real signature
 *  - the sniffed type must agree with the claimed category
 */

const SNIFF_BYTES = 4096;

/**
 * `file-type` is pure ESM, so it is loaded lazily: this keeps the module usable
 * from both the Next.js bundler and plain-Node CLI scripts (worker/seed).
 */
type Sniffer = (input: Uint8Array) => Promise<{ mime: string; ext: string } | undefined>;
let snifferPromise: Promise<Sniffer | null> | null = null;

function getSniffer(): Promise<Sniffer | null> {
  snifferPromise ??= import('file-type')
    .then((mod) => (mod.fileTypeFromBuffer as unknown as Sniffer) ?? null)
    .catch(() => null);
  return snifferPromise;
}

/** Signatures for formats `file-type` does not cover (e.g. plain text/office). */
function sniffOfficeOrText(buffer: Buffer): string | null {
  const head = buffer.subarray(0, 8);
  const hex = head.toString('hex');
  // OOXML / ODF / docx are ZIP containers
  if (hex.startsWith('504b0304')) return 'application/zip';
  // Legacy OLE2 (doc/xls/ppt)
  if (hex.startsWith('d0cf11e0a1b11ae1')) return 'application/x-ole-storage';
  if (buffer.subarray(0, 5).toString() === '%PDF-') return 'application/pdf';
  // RAR5 / RAR4
  if (hex.startsWith('526172211a0700') || hex.startsWith('526172211a070100')) {
    return 'application/vnd.rar';
  }
  // 7z
  if (hex.startsWith('377abcaf271c')) return 'application/x-7z-compressed';
  // gzip / tar
  if (hex.startsWith('1f8b')) return 'application/gzip';
  if (buffer.subarray(257, 262).toString() === 'ustar') return 'application/x-tar';
  return null;
}

function looksLikeText(buffer: Buffer): boolean {
  // Heuristic: no NUL bytes and mostly printable characters.
  if (buffer.length === 0) return true;
  if (buffer.includes(0)) return false;
  let printable = 0;
  for (const byte of buffer) {
    if (byte === 9 || byte === 10 || byte === 13 || (byte >= 32 && byte <= 126) || byte >= 128) {
      printable += 1;
    }
  }
  return printable / buffer.length > 0.9;
}

export type ValidationPolicy = {
  allowedExtensions: string[] | null;
  maxFileSizeBytes: number;
  scanUploads: boolean;
  category?: FileCategory;
};

export type ValidationResult = {
  ok: boolean;
  error?: string;
  detectedMime: string;
  extension: string;
  category: FileCategory;
};

const DANGEROUS_MIME_PREFIX = ['text/html', 'application/x-httpd-php', 'application/x-msdownload'];

export async function validateUpload(params: {
  filename: string;
  claimedMime: string;
  size: number;
  head: Buffer;
  policy: ValidationPolicy;
}): Promise<ValidationResult> {
  const { filename, size, head, policy } = params;
  const extension = extensionOf(filename);
  const claimedMime = (params.claimedMime || '').toLowerCase();

  if (!extension) {
    return {
      ok: false,
      error: 'Files must have an extension.',
      detectedMime: claimedMime,
      extension,
      category: 'other',
    };
  }

  if (BLOCKED_EXTENSIONS.includes(extension)) {
    return {
      ok: false,
      error: `“.${extension}” files are blocked for security reasons.`,
      detectedMime: claimedMime,
      extension,
      category: 'other',
    };
  }

  const allowed = policy.allowedExtensions ?? DEFAULT_ALLOWED_EXTENSIONS;
  if (policy.allowedExtensions && !allowed.includes(extension)) {
    return {
      ok: false,
      error: `“.${extension}” files are not permitted on this platform.`,
      detectedMime: claimedMime,
      extension,
      category: 'other',
    };
  }

  if (size > policy.maxFileSizeBytes) {
    return {
      ok: false,
      error: 'File exceeds the maximum upload size.',
      detectedMime: claimedMime,
      extension,
      category: 'other',
    };
  }

  if (size === 0) {
    return {
      ok: false,
      error: 'Empty files cannot be uploaded.',
      detectedMime: claimedMime,
      extension,
      category: 'other',
    };
  }

  // Content sniffing
  let detectedMime = '';
  if (policy.scanUploads) {
    try {
      const sniff = await getSniffer();
      const sniffed = sniff ? await sniff(head) : undefined;
      if (sniffed) {
        detectedMime = sniffed.mime;
      }
    } catch {
      // fall through to manual sniffing
    }
    if (!detectedMime) {
      detectedMime = sniffOfficeOrText(head) ?? '';
    }
    if (!detectedMime && looksLikeText(head)) {
      detectedMime = claimedMime.startsWith('text/') ? claimedMime : 'text/plain';
    }
  }

  const finalMime = detectedMime || claimedMime || mimeForExtension(extension);
  const category = categoryFor(finalMime, extension);

  if (DANGEROUS_MIME_PREFIX.some((m) => finalMime.startsWith(m)) && extension !== 'html') {
    return {
      ok: false,
      error: 'This file type cannot be served safely.',
      detectedMime: finalMime,
      extension,
      category,
    };
  }

  // A file claiming a rich media extension must actually be that kind of media.
  // (e.g. "photo.png" containing HTML/JS is rejected rather than served.)
  const CLAIMED_MEDIA = new Set(['png', 'jpg', 'jpeg', 'gif', 'webp', 'avif', 'heic', 'bmp', 'tiff', 'ico', 'svg',
    'mp4', 'webm', 'mov', 'm4v', 'mp3', 'wav', 'ogg', 'flac', 'aac']);
  if (policy.scanUploads && CLAIMED_MEDIA.has(extension)) {
    const expectedFamily = mimeForExtension(extension).split('/')[0];
    const detectedFamily = finalMime.split('/')[0];
    const undetectable = !detectedMime;
    if (!undetectable && detectedFamily !== expectedFamily) {
      return {
        ok: false,
        error: `The file content does not match its .${extension} extension.`,
        detectedMime: finalMime,
        extension,
        category,
      };
    }
  }

  // SVG requires sanitisation before it is ever served inline.
  if (policy.scanUploads && category === 'image' && !finalMime.startsWith('image/')) {
    return {
      ok: false,
      error: 'The file content does not match its extension.',
      detectedMime: finalMime,
      extension,
      category,
    };
  }

  // For non-binary formats content sniffing is best-effort; we still verify that
  // an image/video/audio extension is not actually a script or archive.
  if (
    policy.scanUploads &&
    detectedMime &&
    detectedMime !== 'text/plain' &&
    !detectedMime.includes('zip') &&
    !detectedMime.includes('ole-storage') &&
    extensionMismatch(extension, detectedMime)
  ) {
    return {
      ok: false,
      error: 'The file content does not match its extension.',
      detectedMime,
      extension,
      category,
    };
  }

  return { ok: true, detectedMime: finalMime, extension, category };
}

/** Compares a claimed extension family against the sniffed MIME family. */
function extensionMismatch(extension: string, detectedMime: string): boolean {
  const expected = mimeForExtension(extension);
  if (expected === 'application/octet-stream') return false;
  const [expFamily] = expected.split('/');
  const [detFamily] = detectedMime.split('/');
  if (expFamily === 'application' || detFamily === 'application') return false;
  return expFamily !== detFamily;
}

/**
 * Reads the first bytes of a stream and returns a stream that replays them.
 *
 * IMPORTANT: we drive the source with an explicit async iterator instead of
 * `for await` + `break`, because breaking out of `for await` calls `return()`
 * on the iterator, which cancels the underlying request body.
 */
export async function peekStream(
  stream: NodeJS.ReadableStream,
  bytes = SNIFF_BYTES,
): Promise<{ head: Buffer; replay: NodeJS.ReadableStream }> {
  const iterator = (stream as AsyncIterable<Buffer>)[Symbol.asyncIterator]();
  const chunks: Buffer[] = [];
  let total = 0;
  let finished = false;

  while (total < bytes) {
    const { value, done } = await iterator.next();
    if (done) {
      finished = true;
      break;
    }
    const buf = Buffer.isBuffer(value) ? value : Buffer.from(value);
    chunks.push(buf);
    total += buf.length;
  }

  const head = Buffer.concat(chunks);
  const replay = Readable.from(
    (async function* () {
      if (head.length > 0) yield head;
      if (finished) return;
      while (true) {
        const { value, done } = await iterator.next();
        if (done) return;
        yield value;
      }
    })(),
  );
  return { head, replay };
}

/**
 * SVGs can carry scripts. We neutralise the common vectors before storing them
 * and only ever serve them with `Content-Security-Policy: sandbox` plus
 * `X-Content-Type-Options: nosniff`.
 */
export function sanitizeSvg(source: Buffer): Buffer {
  let text = source.toString('utf8');
  text = text
    .replace(/<script[\s\S]*?<\/script>/gi, '')
    .replace(/\son[a-z]+\s*=\s*"[^"]*"/gi, '')
    .replace(/\son[a-z]+\s*=\s*'[^']*'/gi, '')
    .replace(/javascript:/gi, '')
    .replace(/<foreignObject[\s\S]*?<\/foreignObject>/gi, '');
  return Buffer.from(text, 'utf8');
}
