import type { Request } from 'express';
import mongoose, { type HydratedDocument, type Model, type QueryFilter } from 'mongoose';
import { AppError } from './errors.ts';

export function notFound(): AppError {
  return new AppError(404, 'NOT_FOUND', 'Not found');
}

/**
 * Loads a document only if it belongs to the user. A malformed id, a missing
 * document and another user's document all produce the same 404, so responses
 * never reveal whether someone else's resource exists.
 */
export async function findOwned<T>(
  model: Model<T>,
  id: string,
  userId: string,
  extraFilter: QueryFilter<T> = {},
): Promise<HydratedDocument<T>> {
  if (!mongoose.isValidObjectId(id)) throw notFound();
  const doc = await model.findOne({ ...extraFilter, _id: id, userId } as QueryFilter<T>);
  if (!doc) throw notFound();
  return doc;
}

/** A route parameter as a string; anything else becomes "" and therefore a 404. */
export function pathParam(req: Request, name: string): string {
  const value = req.params[name];
  return typeof value === 'string' ? value : '';
}
