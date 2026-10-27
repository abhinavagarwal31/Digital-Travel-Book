import { z } from 'zod';
import { isoDateSchema, timeZoneSchema } from './common.ts';

/** Longest trip a book may span; bounds the number of days the app ever derives. */
export const MAX_TRIP_DAYS = 366;

export const THEME_IDS = ['atlas', 'editorial', 'scrapbook'] as const;
export type ThemeId = (typeof THEME_IDS)[number];

/** Whole days from start to end inclusive, for valid YYYY-MM-DD strings. */
export function tripLengthDays(startDate: string, endDate: string): number {
  const ms = Date.parse(`${endDate}T00:00:00Z`) - Date.parse(`${startDate}T00:00:00Z`);
  return Math.round(ms / 86_400_000) + 1;
}

/** Problem with a trip's date range, or null when it is valid. */
export function tripRangeProblem(startDate: string, endDate: string): string | null {
  const days = tripLengthDays(startDate, endDate);
  if (days < 1) return 'End date must be on or after the start date';
  if (days > MAX_TRIP_DAYS) return `A trip can span at most ${MAX_TRIP_DAYS} days`;
  return null;
}

const titleSchema = z.string().trim().min(1, 'Enter a title').max(120, 'Title is too long');
const descriptionSchema = z.string().trim().max(2000, 'Description is too long');
const destinationsSchema = z
  .array(z.string().trim().min(1, 'Destination cannot be blank').max(80))
  .max(20, 'At most 20 destinations');

export const createBookBodySchema = z
  .strictObject({
    title: titleSchema,
    description: descriptionSchema.optional(),
    startDate: isoDateSchema,
    endDate: isoDateSchema,
    defaultTz: timeZoneSchema,
    destinations: destinationsSchema.default([]),
  })
  .superRefine((body, ctx) => {
    const problem = tripRangeProblem(body.startDate, body.endDate);
    if (problem) ctx.addIssue({ code: 'custom', path: ['endDate'], message: problem });
  });

/**
 * Partial update of the trip details. The date range is re-checked on the server
 * against the stored dates, since one end may change without the other.
 */
export const updateBookBodySchema = z
  .strictObject({
    title: titleSchema,
    description: descriptionSchema,
    startDate: isoDateSchema,
    endDate: isoDateSchema,
    defaultTz: timeZoneSchema,
    destinations: destinationsSchema,
  })
  .partial()
  .refine((body) => Object.keys(body).length > 0, 'Nothing to update');

export const bookSchema = z.object({
  id: z.string(),
  title: z.string(),
  description: z.string(),
  startDate: z.string(),
  endDate: z.string(),
  defaultTz: z.string(),
  destinations: z.array(z.string()),
  theme: z.object({ kind: z.literal('preset'), id: z.enum(THEME_IDS), version: z.number() }),
  /** Diary entries only; the book's full set of days is derived (see daySet). */
  days: z.array(z.object({ date: z.string(), diary: z.string() })),
  chapters: z.array(z.object({ id: z.string(), title: z.string(), dayDates: z.array(z.string()) })),
  chaptersEdited: z.boolean(),
  createdAt: z.string(),
  updatedAt: z.string(),
});

export type CreateBookBody = z.infer<typeof createBookBodySchema>;
export type UpdateBookBody = z.infer<typeof updateBookBodySchema>;
export type Book = z.infer<typeof bookSchema>;
