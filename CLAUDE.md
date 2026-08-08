# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

- `bun install` — install dependencies
- `bun run dev` — start dev server with hot reload at http://localhost:3000 (sets `NODE_ENV=development`)
- `bun run start` — run in production mode (sets `NODE_ENV=production`)
- `bun run typecheck` — TypeScript type check (`tsc --noEmit`)
- `bunx biome check .` — lint and format check (Biome is the linter/formatter; also `bun run check`)
- `bunx biome check --write .` — apply lint/format fixes
- `bun run ngrok` — run production mode plus an ngrok tunnel at ngrok.holmok.com (via `concurrently`)

- `bun test` — run tests (`bun:test`, zero setup)

There is no build step; the server runs TypeScript directly via Bun. Tests live next to the code they cover (e.g. `server/routes/sign-up-routes.test.ts`). The integration tests run against the dev database from `.env` — they seed uniquely-suffixed rows and clean up in `afterAll`. Note: `bun test` forces `NODE_ENV=test`, which the config's Zod enum rejects, so tests pin `process.env.NODE_ENV = 'development'` before `LoadConfig()`.

## What this is

socialstuffs — a server-rendered social app (posts, comments, favorites, follows) built on Bun + Hono + HTMX, backed by Postgres. HTML is built with Hono's JSX runtime (`jsxImportSource: "hono/jsx"`, no React); HTMX on the client swaps HTML fragments returned by routes. Routes return full pages or fragments via `c.html(...)`.

## Architecture

Startup flow: `server/index.ts` loads config, creates the pino logger (stdout always; in production a second stream ships logs to Axiom via `@axiomhq/pino`), verifies the port is free (`assertPortFree` in `server/utils.ts`, exits if in use), calls `createApp()` from `server/server.ts`, starts the server, and registers SIGINT/SIGTERM handlers for graceful shutdown (`shutdown` in `server/utils.ts`, which stops the server then destroys the Kysely db instance).

`createApp()` wires everything together:

1. Creates the Kysely database instance via `data()` (`server/data/index.ts`) and the `API` class (`server/api/index.ts`).
2. Registers context middleware (`server/middleware/`) that puts `config`, `logger`, `db`, `api`, and `auth` on Hono's context — available in any handler via `c.var` / `c.get(...)`. The `ContextVariableMap` declaration in `server/server.ts` types these.
3. Registers `authenticate()`, the session middleware (signed session-id cookie, values stored in the `kvStorage` table), the flash-message middleware (`c.var.flash`, session-backed; always `await` `addFlash`), the layout renderer (`jsxRenderer` via `server/middleware/layout-middleware.tsx`), and `compress()`.
4. Registers routes via `Routes()` (`server/routes/index.ts`), which delegates to route-group files like `public-routes.ts`. New route groups get their own file and are registered in `routes/index.ts`.
5. Falls back to serving static assets from `static/` (favicons, vendored `htmx.min.js`, `nav.js`), with `staticCache` middleware setting `Cache-Control` (`public, max-age=2592000` — 30 days — in production, `no-store` in development).
6. Registers `notFoundHandler` and `errorHandler` (`server/middleware/error-middleware.ts`): both render the error page, or the `ErrorFragment` component when the request came from HTMX (`HX-Request` header); 401s redirect to `/sign-in` (via `HX-Redirect` for HTMX requests); 5xx responses include the stack trace only in development.

### Data layer (`server/data/`)

Postgres accessed through Kysely (`pg` pool, `CamelCasePlugin`, `WithSchemaPlugin` using `DATABASE_SCHEMA`). Each `*-data.ts` file defines a table's Kysely types (`XTable` plus `Selectable`/`Insertable`/`Updateable` aliases); `data/index.ts` re-exports them and assembles the `Database` type (users, posts, comments, favorites, relations, postTargets, accountValidationTokens, passwordRecoveryTokens, kvStorage, cachedQueries). Handlers query directly via `c.var.db` — there is no repository layer. Database schema/migrations are managed outside this repo.

### API layer (`server/api/`)

The `API` class is the container for external service clients, exposed as `c.var.api`. It currently holds `EmailAPI` (`api.email`), which sends transactional email through Postmark using HTML templates in `templates/email/` with simple `{{placeholder}}` substitution (templates: `account-validation-email`, `password-recovery-email`).

### Auth

`authenticate()` (`server/middleware/auth-middleware.ts`) runs on every request: it reads a signed cookie, verifies the JWT inside it (verification failures are caught — the cookie is cleared and the request continues unauthenticated), and sets `c.var.auth` with `user` (the JWT claims: `uid`, `username`, `status`, `role`), `getUser()` (loads the full user row from the db), and `setUser()` (signs a JWT and sets the signed cookie). `authorize({ requireAuth, roles })` is a per-route middleware that throws 401/403 `HTTPException`s; it also 401s users whose JWT `status` is not `active`. Passwords are hashed with `Bun.password` (bcrypt). Sign-in only admits users with `status === 'active'` (`pending` gets a "validate your email" message; `deleted`/`inactive` get the same generic error as bad credentials). Sign-up validates form data with Zod (`validateFormData` in `server/utils.ts`), normalizes email (`normalize-email`) and username for uniqueness checks, and emails an account-validation link (token created with `uniquey`); `/validate-account/:token/:uid` claims the token atomically in a transaction (48-hour expiry) and activates the user.

