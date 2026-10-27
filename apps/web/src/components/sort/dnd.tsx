import {
  DndContext,
  DragOverlay,
  KeyboardSensor,
  MouseSensor,
  TouchSensor,
  useDraggable,
  useDroppable,
  useSensor,
  useSensors,
  type Announcements,
  type DragEndEvent,
  type KeyboardCoordinateGetter,
  type UniqueIdentifier,
} from '@dnd-kit/core';
import type { Photo } from '@tb/shared';
import { createContext, useContext, useState, type MouseEvent, type ReactNode } from 'react';
import { photoImageUrl } from '../../lib/photos.ts';

/** What a drop zone stands for: a day, or (null) the tray of unsorted photos. */
export interface DropData {
  dayDate: string | null;
  /** Position in keyboard order: arrow keys walk the zones in this order. */
  order: number;
  label: string;
}

export const TRAY_ZONE = 'tray';
export const dayZone = (dayDate: string) => `day:${dayDate}`;

const ARROWS_FORWARD = ['ArrowDown', 'ArrowRight'];
const ARROWS_BACK = ['ArrowUp', 'ArrowLeft'];

/**
 * The zone an arrow key moves to from the current one: the next or previous in
 * order, stopping at the ends. From outside any zone it starts at the first.
 */
export function nextZone(
  zones: { id: UniqueIdentifier; order: number }[],
  current: UniqueIdentifier | null,
  forward: boolean,
): UniqueIdentifier | null {
  const ordered = [...zones].sort((a, b) => a.order - b.order);
  if (ordered.length === 0) return null;
  const at = ordered.findIndex((z) => z.id === current);
  if (at < 0) return (ordered[0] as { id: UniqueIdentifier }).id;
  const next = Math.min(Math.max(at + (forward ? 1 : -1), 0), ordered.length - 1);
  return (ordered[next] as { id: UniqueIdentifier }).id;
}

/** Arrow keys jump the picked-up photo straight to the centre of the next zone. */
const jumpBetweenZones: KeyboardCoordinateGetter = (event, { context }) => {
  const forward = ARROWS_FORWARD.includes(event.code);
  if (!forward && !ARROWS_BACK.includes(event.code)) return undefined;
  event.preventDefault();

  const zones = context.droppableContainers.getEnabled().map((c) => ({
    id: c.id,
    order: (c.data.current as DropData | undefined)?.order ?? 0,
  }));
  const target = nextZone(zones, context.over?.id ?? null, forward);
  const rect = target === null ? undefined : context.droppableRects.get(target);
  const self = context.collisionRect;
  if (!rect || !self) return undefined;
  return {
    x: rect.left + rect.width / 2 - self.width / 2,
    y: rect.top + Math.min(rect.height / 2, 80) - self.height / 2,
  };
};

/** Which photos travel with a drag: the whole selection when the dragged photo is in it. */
export function draggedPhotos(active: Photo, selection: Photo[]): Photo[] {
  return selection.some((p) => p.id === active.id) ? selection : [active];
}

/** The photos a drop actually changes: dropping a photo where it already is does nothing. */
export function photosToMove(photos: Photo[], dayDate: string | null): Photo[] {
  return photos.filter((p) => p.dayDate !== dayDate);
}

/** Ids of the photos in the drag in progress, so they can fade while they travel. */
const Travelling = createContext<ReadonlySet<string>>(new Set());

const plural = (n: number) => (n === 1 ? '1 photo' : `${n} photos`);

