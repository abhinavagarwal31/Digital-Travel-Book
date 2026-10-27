# Wanderbook

Turn a trip's photos into a private, organized, themed travel book. Photos are sorted into days and chapters from their own metadata; nothing (dates, places, memories) is ever invented.

## Requirements

- Node.js 24 (see `.node-version`)
- npm 11+

## Repository layout

| Path              | What it is                                                 |
| ----------------- | ---------------------------------------------------------- |
| `packages/shared` | Zod schemas and pure functions shared by web and API       |
| `apps/api`        | Express 5 API; also serves the built web app in production |
| `apps/web`        | React + Vite single-page app                               |

TypeScript runs directly on Node 24 (type stripping), so the API and shared package have no build step.

## Scripts

```sh
npm install
cp .env.example .env # then fill in real values

# development: three terminals, open http://localhost:5173
npm run dev:db       # MongoDB on :27017, data in .local-db/ (git-ignored)
npm run dev:api      # API on :3000; photos go to .local-storage/ until Cloudinary is set
npm run dev:web      # Vite on :5173, proxies /api to :3000

# production: one process serves the app and the API
npm run build && NODE_ENV=production npm start

npm run check        # typecheck + lint + format check + tests
npm run test:integration  # real-account Cloudinary checks (reads .env.production.local)
npm test             # tests only
npm run format       # apply Prettier
```
