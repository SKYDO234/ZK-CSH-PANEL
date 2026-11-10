'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useEffect, useRef, useState } from 'react';
import { ChevronDown, LogOut, Menu, Search, Settings, Shield, User as UserIcon } from 'lucide-react';
import { cn } from '@/lib/cn';
import { ThemeToggle } from './theme-toggle';
import { initials } from '@/lib/format';

export function Topbar({
  user,
  allowThemeToggle = true,
  searchPlaceholder,
  onSearch,
  right,
}: {
  user: { name: string; email: string; avatarUrl: string | null; roleLabel: string; isAdmin: boolean };
  allowThemeToggle?: boolean;
  searchPlaceholder?: string;
  onSearch?: (value: string) => void;
  right?: React.ReactNode;
}) {
  const router = useRouter();
  const [menuOpen, setMenuOpen] = useState(false);
  const [query, setQuery] = useState('');
  const menuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const onClick = (event: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(event.target as Node)) setMenuOpen(false);
    };
    document.addEventListener('mousedown', onClick);
    return () => document.removeEventListener('mousedown', onClick);
  }, []);

  const logout = async () => {
    await fetch('/api/auth/logout', {
      method: 'POST',
      headers: { 'x-csrf-token': document.cookie.match(/vaultly_csrf=([^;]+)/)?.[1] ?? '' },
    });
    router.push('/login');
    router.refresh();
  };

  return (
    <header className="sticky top-0 z-20 flex h-16 items-center gap-3 border-b border-line bg-surface/80 px-4 backdrop-blur-md sm:px-6">
      <button
        type="button"
        className="btn-icon lg:hidden"
        aria-label="Open navigation"
        onClick={() => window.__vaultlyOpenSidebar?.()}
      >
        <Menu className="h-4 w-4" />
      </button>

      {onSearch ? (
        <form
          className="relative hidden max-w-md flex-1 sm:block"
          onSubmit={(event) => {
            event.preventDefault();
            onSearch(query);
          }}
          role="search"
        >
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted" />
          <input
            type="search"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder={searchPlaceholder ?? 'Search files…'}
            aria-label="Search"
            className="input pl-9"
          />
        </form>
      ) : (
        <div className="flex-1" />
      )}

      <div className="ml-auto flex items-center gap-2">
        {right}
        {allowThemeToggle ? <ThemeToggle compact /> : null}

        <div className="relative" ref={menuRef}>
          <button
            type="button"
            onClick={() => setMenuOpen((v) => !v)}
            aria-haspopup="menu"
            aria-expanded={menuOpen}
            className="flex items-center gap-2 rounded-xl border border-line bg-surface py-1 pl-1 pr-2.5 transition hover:bg-canvas"
          >
            <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-brand/10 text-xs font-semibold text-brand">
              {user.avatarUrl ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={user.avatarUrl} alt="" className="h-full w-full rounded-lg object-cover" />
              ) : (
                initials(user.name)
              )}
            </span>
            <span className="hidden text-left sm:block">
              <span className="block max-w-[9rem] truncate text-xs font-semibold leading-tight text-ink">
                {user.name}
              </span>
              <span className="block text-[10px] leading-tight text-muted">{user.roleLabel}</span>
            </span>
            <ChevronDown className="h-3.5 w-3.5 text-muted" />
          </button>

          {menuOpen ? (
            <div
              role="menu"
              className="absolute right-0 mt-2 w-56 animate-scale-in overflow-hidden rounded-xl border border-line bg-surface p-1 shadow-pop"
            >
              <div className="border-b border-line px-3 py-2.5">
                <p className="truncate text-sm font-semibold text-ink">{user.name}</p>
                <p className="truncate text-xs text-muted">{user.email}</p>
              </div>
              <Link
                role="menuitem"
                href="/dashboard/settings"
                onClick={() => setMenuOpen(false)}
                className="flex items-center gap-2.5 rounded-lg px-3 py-2 text-sm text-ink transition hover:bg-canvas"
              >
                <UserIcon className="h-4 w-4 text-muted" /> Account settings
              </Link>
              {user.isAdmin ? (
                <Link
                  role="menuitem"
                  href="/admin"
                  onClick={() => setMenuOpen(false)}
                  className="flex items-center gap-2.5 rounded-lg px-3 py-2 text-sm text-ink transition hover:bg-canvas"
                >
                  <Shield className="h-4 w-4 text-muted" /> Admin panel
                </Link>
              ) : null}
              <Link
                role="menuitem"
                href="/dashboard/settings#security"
                onClick={() => setMenuOpen(false)}
                className="flex items-center gap-2.5 rounded-lg px-3 py-2 text-sm text-ink transition hover:bg-canvas"
              >
                <Settings className="h-4 w-4 text-muted" /> Security
              </Link>
              <button
                role="menuitem"
                type="button"
                onClick={() => void logout()}
                className={cn(
                  'flex w-full items-center gap-2.5 rounded-lg px-3 py-2 text-sm text-red-600 transition hover:bg-red-500/10',
                )}
              >
                <LogOut className="h-4 w-4" /> Sign out
              </button>
            </div>
          ) : null}
        </div>
      </div>
    </header>
  );
}
