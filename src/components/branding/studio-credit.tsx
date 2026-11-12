import { cn } from '@/lib/cn';
import type { PublicBranding } from '@/lib/settings';

/**
 * "Made by ZK STUDIO" credit.
 *
 * The panel is the product, the studio is the maker — so this always renders the
 * studio logo, never the panel logo. It is driven entirely by settings
 * (`studioName` empty hides it), which the admin can change without a redeploy.
 */
export function StudioCredit({
  branding,
  className,
  size = 'sm',
}: {
  branding: Pick<PublicBranding, 'studioName' | 'studioLogoUrl'>;
  className?: string;
  size?: 'sm' | 'md';
}) {
  if (!branding.studioName) return null;

  const logo = size === 'md' ? 'h-7 w-7' : 'h-5 w-5';

  return (
    <span
      className={cn(
        'inline-flex items-center gap-2 text-[11px] font-medium text-muted',
        className,
      )}
    >
      <span>Made by</span>
      {branding.studioLogoUrl ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={branding.studioLogoUrl}
          alt=""
          className={cn('shrink-0 rounded-full object-contain', logo)}
        />
      ) : null}
      <span className="font-semibold uppercase tracking-[0.14em] text-ink/80">
        {branding.studioName}
      </span>
    </span>
  );
}
