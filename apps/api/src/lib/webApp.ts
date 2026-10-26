import express, { type Express } from 'express';
import { extname, join, sep } from 'node:path';

const IMMUTABLE = 'public, max-age=31536000, immutable';

/**
 * Serves the built React app from the same origin as the API. Vite puts
 * content-hashed files under assets/, so those can be cached forever; the HTML
 * shell must be revalidated so a new deploy is picked up immediately.
 */
export function serveWebApp(app: Express, distDir: string): void {
  const assetsDir = `${sep}assets${sep}`;
  app.use(
    express.static(distDir, {
      index: false,
      setHeaders(res, filePath) {
        res.setHeader('Cache-Control', filePath.includes(assetsDir) ? IMMUTABLE : 'no-cache');
      },
    }),
  );

  // Client-side routes (/, /books/123, ...) all get the app shell. Paths with a
  // file extension are real files, so a missing one stays a 404 instead of
  // being answered with HTML. Express 5 needs a named wildcard: '/{*splat}'.
  app.get('/{*splat}', (req, res, next) => {
    if (extname(req.path)) {
      next();
      return;
    }
    res.setHeader('Cache-Control', 'no-cache');
    res.sendFile(join(distDir, 'index.html'));
  });
}
