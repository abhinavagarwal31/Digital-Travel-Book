/**
 * How the photos on one page are laid out, so every photo is shown whole (no
 * cropping) and as large as the page allows. Photos keep their order; only
 * the shape of the grid changes, e.g. two tall photos side by side rather
 * than stacked into thin strips.
 */
export type Arrangement =
  'single' | 'rows' | 'columns' | 'top-one' | 'left-one' | 'rows-3' | 'columns-3' | 'grid';

/** The page's photo area, in the same units as the CSS (cqw of the page width). */
const AREA = { w: 84, h: 106 };
const GAP = 3;
/** Share of the page the first photo gets in 'top-one' and 'left-one' (CSS: 55fr 45fr). */
const LEAD = 0.55;

interface Cell {
  w: number;
  h: number;
}

const CANDIDATES: Record<number, Arrangement[]> = {
  1: ['single'],
  2: ['rows', 'columns'],
  3: ['top-one', 'left-one', 'rows-3', 'columns-3'],
  4: ['grid'],
};

/** The cell each photo gets, in order, for an arrangement. */
export function cellsOf(arrangement: Arrangement): Cell[] {
  const { w, h } = AREA;
  const half = (n: number) => (n - GAP) / 2;
  const third = (n: number) => (n - 2 * GAP) / 3;
  switch (arrangement) {
    case 'single':
      return [{ w, h }];
    case 'rows':
      return [
        { w, h: half(h) },
        { w, h: half(h) },
      ];
    case 'columns':
      return [
        { w: half(w), h },
        { w: half(w), h },
      ];
    case 'top-one': {
      const top = (h - GAP) * LEAD;
      const rest = { w: half(w), h: h - GAP - top };
      return [{ w, h: top }, rest, rest];
    }
    case 'left-one': {
      const left = (w - GAP) * LEAD;
      const rest = { w: w - GAP - left, h: half(h) };
      return [{ w: left, h }, rest, rest];
    }
    case 'rows-3':
      return Array.from({ length: 3 }, () => ({ w, h: third(h) }));
    case 'columns-3':
      return Array.from({ length: 3 }, () => ({ w: third(w), h }));
    case 'grid':
      return Array.from({ length: 4 }, () => ({ w: half(w), h: half(h) }));
  }
}

/** Area of the largest picture of this aspect (width ÷ height) that fits in the cell. */
function fittedArea(aspect: number, cell: Cell): number {
  const width = Math.min(cell.w, cell.h * aspect);
  return width * (width / aspect);
}

/** Width ÷ height, or the common 4:3 when a photo's size is not known. */
export function aspectOf(photo: { width?: number | null; height?: number | null }): number {
  return photo.width && photo.height ? photo.width / photo.height : 4 / 3;
}

/**
 * The arrangement that shows these photos (aspects, in order) largest. Ties
 * go to the earlier candidate, so the same photos always get the same page.
 */
export function arrangePhotos(aspects: number[]): Arrangement {
  const options = CANDIDATES[aspects.length] ?? ['grid'];
  let best = options[0] as Arrangement;
  let bestArea = -1;
  for (const option of options) {
    const area = cellsOf(option).reduce(
      (sum, cell, i) => sum + fittedArea(aspects[i] ?? 4 / 3, cell),
      0,
    );
    if (area > bestArea + 1e-9) {
      best = option;
      bestArea = area;
    }
  }
  return best;
}
