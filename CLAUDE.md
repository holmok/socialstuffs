# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

- `bun install` — install dependencies
- `bun run dev` — start dev server with hot reload at http://localhost:3000 (sets `NODE_ENV=development`)
- `bun run start` — run in production mode (sets `NODE_ENV=production`)
- `bun run typecheck` — TypeScript type check (`tsc --noEmit`)
- `bunx biome check .` — lint and format check (Biome is the linter/formatter; also `bun run check`)
- `bunx biome check --write .` — apply lint/format fixes

There is no test suite or build step; the server runs TypeScript directly via Bun.

## Architecture

Server-rendered app: Hono serves HTML built with Hono's JSX runtime (`jsxImportSource: "hono/jsx"`, no React), and HTMX on the client swaps HTML fragments returned by routes. Routes return full pages or fragments via `c.html(...)`.

Startup flow: `server/index.ts` loads config, creates the pino logger, verifies the port is free (`assertPortFree` in `server/utils.ts`, exits if in use), calls `createApp()` from `server/server.ts`, starts the server, and registers SIGINT/SIGTERM handlers for graceful shutdown (`shutdown` in `server/utils.ts`, which closes the server and calls `api.shutdown()`). `createApp()` wires everything together:

1. Instantiates the `API` class (`server/api/index.ts`) — the container for backend service clients. It currently holds only `NoopAPI`; new backend services get added as private members with getters that throw once `shutdown()` has been called.
2. Registers context middleware (`server/middleware/`) that puts `config`, `logger`, and `api` on Hono's context — available in any handler as `c.get('api')` etc. The `ContextVariableMap` declaration in `server/server.ts` types these.
3. Registers routes via `Routes()` (`server/routes/index.ts`), which delegates to route-group files like `public-routes.ts`. New route groups get their own file and are registered in `routes/index.ts`.
4. Falls back to serving static assets from `static/` (favicons, the vendored `htmx.min.js`), with `staticCache` middleware setting `Cache-Control` (`public, max-age=3600` in production, `no-store` in development).

Templates live in `templates/` split into `layouts/` (full HTML documents), `pages/` (full pages wrapped in a layout), and `components/` (fragments suitable as HTMX swap responses).

Configuration (`server/config.ts`) validates env vars with Zod (`PORT`, `HOST`, `NODE_ENV`, `LOG_LEVEL`, `LOG_NAME`; a `.env` file is loaded automatically by Bun) and returns `{ server, mode, pino }` — `mode` exposes `isDev`/`isProd`/`env` derived from `NODE_ENV`. Pino options: pretty-printed logging in development (level forced to `debug`, ignoring `LOG_LEVEL`), structured JSON at `LOG_LEVEL` in production.

## Styles (CSS-in-TS)

CSS is authored as TypeScript objects in `server/styles/` and injected inline as a `<style>` tag by the main layout — no stylesheets are served from `static/`. How it works:

- Style modules live in `server/styles/css/` (`reset-style.ts`, `global-style.ts`), typed as `CSSObject` (csstype-based): keys are selectors or camelCased CSS properties, values nest for at-rules/nested selectors. Bare numbers render as `px`.
- Design tokens live in `server/styles/_colors.ts` and `server/styles/_vars.ts`; style modules import from these rather than hardcoding values.
- `getStyle()` in `server/styles/index.ts` renders and concatenates the requested styles, caching each combination. To add a style, create a module in `css/`, then register it in the `style` union type and `stylesMap` in `styles/index.ts`.
- The `Layout` component (`templates/layouts/main-layout.tsx`) always includes `reset` and `global`, and pages can pass additional style names via its `styles` prop.

## Path aliases

Defined in `tsconfig.json`: `@/*` → `server/`, plus `@routes/*`, `@api/*`, `@middleware/*`, `@styles/*`, `@templates/*`, `@components/*`, `@pages/*`. Use these instead of relative imports.

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
