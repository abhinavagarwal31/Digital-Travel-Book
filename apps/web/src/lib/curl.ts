/**
 * Page-curl geometry, in 2D, the way a sheet of paper really turns: the page
 * folds along a straight line, the part beyond the fold flips over onto the
 * rest, and you see the back of the paper on that flap.
 *
 * Coordinates are the open spread's, in pixels: the spine is x = 0, the top
 * edge y = 0, pages are W wide and H tall, the right page spans x 0…W and the
 * left page −W…0. A page turning forward lies on the right and its corner
 * travels left; turning back, it lies on the left and travels right.
 *
 * Everything follows from where the page's corner is now (P). The fold is
 * the perpendicular bisector of the corner's resting point C and P: every
 * point of the page nearer C than P is on the flap, and lands reflected
 * across the fold.
 */

export interface Vec {
  x: number;
  y: number;
}

export type Direction = 1 | -1; // 1: forward (right to left), -1: back
export type Corner = 'bottom' | 'top';

const sub = (a: Vec, b: Vec): Vec => ({ x: a.x - b.x, y: a.y - b.y });
const dot = (a: Vec, b: Vec) => a.x * b.x + a.y * b.y;
const len = (a: Vec) => Math.hypot(a.x, a.y);

/** Where the turning page's corner rests before it moves. */
export function restingCorner(direction: Direction, corner: Corner, W: number, H: number): Vec {
  return { x: direction === 1 ? W : -W, y: corner === 'bottom' ? H : 0 };
}

/**
 * Keeps the corner where paper attached at the spine can reach: no further
 * from the spine's end on its own edge than the page is wide, and no further
 * from the other end than the page's diagonal. Otherwise the sheet would tear.
 */
export function constrainCorner(p: Vec, corner: Corner, W: number, H: number): Vec {
  const near: Vec = { x: 0, y: corner === 'bottom' ? H : 0 };
  const far: Vec = { x: 0, y: corner === 'bottom' ? 0 : H };
  let q = p;
  const fromNear = sub(q, near);
  if (len(fromNear) > W)
    q = {
      x: near.x + (fromNear.x / len(fromNear)) * W,
      y: near.y + (fromNear.y / len(fromNear)) * W,
    };
  const diagonal = Math.hypot(W, H);
  const fromFar = sub(q, far);
  if (len(fromFar) > diagonal) {
    q = {
      x: far.x + (fromFar.x / len(fromFar)) * diagonal,
      y: far.y + (fromFar.y / len(fromFar)) * diagonal,
    };
  }
  return q;
}

/** Eases a turn: slow to lift, quick across, gentle to land. */
export const easeTurn = (t: number) => (t < 0.5 ? 4 * t ** 3 : 1 - (-2 * t + 2) ** 3 / 2);

/**
 * The corner's path through an animated turn, t from 0 to 1: an arc over the
 * spine, lifted a little off the page as a hand would carry it.
 */
export function cornerAlongTurn(
  t: number,
  direction: Direction,
  corner: Corner,
  W: number,
  H: number,
): Vec {
  const angle = Math.PI * easeTurn(Math.min(1, Math.max(0, t)));
  // A low lift keeps the fold nearly upright, so the sheet's top edge stays near the book's.
  const lift = Math.min(H * 0.1, W * 0.18) * Math.sin(angle);
  const x = direction * W * Math.cos(angle);
  return constrainCorner({ x, y: corner === 'bottom' ? H - lift : lift }, corner, W, H);
}

/** The part of a convex polygon on the side of a line where `side(point)` ≤ 0. */
function clip(polygon: Vec[], side: (p: Vec) => number): Vec[] {
  const out: Vec[] = [];
  polygon.forEach((a, i) => {
    const b = polygon[(i + 1) % polygon.length] as Vec;
    const sa = side(a);
    const sb = side(b);
    if (sa <= 0) out.push(a);
    if ((sa < 0 && sb > 0) || (sa > 0 && sb < 0)) {
      const t = sa / (sa - sb);
      out.push({ x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t });
    }
  });
  return out;
}

export interface Curl {
  /** The part of the turning page still lying flat, in spread coordinates. */
  lying: Vec[];
  /** The folded part, before it flips: spread coordinates, on the lying page. */
  flap: Vec[];
  /** The flap where it is seen, reflected across the fold. */
  flapShown: Vec[];
  /** The flap in the other face's own coordinates: the part of it on show. */
  flapLocal: Vec[];
  /** The fold line's ends on the page edges (absent before the page lifts). */
  fold: [Vec, Vec] | null;
  /** Unit vector across the fold, pointing from the flap towards the lying part. */
  normal: Vec;
  /** How far the turn has gone, 0 (flat) to 1 (over): drives shading. */
  progress: number;
  /**
   * CSS matrix(a, b, c, d, e, f) placing the other face of the page (whose
   * own top-left corner is its origin) so that it shows on the flap.
   */
  flapMatrix: [number, number, number, number, number, number];
}

