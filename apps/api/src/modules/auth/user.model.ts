import type { User } from '@tb/shared';
import mongoose, { type HydratedDocument } from 'mongoose';

export interface UserFields {
  email: string;
  name: string;
  passwordHash: string;
  plan: 'free';
  createdAt: Date;
  updatedAt: Date;
}

const userSchema = new mongoose.Schema<UserFields>(
  {
    email: { type: String, required: true, unique: true, lowercase: true, trim: true },
    name: { type: String, required: true, trim: true },
    // Excluded from queries unless asked for with .select('+passwordHash').
    passwordHash: { type: String, required: true, select: false },
    // Pro hook: stored only, nothing in the MVP reads it.
    plan: { type: String, enum: ['free'], default: 'free' },
  },
  { timestamps: true },
);

export const UserModel = mongoose.model<UserFields>('User', userSchema);

/** The only shape in which a user leaves the API. */
export function toUserDTO(user: HydratedDocument<UserFields>): User {
  return {
    id: user._id.toString(),
    name: user.name,
    email: user.email,
    createdAt: user.createdAt.toISOString(),
  };
}
