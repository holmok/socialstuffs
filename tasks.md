# socialstuffs — Prioritized Task List

Companion to [audit.md](audit.md) — F-numbers reference findings there. Phases are ordered by dependency and severity; tasks within a phase are independent unless noted. Each task is scoped to roughly one sitting.

---

## Phase 1 — Stop the bleeding (broken now)

- [ ] **1.1 Declare missing dependencies** (F2)
  `bun add date-fns && bun add -d @types/jsonwebtoken @types/pg` — or replace the single `dateFns.addDays` call in `session-middleware.ts` with plain Date math and skip the dep. Verify with a clean `rm -rf node_modules && bun install && bun run typecheck`.

- [ ] **1.2 Fix the `/validate-account` column-shadowing bug** (F1)
  In `sign-up-routes.ts:143-193`: drop the `selectAll()` join; query the token by `token` with explicit columns, then claim atomically (`set claimed where token = ? and claimed is null … returning userId`) and activate the user inside one `db.transaction()`. Add a token max-age check (24–48 h) while in there.
  *Write the integration test first (seed user + token with non-aligned ids) — it fails today and proves the fix.*

- [ ] **1.3 Guard `jwt.verify`** (F3)
  `auth-middleware.ts:36`: try/catch; on failure clear the cookie and continue unauthenticated. Pass `{ algorithms: ['HS256'] }`.

- [ ] **1.4 Enforce `user.status` at sign-in** (F4)
  `sign-in-routes.ts`: after password verify, `pending` → "please validate your email" message; `deleted`/`inactive` → generic invalid sign-in. Also make `authorize()` reject non-active statuses.

- [ ] **1.5 Fix Biome + typecheck baseline** (F32)
  `bunx biome check --write .`, remove the unused `user` prop in `main-layout.tsx`, exclude `templates/email/` from Biome's HTML parsing. Enable `noFloatingPromises` (it enforces 2.2 mechanically). Goal: `bun run check` and `bun run typecheck` both clean, and keep them clean through every phase below.

## Phase 2 — Session & auth hardening

- [ ] **2.1 JWT expiry + secure cookies** (F5, F6)
  Add `expiresIn: '7d'` (or shorter) to `jwt.sign` and matching `maxAge` on the cookie; add `secure: config.mode.isProd` to all three `setSignedCookie` sites (auth set/clear, session). Depends on 1.3 (expired JWTs must not 500).

- [ ] **2.2 Await the four `addFlash` calls** (F11)
  `sign-in-routes.ts:60`, `sign-up-routes.ts:129`, `user-routes.ts:21`, `error-middleware.ts:35`. One `await` each.

- [ ] **2.3 Serve static assets before the middleware chain** (F12)
  Move `serveStatic` + `staticCache` registration ahead of auth/session/flash/layout in `server.ts` (or scope those middleware away from asset paths). Fixes the first-visit session-id clobber race and removes per-asset JWT/HMAC/logging work.

- [ ] **2.4 One-line middleware wins: `secureHeaders()` + `csrf()`** (F13)
  Register both in `server.ts` before routes. Start CSP permissive-but-explicit (`style-src 'unsafe-inline'` for the inline style tag), tighten later.

- [ ] **2.5 Token/session-id entropy** (F8)
  `new Uniquey({ length: 32 })` (or `crypto.randomBytes(32).toString('base64url')`) for validation tokens and session ids. Keep the short 8-char uid for public user ids if you like the aesthetics — it's not a secret — but tokens must grow.

- [ ] **2.6 Rate limiting on auth endpoints** (F7, F20)
  Per-IP + per-account limits on `/sign-in`, `/sign-up`, `/validate-account` (hono-rate-limiter or a kvStorage-backed counter). While in sign-in, add the dummy-bcrypt-verify for unknown emails to kill the timing oracle.

- [ ] **2.7 Sign-out as POST** (F18)
  Change route to POST using `utils.redirect`; replace the nav link with a small form/`hx-post` button styled as a link.

- [ ] **2.8 `authorize({ roles })` implies auth** (F19)
  Missing user + roles specified → 401; wrong role → 403. Small fix in `auth-middleware.ts:73-80`, do alongside 2.7.

## Phase 3 — Sign-up flow integrity

- [ ] **3.1 Transactional sign-up + non-fatal email** (F9, F24-part)
  Wrap user + token inserts in `db.transaction()`; move the Postmark send after commit; on email failure, log and flash "we couldn't send your validation email" instead of 500ing. Use `.executeTakeFirstOrThrow()` instead of the `const [user] =` destructure.

- [ ] **3.2 Validate before touching form data** (F15)
  `sign-up-routes.ts:65-87`: check validation errors first; only then normalize email/username and run the duplicate-check query, using the parsed `result.data`. Fix `validateFormData`'s return typing (no `as T` on failure). Add the malformed-POST test (currently 500s).

- [ ] **3.3 Resend-validation endpoint** (F9)
  Small route: accepts an email, if a matching `pending` user exists, issues a fresh token (new entropy per 2.5) and re-sends; neutral response either way. Unblocks accounts stranded by past sign-up failures.

- [ ] **3.4 Stop echoing passwords into HTML** (F17)
  Strip `password`/`confirmPassword` from props before re-rendering both forms.

- [ ] **3.5 Stop logging secrets; add pino `redact`** (F25)
  Remove raw token from the validate-account warn logs (log a hash/last-4), drop the email payload from `email-api.ts:40`'s debug log, add a `redact` config with paths for cookies/passwords/tokens/urls.

## Phase 4 — Frontend resilience & accessibility

