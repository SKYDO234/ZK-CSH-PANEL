'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useState } from 'react';
import {
  Activity,
  FolderOpen,
  HardDrive,
  Home,
  Image as ImageIcon,
  LayoutDashboard,
  Link2,
  Menu,
  Settings,
  Shield,
  Sparkles,
  Trash2,
  Upload,
  Users,
  Video,
  X,
} from 'lucide-react';
import { cn } from '@/lib/cn';
import { Logo } from '@/components/branding/logo';
import { ProgressBar } from '@/components/ui/misc';
import { formatBytes } from '@/lib/format';
import type { PublicBranding } from '@/lib/settings';

export type NavUser = {
  name: string;
  email: string;
  roleLabel: string;
  quotaBytes: number;
  usedBytes: number;
  isAdmin: boolean;
};

const USER_NAV = [
  { href: '/dashboard', label: 'Overview', icon: Home },
  { href: '/dashboard/files', label: 'My Files', icon: FolderOpen },
  { href: '/dashboard/upload', label: 'Upload', icon: Upload },
  { href: '/dashboard/images', label: 'Images', icon: ImageIcon },
  { href: '/dashboard/videos', label: 'Videos', icon: Video },
  { href: '/dashboard/links', label: 'Shared Links', icon: Link2 },
  { href: '/dashboard/trash', label: 'Trash', icon: Trash2 },
  { href: '/dashboard/settings', label: 'Account', icon: Settings },
];

const ADMIN_NAV = [
  { href: '/admin', label: 'Dashboard', icon: LayoutDashboard },
  { href: '/admin/users', label: 'Users', icon: Users },
  { href: '/admin/files', label: 'All Files', icon: HardDrive },
  { href: '/admin/appearance', label: 'Appearance', icon: Sparkles },
  { href: '/admin/settings', label: 'Settings', icon: Settings },
  { href: '/admin/activity', label: 'Activity', icon: Activity },
  { href: '/admin/security', label: 'Security', icon: Shield },
];

