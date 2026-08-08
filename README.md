# socialstuffs

A server-rendered social app built with [Bun](https://bun.sh), [Hono](https://hono.dev) (JSX templating, no React), and [HTMX](https://htmx.org), backed by Postgres via [Kysely](https://kysely.dev).

## Requirements

- Bun
- A Postgres database (schema is managed outside this repo)
- A [Postmark](https://postmarkapp.com) server token (transactional email)
- An [Axiom](https://axiom.co) dataset + token (production logging only)

## Setup

Install dependencies:

```sh
bun install
```

Create a `.env` file (loaded automatically by Bun). Required variables:

```sh
DATABASE_URL=postgres://user:pass@localhost:5432/socialstuffs
DATABASE_SCHEMA=socialstuffs
AXIOM_DATASET=...
AXIOM_TOKEN=...
POSTMARK_TOKEN=...
FROM_EMAIL=...
JWT_SECRET=...
COOKIE_SECRET=...
COOKIE_NAME_USER=...
COOKIE_NAME_SESSION=...
```

Optional (with defaults): `PORT` (3000), `HOST` (localhost), `NODE_ENV`, `LOG_LEVEL`, `LOG_NAME`, `DATABASE_MIN_CLIENTS`, `DATABASE_MAX_CLIENTS`, `BASE_LINK_URL`, `BASE_IMAGE_URL`.

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

## Project layout

```
server/
  index.ts        # entrypoint: config, logging (pino, + Axiom in prod), startup, graceful shutdown
  server.ts       # createApp(): middleware, routes, static assets, error handlers
  config.ts       # env validation (Zod)
  api/            # external service clients (Postmark email)
  data/           # Kysely table types + database instance
  middleware/     # context, auth (signed JWT cookie), session, flash, security headers, csrf, rate limiting, errors, static caching
  routes/         # route groups (pages + HTMX fragment endpoints)
  styles/         # CSS-in-TS, injected inline by the layout
templates/
  layouts/        # full HTML documents
  pages/          # pages wrapped in a layout
  components/     # fragments used as HTMX swap responses
  email/          # HTML email templates
static/           # favicons, htmx.min.2.0.10.js (versioned), nav.js, flash.js
```

See [CLAUDE.md](CLAUDE.md) for a deeper architecture walkthrough.
