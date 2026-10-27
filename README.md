# Wanderbook

Turn a trip's photos into a private, organised travel book with real turning pages.

**Live app:** https://wanderbook-7rnn.onrender.com · **Repository:** https://github.com/abhinavagarwal31/Wanderbook

**Demo account** (a sample 6-day Japan trip, already uploaded and organised):

| Email                 | Password          |
| --------------------- | ----------------- |
| `demo@wanderbook.app` | `wanderbook-demo` |

Or register your own account and upload your photos.

> The app runs on Render's free tier, which sleeps after ~15 minutes without visitors. The first visit after a pause can take up to a minute to wake it.

---

## Problem statement

After a trip, the memories sit in a camera roll: hundreds of photos in one long grid, mixed with screenshots, with no days, no places and no stories. Turning them into something you would want to reopen (a travel journal or photo book) takes hours of sorting by hand, and photo-book services either want you to place every photo yourself or "auto-fill" pages with captions and dates they invent.

## Target users

- Travellers who take many photos on a phone and never get around to organising them.
- People who keep (or want to keep) a travel diary and want their words next to the photos.
- Anyone who wants a private keepsake of a trip rather than a public social post.

## Solution

Wanderbook reads each photo's own metadata (capture time, time zone and GPS location) on the server and uses it to place every photo in the right **day** and group days into **chapters by place**. Photos it cannot place with confidence are never guessed: they wait on a drag-and-drop sorting board for the owner to decide. The owner adds captions and a diary for each day, picks one of ten styles, and reads the trip as a book with chapter maps and pages that curl as they turn.

Nothing about the trip is invented: dates, places, captions and diary text come only from the photos and from the owner.

## Key features (main workflows)

1. **Accounts and privacy.** Register, log in, stay logged in across visits, change password (logs out other devices), log out everywhere, delete the account and every book in it. Every book, photo and image URL is checked against its owner.
2. **Upload a trip.** Create a book (title, dates, home time zone, destinations), then upload JPEG, PNG, WebP or HEIC photos. Files go straight to cloud storage with signed uploads; failed uploads retry automatically; duplicates and over-limit uploads are rejected with a clear message.
3. **Automatic organising with a human in the loop.** The server extracts EXIF time, offset and GPS, works out the local time zone from the location, and sorts photos into days and place-based chapters. Undated or out-of-range photos, and location outliers, go to a **sorting board** (drag and drop or keyboard) instead of being guessed. Owners can fix a photo's time, rename, split and merge chapters.
4. **Write the journal.** Captions per photo, a diary per day (long entries flow across pages), photo order per day, a page layout per day, and a cover photo.
5. **Read the book.** A flip-book with a page-curl engine (drag a corner or use the arrows/keyboard), hard covers, a trip map and a map for each chapter, photo pages laid out by each photo's real shape, focus mode and full screen.
6. **Ten styles.** Traveller's Journal (default), Espresso, Café Latte, Illustrated Atlas, Minimal Editorial, Scrapbook, Vintage Postcard, Midnight, Pastel Breeze and Comic Adventure. Each restyles the pages and gets its own cover: a leather journal, passport, airmail envelope, luggage tag, comic panel and more. Themes are versioned, so a book never changes look until its owner picks a style again.
7. **Your world map.** The library opens on an atlas-style world map with every trip's route and the countries visited.
8. **Plans.** A Free plan (200 photos per book) and a Pro plan shown as "coming soon" (no payments are taken).

## Tech stack

