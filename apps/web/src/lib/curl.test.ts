import { describe, expect, it } from 'vitest';
import {
  applyMatrix,
  constrainCorner,
  cornerAlongTurn,
  curlAt,
  restingCorner,
  type Vec,
} from './curl.ts';

const W = 300;
const H = 400;
const close = (a: Vec, b: Vec) => {
  expect(a.x).toBeCloseTo(b.x, 6);
  expect(a.y).toBeCloseTo(b.y, 6);
};
const sub2 = (a: Vec, b: Vec): Vec => ({ x: a.x - b.x, y: a.y - b.y });
const area = (poly: Vec[]) =>
  Math.abs(
    poly.reduce((sum, a, i) => {
      const b = poly[(i + 1) % poly.length] as Vec;
      return sum + a.x * b.y - b.x * a.y;
    }, 0) / 2,
  );

describe('curlAt', () => {
  it('lies flat before the corner moves', () => {
    const curl = curlAt(restingCorner(1, 'bottom', W, H), 1, 'bottom', W, H);
    expect(area(curl.lying)).toBeCloseTo(W * H);
    expect(curl.flap).toEqual([]);
  });

  it('folds along the line halfway between where the corner was and where it is', () => {
    const p = { x: 180, y: 330 };
    const curl = curlAt(p, 1, 'bottom', W, H);
    // The corner itself lands exactly at P.
    const c = restingCorner(1, 'bottom', W, H);
    const reflected = curl.flapShown[curl.flap.findIndex((q) => q.x === c.x && q.y === c.y)];
    close(reflected as Vec, p);
    // Nothing is lost: the lying part and the flap make the whole page.
    expect(area(curl.lying) + area(curl.flap)).toBeCloseTo(W * H);
    // Folding keeps the flap's size and shape.
    expect(area(curl.flapShown)).toBeCloseTo(area(curl.flap));
    // Across the fold, the normal points from the flap's side to the part still lying flat.
    const centre = (poly: Vec[]) => ({
      x: poly.reduce((t, q) => t + q.x, 0) / poly.length,
      y: poly.reduce((t, q) => t + q.y, 0) / poly.length,
    });
    const towards = sub2(centre(curl.lying), centre(curl.flap));
    expect(towards.x * curl.normal.x + towards.y * curl.normal.y).toBeGreaterThan(0);
    // The fold's ends are on it: as far from C as from P.
    for (const end of curl.fold ?? []) {
      expect(Math.hypot(end.x - c.x, end.y - c.y)).toBeCloseTo(
        Math.hypot(end.x - p.x, end.y - p.y),
      );
    }
  });

  it('shows the right part of the other face on the flap', () => {
    for (const direction of [1, -1] as const) {
      const p = { x: direction * 60, y: 300 };
      const curl = curlAt(p, direction, 'bottom', W, H);
      // The face's visible part, placed by the matrix, is exactly the flap as seen.
      curl.flapLocal.forEach((local, i) =>
        close(applyMatrix(curl.flapMatrix, local), curl.flapShown[i] as Vec),
      );
      // And it is the other face's own area: inside 0…W × 0…H.
      for (const q of curl.flapLocal) {
        expect(q.x).toBeGreaterThanOrEqual(-1e-6);
        expect(q.x).toBeLessThanOrEqual(W + 1e-6);
      }
    }
  });

  it('ends with the page wholly over, its other face flat on the opposite side', () => {
    const curl = curlAt({ x: -W, y: H }, 1, 'bottom', W, H);
    expect(area(curl.lying)).toBeCloseTo(0);
    expect(area(curl.flap)).toBeCloseTo(W * H);
    // The other face is back where it belongs, unrotated: x → x − W.
    close(applyMatrix(curl.flapMatrix, { x: 0, y: 0 }), { x: -W, y: 0 });
    close(applyMatrix(curl.flapMatrix, { x: W, y: H }), { x: 0, y: H });
  });

  it('turns back as the mirror image of turning forward', () => {
    const forward = curlAt({ x: 120, y: 340 }, 1, 'bottom', W, H);
    const back = curlAt({ x: -120, y: 340 }, -1, 'bottom', W, H);
    expect(area(back.flap)).toBeCloseTo(area(forward.flap));
    const xs = (poly: Vec[]) => poly.map((q) => q.x).sort((a, b) => a - b);
    expect(
      xs(back.flapShown)
        .map((x) => -x)
        .sort((a, b) => a - b),
    ).toEqual(xs(forward.flapShown).map((x) => expect.closeTo(x, 6)));
  });
});

describe('the corner on its way', () => {
  it('starts at rest, crosses the spine, and lands on the other side', () => {
    close(cornerAlongTurn(0, 1, 'bottom', W, H), { x: W, y: H });
    expect(cornerAlongTurn(0.5, 1, 'bottom', W, H).x).toBeCloseTo(0, 6);
    expect(cornerAlongTurn(0.5, 1, 'bottom', W, H).y).toBeLessThan(H);
    close(cornerAlongTurn(1, 1, 'bottom', W, H), { x: -W, y: H });
    close(cornerAlongTurn(1, -1, 'top', W, H), { x: W, y: 0 });
  });

  it('is never further from the spine than the paper reaches', () => {
    for (let t = 0; t <= 1; t += 0.05) {
      const p = cornerAlongTurn(t, 1, 'bottom', W, H);
      expect(Math.hypot(p.x, p.y - H)).toBeLessThanOrEqual(W + 1e-6);
    }
    const pulled = constrainCorner({ x: 900, y: H }, 'bottom', W, H);
    close(pulled, { x: W, y: H });
    const dragged = constrainCorner({ x: -50, y: -800 }, 'bottom', W, H);
    expect(Math.hypot(dragged.x, dragged.y - H)).toBeLessThanOrEqual(W + 1e-6);
  });
});
