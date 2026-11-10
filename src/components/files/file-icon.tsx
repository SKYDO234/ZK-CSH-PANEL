'use client';

import {
  FileArchive,
  FileAudio,
  FileImage,
  FileText,
  FileVideo,
  File as FileIconBase,
  FileSpreadsheet,
  FileCode2,
  FileType2,
  Presentation,
} from 'lucide-react';
import { cn } from '@/lib/cn';

const EXT_STYLES: Record<string, { icon: typeof FileText; className: string; label: string }> = {
  pdf: { icon: FileType2, className: 'text-red-500 bg-red-500/10', label: 'PDF' },
  doc: { icon: FileText, className: 'text-blue-500 bg-blue-500/10', label: 'DOC' },
  docx: { icon: FileText, className: 'text-blue-500 bg-blue-500/10', label: 'DOCX' },
  xls: { icon: FileSpreadsheet, className: 'text-emerald-500 bg-emerald-500/10', label: 'XLS' },
  xlsx: { icon: FileSpreadsheet, className: 'text-emerald-500 bg-emerald-500/10', label: 'XLSX' },
  csv: { icon: FileSpreadsheet, className: 'text-emerald-500 bg-emerald-500/10', label: 'CSV' },
  ppt: { icon: Presentation, className: 'text-orange-500 bg-orange-500/10', label: 'PPT' },
  pptx: { icon: Presentation, className: 'text-orange-500 bg-orange-500/10', label: 'PPTX' },
  txt: { icon: FileText, className: 'text-slate-500 bg-slate-500/10', label: 'TXT' },
  md: { icon: FileText, className: 'text-slate-500 bg-slate-500/10', label: 'MD' },
  json: { icon: FileCode2, className: 'text-amber-500 bg-amber-500/10', label: 'JSON' },
  zip: { icon: FileArchive, className: 'text-teal-500 bg-teal-500/10', label: 'ZIP' },
  rar: { icon: FileArchive, className: 'text-teal-500 bg-teal-500/10', label: 'RAR' },
  '7z': { icon: FileArchive, className: 'text-teal-500 bg-teal-500/10', label: '7Z' },
};

export function FileTypeIcon({
  category,
  extension,
  className,
  size = 'md',
}: {
  category: string;
  extension?: string | null;
  className?: string;
  size?: 'sm' | 'md' | 'lg';
}) {
  const ext = (extension ?? '').toLowerCase();
  const style = EXT_STYLES[ext];
  const dimensions = size === 'sm' ? 'h-8 w-8' : size === 'lg' ? 'h-14 w-14' : 'h-11 w-11';
  const iconSize = size === 'sm' ? 'h-4 w-4' : size === 'lg' ? 'h-6 w-6' : 'h-5 w-5';

  if (style) {
    const Icon = style.icon;
    return (
      <span
        className={cn('flex shrink-0 items-center justify-center rounded-xl', dimensions, style.className, className)}
        aria-hidden="true"
      >
        <Icon className={iconSize} />
      </span>
    );
  }

  const map: Record<string, { icon: typeof FileText; className: string }> = {
    image: { icon: FileImage, className: 'text-violet-500 bg-violet-500/10' },
    video: { icon: FileVideo, className: 'text-rose-500 bg-rose-500/10' },
    audio: { icon: FileAudio, className: 'text-amber-500 bg-amber-500/10' },
    document: { icon: FileText, className: 'text-sky-500 bg-sky-500/10' },
    archive: { icon: FileArchive, className: 'text-teal-500 bg-teal-500/10' },
    other: { icon: FileIconBase, className: 'text-slate-500 bg-slate-500/10' },
  };
  const entry = map[category] ?? map.other;
  const Icon = entry.icon;
  return (
    <span
      className={cn('flex shrink-0 items-center justify-center rounded-xl', dimensions, entry.className, className)}
      aria-hidden="true"
    >
      <Icon className={iconSize} />
    </span>
  );
}