- [ ] **4.1 Form fallbacks + autocomplete** (F10, F31-part)
  Add `action`/`method` to both forms (kills the JS-off password-in-URL leak). Add an `autocomplete` prop to `TextInput`; set `email`/`current-password` on sign-in, `username`/`email`/`new-password` on sign-up.

- [ ] **4.2 Request feedback: indicators, double-submit, network errors** (F30)
  `hx-disabled-elt="find button"` + `hx-indicator` on both forms with a `.htmx-request` style in `form-style.ts`; a global `htmx:sendError` listener in `flash.js` that surfaces a flash-style "couldn't reach the server" message.

- [ ] **4.3 Preserve forms on server errors** (F16)
  In `error-middleware.ts`, send `HX-Reswap: none` for HTMX error responses and deliver the error via the flash region instead of swapping `ErrorFragment` over the form.

- [ ] **4.4 A11y pass on forms and nav** (F31)
  Error `<ul>` gets `id={id}-errors`; inputs get `aria-invalid` + `aria-describedby` when errored; form-errors container gets `role="alert"`; nav toggle gets `aria-label="Menu"`; lighten the two failing placeholder colors (target ≥4.5:1).

- [ ] **4.5 Resolve `/recover-password`** (F14)
  Quick: remove the link. Real: implement the flow using the *fixed* token primitives (32-char token, expiry, atomic claim, neutral responses, rate-limited) — after Phases 2–3, this is mostly assembly.

## Phase 5 — Performance

- [ ] **5.1 Cheap flash reads** (F21)
  Make `getFlashes` one atomic delete-returning "pop"; skip the DB entirely when the request has no session cookie. With 2.3 done, anonymous static-page hits become DB-free.

- [ ] **5.2 kvStorage sweep** (F22)
  `setInterval` at startup: `DELETE FROM kv_storage WHERE expires < now()` (hourly is plenty). Confirm the unique index on `key`.

- [ ] **5.3 Static asset caching done right** (F23)
  Commit `.gz`/`.br` siblings, `serveStatic({ precompressed: true })`, add `hono/etag`; version `htmx.min.js` in its filename (and bump to latest 2.0.x) + `immutable`, or lower the TTL.

- [ ] **5.4 Email API cleanup** (F24)
  Construct the Postmark client once in the constructor; cache template file contents on first read.

- [ ] **5.5 Pool + shutdown + logging hardening** (F33, F26-part)
  `connectionTimeoutMillis: 5000` (+ explicit `idleTimeoutMillis`); shutdown deadline racing `server.stop(true)` at ~10 s; drop `assertPortFree` (try/catch `Bun.serve` instead); async stdout destination for pino.

## Phase 6 — Idioms, types, and hygiene

- [ ] **6.1 Fix pino wiring and logger typing** (F26)
  Dev: pretty transport only (the multistream is currently discarded). Prod: explicit per-stream `level`. Type `c.var.logger` as hono-pino's `PinoLogger`; use `c.var.logger` (not the module-scope logger) inside handlers.

- [ ] **6.2 Zod 4 idioms** (F27)
  `z.coerce.number().int().positive()` for numeric env vars; `z.url()`/`z.email()` where applicable; `message:` → `error:`; replace `validateFormData` internals with `z.flattenError` — or adopt `@hono/zod-validator` and delete it (pairs with 3.2).

- [ ] **6.3 Honest Kysely types** (F28)
  `| null` on `claimed`, `lastLogin`, `imageUrl`; collapse `ColumnType<X,X,X>` triples; align the `uid` generated-vs-supplied convention; optionally wire Kysely's `log` hook to pino.

- [ ] **6.4 Consider `hono/jwt`** (F29)
  Replace `jsonwebtoken` with Hono's built-in Web-Crypto JWT (drops a CommonJS dep and `@types/jsonwebtoken`). Best done as part of, or right after, 2.1 since it touches the same lines.

- [ ] **6.5 tsconfig modernization** (F34)
  `module: "Preserve"`, `moduleResolution: "bundler"`, `target: "ESNext"`, `noEmit: true`, `verbatimModuleSyntax: true`; consider `noUncheckedIndexedAccess`.

- [ ] **6.6 Dead-code sweep** (F36)
  Remove `card.tsx`, `cachedQueries` (or implement it deliberately), unused `baseImageUrl`, `Layout`'s `user` prop; rename `APP_NAME` from the `bun-hono-htmx` boilerplate; keep `passwordRecoveryTokens` only if 4.5 goes the "implement" route; `auth.getUser` may become live via 1.4/2.1 — decide then.

- [ ] **6.7 Update CLAUDE.md** (F35)
  Correct the static cache TTL, document session/flash/layout middleware and the flash system, and fold in any architecture changes from Phases 2–5.

## Phase 7 — Test suite (interleave, don't defer)

Targets in value order — 7.1 belongs inside task 1.2, and 7.2/7.3 should land with Phases 2–3 rather than after:

- [ ] **7.1** `/validate-account` integration (non-aligned ids, reuse, expiry, wrong uid) — *part of 1.2*
- [ ] **7.2** Sign-up POST (duplicates incl. normalize-email aliases, malformed payloads, failure-after-insert)
- [ ] **7.3** Sign-in + auth round-trip (statuses, garbage/rotated-secret cookie, JWT expiry)
- [ ] **7.4** Flash/session lifecycle (add→render→clear, expiry, redirect race, first-visit parallel requests)
- [ ] **7.5** Error middleware branching (HTMX vs full-page, 401 redirect both ways, dev-only stack)

---

**Suggested first sitting:** 1.1 → 1.5 in order — after that the app is honestly runnable from a clean clone, account validation actually works, bad cookies don't 500, and banned/pending users can't sign in. Phases 2–3 are the security core; 4–7 can proceed in any order or in parallel.
