# Digital Travel Book

Turn a trip's photos into a private, organized, themed travel book. Photos are sorted into days and chapters from their own metadata; nothing (dates, places, memories) is ever invented.

## Requirements

- Node.js 24 (see `.node-version`)
- npm 11+

## Repository layout

| Path              | What it is                                           |
| ----------------- | ---------------------------------------------------- |
| `packages/shared` | Zod schemas and pure functions shared by web and API |
| `apps/api`        | Express 5 API (added in a later step)                |
| `apps/web`        | React + Vite single-page app (added in a later step) |

TypeScript runs directly on Node 24 (type stripping), so the API and shared package have no build step.

## Scripts

```sh
npm install
npm run check        # typecheck + lint + format check + tests
npm test             # tests only
npm run format       # apply Prettier
```
