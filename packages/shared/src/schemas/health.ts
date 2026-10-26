import { z } from 'zod';

/** Body of GET /api/health, returned with 200 (ok) or 503 (degraded). */
export const healthResponseSchema = z.object({
  status: z.enum(['ok', 'degraded']),
  db: z.enum(['up', 'down']),
});

export type HealthResponse = z.infer<typeof healthResponseSchema>;
