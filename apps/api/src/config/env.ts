import { z } from 'zod';

const CLOUDINARY_VARS = [
  'CLOUDINARY_CLOUD_NAME',
  'CLOUDINARY_API_KEY',
  'CLOUDINARY_API_SECRET',
] as const;

// Only variables the code already uses are listed here; each slice adds its own.
// A missing or invalid value stops the server at startup instead of failing on
// the first request.
const envSchema = z
  .object({
    NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
    PORT: z.coerce.number().int().min(1).max(65535).default(3000),
    MONGODB_URI: z
      .string()
      .regex(/^mongodb(\+srv)?:\/\//, 'must start with mongodb:// or mongodb+srv://'),
    // Signs session tokens. 32+ random characters; generate with `openssl rand -base64 48`.
    // The .env.example placeholder is long enough to pass min(32), so it is refused explicitly.
    JWT_SECRET: z
      .string()
      .min(32)
      .refine((value) => !value.startsWith('replace-with'), 'still the .env.example placeholder'),
    // Photo storage. Required in production; optional in development so the app
    // runs before an account exists (uploads then answer "storage not configured").
    CLOUDINARY_CLOUD_NAME: z
      .string()
      .regex(/^[a-z0-9_-]+$/i)
      .optional(),
    CLOUDINARY_API_KEY: z.string().regex(/^\d+$/).optional(),
    CLOUDINARY_API_SECRET: z.string().min(10).optional(),
  })
  .superRefine((env, ctx) => {
    const set = CLOUDINARY_VARS.filter((name) => env[name] !== undefined);
    const required = env.NODE_ENV === 'production' || set.length > 0;
    if (!required) return;
    for (const name of CLOUDINARY_VARS) {
      if (env[name] === undefined)
        ctx.addIssue({ code: 'custom', path: [name], message: 'required' });
    }
  });

export type Env = z.infer<typeof envSchema>;

/** Cloudinary credentials when all three are set, otherwise null. */
export function cloudinaryCredentials(env: Env) {
  const { CLOUDINARY_CLOUD_NAME: cloudName, CLOUDINARY_API_KEY: apiKey } = env;
  const apiSecret = env.CLOUDINARY_API_SECRET;
  return cloudName && apiKey && apiSecret ? { cloudName, apiKey, apiSecret } : null;
}

/**
 * Parses and validates environment variables. The error names each bad variable
 * and the rule it broke, but never echoes a value: values may be secrets.
 */
export function loadEnv(source: NodeJS.ProcessEnv = process.env): Env {
  const result = envSchema.safeParse(source);
  if (result.success) return result.data;

  const problems = result.error.issues.map((issue) => {
    const name = issue.path.join('.');
    return source[name] === undefined ? `${name} is required` : `${name} is invalid`;
  });
  throw new Error(`Invalid environment configuration:\n  - ${problems.join('\n  - ')}`);
}
