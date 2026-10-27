import { useCallback, useEffect, useRef, useState } from 'react';
import { leafCount, turnedForPage, visiblePages, type FlipMode } from '../../lib/flip.ts';

/** Must match the leaf transition in reader.css. */
export const FLIP_MS = 900;
/** Delay between leaves when riffling to a distant page. */
const RIFFLE_GAP_MS = 85;

function useMediaQuery(query: string): boolean {
  const [matches, setMatches] = useState(() => window.matchMedia(query).matches);
  useEffect(() => {
    const list = window.matchMedia(query);
    const update = () => setMatches(list.matches);
    list.addEventListener('change', update);
    return () => list.removeEventListener('change', update);
  }, [query]);
  return matches;
}

/**
 * Page-turn state: how many leaves are turned, which are in flight, and the
 * actions to turn one leaf or riffle to any page. With reduced motion, pages
 * change instantly instead of flying.
 */
export function useFlipBook(pageCount: number) {
  const narrow = useMediaQuery('(max-width: 760px)');
  const reducedMotion = useMediaQuery('(prefers-reduced-motion: reduce)');
  const mode: FlipMode = narrow ? 'single' : 'double';
  const total = leafCount(pageCount, mode);

  const [turned, setTurned] = useState(0);
  const turnedRef = useRef(0);
  const [flights, setFlights] = useState<ReadonlyMap<number, 1 | -1>>(new Map());
  const riffle = useRef<number | undefined>(undefined);
  const [riffleOrigin, setRiffleOrigin] = useState<number | null>(null);
  const inFlight = useRef(0);

  // Switching between spreads and single pages keeps the same page in view.
  const modeRef = useRef(mode);
  useEffect(() => {
    if (modeRef.current === mode) return;
    const page = visiblePages(turnedRef.current, pageCount, modeRef.current).at(-1) ?? 0;
    modeRef.current = mode;
    turnedRef.current = Math.min(turnedForPage(page, mode), leafCount(pageCount, mode));
    setTurned(turnedRef.current);
  }, [mode, pageCount]);

  useEffect(() => () => window.clearTimeout(riffle.current), []);

  const step = useCallback(
    (direction: 1 | -1): boolean => {
      const current = turnedRef.current;
      const next = current + direction;
      if (next < 0 || next > total) return false;
      turnedRef.current = next;
      setTurned(next);
      if (!reducedMotion) {
        const leaf = direction === 1 ? current : next;
        inFlight.current += 1;
        setFlights((f) => new Map(f).set(leaf, direction));
        window.setTimeout(() => {
          inFlight.current -= 1;
          if (inFlight.current === 0) setRiffleOrigin(null);
          setFlights((f) => {
            const rest = new Map(f);
            rest.delete(leaf);
            return rest;
          });
        }, FLIP_MS);
      }
      return true;
    },
    [total, reducedMotion],
  );

  const stopRiffle = () => window.clearTimeout(riffle.current);

  /** Completes a turn the reader made by hand: it has already been animated. */
  const settle = useCallback(
    (direction: 1 | -1) => {
      stopRiffle();
      const next = turnedRef.current + direction;
      if (next < 0 || next > total) return;
      turnedRef.current = next;
      setTurned(next);
    },
    [total],
  );

  const next = useCallback(() => {
    stopRiffle();
    step(1);
  }, [step]);

  const prev = useCallback(() => {
    stopRiffle();
    step(-1);
  }, [step]);

  /** Riffles leaf by leaf to the spread showing `page`. */
  const goToPage = useCallback(
    (page: number) => {
      stopRiffle();
      const target = Math.max(0, Math.min(turnedForPage(page, mode), total));
      if (reducedMotion) {
        turnedRef.current = target;
        setTurned(target);
        return;
      }
      const start = turnedRef.current;
      if (start === target) return;
      setRiffleOrigin((origin) => origin ?? start);
      const tick = () => {
        const current = turnedRef.current;
        if (current === target) return;
        step(current < target ? 1 : -1);
        riffle.current = window.setTimeout(tick, RIFFLE_GAP_MS);
      };
      tick();
    },
    [mode, total, reducedMotion, step],
  );

  return {
    mode,
    total,
    turned,
    flights,
    riffleOrigin,
    reducedMotion,
    next,
    prev,
    settle,
    goToPage,
  };
}
