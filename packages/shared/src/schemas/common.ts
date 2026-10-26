import { z } from 'zod';

/** A MongoDB ObjectId as it travels over the API: 24 hex characters. */
export const objectIdSchema = z.string().regex(/^[a-f\d]{24}$/i, 'Expected a valid id');

const ISO_DATE = /^(\d{4})-(\d{2})-(\d{2})$/;

/** True only for a real calendar date written as YYYY-MM-DD (rejects 2026-02-30). */
export function isValidIsoDate(value: string): boolean {
  const match = ISO_DATE.exec(value);
  if (!match) return false;
  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  const date = new Date(Date.UTC(year, month - 1, day));
  return (
    date.getUTCFullYear() === year && date.getUTCMonth() === month - 1 && date.getUTCDate() === day
  );
}

/** A calendar date with no time or zone, e.g. a trip day or a photo's local date. */
export const isoDateSchema = z
  .string()
  .refine(isValidIsoDate, 'Expected a real date in YYYY-MM-DD format');

// IANA names look like "UTC", "Asia/Tokyo" or "America/Argentina/Buenos_Aires".
// Fixed offsets such as "+05:30" are accepted by Intl but are not IANA zones.
const IANA_ZONE_SHAPE = /^[A-Za-z_]+(?:\/[A-Za-z0-9_+-]+)*$/;

/** True for a time zone identifier that is IANA-shaped and known to this runtime. */
export function isValidTimeZone(value: string): boolean {
  if (!IANA_ZONE_SHAPE.test(value)) return false;
  try {
    new Intl.DateTimeFormat('en-US', { timeZone: value });
    return true;
  } catch {
    return false;
  }
}

export const timeZoneSchema = z
  .string()
  .refine(isValidTimeZone, 'Expected an IANA time zone such as "Asia/Tokyo"');

/** Every API error response has this shape. */
export const apiErrorSchema = z.object({
  error: z.object({
    code: z.string(),
    message: z.string(),
    details: z.unknown().optional(),
  }),
});

export type ApiError = z.infer<typeof apiErrorSchema>;