export function Sidebar({
  branding,
  user,
  variant = 'user',
}: {
  branding: PublicBranding;
  user: NavUser;
  variant?: 'user' | 'admin';
}) {
  const pathname = usePathname();
  const [mobileOpen, setMobileOpen] = useState(false);
  const nav = variant === 'admin' ? ADMIN_NAV : USER_NAV;

  const content = (
    <div className="flex h-full flex-col">
      <div className="flex h-16 shrink-0 items-center justify-between px-5">
        <Link href={variant === 'admin' ? '/admin' : '/dashboard'} onClick={() => setMobileOpen(false)}>
          <Logo name={branding.platformName} logoUrl={branding.logoUrl} markUrl={branding.markUrl} invert={branding.sidebarStyle === 'dark'} />
        </Link>
        <button
          type="button"
          className="rounded-lg p-1.5 text-[rgb(var(--sidebar-ink))]/70 transition hover:bg-white/10 lg:hidden"
          onClick={() => setMobileOpen(false)}
          aria-label="Close navigation"
        >
          <X className="h-5 w-5" />
        </button>
      </div>

      <nav className="flex-1 space-y-1 overflow-y-auto px-3 pb-4" aria-label="Main navigation">
        {nav.map((item) => {
          const active =
            item.href === '/admin' || item.href === '/dashboard'
              ? pathname === item.href
              : pathname.startsWith(item.href);
          const Icon = item.icon;
          return (
            <Link
              key={item.href}
              href={item.href}
              onClick={() => setMobileOpen(false)}
              aria-current={active ? 'page' : undefined}
              className={cn(
                'nav-link',
                active
                  ? 'bg-brand text-white shadow-sm'
                  : 'text-[rgb(var(--sidebar-ink))]/70 hover:bg-white/10 hover:text-[rgb(var(--sidebar-ink))]',
              )}
            >
              <Icon className="h-[18px] w-[18px]" />
              <span className="truncate">{item.label}</span>
            </Link>
          );
        })}

        {variant === 'user' && user.isAdmin ? (
          <>
            <div className="my-3 border-t border-white/10" />
            <Link
              href="/admin"
              onClick={() => setMobileOpen(false)}
              className="nav-link text-[rgb(var(--sidebar-ink))]/70 hover:bg-white/10 hover:text-[rgb(var(--sidebar-ink))]"
            >
              <Shield className="h-[18px] w-[18px]" />
              <span>Admin panel</span>
            </Link>
          </>
        ) : null}

        {variant === 'admin' ? (
          <>
            <div className="my-3 border-t border-white/10" />
            <Link
              href="/dashboard"
              onClick={() => setMobileOpen(false)}
              className="nav-link text-[rgb(var(--sidebar-ink))]/70 hover:bg-white/10 hover:text-[rgb(var(--sidebar-ink))]"
            >
              <Home className="h-[18px] w-[18px]" />
              <span>My storage</span>
            </Link>
          </>
        ) : null}
      </nav>

      {variant === 'user' ? (
        <div className="shrink-0 px-3 pb-3">
          <div className="rounded-xl bg-white/[0.06] p-3.5">
            <div className="mb-2 flex items-center justify-between text-[11px] font-medium text-[rgb(var(--sidebar-ink))]/60">
              <span>Storage</span>
              <span>{((user.usedBytes / user.quotaBytes) * 100 || 0).toFixed(0)}%</span>
            </div>
            <ProgressBar value={user.usedBytes} max={user.quotaBytes} size="sm" />
            <p className="mt-2 text-[11px] text-[rgb(var(--sidebar-ink))]/60">
              {formatBytes(user.usedBytes)} of {formatBytes(user.quotaBytes)}
            </p>
            <Link
              href="/dashboard/settings"
              onClick={() => setMobileOpen(false)}
              className="mt-2.5 block text-[11px] font-semibold text-brand-300 hover:text-brand-200"
            >
              Manage plan →
            </Link>
          </div>
        </div>
      ) : null}

      <div className="shrink-0 border-t border-white/10 px-4 py-3">
        <p className="truncate text-xs font-medium text-[rgb(var(--sidebar-ink))]/80">{user.name}</p>
        <p className="truncate text-[11px] text-[rgb(var(--sidebar-ink))]/50">{user.email}</p>
        {branding.showPoweredBy && branding.studioName ? (
          <span className="mt-2 flex items-center gap-1.5 text-[10px] text-[rgb(var(--sidebar-ink))]/45">
            <span>Made by</span>
            {branding.studioLogoUrl ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={branding.studioLogoUrl}
                alt=""
                className="h-4 w-4 shrink-0 rounded-full object-contain opacity-80"
              />
            ) : null}
            <span className="font-semibold uppercase tracking-[0.12em]">{branding.studioName}</span>
          </span>
        ) : null}
      </div>
    </div>
  );

  return (
    <>
      {/* Mobile trigger lives in the topbar; this is the drawer */}
      <div
        className={cn(
          'fixed inset-0 z-40 lg:hidden',
          mobileOpen ? 'pointer-events-auto' : 'pointer-events-none',
        )}
        aria-hidden={!mobileOpen}
      >
        <div
          className={cn(
            'absolute inset-0 bg-slate-950/50 backdrop-blur-sm transition-opacity',
            mobileOpen ? 'opacity-100' : 'opacity-0',
          )}
          onClick={() => setMobileOpen(false)}
        />
        <aside
          id="mobile-sidebar"
          className={cn(
            'absolute left-0 top-0 h-full w-72 bg-[rgb(var(--sidebar-bg))] shadow-pop transition-transform duration-300',
            mobileOpen ? 'translate-x-0' : '-translate-x-full',
          )}
        >
          {content}
        </aside>
      </div>

      <aside
        className={cn(
          'fixed left-0 top-0 z-30 hidden h-screen w-64 flex-col bg-[rgb(var(--sidebar-bg))] lg:flex',
          branding.sidebarStyle === 'light' && 'sidebar-light border-r border-line',
        )}
      >
        {content}
      </aside>

      <MobileTriggerSetter onOpen={() => setMobileOpen(true)} open={mobileOpen} />
    </>
  );
}

/**
 * Publishes the drawer opener to the topbar through a custom event so the two
 * components stay decoupled (the topbar is rendered by a different layout).
 */
function MobileTriggerSetter({ onOpen, open }: { onOpen: () => void; open: boolean }) {
  if (typeof window !== 'undefined') {
    window.__vaultlyOpenSidebar = onOpen;
  }
  return <span hidden data-mobile-nav-open={open} />;
}

declare global {
  interface Window {
    __vaultlyOpenSidebar?: () => void;
  }
}
