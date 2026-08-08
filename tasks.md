# socialstuffs — Prioritized Task List

Companion to [audit.md](audit.md) — F-numbers reference findings there. Phases are ordered by dependency and severity; tasks within a phase are independent unless noted. Each task is scoped to roughly one sitting.

**Status (2026-08-07):**
- **Phase 1 complete** (merged): PR [#1](https://github.com/holmok/socialstuffs/pull/1) deps, [#2](https://github.com/holmok/socialstuffs/pull/2) auth hardening, [#3](https://github.com/holmok/socialstuffs/pull/3) validate-account, [#4](https://github.com/holmok/socialstuffs/pull/4) lint baseline. PR #4 also completed 2.2; PR #3 completed 7.1 and the validate-account part of 3.5.
- **Phase 1 follow-ups complete** (merged): PR [#5](https://github.com/holmok/socialstuffs/pull/5) — 1.6, 1.7, 1.8.
- **Phase 2 open for review** (not yet merged): PR [#6](https://github.com/holmok/socialstuffs/pull/6) JWT expiry + secure cookies (2.1), [#7](https://github.com/holmok/socialstuffs/pull/7) token entropy (2.5), [#8](https://github.com/holmok/socialstuffs/pull/8) sign-out POST + authorize (2.7, 2.8), [#9](https://github.com/holmok/socialstuffs/pull/9) middleware pipeline + secure headers + CSRF (2.3, 2.4), [#10](https://github.com/holmok/socialstuffs/pull/10) rate limiting + timing-oracle fix (2.6). This docs PR should merge alongside/after them.

---

## Phase 1 — Stop the bleeding (broken now)

- [x] **1.1 Declare missing dependencies** (F2) — *done, PR #1: dropped `date-fns` for plain Date math, added the two `@types` dev deps*

- [x] **1.2 Fix the `/validate-account` column-shadowing bug** (F1) — *done, PR #3: explicit columns, 48h expiry, atomic transactional claim, regression test written first*
- [x] **1.3 Guard `jwt.verify`** (F3) — *done, PR #2: try/catch, HS256 pinned, cookie cleared, warn log with error name only*

- [x] **1.4 Enforce `user.status` at sign-in** (F4) — *done, PR #2: status branch at sign-in + `authorize()` 401s non-active users. Known limit: JWT status is a sign-in-time snapshot until 2.1 lands*

- [x] **1.5 Fix Biome + typecheck baseline** (F32) — *done, PR #4: `biome check .` clean, dead `user` prop removed, email templates parse via `html.parser.interpolation`. `noFloatingPromises` is enabled but cannot see through Hono's `c.var` typing — do not rely on it to catch floating flash/session writes*

**Follow-ups surfaced by Phase 1 reviews:**

- [x] **1.6** Add `typescript` as a devDependency (F2 follow-on) — *done, PR #5: added TypeScript 7.0.2 (the native compiler — TS 5.x fails this repo's minimal tsconfig; downgrading needs the tsconfig work in 6.5)*
- [x] **1.7** Fix the `claimed` type lie in `password-recovery-token-data.ts` (F28-part) — *done, PR #5: now `Date | null`*
- [x] **1.8** Add `'test'` to the `NODE_ENV` Zod enum (F-config) — *done, PR #5: enum accepts `test`; the pin removed from the test file; all `isDev`/`isProd` branches degrade safely with both false*

## Phase 2 — Session & auth hardening

- [x] **2.1 JWT expiry + secure cookies** (F5, F6) — *PR #6: 7-day `expiresIn` + matching cookie `maxAge`, `secure: config.mode.isProd` on all four cookie sites. Trap noted: never re-sign `auth.user` without destructuring — it carries runtime `iat`/`exp`*

- [x] **2.2 Await the four `addFlash` calls** (F11) — *done early, PR #4: all four awaited; `errorHandler` made async for the 401 path*

- [x] **2.3 Serve static assets before the middleware chain** (F12) — *PR #9: static served after `compress()` but before auth/session/flash/layout; fixes the first-visit session-clobber race and per-asset JWT/HMAC/logging work*

- [x] **2.4 `secureHeaders()` + `csrf()`** (F13) — *PR #9: CSP (`default-src 'self'`, inline style allowed), `X-Frame-Options: DENY`, csrf() Origin/Sec-Fetch-Site check. Known limit: a csrf-403 renders as a bare unstyled fragment (pre-layout error) — tracked separately*

- [x] **2.5 Token/session-id entropy** (F8) — *PR #7: 32-char (~190-bit) session ids and validation tokens; uid stays short by design (public, not a secret). DB columns confirmed unbounded `text`*

- [x] **2.6 Rate limiting on auth endpoints** (F7, F20) — *PR #10: in-memory per-IP fixed-window limiter (sign-in 10/15min, sign-up 10/hr, validate 20/hr) + dummy-bcrypt timing fix. Keys on the LAST X-Forwarded-For entry (ngrok appends the real IP) — depends on ngrok being the sole front proxy*

- [x] **2.7 Sign-out as POST** (F18) — *PR #8: POST route via `utils.redirect`; nav link → styled form button*

- [x] **2.8 `authorize({ roles })` implies auth** (F19) — *PR #8: missing user + roles → 401; wrong role → 403; new test covers all three*

## Phase 3 — Sign-up flow integrity

- [ ] **3.1 Transactional sign-up + non-fatal email** (F9, F24-part)
  Wrap user + token inserts in `db.transaction()`; move the Postmark send after commit; on email failure, log and flash "we couldn't send your validation email" instead of 500ing. Use `.executeTakeFirstOrThrow()` instead of the `const [user] =` destructure.

- [ ] **3.2 Validate before touching form data** (F15)
  `sign-up-routes.ts:65-87`: check validation errors first; only then normalize email/username and run the duplicate-check query, using the parsed `result.data`. Fix `validateFormData`'s return typing (no `as T` on failure). Add the malformed-POST test (currently 500s).

- [ ] **3.3 Resend-validation endpoint** (F9)
  Small route: accepts an email, if a matching `pending` user exists, issues a fresh token (new entropy per 2.5) and re-sends; neutral response either way. Unblocks accounts stranded by past sign-up failures.

- [ ] **3.4 Stop echoing passwords into HTML** (F17)
  Strip `password`/`confirmPassword` from props before re-rendering both forms.

- [ ] **3.5 Stop logging secrets; add pino `redact`** (F25) — *partially done: PR #3 removed raw tokens from the validate-account logs. Remaining: the email payload in `email-api.ts` debug log, and the `redact` config*

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

- [x] **7.1** `/validate-account` integration (non-aligned ids, reuse, expiry, wrong uid) — *done, PR #3: `server/routes/sign-up-routes.test.ts`, 5 tests against the real dev DB with full cleanup*
- [ ] **7.2** Sign-up POST (duplicates incl. normalize-email aliases, malformed payloads, failure-after-insert)
- [ ] **7.3** Sign-in + auth round-trip (statuses, garbage/rotated-secret cookie, JWT expiry)
- [ ] **7.4** Flash/session lifecycle (add→render→clear, expiry, redirect race, first-visit parallel requests)
- [ ] **7.5** Error middleware branching (HTMX vs full-page, 401 redirect both ways, dev-only stack)

---

**Suggested first sitting:** 1.1 → 1.5 in order — after that the app is honestly runnable from a clean clone, account validation actually works, bad cookies don't 500, and banned/pending users can't sign in. Phases 2–3 are the security core; 4–7 can proceed in any order or in parallel.
