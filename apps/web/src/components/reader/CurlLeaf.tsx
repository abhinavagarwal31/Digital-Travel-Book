import { useId, useLayoutEffect, useRef, type ReactNode } from 'react';
import {
  clipPath,
  constrainCorner,
  cornerAlongTurn,
  curlAt,
  type Corner,
  type Curl,
  type Direction,
  type Vec,
} from '../../lib/curl.ts';
import type { FlipMode } from '../../lib/flip.ts';

/**
 * Where the page's corner is at a moment, and whether the turn is over. The
 * default is a timed turn; a drag passes one that follows the pointer.
 */
export type CornerDriver = (now: number, W: number, H: number) => { corner: Vec; done: boolean };

interface CurlLeafProps {
  direction: Direction;
  /** Overrides the timed turn: e.g. a hand dragging the corner. */
  driver?: CornerDriver;
  mode: FlipMode;
  duration: number;
  /** The face lying flat when the turn starts, and the one revealed as it folds over. */
  lying: ReactNode;
  other: ReactNode;
  lyingSide: 'front' | 'back';
  zIndex: number;
  corner?: Corner;
}

const toPoints = (poly: Vec[], dx: number) =>
  poly.map((q) => `${(q.x + dx).toFixed(2)},${q.y.toFixed(2)}`).join(' ');

/**
 * One sheet of paper turning: it folds along a moving line, the part past the
 * fold flips over showing its other side, the bend catches the light, and the
 * flap casts a shadow on the page it uncovers. Driven frame by frame, writing
 * straight to the DOM, so React renders the turn once rather than 60 times a
 * second.
 */
