import { z } from 'zod';

export const MAX_CAPTION_LENGTH = 300;
export const MAX_DIARY_LENGTH = 5000;

/** A photo's caption. Empty clears it. */
export const captionBodySchema = z.strictObject({
  caption: z
    .string()
    .trim()
    .max(MAX_CAPTION_LENGTH, `Captions can be at most ${MAX_CAPTION_LENGTH} characters`),
});

/** A day's diary entry. Empty removes the entry. */
export const diaryBodySchema = z.strictObject({
  diary: z
    .string()
    .trim()
    .max(MAX_DIARY_LENGTH, `A diary entry can be at most ${MAX_DIARY_LENGTH} characters`),
});

export type CaptionBody = z.infer<typeof captionBodySchema>;
export type DiaryBody = z.infer<typeof diaryBodySchema>;
