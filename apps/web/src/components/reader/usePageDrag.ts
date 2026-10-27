import { useCallback, useRef, useState, type PointerEvent } from 'react';
import { constrainCorner, type Corner, type Direction, type Vec } from '../../lib/curl.ts';
import type { FlipMode } from '../../lib/flip.ts';
import type { CornerDriver } from './CurlLeaf.tsx';

/** How far a press must move before it is a drag rather than a tap. */
const DRAG_THRESHOLD_PX = 8;
/** Grabbing within this share of the page from its outer edge picks the page up. */
const GRAB_ZONE = 0.42;
/** Let go with the corner past this share of the way to the spine, and the page turns. */
const TURN_AT = 0.4;
const SETTLE_MS = 420;

export interface PageDrag {
  leaf: number;
  direction: Direction;
  corner: Corner;
  driver: CornerDriver;
}

interface Hold {
  leaf: number;
  direction: Direction;
  corner: Corner;
  /** The spread's spine and top edge on screen, and the page width, at the press. */
  spineX: number;
  top: number;
  W: number;
  H: number;
  startX: number;
  startY: number;
  started: boolean;
  point: Vec;
  release: { start: number; from: Vec; to: Vec; turn: boolean } | null;
  onTurned: (direction: Direction) => void;
}

const easeOut = (t: number) => 1 - (1 - t) ** 3;

/**
 * Turning a page by hand: press on the outer part of a page and drag, and the
 * paper curls under the pointer; let go past the middle and it carries on
 * over, otherwise it settles back. A press that hardly moves stays a tap.
 */
export function usePageDrag(options: {
  mode: FlipMode;
  turned: number;
  total: number;
  /** Covers are boards: they open with a tap, not by curling. */
  isHard: (leaf: number) => boolean;
  enabled: boolean;
  onTurned: (direction: Direction) => void;
}) {
  const { mode, turned, total, isHard, enabled, onTurned } = options;
  const [drag, setDrag] = useState<Omit<PageDrag, 'driver'> | null>(null);
  const hold = useRef<Hold | null>(null);

  // Reads the live hold on every frame; stable, so the curl never restarts.
  const driver = useCallback<CornerDriver>((now) => {
    const h = hold.current;
    if (!h) return { corner: { x: 0, y: 0 }, done: true };
    const r = h.release;
    if (!r) return { corner: h.point, done: false };
    const t = Math.min(1, (now - r.start) / SETTLE_MS);
    const e = easeOut(t);
    const corner = { x: r.from.x + (r.to.x - r.from.x) * e, y: r.from.y + (r.to.y - r.from.y) * e };
    if (t >= 1 && hold.current === h) {
      hold.current = null;
      // After this frame: the page lands, and the curl gives way to the flat page.
      queueMicrotask(() => {
        setDrag(null);
        if (r.turn) h.onTurned(h.direction);
      });
    }
    return { corner, done: t >= 1 };
  }, []);

  function down(event: PointerEvent<HTMLElement>) {
    if (!enabled || hold.current || event.button !== 0) return;
    const box = event.currentTarget.getBoundingClientRect();
    const W = mode === 'double' ? box.width / 2 : box.width;
    const spineX = box.left + (mode === 'double' ? W : 0);
    const x = event.clientX - spineX;
    const y = event.clientY - box.top;
    let leaf: number;
    let direction: Direction;
    if (x > W * (1 - GRAB_ZONE) && turned < total && !isHard(turned)) {
      leaf = turned;
      direction = 1;
    } else if (mode === 'double' && x < -W * (1 - GRAB_ZONE) && turned > 0 && !isHard(turned - 1)) {
      leaf = turned - 1;
      direction = -1;
    } else {
      return;
    }
    hold.current = {
      leaf,
      direction,
      corner: y > box.height / 2 ? 'bottom' : 'top',
      spineX,
      top: box.top,
      W,
      H: box.height,
      startX: event.clientX,
      startY: event.clientY,
      started: false,
      point: { x, y },
      release: null,
      onTurned,
    };
  }

  function move(event: PointerEvent<HTMLElement>) {
    const h = hold.current;
    if (!h || h.release) return;
    h.point = { x: event.clientX - h.spineX, y: event.clientY - h.top };
    if (!h.started) {
      const moved = Math.hypot(event.clientX - h.startX, event.clientY - h.startY);
      if (moved < DRAG_THRESHOLD_PX) return;
      h.started = true;
      event.currentTarget.setPointerCapture?.(event.pointerId);
      setDrag({ leaf: h.leaf, direction: h.direction, corner: h.corner });
    }
  }

  /** Ends a press. True when it was a drag, so it must not also count as a tap. */
  function up(cancelled = false): boolean {
    const h = hold.current;
    if (!h || h.release) return Boolean(h?.started);
    if (!h.started) {
      hold.current = null;
      return false;
    }
    const restY = h.corner === 'bottom' ? h.H : 0;
    const from = constrainCorner(h.point, h.corner, h.W, h.H);
    const turn = !cancelled && h.direction * from.x < h.W * TURN_AT;
    h.release = {
      start: performance.now(),
      from,
      to: { x: (turn ? -h.direction : h.direction) * h.W, y: restY },
      turn,
    };
    return true;
  }

  return {
    drag: drag && { ...drag, driver },
    down,
    move,
    up,
  };
}
