import type { HealthResponse } from '@tb/shared';
import express from 'express';
import helmet from 'helmet';
import { isDatabaseUp } from './lib/db.ts';
import { apiNotFound, errorHandler } from './lib/errors.ts';
import { requireJsonForWrites } from './lib/requireJson.ts';
import { serveWebApp } from './lib/webApp.ts';

export interface AppOptions {
  /** Built web app to serve alongside the API (production only). */
  webDistDir?: string;
}

export function createApp(options: AppOptions = {}): express.Express {
  const app = express();

  // Render terminates TLS in one proxy hop. Without this, req.ip is the proxy's
  // address and per-client rate limits would apply to everyone at once.
  app.set('trust proxy', 1);
  app.use(helmet());

  const api = express.Router();
  api.use(requireJsonForWrites);
  api.use(express.json({ limit: '100kb' }));

  // Shallow health check (database only): safe for the host to poll often.
  api.get('/health', async (_req, res) => {
    const dbUp = await isDatabaseUp();
    const body: HealthResponse = { status: dbUp ? 'ok' : 'degraded', db: dbUp ? 'up' : 'down' };
    res.status(dbUp ? 200 : 503).json(body);
  });

  api.use(apiNotFound);
  app.use('/api', api);

  if (options.webDistDir) serveWebApp(app, options.webDistDir);

  app.use(errorHandler);
  return app;
}
