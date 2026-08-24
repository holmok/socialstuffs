# socialstuffs

A server-rendered social app built with [Bun](https://bun.sh), [Hono](https://hono.dev) (JSX templating, no React), and [HTMX](https://htmx.org), backed by Postgres via [Kysely](https://kysely.dev). Users post text/images/links to audience-scoped circles (everyone, non-disapproved, approved, favorites), comment on posts, and favorite or approve/disapprove each other; text runs through Google Natural Language moderation and images through Vision SafeSearch before anything is saved.

## Requirements

- Bun
- A Postgres database (schema managed by the migrations in `migrations/`)
- Google Cloud Application Default Credentials — Natural Language (text moderation), Vision SafeSearch (image moderation), and Cloud Storage buckets for uploaded images and own-data export zips
- A [Postmark](https://postmarkapp.com) server token (transactional email)
- An [Axiom](https://axiom.co) dataset + token (production logging only)

## Setup

Install dependencies:

```sh
bun install
```

Copy the documented example env file and fill in your values (`.env` is gitignored and loaded automatically by Bun):

```sh
cp .example_env .env
```

`.example_env` documents every variable: required ones (`DATABASE_URL`, `DATABASE_SCHEMA`, `PORT`, `HOST`, `NODE_ENV`, `TRUST_PROXY`, `LOG_NAME`, `AXIOM_DATASET`/`AXIOM_TOKEN`, `POSTMARK_TOKEN`/`FROM_EMAIL`, `BASE_LINK_URL`, `IMAGE_BUCKET`, `BASE_IMAGE_URL`, `DATA_BUCKET`, `JWT_SECRET`, `COOKIE_SECRET`, `COOKIE_NAME_USER`/`COOKIE_NAME_SESSION`) and the optional ones with defaults (`LOG_LEVEL`, `DATABASE_MIN_CLIENTS`/`DATABASE_MAX_CLIENTS`).

Create/update the database schema:

```sh
bun run migrate up    # node-pg-migrate over migrations/ (uses DATABASE_URL)
```

## Running

```sh
bun run dev      # dev server with hot reload at http://localhost:3000
bun run start    # production mode
bun run ngrok    # production mode + ngrok tunnel
```

Checks:

```sh
bun run typecheck   # tsc --noEmit
bun run check       # biome lint + format check
bun test            # bun:test — integration tests run against the dev database from .env
bun run test:coverage  # bun test --coverage — report-only coverage (text table + lcov into coverage/)
```

There is no build step; Bun runs the TypeScript directly. Tests live next to the code they cover (e.g. `server/routes/sign-up-flow.test.ts`) and seed uniquely-suffixed rows they clean up afterward.

Dev-only fake data: `bun run scripts/seed-fake-data.ts` creates a dozen fake users (all with password `Password123!`) plus posts, comments, relations, and favorites, recording everything in `scripts/seeded-data.json`; `bun run scripts/unseed-fake-data.ts` hard-deletes it all again. The seeds write directly through Kysely, so no Google credentials are needed.

## Deployment

The app ships as a Docker image (`Dockerfile` — `oven/bun:1-slim`, production dependencies only, no build step) and runs on Google Cloud Run:

```sh
./deploy-dev.sh     # build + push + deploy the dev environment
./deploy-prod.sh    # build + push + deploy production
```

Each script builds a `linux/amd64` image, pushes it to Artifact Registry (a timestamp tag plus `latest`), and runs `gcloud run deploy` for the matching Cloud Run service (`dev-website-service` / `prod-website-service`, region `us-central1`). Unauthenticated probe endpoints for the platform: `GET /liveness` and `GET /start-up` (which also checks database connectivity).

## Project layout

```
migrations/       # node-pg-migrate migrations (bun run migrate)
scripts/          # dev-only fake-data seed/unseed
server/
  index.ts        # entrypoint: config, logging (pino, + Axiom in prod), startup, graceful shutdown
  server.ts       # createApp(): middleware, routes, static assets, error handlers
  config.ts       # env validation (Zod) + text-moderation thresholds
  api/            # external service clients: Postmark email, GCS/Vision images, Natural Language moderation, user-data export/delete
  data/           # Kysely table types + database instance
  middleware/     # context, auth (signed JWT cookie), session, flash, security headers, csrf, rate limiting, errors, static caching
  routes/         # route groups (pages + HTMX fragment endpoints)
  styles/         # CSS-in-TS, injected inline by the layout
templates/
  layouts/        # full HTML documents
  pages/          # pages wrapped in a layout
  components/     # fragments used as HTMX swap responses
  email/          # HTML email templates
static/           # favicons, htmx.min.2.0.10.js (versioned), and the page-behavior JS (nav, flash, char-count, image-preview, lightbox, modals)
```

See [CLAUDE.md](CLAUDE.md) for a deeper architecture walkthrough.
