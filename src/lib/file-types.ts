/**
 * File category + validation helpers.
 *
 * Extensions are only ever a *hint*. Real validation happens by sniffing the
 * magic bytes of the uploaded content (see storage/validation.ts) and by
 * comparing the detected MIME type against the category allow-list.
 */

export type FileCategory = 'image' | 'video' | 'audio' | 'document' | 'archive' | 'other';

export const CATEGORY_LABELS: Record<FileCategory, string> = {
  image: 'Images',
  video: 'Videos',
  audio: 'Audio',
  document: 'Documents',
  archive: 'Archives',
  other: 'Other',
};

export const IMAGE_EXTENSIONS = ['jpg', 'jpeg', 'png', 'webp', 'gif', 'svg', 'avif', 'bmp', 'ico'];
export const VIDEO_EXTENSIONS = ['mp4', 'webm', 'mov', 'm4v', 'ogv', 'mkv', 'avi'];
export const AUDIO_EXTENSIONS = ['mp3', 'wav', 'ogg', 'oga', 'm4a', 'flac', 'aac', 'opus'];
export const DOCUMENT_EXTENSIONS = [
  'pdf', 'doc', 'docx', 'xls', 'xlsx', 'ppt', 'pptx', 'txt', 'md', 'csv', 'rtf',
  'odt', 'ods', 'odp', 'json', 'xml', 'html', 'css', 'js', 'ts', 'yml', 'yaml', 'log',
];
export const ARCHIVE_EXTENSIONS = ['zip', 'rar', '7z', 'tar', 'gz', 'tgz', 'bz2', 'xz', 'iso'];

/** Extensions that are never accepted regardless of admin settings. */
export const BLOCKED_EXTENSIONS = [
  'exe', 'dll', 'so', 'dylib', 'bat', 'cmd', 'com', 'msi', 'scr', 'vbs', 'vbe', 'js',
  'jse', 'wsf', 'wsh', 'ps1', 'psm1', 'sh', 'bash', 'cgi', 'pl', 'php', 'php3', 'php4',
  'php5', 'phtml', 'asp', 'aspx', 'jsp', 'jspx', 'htaccess', 'htpasswd', 'jar', 'apk',
  'app', 'pkg', 'deb', 'rpm', 'hta', 'reg', 'lnk',
];

export const DEFAULT_ALLOWED_EXTENSIONS = [
  ...IMAGE_EXTENSIONS,
  ...VIDEO_EXTENSIONS,
  ...AUDIO_EXTENSIONS,
  ...DOCUMENT_EXTENSIONS,
  ...ARCHIVE_EXTENSIONS,
];

