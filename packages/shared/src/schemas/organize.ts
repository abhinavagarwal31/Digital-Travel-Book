import { z } from 'zod';
import { isValidLocalDateTime } from '../photos/time.ts';
import { isoDateSchema, objectIdSchema, timeZoneSchema } from './common.ts';
import { MAX_PHOTOS_PER_BOOK } from './photo.ts';

const photoIds = z.array(objectIdSchema).min(1).max(MAX_PHOTOS_PER_BOOK);

/**
 * Move photos to a day (or deliberately to no day). `expect` is the state the
 * client believes each photo is in; if any differs, nothing changes (409).
 * Undo uses it so it can never overwrite a newer decision.
 */
export const setDayBodySchema = z
  .strictObject({
    photoIds,
    dayDate: isoDateSchema.nullable(),
    expect: z
      .record(
        objectIdSchema,
        z.strictObject({ dayDate: isoDateSchema.nullable(), assignedBy: z.enum(['auto', 'user']) }),
      )
      .optional(),
  })
  .refine((b) => new Set(b.photoIds).size === b.photoIds.length, 'Duplicate photo ids');

export const photoIdsBodySchema = z.strictObject({ photoIds });

export const visibilityBodySchema = z.strictObject({ photoIds, hidden: z.boolean() });

export const locationBodySchema = z.strictObject({
  action: z.enum(['confirm', 'remove', 'reset']),
});

export const timeBodySchema = z.union([
  z.strictObject({
    localDateTime: z
      .string()
      .refine(isValidLocalDateTime, 'Expected a date and time like 2026-10-12T17:42:00'),
    timeZone: timeZoneSchema,
  }),
  z.strictObject({ reset: z.literal(true) }),
]);

const chapterSchema = z.strictObject({
  id: z.string().regex(/^[a-z0-9-]{1,40}$/, 'Invalid chapter id'),
  title: z.string().trim().min(1, 'Give the chapter a title').max(120),
  dayDates: z.array(isoDateSchema).max(366),
});

export const chaptersBodySchema = z
  .strictObject({ chapters: z.array(chapterSchema).max(100) })
  .superRefine((body, ctx) => {
    const ids = new Set<string>();
    const days = new Set<string>();
    body.chapters.forEach((chapter, i) => {
      if (ids.has(chapter.id)) {
        ctx.addIssue({ code: 'custom', path: ['chapters', i, 'id'], message: 'Duplicate chapter' });
      }
      ids.add(chapter.id);
      for (const day of chapter.dayDates) {
        if (days.has(day)) {
          ctx.addIssue({
            code: 'custom',
            path: ['chapters', i, 'dayDates'],
            message: `${day} is in more than one chapter`,
          });
        }
        days.add(day);
      }
    });
  });

export type SetDayBody = z.infer<typeof setDayBodySchema>;
export type VisibilityBody = z.infer<typeof visibilityBodySchema>;
export type LocationBody = z.infer<typeof locationBodySchema>;
export type TimeBody = z.infer<typeof timeBodySchema>;
export type ChaptersBody = z.infer<typeof chaptersBodySchema>;
