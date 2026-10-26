import { useRef, type CSSProperties, type PointerEvent, type ReactNode } from 'react';
import { leafPages, leafZIndex, visiblePages, type FlipMode } from '../../lib/flip.ts';

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
 * The book as a stack of 3D leaves hinged at the spine. Only leaves near the
 * open spread render their content, so long books stay light.
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
      {Array.from({ length: total }, (_, leaf) => {
        const [front, back] = leafPages(leaf, pageCount, mode);
        const flight = flights.get(leaf);
        const near = nearAny(leaf) || flight !== undefined;
        const shown = visible.includes(front) || (back !== null && visible.includes(back));
        return (
          <div
            key={leaf}
            className={[
              'leaf',
              leaf < turned && 'turned',
              flight !== undefined && 'flying',
              front === 0 && 'hard',
            ]
              .filter(Boolean)
              .join(' ')}
            style={{
              zIndex: leafZIndex(leaf, turned, total, flight ? { direction: flight } : undefined),
            }}
            aria-hidden={!shown}
          >
            <div className="face front">{near && renderPage(front)}</div>
            <div className="face back">
              {near && (back === null ? <div className="page blank" /> : renderPage(back))}
            </div>
          </div>
        );
      })}
    </div>
  );
}