export function extensionOf(filename: string): string {
  const clean = filename.split(/[?#]/)[0];
  const idx = clean.lastIndexOf('.');
  if (idx <= 0 || idx === clean.length - 1) return '';
  return clean.slice(idx + 1).toLowerCase();
}

export function categoryFor(mimeType: string, extension: string): FileCategory {
  const mime = (mimeType || '').toLowerCase();
  if (mime.startsWith('image/')) return 'image';
  if (mime.startsWith('video/')) return 'video';
  if (mime.startsWith('audio/')) return 'audio';
  if (
    mime === 'application/pdf' ||
    mime.startsWith('text/') ||
    mime.includes('word') ||
    mime.includes('excel') ||
    mime.includes('spreadsheet') ||
    mime.includes('presentation') ||
    mime.includes('powerpoint') ||
    mime === 'application/json' ||
    mime === 'application/xml' ||
    mime === 'application/rtf'
  ) {
    return 'document';
  }
  if (
    mime.includes('zip') ||
    mime.includes('rar') ||
    mime.includes('7z-compressed') ||
    mime.includes('tar') ||
    mime.includes('gzip') ||
    mime.includes('x-compressed') ||
    mime === 'application/x-iso9660-image'
  ) {
    return 'archive';
  }
  // Fallbacks on extension for formats with unreliable MIME detection
  const ext = extension.toLowerCase();
  if (IMAGE_EXTENSIONS.includes(ext)) return 'image';
  if (VIDEO_EXTENSIONS.includes(ext)) return 'video';
  if (AUDIO_EXTENSIONS.includes(ext)) return 'audio';
  if (DOCUMENT_EXTENSIONS.includes(ext)) return 'document';
  if (ARCHIVE_EXTENSIONS.includes(ext)) return 'archive';
  return 'other';
}

const MIME_BY_EXTENSION: Record<string, string> = {
  jpg: 'image/jpeg', jpeg: 'image/jpeg', png: 'image/png', webp: 'image/webp',
  gif: 'image/gif', svg: 'image/svg+xml', avif: 'image/avif', bmp: 'image/bmp',
  ico: 'image/x-icon', mp4: 'video/mp4', m4v: 'video/x-m4v', webm: 'video/webm',
  mov: 'video/quicktime', mkv: 'video/x-matroska', ogv: 'video/ogg', avi: 'video/x-msvideo',
  mp3: 'audio/mpeg', wav: 'audio/wav', ogg: 'audio/ogg', oga: 'audio/ogg', m4a: 'audio/mp4',
  flac: 'audio/flac', aac: 'audio/aac', opus: 'audio/opus', pdf: 'application/pdf',
  zip: 'application/zip', rar: 'application/vnd.rar', '7z': 'application/x-7z-compressed',
  tar: 'application/x-tar', gz: 'application/gzip', tgz: 'application/gzip',
  txt: 'text/plain', md: 'text/markdown', csv: 'text/csv', json: 'application/json',
  xml: 'application/xml', html: 'text/html', css: 'text/css', js: 'text/javascript',
  doc: 'application/msword',
  docx: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  xls: 'application/vnd.ms-excel',
  xlsx: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  ppt: 'application/vnd.ms-powerpoint',
  pptx: 'application/vnd.openxmlformats-officedocument.presentationml.presentation',
};

export function mimeForExtension(extension: string): string {
  return MIME_BY_EXTENSION[extension.toLowerCase()] ?? 'application/octet-stream';
}

/** MIME types that browsers can render natively in an <img> tag. */
export const INLINE_IMAGE_TYPES = [
  'image/jpeg', 'image/png', 'image/webp', 'image/gif', 'image/avif', 'image/svg+xml', 'image/bmp',
];

export const INLINE_VIDEO_TYPES = ['video/mp4', 'video/webm', 'video/ogg', 'video/quicktime', 'video/x-m4v'];

export const INLINE_AUDIO_TYPES = [
  'audio/mpeg', 'audio/mp3', 'audio/wav', 'audio/x-wav', 'audio/ogg', 'audio/mp4',
  'audio/m4a', 'audio/flac', 'audio/aac', 'audio/opus',
];

export const TEXT_PREVIEW_TYPES = [
  'text/plain', 'text/markdown', 'text/csv', 'application/json', 'application/xml',
  'text/xml', 'text/javascript', 'application/javascript', 'text/css', 'text/x-python',
];

export function isImage(mime: string) {
  return mime.startsWith('image/');
}
export function isVideo(mime: string) {
  return mime.startsWith('video/');
}
export function isAudio(mime: string) {
  return mime.startsWith('audio/');
}
export function isPdf(mime: string) {
  return mime === 'application/pdf';
}

/** RFC 6266 safe Content-Disposition value. */
export function contentDisposition(type: 'inline' | 'attachment', filename: string): string {
  const asciiFallback = filename.replace(/[^\x20-\x7E]/g, '_').replace(/["\\]/g, '_');
  const encoded = encodeURIComponent(filename);
  return `${type}; filename="${asciiFallback}"; filename*=UTF-8''${encoded}`;
}

/** Removes path traversal and control characters from a user-supplied filename. */
export function sanitizeFilename(name: string): string {
  const base = name
    .replace(/[\u0000-\u001f\u007f]/g, '')
    .replace(/[/\\]/g, '-')
    .replace(/^\.+/, '')
    .trim();
  const safe = base || 'file';
  return safe.length > 180 ? `${safe.slice(0, 170)}.${extensionOf(safe)}` : safe;
}

/** Appends " (1)", " (2)" … until the filename is unique in the given set. */
export function uniqueFilename(name: string, taken: Set<string>): string {
  if (!taken.has(name.toLowerCase())) return name;
  const ext = extensionOf(name);
  const stem = ext ? name.slice(0, -(ext.length + 1)) : name;
  for (let i = 1; i < 500; i += 1) {
    const candidate = ext ? `${stem} (${i}).${ext}` : `${stem} (${i})`;
    if (!taken.has(candidate.toLowerCase())) return candidate;
  }
  return `${stem}-${Date.now()}${ext ? `.${ext}` : ''}`;
}

export function iconForCategory(category: string): string {
  switch (category) {
    case 'image':
      return 'image';
    case 'video':
      return 'video';
    case 'audio':
      return 'audio';
    case 'document':
      return 'document';
    case 'archive':
      return 'archive';
    default:
      return 'file';
  }
}
