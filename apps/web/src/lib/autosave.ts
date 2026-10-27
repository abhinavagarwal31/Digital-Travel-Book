import { useCallback, useEffect, useRef, useState } from 'react';

export type SaveState = 'idle' | 'pending' | 'saving' | 'saved' | 'error';

export const AUTOSAVE_DELAY_MS = 800;

/**
 * Saves text a moment after the user stops typing. At most one save is in
 * flight; edits made meanwhile are saved right after it, newest text only, so
 * an older save can never land after a newer one. A failed save keeps the
 * text pending until the next edit, blur or retry. Leaving the page while
 * anything is unsaved asks first.
 */
export function useAutosave(save: (value: string) => Promise<unknown>, delay = AUTOSAVE_DELAY_MS) {
  const [state, setState] = useState<SaveState>('idle');
  const saveRef = useRef(save);
  const waiting = useRef<string | null>(null);
  const running = useRef(false);
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);

  useEffect(() => {
    saveRef.current = save;
  });

  const flush = useCallback(async () => {
    clearTimeout(timer.current);
    if (running.current) return; // the running loop picks up the newest text
    running.current = true;
    try {
      while (waiting.current !== null) {
        const value = waiting.current;
        waiting.current = null;
        setState('saving');
        try {
          await saveRef.current(value);
        } catch {
          waiting.current ??= value;
          setState('error');
          return;
        }
      }
      setState('saved');
    } finally {
      running.current = false;
    }
  }, []);

  const change = useCallback(
    (value: string) => {
      waiting.current = value;
      setState('pending');
      clearTimeout(timer.current);
      timer.current = setTimeout(() => void flush(), delay);
    },
    [delay, flush],
  );

  useEffect(() => {
    const warn = (event: BeforeUnloadEvent) => {
      if (waiting.current !== null || running.current) event.preventDefault();
    };
    window.addEventListener('beforeunload', warn);
    return () => {
      window.removeEventListener('beforeunload', warn);
      // Leaving the page within the app: save what was typed.
      if (waiting.current !== null) void flush();
    };
  }, [flush]);

  return { state, change, flush };
}