export function CurlLeaf({
  direction,
  mode,
  duration,
  lying,
  other,
  lyingSide,
  zIndex,
  corner = 'bottom',
  driver,
}: CurlLeafProps) {
  const root = useRef<HTMLDivElement>(null);
  const lyingEl = useRef<HTMLDivElement>(null);
  const otherEl = useRef<HTMLDivElement>(null);
  const flapWrap = useRef<HTMLDivElement>(null);
  const cast = useRef<SVGPolygonElement>(null);
  const castGradient = useRef<SVGLinearGradientElement>(null);
  const castStop = useRef<SVGStopElement>(null);
  const sheen = useRef<SVGPolygonElement>(null);
  const sheenGradient = useRef<SVGLinearGradientElement>(null);
  // SVG ids must be plain; React's ids carry punctuation.
  const id = `curl-${useId().replace(/[^a-zA-Z0-9]/g, '')}`;

  useLayoutEffect(() => {
    const box = root.current;
    if (!box) return;
    let frame = 0;
    const start = performance.now();

    const draw = (curl: Curl, W: number, spineX: number) => {
      const lyingLeft = direction === 1 ? 0 : -W;
      lyingEl.current?.style.setProperty('clip-path', clipPath(curl.lying, { x: lyingLeft, y: 0 }));
      const o = otherEl.current;
      if (o) {
        o.style.transform = `matrix(${curl.flapMatrix.map((v) => v.toFixed(5)).join(',')})`;
        o.style.clipPath = clipPath(curl.flapLocal, { x: 0, y: 0 });
      }
      // Shadows are strongest mid-turn, when the sheet stands highest off the page.
      const height = Math.sin(Math.PI * curl.progress);
      flapWrap.current?.style.setProperty(
        'filter',
        `drop-shadow(${(-direction * 6 * height).toFixed(1)}px ${(4 * height).toFixed(1)}px ${(6 + 18 * height).toFixed(1)}px rgb(30 20 10 / ${(0.12 + 0.3 * height).toFixed(2)}))`,
      );
      if (mode === 'single') {
        // On a phone the page leaves the screen: fade it as it goes.
        flapWrap.current?.style.setProperty(
          'opacity',
          String(Math.min(1, 2.4 - 2.4 * curl.progress)),
        );
      }

      const fold = curl.fold;
      if (!fold) {
        cast.current?.setAttribute('points', '');
        sheen.current?.setAttribute('points', '');
        return;
      }
      const mid = { x: (fold[0].x + fold[1].x) / 2 + spineX, y: (fold[0].y + fold[1].y) / 2 };
      const n = curl.normal;
      // The uncovered page is darker right under the fold, fading over a hand's width.
      const reach = W * (0.08 + 0.22 * height);
      cast.current?.setAttribute('points', toPoints(curl.flap, spineX));
      castGradient.current?.setAttribute('x1', String(mid.x));
      castGradient.current?.setAttribute('y1', String(mid.y));
      castGradient.current?.setAttribute('x2', String(mid.x - n.x * reach));
      castGradient.current?.setAttribute('y2', String(mid.y - n.y * reach));
      castStop.current?.setAttribute('stop-opacity', (0.15 + 0.35 * height).toFixed(2));
      // The bend: shaded in the crease, a highlight where the paper rounds, then flat.
      const extent = Math.max(
        1,
        ...curl.flapShown.map((q) => (q.x + spineX - mid.x) * n.x + (q.y - mid.y) * n.y),
      );
      sheen.current?.setAttribute('points', toPoints(curl.flapShown, spineX));
      sheenGradient.current?.setAttribute('x1', String(mid.x));
      sheenGradient.current?.setAttribute('y1', String(mid.y));
      sheenGradient.current?.setAttribute('x2', String(mid.x + n.x * extent));
      sheenGradient.current?.setAttribute('y2', String(mid.y + n.y * extent));
    };

    const timed: CornerDriver = (now, W, H) => {
      const t = Math.min(1, (now - start) / duration);
      return { corner: cornerAlongTurn(t, direction, corner, W, H), done: t >= 1 };
    };
    const where = driver ?? timed;

    const tick = (now: number) => {
      const width = box.offsetWidth;
      const H = box.offsetHeight;
      const W = mode === 'double' ? width / 2 : width;
      const spineX = mode === 'double' ? W : 0;
      const { corner: p, done } = where(now, W, H);
      const held = constrainCorner(p, corner, W, H);
      draw(curlAt(held, direction, corner, W, H), W, spineX);
      if (!done) frame = requestAnimationFrame(tick);
    };
    // The first frame is drawn before the browser paints, so nothing flashes.
    tick(start);
    return () => cancelAnimationFrame(frame);
  }, [direction, mode, duration, corner, driver]);

  const otherSide = lyingSide === 'front' ? 'back' : 'front';
  return (
    <div
      ref={root}
      className={`curl ${mode} ${direction === 1 ? 'forward' : 'back'}`}
      style={{ zIndex }}
      aria-hidden="true"
    >
      <svg className="curl-shading" aria-hidden="true">
        <defs>
          <linearGradient ref={castGradient} id={`${id}-cast`} gradientUnits="userSpaceOnUse">
            <stop ref={castStop} offset="0" stopColor="rgb(30 20 10)" stopOpacity="0" />
            <stop offset="1" stopColor="rgb(30 20 10)" stopOpacity="0" />
          </linearGradient>
          <linearGradient ref={sheenGradient} id={`${id}-sheen`} gradientUnits="userSpaceOnUse">
            <stop offset="0" stopColor="rgb(40 25 10)" stopOpacity="0.28" />
            <stop offset="0.06" stopColor="rgb(40 25 10)" stopOpacity="0.1" />
            <stop offset="0.16" stopColor="rgb(255 250 240)" stopOpacity="0.32" />
            <stop offset="0.45" stopColor="rgb(255 250 240)" stopOpacity="0.06" />
            <stop offset="1" stopColor="rgb(40 25 10)" stopOpacity="0.08" />
          </linearGradient>
        </defs>
        <polygon ref={cast} fill={`url(#${id}-cast)`} />
      </svg>
      <div ref={lyingEl} className={`face ${lyingSide} curl-lying`}>
        {lying}
      </div>
      <div ref={flapWrap} className="curl-flap">
        <div ref={otherEl} className={`face ${otherSide} curl-other`}>
          {other}
        </div>
      </div>
      <svg className="curl-shading curl-sheen" aria-hidden="true">
        <polygon ref={sheen} fill={`url(#${id}-sheen)`} />
      </svg>
    </div>
  );
}