| Layer         | Technology                                                            | Why                                                                             |
| ------------- | --------------------------------------------------------------------- | ------------------------------------------------------------------------------- |
| Frontend      | React 19, Vite, React Router, TanStack Query                          | Fast SPA with cached server state and optimistic updates                        |
| Drag and drop | dnd-kit                                                               | Accessible (keyboard) sorting board                                             |
| Maps          | d3-geo + world-atlas (world map), Stadia static tiles (chapter maps)  | Vector world map with no API calls; real map tiles for routes                   |
| Backend       | Node.js 24, Express 5                                                 | TypeScript runs directly on Node 24 (type stripping): no build step for the API |
| Validation    | Zod 4 (shared by frontend and backend)                                | One schema validates forms in the browser and requests on the server            |
| Database      | MongoDB Atlas + Mongoose 9                                            | Books, photos and journals are document-shaped; atomic per-day updates          |
| Photo storage | Cloudinary (signed uploads, private delivery)                         | Image variants (thumb, page, cover) and HEIC conversion                         |
| Metadata      | exifr, geo-tz, luxon, image-size                                      | EXIF time/GPS, time zone from coordinates, correct dimensions                   |
| Security      | helmet (CSP), JWT in HTTP-only cookies, scrypt, express-rate-limit    | See "Security" below                                                            |
| Testing       | Vitest, Testing Library, Supertest, mongodb-memory-server, Playwright | 500+ unit/integration tests and end-to-end browser tests                        |
| Hosting       | Render (web service), MongoDB Atlas M0, Cloudinary free tier          | All free tiers                                                                  |

## Architecture

The repository is an npm-workspaces monorepo:

| Folder            | Role                                                                                                                                                                        |
| ----------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `apps/api`        | **Backend.** Express REST API; in production it also serves the built frontend from the same origin                                                                         |
| `apps/web`        | **Frontend.** React single-page app                                                                                                                                         |
| `packages/shared` | **Shared domain logic.** Zod schemas and pure functions used by both: organising photos into days and chapters, composing the book's pages, laying out photos, maps, themes |
| `e2e`             | Playwright end-to-end tests (real browser, in-memory database)                                                                                                              |
| `fixtures`        | Generators for sample trips and a test-photo dataset with varied metadata                                                                                                   |
| `docs`            | Deployment guide                                                                                                                                                            |

```text
Browser (React SPA)
  │  JSON over /api (same origin, session cookie)
  ▼
Express API ── auth · books · photos · organize · journal · account
  │   │
  │   └── Cloudinary: signed direct uploads from the browser; private image delivery
  ▼
MongoDB Atlas: users, books (days, chapters, overrides, theme), photos (capture metadata)
```

**Upload flow.** `POST /api/books/:id/uploads` checks the plan limit and returns a signed upload → the browser uploads the file directly to Cloudinary (retrying on transient failures) → `POST /api/photos/:id/confirm` makes the server fetch the stored file, hash it (duplicate detection), read EXIF, derive the time zone from GPS and store the photo's capture metadata.

**Organising.** `POST /api/books/:id/organize` runs the pure organiser from `packages/shared`: it converts capture times to local days, splits days into chapters when the place changes, flags outliers, and leaves uncertain photos unassigned for the sorting board. Because it is a pure function, the same code is unit-tested exhaustively and could run in the browser.

**Composing the book.** `composeBook(book, photos, theme)` in `packages/shared` turns a book into an ordered list of pages (cover, title, trip map, chapter openers, day pages, diary pages, photo pages, back cover). The reader only renders pages; it never decides what goes on them.

**Main API routes**

| Area               | Routes                                                                                                                                                                                                                |
| ------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Auth               | `POST /api/auth/register`, `POST /api/auth/login`, `POST /api/auth/logout`, `GET /api/auth/me`                                                                                                                        |
| Account            | `GET/PATCH/DELETE /api/account`, `PUT /api/account/password`, `POST /api/account/sessions/sign-out-others`, `GET /api/account/places`                                                                                 |
| Books              | `POST/GET /api/books`, `GET/PATCH/DELETE /api/books/:id`, `PUT /api/books/:id/theme`, `/cover`, `/day-layouts/:date`, `/days/:date/photo-order`                                                                       |
| Photos             | `POST /api/books/:id/uploads`, `POST /api/photos/:id/confirm`, `GET /api/books/:id/photos`, `GET /api/photos/:id/image/:variant`, `PUT /api/photos/:id/time`, `PUT /api/photos/:id/caption`, `DELETE /api/photos/:id` |
| Organise / journal | `POST /api/books/:id/organize`, `PUT /api/books/:id/days/:date/diary`                                                                                                                                                 |
| Health             | `GET /api/health`                                                                                                                                                                                                     |

