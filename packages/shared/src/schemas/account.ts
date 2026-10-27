import { z } from 'zod';
import { PASSWORD_MAX_LENGTH, PASSWORD_MIN_LENGTH, userSchema } from './auth.ts';
import { THEME_IDS } from './book.ts';
import { MAX_PHOTOS_PER_BOOK } from './photo.ts';

export const PLAN_IDS = ['free', 'pro'] as const;
export type PlanId = (typeof PLAN_IDS)[number];

export interface Plan {
  name: string;
  /** What the plan allows per book, before the technical cap (see photoLimit). */
  photosPerBook: number;
  /** Shown on the plans page; nothing is charged yet. */
  priceLabel: string;
  features: string[];
  /** Pro is described, not sold: there are no payments yet. */
  available: boolean;
}

/** The plans, as the plans page and the upload limit both read them. */
export const PLANS: Record<PlanId, Plan> = {
  free: {
    name: 'Free',
    photosPerBook: 200,
    priceLabel: '₹0',
    available: true,
    features: [
      'Unlimited travel books',
      'Automatic days, chapters and route maps',
      'Captions, diary and chapter names',
      `All ${THEME_IDS.length} book styles, including Comic Adventure`,
      'The page-turning reader, on any device',
    ],
  },
  pro: {
    name: 'Pro',
    photosPerBook: 1000,
    priceLabel: 'Price to be announced',
    available: false,
    features: [
      'Everything in Free',
      'More room in every book',
      'Book styles designed for you by AI, from a mood you describe',
      'Your book keeps its style even if you go back to Free',
    ],
  },
};

/**
 * Photos a book may hold on a plan: the plan's allowance, never above the
 * technical cap every book shares. A book over its limit (after a change of
 * plan) stays readable and editable; it just takes no new photos.
 */
export function photoLimit(plan: PlanId): number {
  return Math.min(PLANS[plan].photosPerBook, MAX_PHOTOS_PER_BOOK);
}

const passwordSchema = z
  .string()
  .min(PASSWORD_MIN_LENGTH, `Password must be at least ${PASSWORD_MIN_LENGTH} characters`)
  .max(PASSWORD_MAX_LENGTH, `Password must be at most ${PASSWORD_MAX_LENGTH} characters`);

const currentPasswordSchema = z.string().min(1, 'Enter your password').max(PASSWORD_MAX_LENGTH);

/** A new name and/or email. Changing the email needs the current password. */
export const updateAccountBodySchema = z
  .strictObject({
    name: z.string().trim().min(1, 'Enter your name').max(80, 'Name is too long'),
    email: z.string().trim().toLowerCase().pipe(z.email('Enter a valid email address')),
    currentPassword: currentPasswordSchema,
  })
  .partial()
  .refine((b) => b.name !== undefined || b.email !== undefined, 'Nothing to update')
  .refine((b) => b.email === undefined || b.currentPassword !== undefined, {
    path: ['currentPassword'],
    message: 'Enter your password to change your email',
  });

export const changePasswordBodySchema = z.strictObject({
  currentPassword: currentPasswordSchema,
  newPassword: passwordSchema,
});

export const deleteAccountBodySchema = z.strictObject({ password: currentPasswordSchema });

export const accountSchema = z.object({
  user: userSchema,
  plan: z.enum(PLAN_IDS),
  photoLimit: z.number(),
  usage: z.object({
    books: z.number(),
    photos: z.number(),
    /** The book closest to the photo limit, if any. */
    fullestBook: z.object({ id: z.string(), title: z.string(), photos: z.number() }).nullable(),
  }),
});

export type UpdateAccountBody = z.infer<typeof updateAccountBodySchema>;
export type ChangePasswordBody = z.infer<typeof changePasswordBodySchema>;
export type DeleteAccountBody = z.infer<typeof deleteAccountBodySchema>;
export type Account = z.infer<typeof accountSchema>;
