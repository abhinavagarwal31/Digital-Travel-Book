/**
 * Page-turn geometry. A book is a stack of leaves (sheets of paper). In
 * "double" mode (desktop spreads) leaf k carries page 2k on its front and page
 * 2k + 1 on its back, so turning it reveals a new spread. In "single" mode
 * (phones) each page is its own leaf with a blank back. `turned` counts the
 * leaves already turned to the left.
 */
export type FlipMode = 'double' | 'single';

export function leafCount(pageCount: number, mode: FlipMode): number {
  return mode === 'double' ? Math.ceil(pageCount / 2) : pageCount;
}

/** [front page, back page] of a leaf; the back is null when there is none. */
export function leafPages(
  leaf: number,
  pageCount: number,
  mode: FlipMode,
): [number, number | null] {
  if (mode === 'single') return [leaf, null];
  const back = leaf * 2 + 1;
  return [leaf * 2, back < pageCount ? back : null];
}

/** How many leaves must be turned for a page to be in view. */
export function turnedForPage(page: number, mode: FlipMode): number {
  if (mode === 'single') return page;
  return page % 2 === 0 ? page / 2 : (page + 1) / 2;
}

/** The pages in view: [left, right] in double mode, [page] in single mode. */
export function visiblePages(turned: number, pageCount: number, mode: FlipMode): number[] {
  if (mode === 'single') return turned < pageCount ? [turned] : [];
  return [turned * 2 - 1, turned * 2].filter((p) => p >= 0 && p < pageCount);
}

/**
 * Stacking order. Unturned leaves: the lowest is on top (it is the next to
 * turn). Turned leaves: the highest is on top (it landed last). A leaf in
 * flight is above everything, and a later flight above an earlier one, so a
 * riffle stacks correctly.
 */
export function leafZIndex(
  leaf: number,
  turned: number,
  total: number,
  flight?: { direction: 1 | -1 },
): number {
  if (flight) return total * 2 + (flight.direction === 1 ? leaf : total - leaf);
  return leaf < turned ? leaf + 1 : total - leaf;
}
