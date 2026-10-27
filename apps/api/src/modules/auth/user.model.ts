import { PLAN_IDS, type PlanId, type User } from '@tb/shared';
import mongoose, { type HydratedDocument } from 'mongoose';

export interface UserFields {
  email: string;
  name: string;
  passwordHash: string;
  plan: PlanId;
  /** Bumped to sign out every existing session (password change, "log out other devices"). */
  sessionVersion: number;
  createdAt: Date;
  updatedAt: Date;
}

const userSchema = new mongoose.Schema<UserFields>(
  {
    email: { type: String, required: true, unique: true, lowercase: true, trim: true },
    name: { type: String, required: true, trim: true },
    // Excluded from queries unless asked for with .select('+passwordHash').
    passwordHash: { type: String, required: true, select: false },
    // Decides the photo limit per book; there is no way to buy Pro yet.
    plan: { type: String, enum: PLAN_IDS, default: 'free' },
    sessionVersion: { type: Number, default: 0 },
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
