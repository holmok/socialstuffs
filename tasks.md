# socialstuffs — Prioritized Task List

Companion to [audit.md](audit.md) — F-numbers reference findings there. Phases are ordered by dependency and severity; tasks within a phase are independent unless noted. Each task is scoped to roughly one sitting.

**Status (2026-08-07):**
- **Phase 1 complete** (merged): PR [#1](https://github.com/holmok/socialstuffs/pull/1) deps, [#2](https://github.com/holmok/socialstuffs/pull/2) auth hardening, [#3](https://github.com/holmok/socialstuffs/pull/3) validate-account, [#4](https://github.com/holmok/socialstuffs/pull/4) lint baseline. PR #4 also completed 2.2; PR #3 completed 7.1 and the validate-account part of 3.5.
- **Phase 1 follow-ups complete** (merged): PR [#5](https://github.com/holmok/socialstuffs/pull/5) — 1.6, 1.7, 1.8.
- **Phase 2 complete** (merged): PR [#6](https://github.com/holmok/socialstuffs/pull/6) JWT expiry + secure cookies (2.1), [#7](https://github.com/holmok/socialstuffs/pull/7) token entropy (2.5), [#8](https://github.com/holmok/socialstuffs/pull/8) sign-out POST + authorize (2.7, 2.8), [#9](https://github.com/holmok/socialstuffs/pull/9) middleware pipeline + secure headers + CSRF (2.3, 2.4), [#10](https://github.com/holmok/socialstuffs/pull/10) rate limiting + timing-oracle fix (2.6); docs [#11](https://github.com/holmok/socialstuffs/pull/11).
- **Phase 3 complete** (merged): PR [#12](https://github.com/holmok/socialstuffs/pull/12) rate-limit test fix, [#13](https://github.com/holmok/socialstuffs/pull/13) password echo (3.4), [#14](https://github.com/holmok/socialstuffs/pull/14) log redaction (3.5), [#15](https://github.com/holmok/socialstuffs/pull/15) sign-up integrity (3.1, 3.2, 3.3); docs [#16](https://github.com/holmok/socialstuffs/pull/16).
- **Phase 4 open for review** (not yet merged): PR [#17](https://github.com/holmok/socialstuffs/pull/17) form PE + feedback + a11y (4.1, 4.2, 4.4), [#18](https://github.com/holmok/socialstuffs/pull/18) preserve forms on error (4.3), [#19](https://github.com/holmok/socialstuffs/pull/19) password recovery (4.5). This docs PR should merge alongside/after them.

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

- [x] **3.1 Transactional sign-up + non-fatal email** (F9, F24-part) — *PR #15: user+token inserts in one `db.transaction()` with `.executeTakeFirstOrThrow()`; email send moved after commit and made non-fatal (logs + `info` flash, still redirects); DB failure still 500s the form*

- [x] **3.2 Validate before touching form data** (F15) — *PR #15: schema errors checked before any normalize/query; `validateFormData` now returns a discriminated union (no `as T`); malformed-POST test added (500s on main)*

- [x] **3.3 Resend-validation endpoint** (F9) — *PR #15: rate-limited (5/hr) `GET`/`POST /resend-validation`; issues a fresh 32-char token for `pending` users; identical neutral response across match/unknown/active (residual timing side-channel documented in a code comment); linked from the validation-failure page*

- [x] **3.4 Stop echoing passwords into HTML** (F17) — *PR #13: password/confirm-password `value` bindings removed from both form components; test asserts the password is absent from rendered HTML*

- [x] **3.5 Stop logging secrets; add pino `redact`** (F25) — *PR #3 removed raw tokens from validate-account logs; PR #14 dropped the email payload from the debug log and added a pino `redact` config (headers, password/token/hash at depth; a function censor masks the token in `req.url` while keeping the route)*

**Also merged during Phase 3:** PR #12 fixed the rate-limit test that #9's `csrf()` broke once #10's origin-less-POST test landed on main (a merge interaction, not a regression in either PR).

## Phase 4 — Frontend resilience & accessibility

- [x] **4.1 Form fallbacks + autocomplete** (F10, F31-part) — *PR #17: native `action`/`method` alongside `hx-post` on all three forms (no-JS submit no longer leaks the password to a URL); `autocomplete` prop on `TextInput` set per field (current-password / new-password / email / username)*

- [x] **4.2 Request feedback: indicators, double-submit, network errors** (F30) — *PR #17: `hx-disabled-elt="find button"` + `hx-indicator` with a `.form-indicator` "Working…" span and disabled-button style; `flash.js` listens for `htmx:sendError`/`htmx:timeout` and surfaces a dismissible flash-style error*

- [x] **4.3 Preserve forms on server errors** (F16) — *PR #18: HTMX error responses send `HX-Reswap: none` + an out-of-band flash fragment (targets `main`, since `.flash` may not exist), so the form and its input survive; non-HTMX full-page errors and the 401 redirect unchanged*

- [x] **4.4 A11y pass on forms and nav** (F31) — *PR #17: `aria-invalid` + `aria-describedby` tying inputs to their errors `<ul>` id; `role="alert"` on form-errors; nav toggle `aria-label="Menu"` with the glyph `aria-hidden`; placeholder contrast raised to AA (2.03:1 → 4.75:1, 2.12:1 → 4.90:1)*

- [x] **4.5 Resolve `/recover-password`** (F14) — *PR #19: full password-recovery flow (request + reset), 32-char tokens, 48h expiry enforced at both GET and POST, atomic single-use claim with uid binding, rate-limited, neutral responses; the dead sign-in link now resolves. Two review passes — the first caught expiry-at-POST and uid-binding defects*

**Phase 4 follow-up (trivial):** the password-reset form's fields could take `autocomplete="new-password"` now that #17 added the prop to `TextInput` — deferred to avoid cross-PR conflict.

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
