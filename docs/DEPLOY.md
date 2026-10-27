# Deploying to Render (free)

One Render **Web Service** runs everything: Express serves the API and the built web app from the same origin. MongoDB Atlas (free M0) holds the data and Cloudinary (free) holds the photos.

## Before you start

- **MongoDB Atlas → Security → IP Access List** contains `0.0.0.0/0` ("Allow access from anywhere"). Render's free tier has no fixed IP; access still needs the database username and password.
- Your local `.env.production.local` (git-ignored) has all of: `MONGODB_URI`, `JWT_SECRET`, `CLOUDINARY_CLOUD_NAME`, `CLOUDINARY_API_KEY`, `CLOUDINARY_API_SECRET`.
- `npm run test:integration` passes (checks Cloudinary against the real account).

## Create the service

1. Sign in at **render.com** with GitHub.
2. **+ New → Web Service**. When GitHub asks for access, choose **Only select repositories → `Wanderbook`**.
3. Fill in:

| Field          | Value                                                         |
| -------------- | ------------------------------------------------------------- |
| Name           | `wanderbook` (becomes `https://wanderbook-7rnn.onrender.com`) |
| Language       | Node                                                          |
| Branch         | `main`                                                        |
| Region         | **Singapore** (same region as the Atlas cluster)              |
| Root Directory | _(empty)_                                                     |
| Build Command  | `npm ci --include=dev && npm run build`                       |
| Start Command  | `npm start`                                                   |
| Instance Type  | **Free**                                                      |

`--include=dev` matters: with `NODE_ENV=production`, npm would otherwise skip the build tools (Vite, TypeScript) and the build would fail.

4. **Environment Variables** (copy values from `.env.production.local`; never paste them anywhere else):

| Key                     | Value                           |
| ----------------------- | ------------------------------- |
| `NODE_ENV`              | `production`                    |
| `NODE_VERSION`          | `24`                            |
| `MONGODB_URI`           | everything after `MONGODB_URI=` |
| `JWT_SECRET`            | everything after `JWT_SECRET=`  |
| `CLOUDINARY_CLOUD_NAME` | from the file                   |
| `CLOUDINARY_API_KEY`    | from the file                   |
| `CLOUDINARY_API_SECRET` | from the file                   |

Do **not** add `PORT`; Render sets it.

5. **Advanced**
   - Health Check Path: `/api/health`
   - Auto-Deploy: **On Commit** (every push to `main` redeploys)
6. **Deploy Web Service**. The first build takes 3–5 minutes.

Stay on the free tier: if Render asks for a card or shows a price, stop. A free web service needs neither.

## If the deploy fails

The **Logs** tab shows why. The server refuses to start with a clear message when something is missing:

| Log message                                        | Fix                                                                |
| -------------------------------------------------- | ------------------------------------------------------------------ |
| `Invalid environment configuration: … is required` | that environment variable is missing in Render                     |
| `Could not connect to MongoDB`                     | Atlas IP Access List lacks `0.0.0.0/0`, or a typo in `MONGODB_URI` |
| `Web build not found in apps/web/dist`             | the Build Command is not the one above                             |

## Free-tier behaviour

- The service sleeps after ~15 minutes without traffic; the next visit takes about a minute to wake it.
- Render's free tier allows 750 instance hours a month, enough for one service running all month.

## After it is live

Verify on the production URL (plan item C7), not just that the page loads:

- `GET /api/health` → `{"status":"ok","db":"up"}`
- Register, refresh the page, still logged in; the session cookie is `Secure; HttpOnly; SameSite=Lax`.
- Upload a photo; its thumbnail loads for the owner, returns 401 when logged out and 404 for a different user.
- The flip-book opens and turns pages.
