import { z } from 'zod';

// Only variables the code already uses are listed here; each slice adds its own
// (JWT secret in Slice 1, Cloudinary in Slice 2). A missing or invalid value
// stops the server at startup instead of failing on the first request.
const envSchema = z.object({
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
});

export type Env = z.infer<typeof envSchema>;

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