### Redirects with HTMX

Use `utils.redirect(c, path)` — it sends an `HX-Redirect` header (204) for HTMX requests and a normal 303 otherwise.

### Templates

Templates live in `templates/` split into `layouts/` (full HTML documents), `pages/` (full pages wrapped in a layout), `components/` (fragments suitable as HTMX swap responses, e.g. the sign-in/sign-up forms re-rendered with validation errors), and `email/` (raw HTML email templates).

## Configuration (`server/config.ts`)

Env vars validated with Zod (a `.env` file is loaded automatically by Bun). Required (no default): `DATABASE_URL`, `DATABASE_SCHEMA`, `AXIOM_DATASET`, `AXIOM_TOKEN`, `POSTMARK_TOKEN`, `FROM_EMAIL`, `JWT_SECRET`, `COOKIE_SECRET`, `COOKIE_NAME_USER`, `COOKIE_NAME_SESSION`. Optional with defaults: `PORT`, `HOST`, `NODE_ENV`, `LOG_LEVEL`, `LOG_NAME`, `DATABASE_MAX_CLIENTS`, `DATABASE_MIN_CLIENTS`, `BASE_LINK_URL` (used to build links in emails), `BASE_IMAGE_URL`. `LoadConfig()` returns grouped config: `auth`, `email`, `poolConfig`, `axiom`, `dbSchema`, `server`, `mode` (`isDev`/`isProd`/`env`), and `pino` (pretty-printed at `debug` level in development, structured JSON at `LOG_LEVEL` in production).

## Styles (CSS-in-TS)

CSS is authored as TypeScript objects in `server/styles/` and injected inline as a `<style>` tag by the main layout — no stylesheets are served from `static/`. How it works:

- Style modules live in `server/styles/css/` (`reset-style.ts`, `global-style.ts`, `form-style.ts`, `info-style.ts`, `error-style.ts`), typed as `CSSObject` (csstype-based): keys are selectors or camelCased CSS properties, values nest for at-rules/nested selectors. Bare numbers render as `px`.
- Design tokens live in `server/styles/_colors.ts` and `server/styles/_vars.ts`; style modules import from these rather than hardcoding values.
- `getStyle()` in `server/styles/index.ts` renders and concatenates the requested styles, caching each combination. To add a style, create a module in `css/`, then register it in the `style` union type and `stylesMap` in `styles/index.ts` (current names: `global`, `reset`, `auth`, `info`, `error`).
- The `Layout` component (`templates/layouts/main-layout.tsx`) always includes `reset` and `global`, and pages can pass additional style names via its `styles` prop.

## Path aliases

Defined in `tsconfig.json`: `@/*` → `server/`, plus `@routes/*`, `@api/*`, `@data/*`, `@middleware/*`, `@styles/*`, `@templates/*`, `@components/*`, `@pages/*`. Use these instead of relative imports.

## Style

Biome enforces: single quotes, no semicolons (as needed), no trailing commas, 2-space indent, 130-char lines.

## Coding Guidelines (Karpathy Skills)

Behavioral guidelines to reduce common LLM coding mistakes. Merge with project-specific instructions as needed.

**Tradeoff:** These guidelines bias toward caution over speed. For trivial tasks, use judgment.

### 1. Think Before Coding

**Don't assume. Don't hide confusion. Surface tradeoffs.**

Before implementing:
- State your assumptions explicitly. If uncertain, ask.
- If multiple interpretations exist, present them - don't pick silently.
- If a simpler approach exists, say so. Push back when warranted.
- If something is unclear, stop. Name what's confusing. Ask.

### 2. Simplicity First

**Minimum code that solves the problem. Nothing speculative.**

- No features beyond what was asked.
- No abstractions for single-use code.
- No "flexibility" or "configurability" that wasn't requested.
- No error handling for impossible scenarios.
- If you write 200 lines and it could be 50, rewrite it.

Ask yourself: "Would a senior engineer say this is overcomplicated?" If yes, simplify.

### 3. Surgical Changes

**Touch only what you must. Clean up only your own mess.**

When editing existing code:
- Don't "improve" adjacent code, comments, or formatting.
- Don't refactor things that aren't broken.
- Match existing style, even if you'd do it differently.
- If you notice unrelated dead code, mention it - don't delete it.

When your changes create orphans:
- Remove imports/variables/functions that YOUR changes made unused.
- Don't remove pre-existing dead code unless asked.

The test: Every changed line should trace directly to the user's request.

### 4. Goal-Driven Execution

**Define success criteria. Loop until verified.**

Transform tasks into verifiable goals:
- "Add validation" → "Write tests for invalid inputs, then make them pass"
- "Fix the bug" → "Write a test that reproduces it, then make it pass"
- "Refactor X" → "Ensure tests pass before and after"

For multi-step tasks, state a brief plan:
```
1. [Step] → verify: [check]
2. [Step] → verify: [check]
3. [Step] → verify: [check]
```

Strong success criteria let you loop independently. Weak criteria ("make it work") require constant clarification.

**These guidelines are working if:** fewer unnecessary changes in diffs, fewer rewrites due to overcomplication, and clarifying questions come before implementation rather than after mistakes.
