'use client';

import { cn } from '@/lib/cn';
import { Cloud } from 'lucide-react';

/**
 * Logo mark. If the admin uploaded a logo it is used as-is; otherwise a
 * generated mark in the brand colour keeps the panel looking intentional.
 */
export function Logo({
  name,
  logoUrl,
  markUrl,
  className,
  size = 'md',
  showWordmark = true,
  invert = false,
  full = false,
}: {
  name: string;
  logoUrl?: string | null;
  /** Square mark for compact slots; falls back to the full logo. */
  markUrl?: string | null;
  className?: string;
  size?: 'sm' | 'md' | 'lg';
  showWordmark?: boolean;
  invert?: boolean;
  /** Render the full lockup (logo with its own wordmark) instead of the mark. */
  full?: boolean;
}) {
  const box = size === 'sm' ? 'h-8 w-8 rounded-lg' : size === 'lg' ? 'h-11 w-11 rounded-2xl' : 'h-9 w-9 rounded-xl';
  const text = size === 'sm' ? 'text-sm' : size === 'lg' ? 'text-xl' : 'text-base';

  // The full artwork already contains the panel name, so the text wordmark is
  // dropped to avoid printing it twice.
  const lockup = full && logoUrl;
  const src = lockup ? logoUrl : (markUrl || logoUrl);

  return (
    <span className={cn('flex items-center gap-2.5', className)}>
      {src ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={src}
          alt={`${name} logo`}
          className={cn('shrink-0 object-contain', lockup ? 'h-10 w-auto' : box)}
        />
      ) : (
        <span
          className={cn(
            'flex shrink-0 items-center justify-center bg-gradient-to-br from-brand to-secondary text-white shadow-sm',
            box,
          )}
          aria-hidden="true"
        >
          <Cloud className={size === 'lg' ? 'h-6 w-6' : 'h-[18px] w-[18px]'} strokeWidth={2.2} />
        </span>
      )}
      {showWordmark && !lockup ? (
        <span
          className={cn(
            'truncate font-semibold tracking-tight',
            text,
            invert ? 'text-[rgb(var(--sidebar-ink))]' : 'text-ink',
          )}
        >
          {name}
        </span>
      ) : null}
    </span>
  );
}
