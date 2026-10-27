import { describe, expect, it } from 'vitest';
import { mergeWithPrevious, refreshAutoTitles, renameChapter, splitChapter } from './structure.ts';
import type { Chapter } from './types.ts';

const TRIP: Chapter[] = [
  {
    id: 'c-2026-10-10',
    title: 'Chapter 1 · 10 – 12 Oct',
    dayDates: ['2026-10-10', '2026-10-11', '2026-10-12'],
  },
  { id: 'kyoto', title: 'Kyoto', dayDates: ['2026-10-13', '2026-10-14'] },
];

describe('splitChapter', () => {
  it('starts a new chapter at the day, taking the later days with it', () => {
    expect(splitChapter(TRIP, '2026-10-11')).toEqual([
      { id: 'c-2026-10-10', title: 'Chapter 1 · 10 Oct', dayDates: ['2026-10-10'] },
      {
        id: 'c-2026-10-11',
        title: 'Chapter 2 · 11 – 12 Oct',
        dayDates: ['2026-10-11', '2026-10-12'],
      },
      TRIP[1],
    ]);
  });

  it('does nothing at the first day of a chapter or a day in no chapter', () => {
    expect(splitChapter(TRIP, '2026-10-13')).toBe(TRIP);
    expect(splitChapter(TRIP, '2026-12-01')).toBe(TRIP);
  });

  it('never reuses an id that is taken', () => {
    const taken: Chapter[] = [
      {
        id: 'c-2026-10-11',
        title: 'Chapter 1 · 10 – 12 Oct',
        dayDates: ['2026-10-10', '2026-10-11'],
      },
    ];
    expect(splitChapter(taken, '2026-10-11')[1]?.id).toBe('c-2026-10-11-2');
  });
});

describe('mergeWithPrevious', () => {
  it('joins a chapter onto the one before, which keeps its own title', () => {
    expect(mergeWithPrevious(TRIP, 'kyoto')).toEqual([
      {
        id: 'c-2026-10-10',
        title: 'Chapter 1 · 10 – 14 Oct',
        dayDates: ['2026-10-10', '2026-10-11', '2026-10-12', '2026-10-13', '2026-10-14'],
      },
    ]);
    const named = renameChapter(TRIP, 'c-2026-10-10', 'Tokyo');
    expect(mergeWithPrevious(named, 'kyoto')[0]?.title).toBe('Tokyo');
  });

  it('does nothing for the first chapter or an unknown one', () => {
    expect(mergeWithPrevious(TRIP, 'c-2026-10-10')).toBe(TRIP);
    expect(mergeWithPrevious(TRIP, 'nope')).toBe(TRIP);
  });
});

describe('refreshAutoTitles', () => {
  it('renumbers and re-dates only the titles the app wrote', () => {
    const chapters: Chapter[] = [
      { id: 'a', title: 'Arrival', dayDates: ['2026-10-10'] },
      { id: 'b', title: 'Chapter 7 · 1 Jan', dayDates: ['2026-10-11', '2026-10-12'] },
      { id: 'c', title: 'Chapter one of many', dayDates: ['2026-10-13'] },
    ];
    expect(refreshAutoTitles(chapters).map((c) => c.title)).toEqual([
      'Arrival',
      'Chapter 2 · 11 – 12 Oct',
      'Chapter one of many',
    ]);
  });
});
