import { useCallback, useEffect, useRef, useState } from 'react';

/** How long the reader may sit still before the controls step out of the way. */
export const CHROME_IDLE_MS = 2600;

/**
 * Controls that fade while you read and come back the moment you move the
 * mouse, touch the screen or press a key. They never fade while pointed at
 * or while holding keyboard focus, so nobody loses them mid-use.
 */
export function useReaderChrome(idleMs = CHROME_IDLE_MS) {
  const [visible, setVisible] = useState(true);
  const timer = useRef<number | undefined>(undefined);
  const held = useRef(false);

  const fadeLater = useCallback(() => {
    window.clearTimeout(timer.current);
    timer.current = window.setTimeout(() => {
      if (!held.current) setVisible(false);
    }, idleMs);
  }, [idleMs]);

  const wake = useCallback(() => {
    setVisible(true);
    fadeLater();
  }, [fadeLater]);

  useEffect(() => {
    fadeLater();
    const events = ['pointermove', 'pointerdown', 'keydown', 'touchstart'] as const;
    for (const e of events) window.addEventListener(e, wake, { passive: true });
    return () => {
      window.clearTimeout(timer.current);
      for (const e of events) window.removeEventListener(e, wake);
    };
  }, [fadeLater, wake]);

  const holdOn = useCallback(() => {
    held.current = true;
    setVisible(true);
  }, []);
  const holdOff = useCallback(() => {
    held.current = false;
    fadeLater();
  }, [fadeLater]);

  return {
    visible,
    /** Spread onto each control bar: pointing at it or focusing inside it keeps it up. */
    holdProps: {
      onPointerEnter: holdOn,
      onPointerLeave: holdOff,
      onFocus: holdOn,
      onBlur: holdOff,
    },
  };
}

/** The browser's full-screen mode for the reader, where it is available. */
export function useFullscreen() {
  const [active, setActive] = useState(() => Boolean(document.fullscreenElement));
  useEffect(() => {
    const update = () => setActive(Boolean(document.fullscreenElement));
    document.addEventListener('fullscreenchange', update);
    return () => document.removeEventListener('fullscreenchange', update);
  }, []);
  const supported = typeof document.documentElement.requestFullscreen === 'function';
  const toggle = useCallback(() => {
    if (document.fullscreenElement) void document.exitFullscreen();
    else void document.documentElement.requestFullscreen?.().catch(() => undefined);
  }, []);
  return { active, supported, toggle };
}
