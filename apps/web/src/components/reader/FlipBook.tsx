import { Fragment, useRef, type CSSProperties, type PointerEvent, type ReactNode } from 'react';
import { leafPages, leafZIndex, visiblePages, type FlipMode } from '../../lib/flip.ts';
import { CurlLeaf } from './CurlLeaf.tsx';
import { FLIP_MS } from './useFlipBook.ts';

interface FlipBookProps {
  pageCount: number;
  mode: FlipMode;
  total: number;
  turned: number;
  flights: ReadonlyMap<number, 1 | -1>;
  /** Where the current riffle started, or null when none is under way. */
  riffleOrigin: number | null;
  renderPage: (index: number) => ReactNode;
  onNext: () => void;
  onPrev: () => void;
  label: string;
}

/**
 * The edges of the pages on one side, as a stack of thin lines peeking out
 * below and beside the open page: a thicker stack for more pages, the way a
 * real book shows how far through it you are.
 */
export function pageStack(leaves: number, side: 'left' | 'right'): string {
  const layers = Math.min(9, Math.ceil(leaves * 0.45));
  const sign = side === 'right' ? 1 : -1;
  return Array.from({ length: layers }, (_, i) => {
    const step = i + 1;
    const colour = step % 2 === 0 ? 'var(--page-edge-dark)' : 'var(--page-edge)';
    return `${sign * step * 0.9}px ${step * 0.7}px 0 ${colour}`;
  }).join(', ');
}

/**
 * The book as a stack of leaves hinged at the spine. Paper leaves turn by
 * curling (CurlLeaf); the covers are boards and swing stiffly on their hinge.
 * Only leaves near the open spread render their content, so long books stay
 * light.
 */
export function FlipBook(props: FlipBookProps) {
  const {
    pageCount,
    mode,
    total,
    turned,
    flights,
    riffleOrigin,
    renderPage,
    onNext,
    onPrev,
    label,
  } = props;
  const pointer = useRef<{ x: number; y: number } | null>(null);
  const visible = visiblePages(turned, pageCount, mode);
  // During a riffle the pages where it started are still on show beneath the
  // leaves in flight, so they keep their content until every leaf has landed.
  const nearAny = (leaf: number) =>
    Math.abs(leaf - turned) <= 2 || (riffleOrigin !== null && Math.abs(leaf - riffleOrigin) <= 2);

  // A closed book sits centred on its cover; a finished one on its back page.
  const offset =
    mode === 'double' ? (turned === 0 ? '-25%' : turned === total ? '25%' : '0%') : '0%';

  function onPointerDown(event: PointerEvent) {
    pointer.current = { x: event.clientX, y: event.clientY };
  }

  function onPointerUp(event: PointerEvent<HTMLDivElement>) {
    const start = pointer.current;
    pointer.current = null;
    if (!start) return;
    const dx = event.clientX - start.x;
    if (Math.abs(dx) > 40 && Math.abs(dx) > Math.abs(event.clientY - start.y)) {
      if (dx < 0) onNext();
      else onPrev();
      return;
    }
    // A tap turns forward on the right-hand side and back on the left.
    const box = event.currentTarget.getBoundingClientRect();
    const split = mode === 'double' ? box.left + box.width / 2 : box.left + box.width * 0.3;
    if (event.clientX >= split) onNext();
    else onPrev();
  }

  return (
    <div
      className={`flipbook ${mode}`}
      data-state={
        mode === 'double' && turned === 0 ? 'closed' : turned === total ? 'finished' : 'open'
      }
      style={{ '--book-offset': offset } as CSSProperties}
      role="region"
      aria-roledescription="book"
      aria-label={label}
      onPointerDown={onPointerDown}
      onPointerUp={onPointerUp}
    >
      {/* The hard case the pages are bound into, and the thickness of the pages on each side. */}
      <div className="book-case" aria-hidden="true" />
      {mode === 'double' && turned > 0 && (
        <div
          className="page-block left"
          aria-hidden="true"
          style={{ boxShadow: pageStack(turned, 'left') }}
        />
      )}
      {turned < total && (
        <div
          className="page-block right"
          aria-hidden="true"
          style={{ boxShadow: pageStack(total - turned, 'right') }}
        />
      )}
      {Array.from({ length: total }, (_, leaf) => {
        const [front, back] = leafPages(leaf, pageCount, mode);
        const flight = flights.get(leaf);
        const near = nearAny(leaf) || flight !== undefined;
        const shown = visible.includes(front) || (back !== null && visible.includes(back));
        // The covers (and the endpapers glued to them) are stiff boards.
        const hard = front === 0 || front === pageCount - 1 || back === pageCount - 1;
        const curling = flight !== undefined && !hard;
        const backFace = back === null ? <div className="page blank" /> : renderPage(back);
        return (
          <Fragment key={leaf}>
            <div
              className={[
                'leaf',
                leaf < turned && 'turned',
                flight !== undefined && 'flying',
                hard && 'hard',
                curling && 'curling',
              ]
                .filter(Boolean)
                .join(' ')}
              style={{
                zIndex: leafZIndex(leaf, turned, total, flight ? { direction: flight } : undefined),
              }}
              aria-hidden={!shown}
            >
              <div className="face front">{near && !curling && renderPage(front)}</div>
              <div className="face back">{near && !curling && backFace}</div>
            </div>
            {curling && (
              <CurlLeaf
                direction={flight}
                mode={mode}
                duration={FLIP_MS}
                zIndex={leafZIndex(leaf, turned, total, { direction: flight })}
                lyingSide={flight === 1 ? 'front' : 'back'}
                lying={flight === 1 ? renderPage(front) : backFace}
                other={flight === 1 ? backFace : renderPage(front)}
              />
            )}
          </Fragment>
        );
      })}
    </div>
  );
}