/**
 * The curl with the corner at P. The lying face's own origin is its top-left
 * corner, at x = 0 (forward) or −W (back); the other face is drawn at the
 * position it will have once turned, and `flapMatrix` folds it onto the flap.
 */
export function curlAt(p: Vec, direction: Direction, corner: Corner, W: number, H: number): Curl {
  const c = restingCorner(direction, corner, W, H);
  const lyingLeft = direction === 1 ? 0 : -W;
  const page: Vec[] = [
    { x: lyingLeft, y: 0 },
    { x: lyingLeft + W, y: 0 },
    { x: lyingLeft + W, y: H },
    { x: lyingLeft, y: H },
  ];
  const span = len(sub(p, c));
  // Not lifted yet: the whole page lies flat.
  if (span < 1e-6) {
    return {
      lying: page,
      flap: [],
      flapShown: [],
      flapLocal: [],
      fold: null,
      normal: { x: -direction, y: 0 },
      progress: 0,
      flapMatrix: [1, 0, 0, 1, 0, 0],
    };
  }

  const m: Vec = { x: (c.x + p.x) / 2, y: (c.y + p.y) / 2 };
  const n: Vec = { x: (p.x - c.x) / span, y: (p.y - c.y) / span }; // from C towards P
  // Signed distance across the fold: negative on the corner's side (the flap).
  const across = (q: Vec) => dot(sub(q, m), n);
  const reflect = (q: Vec): Vec => {
    const d = 2 * across(q);
    return { x: q.x - d * n.x, y: q.y - d * n.y };
  };

  const flap = clip(page, across);
  const lying = clip(page, (q) => -across(q));
  // The fold's ends: the flap's vertices that lie on the line.
  const onFold = flap.filter((q) => Math.abs(across(q)) < 1e-6);
  const fold = onFold.length >= 2 ? ([onFold[0], onFold[onFold.length - 1]] as [Vec, Vec]) : null;

  // The other face, drawn where it lands once turned (its origin at −W for
  // forward, 0 for back), maps onto the page by mirroring about the spine
  // (x → −x), then onto the flap by reflecting across the fold.
  // Mirror then reflect is linear; in CSS matrix terms, local (x, y) of the
  // other face → spread point.
  const otherLeft = direction === 1 ? -W : 0;
  // Local (x, y) → turned position (otherLeft + x, y) → mirrored (−otherLeft − x, y).
  // Reflection: q − 2((q − m)·n)n = (I − 2nnᵀ)q + 2(m·n)n.
  const r11 = 1 - 2 * n.x * n.x;
  const r12 = -2 * n.x * n.y;
  const r22 = 1 - 2 * n.y * n.y;
  const k = 2 * dot(m, n);
  // q = (−otherLeft − x, y) = A·(x, y) + b with A = diag(−1, 1), b = (−otherLeft, 0).
  const a = -r11;
  const b = -r12;
  const cc = r12;
  const d = r22;
  const e = r11 * -otherLeft + k * n.x;
  const f = r12 * -otherLeft + k * n.y;

  return {
    lying,
    flap,
    flapShown: flap.map(reflect),
    // The face point shown at reflect(q) is the one that, turned and mirrored, is q.
    flapLocal: flap.map((q) => ({ x: -q.x - otherLeft, y: q.y })),
    fold,
    normal: n,
    progress: Math.min(1, span / (2 * W)),
    flapMatrix: [a, b, cc, d, e, f],
  };
}

/** A polygon as CSS clip-path, relative to a box whose top-left is `origin`. */
export function clipPath(polygon: Vec[], origin: Vec): string {
  if (polygon.length < 3) return 'polygon(0 0, 0 0, 0 0)';
  return `polygon(${polygon
    .map((q) => `${(q.x - origin.x).toFixed(2)}px ${(q.y - origin.y).toFixed(2)}px`)
    .join(', ')})`;
}

/** Where a point of the other face (its own coordinates) shows on the spread. */
export function applyMatrix(m: Curl['flapMatrix'], q: Vec): Vec {
  return { x: m[0] * q.x + m[2] * q.y + m[4], y: m[1] * q.x + m[3] * q.y + m[5] };
}