## Security

- Passwords are stored as salted **scrypt** hashes; login and password checks are rate-limited.
- Sessions are signed JWTs in `HttpOnly`, `SameSite=Lax` (and `Secure` in production) cookies. Each session carries a version, so changing the password or "log out other devices" invalidates old sessions.
- Every book, photo and image request is checked against its owner; another user's resource returns 404, not 403, so ids cannot be probed.
- All request bodies are validated with Zod; writes must be JSON (blocks form-based CSRF); `helmet` sets a strict Content-Security-Policy.
- Photos are stored privately and served only through the API to their owner, with `Cache-Control: private, no-store`.
- Secrets live only in environment variables (`.env` files are git-ignored).

## Local setup

Requirements: **Node.js 24** (see `.node-version`), npm 11+, and MongoDB (a local `mongod`, or an Atlas connection string).

```sh
git clone https://github.com/abhinavagarwal31/Wanderbook.git
cd Wanderbook
npm install
cp .env.example .env        # then fill in the values (see below)

# three terminals, then open http://localhost:5173
npm run dev:db              # local MongoDB on :27017 (data in .local-db/, git-ignored)
npm run dev:api             # API on :3000
npm run dev:web             # Vite on :5173, proxies /api to :3000
```

Without Cloudinary keys the API stores photos on local disk (`.local-storage/`), so the whole app works offline. (Chrome cannot display HEIC files served from disk; with Cloudinary configured they are converted.)

Sample data:

```sh
npm run fixtures              # writes sample trip photos used by the tests
npm run fixtures:test-photos  # generates a folder of test photos with varied metadata (dates, GPS, formats)
```

Checks:

```sh
npm run check       # typecheck + lint + format check + all unit/integration tests
npm run test:e2e    # Playwright end-to-end tests (desktop and phone)
```

Production build, one process serving the app and the API:

```sh
npm run build && NODE_ENV=production npm start
```

## Environment variables

See `.env.example`. Never commit real values.

| Variable                | Required   | Description                                                             |
| ----------------------- | ---------- | ----------------------------------------------------------------------- |
| `NODE_ENV`              | yes        | `development` or `production`                                           |
| `PORT`                  | no         | Port to listen on (default 3000; Render sets it)                        |
| `MONGODB_URI`           | yes        | MongoDB connection string (local or Atlas)                              |
| `JWT_SECRET`            | yes        | 32+ random characters used to sign sessions (`openssl rand -base64 48`) |
| `CLOUDINARY_CLOUD_NAME` | production | Cloudinary cloud name                                                   |
| `CLOUDINARY_API_KEY`    | production | Cloudinary API key                                                      |
| `CLOUDINARY_API_SECRET` | production | Cloudinary API secret                                                   |

The server validates its configuration at start-up and refuses to start with a clear message if anything is missing.

## Deployment

The app is deployed as a single **Render** web service (Singapore region, free tier): Express serves both the API and the built frontend, MongoDB Atlas (M0) holds the data, and Cloudinary holds the photos.

- **Live:** https://wanderbook-7rnn.onrender.com
- Build command: `npm ci --include=dev && npm run build`
- Start command: `npm start`
- Health check: `GET /api/health` returns `{"status":"ok","db":"up"}`

Step-by-step instructions, including troubleshooting, are in [`docs/DEPLOY.md`](docs/DEPLOY.md).

## Testing

- **Unit and integration (Vitest):** the organiser, book composer, photo layout, maps, themes and schemas in `packages/shared`; every API route with Supertest against an in-memory MongoDB (auth, ownership, validation, limits, duplicate uploads, atomic updates); React pages with Testing Library.
- **End-to-end (Playwright):** register → create a book → upload a 30-photo trip → it sorts itself → read it as a book; turning pages by dragging; reading on a phone.

## AI usage

AI coding assistants were used during development for brainstorming, code generation, reviews and tests. All features were specified, checked and tested by the author.
