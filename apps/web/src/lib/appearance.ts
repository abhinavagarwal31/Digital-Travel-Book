import { useEffect, useSyncExternalStore } from 'react';

export type Appearance = 'system' | 'light' | 'dark';

const KEY = 'tb-appearance';
const DARK_QUERY = '(prefers-color-scheme: dark)';
const listeners = new Set<() => void>();

function read(): Appearance {
  try {
    const saved = localStorage.getItem(KEY);
    return saved === 'light' || saved === 'dark' ? saved : 'system';
  } catch {
    return 'system';
  }
}

function systemDark(): boolean {
  return window.matchMedia?.(DARK_QUERY).matches ?? false;
}

/** Puts the colours on the page: <html data-theme="light|dark">, as theme-init.js does at load. */
function apply(appearance: Appearance) {
  const dark = appearance === 'dark' || (appearance === 'system' && systemDark());
  document.documentElement.dataset.theme = dark ? 'dark' : 'light';
}

export function setAppearance(appearance: Appearance) {
  try {
    if (appearance === 'system') localStorage.removeItem(KEY);
    else localStorage.setItem(KEY, appearance);
  } catch {
    // Storage blocked: the choice lasts until the page is closed.
  }
  apply(appearance);
  for (const notify of listeners) notify();
}

function subscribe(notify: () => void) {
  listeners.add(notify);
  return () => listeners.delete(notify);
}

/**
 * Light, dark, or following the system. Every control showing it (header
 * switch, account page) stays in step, and "system" follows the OS live.
 */
export function useAppearance() {
  const appearance = useSyncExternalStore(subscribe, read, () => 'system' as const);
  const dark = useSyncExternalStore(
    subscribe,
    () => document.documentElement.dataset.theme === 'dark',
    () => false,
  );

  useEffect(() => {
    if (appearance !== 'system' || !window.matchMedia) return;
    const list = window.matchMedia(DARK_QUERY);
    const follow = () => {
      apply('system');
      for (const notify of listeners) notify();
    };
    list.addEventListener('change', follow);
    return () => list.removeEventListener('change', follow);
  }, [appearance]);

  return { appearance, dark, setAppearance };
}
