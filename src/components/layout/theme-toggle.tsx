'use client';

import { useEffect, useState } from 'react';
import { Monitor, Moon, Sun } from 'lucide-react';
import { cn } from '@/lib/cn';

type Mode = 'light' | 'dark' | 'system';

export function useThemeMode() {
  const [mode, setMode] = useState<Mode>('system');

  useEffect(() => {
    const stored = (localStorage.getItem('vaultly-theme') as Mode | null) ?? 'system';
    setMode(stored);
  }, []);

  const apply = (next: Mode) => {
    setMode(next);
    localStorage.setItem('vaultly-theme', next);
    const isDark = next === 'dark' || (next === 'system' && window.matchMedia('(prefers-color-scheme: dark)').matches);
    document.documentElement.classList.toggle('dark', isDark);
    document.documentElement.dataset.themeMode = next;
  };

  return { mode, setMode: apply };
}

export function ThemeToggle({ compact = false }: { compact?: boolean }) {
  const { mode, setMode } = useThemeMode();
  const options: Array<{ value: Mode; icon: typeof Sun; label: string }> = [
    { value: 'light', icon: Sun, label: 'Light' },
    { value: 'dark', icon: Moon, label: 'Dark' },
    { value: 'system', icon: Monitor, label: 'System' },
  ];

  if (compact) {
    const next: Mode = mode === 'dark' ? 'light' : 'dark';
    const Icon = mode === 'dark' ? Sun : Moon;
    return (
      <button
        type="button"
        onClick={() => setMode(next)}
        aria-label={`Switch to ${next} mode`}
        className="btn-icon"
      >
        <Icon className="h-4 w-4" />
      </button>
    );
  }

  return (
    <div
      role="group"
      aria-label="Colour theme"
      className="inline-flex items-center gap-0.5 rounded-xl border border-line bg-canvas p-0.5"
    >
      {options.map((option) => {
        const Icon = option.icon;
        return (
          <button
            key={option.value}
            type="button"
            onClick={() => setMode(option.value)}
            aria-pressed={mode === option.value}
            title={option.label}
            className={cn(
              'rounded-[10px] p-1.5 transition',
              mode === option.value ? 'bg-surface text-ink shadow-sm ring-1 ring-line' : 'text-muted hover:text-ink',
            )}
          >
            <Icon className="h-4 w-4" />
          </button>
        );
      })}
    </div>
  );
}