export function SortDnd({
  photoById,
  selection,
  onDrop,
  children,
}: {
  photoById: ReadonlyMap<string, Photo>;
  selection: Photo[];
  onDrop: (photos: Photo[], dayDate: string | null) => void;
  children: ReactNode;
}) {
  const [active, setActive] = useState<Photo | null>(null);
  const sensors = useSensors(
    // A short movement threshold keeps a plain click a click (it selects).
    useSensor(MouseSensor, { activationConstraint: { distance: 6 } }),
    // On touch screens a swipe must still scroll the page: dragging needs a long press.
    useSensor(TouchSensor, { activationConstraint: { delay: 250, tolerance: 8 } }),
    // Space selects a photo (it is a button); Enter picks it up to move by keyboard.
    useSensor(KeyboardSensor, {
      keyboardCodes: { start: ['Enter'], end: ['Enter', 'Space'], cancel: ['Escape'] },
      coordinateGetter: jumpBetweenZones,
    }),
  );

  const travelling = (id: UniqueIdentifier) => {
    const photo = photoById.get(String(id));
    return photo ? draggedPhotos(photo, selection) : [];
  };
  const zoneLabel = (data: unknown) => (data as DropData | undefined)?.label ?? 'nowhere';

  const announcements: Announcements = {
    onDragStart: ({ active }) =>
      `Picked up ${plural(travelling(active.id).length)}. Use the arrow keys to choose a day, Enter to drop, Escape to cancel.`,
    onDragOver: ({ over }) => (over ? `Over ${zoneLabel(over.data.current)}.` : 'Not over a day.'),
    onDragEnd: ({ active, over }) =>
      over
        ? `Dropped ${plural(travelling(active.id).length)} on ${zoneLabel(over.data.current)}.`
        : 'Dropped outside any day. Nothing moved.',
    onDragCancel: () => 'Cancelled. Nothing moved.',
  };

  function handleEnd({ active, over }: DragEndEvent) {
    setActive(null);
    if (!over) return;
    const data = over.data.current as DropData;
    const moving = photosToMove(travelling(active.id), data.dayDate);
    if (moving.length > 0) onDrop(moving, data.dayDate);
  }

  const moving = active ? travelling(active.id) : [];

  return (
    <DndContext
      sensors={sensors}
      accessibility={{
        announcements,
        screenReaderInstructions: {
          draggable:
            'Press Space to select this photo. Press Enter to pick it up, the arrow keys to choose a day, and Enter again to drop it.',
        },
      }}
      onDragStart={({ active }) => setActive(photoById.get(String(active.id)) ?? null)}
      onDragCancel={() => setActive(null)}
      onDragEnd={handleEnd}
    >
      <Travelling.Provider value={new Set(moving.map((p) => p.id))}>{children}</Travelling.Provider>
      <DragOverlay dropAnimation={null}>
        {active && (
          <div className="sort-drag-preview">
            <img src={photoImageUrl(active.id, 'thumb')} alt="" />
            {moving.length > 1 && <span className="sort-drag-count">{moving.length}</span>}
          </div>
        )}
      </DragOverlay>
    </DndContext>
  );
}

/** A day or the tray, highlighted while photos are dragged over it. */
export function DropZone({
  id,
  data,
  className,
  children,
  ...rest
}: {
  id: string;
  data: DropData;
  className: string;
  children: ReactNode;
  'aria-labelledby'?: string;
}) {
  const { setNodeRef, isOver, active } = useDroppable({ id, data });
  const state = isOver ? ' drop-over' : active ? ' drop-ready' : '';
  return (
    <section ref={setNodeRef} className={`${className}${state}`} {...rest}>
      {children}
    </section>
  );
}

const time = (p: Photo) => p.localDateTime?.slice(11, 16) ?? null;

/** One photo on the board: click or Space selects it; dragging (or Enter) moves it. */
export function PhotoChip({
  photo,
  selected,
  onToggle,
  note,
}: {
  photo: Photo;
  selected: boolean;
  onToggle: (event: MouseEvent) => void;
  note?: string;
}) {
  const { attributes, listeners, setNodeRef } = useDraggable({ id: photo.id });
  const travelling = useContext(Travelling).has(photo.id);
  return (
    <button
      ref={setNodeRef}
      type="button"
      className={`sort-chip${travelling ? ' travelling' : ''}`}
      {...attributes}
      {...listeners}
      aria-roledescription="photo"
      aria-pressed={selected}
      aria-label={[photo.originalFilename, time(photo), note].filter(Boolean).join(', ')}
      onClick={onToggle}
    >
      <img src={photoImageUrl(photo.id, 'thumb')} alt="" loading="lazy" draggable={false} />
      {time(photo) && <span className="sort-chip-time">{time(photo)}</span>}
      {note && <span className="sort-chip-note">{note}</span>}
      <span className="sort-chip-check" aria-hidden="true" />
    </button>
  );
}
