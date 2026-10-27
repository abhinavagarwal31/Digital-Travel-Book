import type { HealthResponse } from '@tb/shared';
import cookieParser from 'cookie-parser';
import express from 'express';
import helmet from 'helmet';
import { isDatabaseUp } from './lib/db.ts';
import { LocalDiskStorage } from './lib/localDiskStorage.ts';
import { apiNotFound, errorHandler } from './lib/errors.ts';
import { requireJsonForWrites } from './lib/requireJson.ts';
import type { ImageStorage } from './lib/storage.ts';
import { serveWebApp } from './lib/webApp.ts';
import { createAuthRouter, type AuthRateLimit } from './modules/auth/auth.routes.ts';
import { createBooksRouter } from './modules/books/books.routes.ts';
import { createJournalRouter } from './modules/journal/journal.routes.ts';
import { createOrganizeRouter } from './modules/organize/organize.routes.ts';
import { createPhotosRouter } from './modules/photos/photos.routes.ts';

export interface AppConfig {
  jwtSecret: string;
  /** Secure cookies need HTTPS: true in production, false for local http. */
  cookieSecure: boolean;
  /** Register/login attempts allowed per client IP per window. */
  authRateLimit?: AuthRateLimit;
  /** Built web app to serve alongside the API (production only). */
  webDistDir?: string;
  /** Photo storage; null until credentials are configured (uploads then answer 503). */
  storage?: ImageStorage | null;
  /** Storage path namespace keeping dev, test and production assets apart. */
  storageNamespace?: string;
}

const DEFAULT_AUTH_RATE_LIMIT: AuthRateLimit = { windowMs: 15 * 60 * 1000, limit: 20 };

export function createApp(config: AppConfig): express.Express {
  const app = express();

  // Render terminates TLS in one proxy hop. Without this, req.ip is the proxy's
  // address and per-client rate limits would apply to everyone at once.
  app.set('trust proxy', 1);
  app.use(
    helmet({
      contentSecurityPolicy: {
        // Book maps load their tiles straight from Stadia Maps.
        directives: { imgSrc: ["'self'", 'data:', 'https://tiles.stadiamaps.com'] },
      },
    }),
  );

  // Development-only stand-in for Cloudinary's upload endpoint.
  if (config.storage instanceof LocalDiskStorage) config.storage.mount(app);

  const api = express.Router();
  api.use(requireJsonForWrites);
  api.use(express.json({ limit: '100kb' }));
  api.use(cookieParser());

  // Shallow health check (database only): safe for the host to poll often.
  api.get('/health', async (_req, res) => {
    const dbUp = await isDatabaseUp();
    const body: HealthResponse = { status: dbUp ? 'ok' : 'degraded', db: dbUp ? 'up' : 'down' };
    res.status(dbUp ? 200 : 503).json(body);
  });

  api.use(
    '/auth',
    createAuthRouter({
      jwtSecret: config.jwtSecret,
      cookieSecure: config.cookieSecure,
      authRateLimit: config.authRateLimit ?? DEFAULT_AUTH_RATE_LIMIT,
    }),
  );
  const storageConfig = {
    ...config,
    storage: config.storage ?? null,
    storageNamespace: config.storageNamespace ?? 'development',
  };
  api.use('/books', createBooksRouter(storageConfig));
  api.use(createPhotosRouter(storageConfig));
  api.use(createOrganizeRouter(config));
  api.use(createJournalRouter(config));

  api.use(apiNotFound);
  app.use('/api', api);

  if (config.webDistDir) serveWebApp(app, config.webDistDir);

  app.use(errorHandler);
  return app;
}
