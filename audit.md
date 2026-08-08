# socialstuffs — Code Audit

**Date:** 2026-08-07
**Scope:** Full review of `server/`, `templates/`, `static/`, and project config by five parallel review passes: security, performance, library best practices (Hono / Kysely / Zod 4 / HTMX / pino / Bun), architecture & correctness, and frontend/accessibility. Every finding cites file and line; the two most severe claims (F1, F2) were independently re-verified against the source.

**Overall shape:** The architecture is clean and idiomatic in its bones — typed `ContextVariableMap`, small single-purpose middleware, parameterized Kysely everywhere (no SQL injection surface), auto-escaping JSX (no XSS found), `Bun.password` bcrypt, signed cookies, correct `HX-Redirect`/303 handling. The problems cluster in four places: **the account-validation flow is actually broken**, **auth sessions are effectively permanent and status is never enforced**, **the flash/session layer has races and runs where it shouldn't**, and **a set of one-line hardening wins (secure cookies, secureHeaders, csrf, jwt try/catch) were never applied**.

**Resolution status (updated 2026-08-07):**
- **P0 — all fixed and merged:** F1 (PR [#3](https://github.com/holmok/socialstuffs/pull/3)), F2 (PR [#1](https://github.com/holmok/socialstuffs/pull/1)), F3 + F4 (PR [#2](https://github.com/holmok/socialstuffs/pull/2)).
- **P1 — all fixed:** F11, F32 (PR [#4](https://github.com/holmok/socialstuffs/pull/4)); F5 + F6 ([#6](https://github.com/holmok/socialstuffs/pull/6)), F8 ([#7](https://github.com/holmok/socialstuffs/pull/7)), F12 + F13 ([#9](https://github.com/holmok/socialstuffs/pull/9)), F7 + F20 ([#10](https://github.com/holmok/socialstuffs/pull/10)) — all merged.
- **P2/P3 — fixed:** F18 + F19 (PR [#8](https://github.com/holmok/socialstuffs/pull/8)); F9 + F15 (+ F24 client/template caching still open) via [#15](https://github.com/holmok/socialstuffs/pull/15); F17 ([#13](https://github.com/holmok/socialstuffs/pull/13)); F25 ([#3](https://github.com/holmok/socialstuffs/pull/3) + [#14](https://github.com/holmok/socialstuffs/pull/14)); F28 partial (`claimed` fixed on both token tables via #3 + #5; `lastLogin`/`imageUrl` remain).
- Phase 1 follow-ups (PR [#5](https://github.com/holmok/socialstuffs/pull/5)): local `typescript` dep, password-recovery `claimed` type, `NODE_ENV=test` support.
- **Phase 4 — fixed:** F10 + F30 + F31 (PR [#17](https://github.com/holmok/socialstuffs/pull/17)), F16 (PR [#18](https://github.com/holmok/socialstuffs/pull/18)), F14 (PR [#19](https://github.com/holmok/socialstuffs/pull/19)).
- **Phase 5 — fixed:** F21 + F24 (PR [#23](https://github.com/holmok/socialstuffs/pull/23) flash, [#21](https://github.com/holmok/socialstuffs/pull/21) email), F22 + F33 + F26-part (PR [#22](https://github.com/holmok/socialstuffs/pull/22)), F23 (PR [#24](https://github.com/holmok/socialstuffs/pull/24)).
- **Phase 6 — fixed:** F26-rest + F27 + F36-part (PR [#29](https://github.com/holmok/socialstuffs/pull/29)), F28-rest + F36-part (PR [#26](https://github.com/holmok/socialstuffs/pull/26)), F29 (PR [#28](https://github.com/holmok/socialstuffs/pull/28)), F34 (PR [#27](https://github.com/holmok/socialstuffs/pull/27), light touch).
- **Remaining:** Phase 7 (tests). Small deferred follow-ups (all noted in [tasks.md](tasks.md)): stricter tsconfig flags (`verbatimModuleSyntax`/`noUncheckedIndexedAccess`), Kysely `log` hook, `posts.uid` convention. The dead-code sweep deliberately kept `baseImageUrl` (forward-looking) and `auth.getUser` (legitimate API).

See [tasks.md](tasks.md) for the live checklist.

**Priority scale:**
- **P0 — Broken or exploitable now.** Fix before anything else.
- **P1 — High.** Security posture or data-integrity gaps that will bite as soon as real users arrive.
- **P2 — Medium.** Correctness edge cases, performance drags, UX/accessibility gaps.
- **P3 — Low.** Idiom, hygiene, dead code, docs drift.

---

## P0 — Broken or exploitable now

### F1. Account validation is broken by column shadowing in a `selectAll()` join
`server/routes/sign-up-routes.ts:143-193` — ✅ **Fixed** (PR #3): explicit columns, 48h expiry, atomic transactional claim by token, regression test added.

The `/validate-account/:token/:uid` handler joins `users` to `accountValidationTokens` and calls `.selectAll()` (i.e. `SELECT *`). Both tables have an `id`, `created`, and overlapping timestamps; node-postgres builds row objects by field name, so **the token table's columns overwrite the user's** — `user.id` is actually the token row's id.

Consequences, verified in the code:
- Line 170 compares `isTokenClaimed.userId !== user?.id`, i.e. the real user id vs the *token's row id*. These only match while the two sequences happen to align (fresh dev databases), which is why it appears to work. Once ids diverge, every legitimate validation link renders the failure page.
- Line 186 `updateTable('users').where('id', '=', user?.id)` activates whatever user happens to have the token's row id — potentially the wrong user, or none.

Additional problems in the same handler:
- The claim UPDATE (line 192) filters `where('userId', '=', ...)` instead of `where('token', '=', token)` — it claims **all** of the user's tokens, not the presented one.
- The claimed-check (151-155) and the claim-write (189-193) are a non-atomic check-then-update: concurrent requests can both pass.
- Tokens **never expire** — the failure page says "invalid or has expired" (line 177) but no expiry check against `created` exists. Old inbox links are live forever.
- The two UPDATEs are not in a transaction — partial failure can activate a user while leaving the token claimable, or vice versa.
- Redundant queries: two overlapping SELECTs (one pulling every column including `passwordHash` across the wire) where one suffices.

**Fix:** Query the token first (`select(['id','userId','claimed','created'])` by token), check expiry, then claim atomically and activate inside one transaction:

```ts
await db.transaction().execute(async (trx) => {
  const claimed = await trx.updateTable('accountValidationTokens')
    .set({ claimed: new Date() })
    .where('token', '=', token)
    .where('claimed', 'is', null)
    .returning('userId')
    .executeTakeFirst()
  if (!claimed) return invalid()
  await trx.updateTable('users').set({ status: 'active' })
    .where('id', '=', claimed.userId).where('uid', '=', uid).execute()
})
```

Never `selectAll()` across a join — alias explicitly.

### F2. Undeclared dependencies — a fresh clone does not run
`server/middleware/session-middleware.ts:1`, `package.json`, `bun.lock` — ✅ **Fixed** (PR #1): `date-fns` dropped for plain Date math; `@types/jsonwebtoken` + `@types/pg` declared. Follow-up: `typescript` itself is still not a devDependency (tasks.md 1.6).

`date-fns` is imported but appears in neither `package.json` nor `bun.lock` (verified: zero matches in the lockfile; it only exists loose in `node_modules`). `@types/jsonwebtoken` and `@types/pg` are likewise unmanifested. A fresh clone + `bun install` fails at runtime on the `date-fns` import, and `tsc --noEmit` fails on the missing type packages.

**Fix:** `bun add date-fns && bun add -d @types/jsonwebtoken @types/pg` — or drop `date-fns` entirely; its single use (`addDays(new Date(), 1)` for kv expiry) is one line of plain Date math.

### F3. Unguarded `jwt.verify` bricks the site for affected users
`server/middleware/auth-middleware.ts:36` — ✅ **Fixed** (PR #2): try/catch, HS256 pinned, cookie cleared, continues unauthenticated.

`jwt.verify(token, secret)` runs on every request with no try/catch. The signed-cookie HMAC only proves client-side integrity; verify still throws if `JWT_SECRET` is rotated, the payload is malformed, or an `exp` claim is ever added and lapses. The throw recurs on **every request** from that browser → persistent 500s until the user manually clears cookies. Rotating `JWT_SECRET` (a normal incident response) would brick every logged-in user. Worse, because `authenticate()` runs before `layoutContext()` (`server/server.ts:37-40`), the error renders through Hono's default renderer as a bare unstyled fragment. The result is also cast `as UserContext` with no shape validation.

**Fix:** Wrap in try/catch; on failure clear the cookie and continue as signed-out. Pass `{ algorithms: ['HS256'] }`. Optionally validate claims with a small Zod schema instead of the cast.

### F4. Sign-in never checks `user.status` — email validation gates nothing
`server/routes/sign-in-routes.ts:37-56` — ✅ **Fixed** (PR #2): sign-in admits only `active`; `authorize()` 401s non-active. Note: JWT status is a sign-in-time snapshot until F5 (JWT expiry) lands.

After password verification, `user.status` (`pending | active | deleted | inactive`) is copied into the JWT (line 55) and **never checked anywhere** — not at sign-in, not in `authorize()`. A `pending` (unvalidated) user signs in normally, so the entire validation-token flow is decorative. `deleted`/`inactive` (banned) users also sign in normally.

**Fix:** After password verification, reject unless `status === 'active'` — distinct "please validate your email" message for `pending`, generic invalid-sign-in for `deleted`/`inactive`. Have `authorize()` also check status (see F5 for why claims alone can't be trusted).

### F5. Auth JWT never expires and cannot be revoked — ✅ Fixed (PR #6): 7-day expiry + matching cookie maxAge
`server/middleware/auth-middleware.ts:40-44, 51-57`

`jwt.sign(userContext, secret)` sets no `expiresIn`; the cookie has no `maxAge`. `signOut()` only clears the browser cookie — the JWT stays valid forever and nothing server-side can invalidate it. Routes build `c.var.auth.user` purely from JWT claims (line 36) and never re-check the DB (`getUser()` exists but is never called). Combined with F4: a stolen cookie is permanent access; banning or demoting a user does nothing to their existing sessions; a user demoted from `admin` keeps the `role: 'admin'` claim indefinitely.

**Fix:** `jwt.sign(claims, secret, { expiresIn: '7d', algorithm: 'HS256' })` plus matching cookie `maxAge`. For authorization decisions on status/role, either re-load from DB or keep the JWT short-lived (hours) and refresh it.

### F6. Cookies missing the `Secure` flag — ✅ Fixed (PR #6): `secure: config.mode.isProd` on all cookie sites
`server/middleware/auth-middleware.ts:41-44, 52-56`, `server/middleware/session-middleware.ts:21-24`

All three `setSignedCookie` calls set `httpOnly: true, sameSite: 'strict'` but never `secure: true`. Production runs behind an ngrok HTTPS tunnel while the origin itself is plain HTTP, so browsers will send the auth and session cookies over any `http://` request to the host — session disclosure to any network attacker.

**Fix:** `secure: config.mode.isProd` on all three call sites (auth set, auth clear, session). Consider the `__Host-` cookie-name prefix, which Hono enforces (secure + path=/).

---

## P1 — High

### F7. No rate limiting or brute-force protection anywhere — ✅ Fixed (PR #10): in-memory per-IP fixed-window limiter on auth endpoints
`server/server.ts:33-46` (verified: no rate-limit middleware exists in the codebase)

`/sign-in`, `/sign-up`, and `/validate-account/:token/:uid` are unthrottled. Consequences: unlimited credential stuffing (bcrypt cost 10 ≈ 100 ms/attempt, trivially parallelized); unlimited outbound Postmark email via sign-up (email bombing, real cost); unthrottled token guessing — which matters directly because of F8.

**Fix:** Per-IP + per-account rate limiting on auth endpoints (`hono-rate-limiter`, or a kvStorage-backed counter since that plumbing exists), plus failed-login backoff.

### F8. Security tokens have ~47 bits of entropy, with modulo bias — ✅ Fixed (PR #7): 32-char (~190-bit) session ids and validation tokens
`server/routes/sign-up-routes.ts:12,100,110`, `server/middleware/session-middleware.ts:13,20`

`new Uniquey()` defaults to length 8 over a 62-char alphabet ≈ 47.6 bits, and its byte-mapping uses `x % 62`, so 8 characters are ~1.5× more likely than the rest — effective entropy is lower still. This generates account-validation tokens, user `uid`s, and session ids. OWASP recommends ≥128 bits for security tokens/session ids. Session ids are HMAC-signed in the cookie (forgery requires `COOKIE_SECRET`), which mitigates but shouldn't be the only barrier; validation tokens have no such second factor and (per F1) never expire — with no rate limiting (F7), online guessing is plausible defense-in-depth failure.

**Fix:** `new Uniquey({ length: 32 })` for tokens and session ids — or `crypto.randomBytes(32).toString('base64url')`. **Do this before building password recovery on the same primitives.**

### F9. Sign-up's multi-step write is not transactional and has no recovery path — ✅ Fixed (PR #15): transactional inserts, non-fatal email, and a resend-validation endpoint
`server/routes/sign-up-routes.ts:97-127`

User insert, token insert, and Postmark send run sequentially with no transaction. If the token insert or email send fails after the user insert, the catch shows "unexpected error" — but the user row exists. Retrying yields "Email is already in use," and there is no resend-validation route: the account is permanently stuck in `pending` (currently masked only by F4 letting pending users sign in). The sign-up response also blocks on the full Postmark round trip (commonly 200-800 ms) on top of bcrypt.

**Fix:** Wrap both inserts in `db.transaction()`. Send the email after commit and treat email failure as non-fatal (log + flash directing the user to a resend path). Add a resend-validation endpoint.

### F10. Auth forms have no non-JS fallback — a failed htmx load leaks passwords into URLs — ✅ Fixed (PR #17): native action/method fallback on all forms
`templates/components/sign-in-form.tsx:11`, `templates/components/sign-up-form.tsx:14`

Both forms have only `hx-post` — no `action`/`method`. If htmx fails to load (blocked script, flaky network, JS off), the browser falls back to **GET to the current URL**, putting `password=...` into the query string — browser history, server logs, Axiom. The server already handles non-HTMX POSTs correctly (`utils.redirect` branches on `HX-Request`), so only the markup is missing.

**Fix:** Add `action="/sign-in" method="post"` (resp. `/sign-up`) alongside the `hx-post` attributes.

### F11. `flash.addFlash(...)` is fire-and-forget at all four call sites
`server/routes/sign-in-routes.ts:60`, `server/routes/sign-up-routes.ts:129`, `server/routes/user-routes.ts:21`, `server/middleware/error-middleware.ts:35` — ✅ **Fixed** (PR #4): all four awaited; `errorHandler` made async. Caveat: Biome's `noFloatingPromises` cannot see through `c.var` typing, so it won't catch a recurrence of this class.

Flagged independently by three review passes. `addFlash` performs a kv read + upsert (two sequential queries), but every caller drops the promise. The redirect response goes out immediately; the browser's follow-up GET calls `getFlashes()` and can race ahead of the uncommitted write — the flash silently vanishes (the classic intermittent "my message didn't show" bug). A DB error inside becomes an unhandled rejection with no request context. The error-middleware case fires on every 401.

**Fix:** `await` all four calls (handlers are already async). Consider enabling Biome's `noFloatingPromises` rule, which would have caught this.

### F12. The full middleware chain runs on every static asset request — including a session-cookie race — ✅ Fixed (PR #9): static served before the auth/session chain
`server/server.ts:33-46`, `server/middleware/session-middleware.ts:19-25`

`serveStatic` is registered last, so a request for `/js/htmx.min.js` or a favicon still executes: signed-cookie HMAC verify + `jwt.verify` (auth), a second HMAC verify plus possible signed Set-Cookie (session), flash/layout setup, and a hono-pino log line. A first page view fans out to ~7 asset requests, each paying 2-3 WebCrypto HMAC ops for nothing.

The sharper edge: on a first visit, the parallel cookie-less asset requests **each mint a different session id** — last Set-Cookie wins, so the session id the page's flash was stored under can be clobbered by a favicon response. This is a correctness bug, not just overhead.

**Fix:** Register static serving (with `staticCache`) *before* the auth/session/flash/layout middleware, or scope those middleware away from `/js/*`, favicon, and manifest paths. This fixes the race and the waste in one move.

### F13. No `secureHeaders()` and no `csrf()` middleware — ✅ Fixed (PR #9): both registered with a real CSP
`server/server.ts:26-50`

No CSP, `X-Frame-Options`/`frame-ancestors`, `X-Content-Type-Options`, `Referrer-Policy`, or HSTS on any response; pages are framable (clickjacking on the HTMX forms). CSRF protection is solely `SameSite=Strict` — acceptable for today's pre-auth POSTs, but the moment post/comment/favorite routes land, the app's entire CSRF posture is one cookie attribute. Hono ships both fixes: `secureHeaders()` and `csrf()` (Origin + Sec-Fetch-Site validation, zero config).

**Fix:** `app.use(secureHeaders({...}))` and `app.use(csrf())` before routes. A strict CSP is feasible since all JS is same-origin files; only the inline `<style>` needs `style-src 'unsafe-inline'` or a nonce.

### F14. `/recover-password` is linked but does not exist — ✅ Fixed (PR #19): full password-recovery flow implemented
`templates/components/sign-in-form.tsx:45`

The sign-in form advertises password recovery; no route serves it (only the `passwordRecoveryTokens` table type and email template exist). Every user who forgets their password hits the 404 page.

**Fix:** Remove the link until the flow ships, or implement it. **When implementing, do not copy the validate-account flow** — apply F1/F8's lessons: ≥32-char token, expiry, atomic single-use claim, neutral "if that email exists we sent a link" response, rate limiting.

---

## P2 — Medium

### Correctness

### F15. Crafted sign-up POST yields a 500; `validateFormData` lies about its types — ✅ Fixed (PR #15): validate-first + discriminated-union return type
`server/routes/sign-up-routes.ts:65-66`, `server/utils.ts:77-93`

`normalizeEmail(data.email)` and `data.username.toLowerCase()` run before the validation-error check, on the **raw** form data cast `as SignUpData` (utils.ts:90 returns unvalidated input as `T`). A POST missing `email` or `username` (curl, broken client) throws `TypeError` → 500 error page instead of the form with errors. The duplicate-user DB query (lines 69-73) also runs even when field validation already failed. Related: `err.path[0]` is `undefined` for root-level Zod refine issues, producing an unreadable `"undefined"` error key (latent — current schemas always set `path`).

**Fix:** Check `errors` first; only normalize and query on parse success, using `result.data` rather than the cast. Have `validateFormData` return the raw input typed honestly (`Partial<...>`), or replace the whole dance with `@hono/zod-validator` (see F27).

### F16. HTMX error responses destroy the form and the user's input — ✅ Fixed (PR #18): HX-Reswap:none + out-of-band flash
`server/middleware/error-middleware.ts:12-13`, `templates/layouts/main-layout.tsx:28`

The `htmx-config` meta makes all non-204 statuses swap, and forms use `hx-target="this" hx-swap="outerHTML"` — so any error reaching the global handler (middleware throw, body-parse failure, stale endpoint 404) replaces the entire form with a one-line `ErrorFragment` dead end, losing everything the user typed. (The sign-up route's own catch does this right — it re-renders the form; only the global path is wrong.)

**Fix:** Have the error handler send `HX-Reswap: none` and deliver the error as an out-of-band flash, or standardize on re-rendering the form.

### F17. Submitted passwords are echoed back into response HTML — ✅ Fixed (PR #13): password `value` bindings removed from both forms
`templates/components/sign-in-form.tsx:35`, `templates/components/sign-up-form.tsx:56,66`, via `text-input.tsx:37`

On validation failure the forms re-render with `value={props.password}` — cleartext password in the response body (DOM, history, proxies; the response is also compressed and carries no `Cache-Control: no-store`).

**Fix:** Strip `password`/`confirmPassword` before re-rendering; the user retypes.

### F18. Sign-out is a state-changing GET — ✅ Fixed (PR #8): now POST via a nav form
`server/routes/user-routes.ts:18-23`, `templates/components/navigation.tsx:31`

Prefetchers and link scanners can sign users out; `csrf()` can't protect GET. It also calls `c.redirect` directly instead of `utils.redirect`, so an HTMX-triggered call wouldn't redirect properly.

**Fix:** POST route + a small form (or `hx-post` button) styled as a nav link; use `utils.redirect`.

### F19. `authorize({ roles })` without `requireAuth` silently admits anonymous users — ✅ Fixed (PR #8): roles now imply authentication
`server/middleware/auth-middleware.ts:73-80`

The role check is `if (opts.roles && user && ...)` — with no user, it falls through to `next()`. Not exploitable today (the sole usage sets `requireAuth: true`), but the first `authorize({ roles: ['admin'] })` someone writes is an open admin route.

**Fix:** `roles` implies authentication: missing user → 401, wrong role → 403.

### F20. User enumeration via sign-up oracle and sign-in timing — ⚠️ Partially fixed (PR #10): sign-in timing oracle closed with a dummy bcrypt verify; sign-up email oracle remains (mitigated by rate limiting)
`server/routes/sign-up-routes.ts:77-84`, `server/routes/sign-in-routes.ts:37-49`

Sign-up returns "Email is already in use" with no rate limit in front of it — a registration oracle. Sign-in's message is correctly identical for both failure cases, but it skips the ~100 ms bcrypt verify when the user doesn't exist — a measurable timing oracle.

**Fix:** Rate-limit sign-up (F7 covers most of the risk); verify against a static dummy bcrypt hash when the user is missing on sign-in.

### Performance

### F21. Every full-page render costs 2 DB round trips for flash messages — even static pages — ✅ Fixed (PR #23): single-query pop + zero-DB fast path for new sessions
`server/middleware/layout-middleware.tsx:17`, `server/middleware/flash-middleware.ts:21-26`, `server/middleware/session-middleware.ts:28-59`

The layout renderer calls `getFlashes()` on every full-page render: a SELECT on `kvStorage` plus an **unconditional DELETE** (even when the SELECT returned nothing). The marketing pages (`/`, `/about`, `/terms`…), which need zero DB access, do 2 queries per hit — the app's dominant query source.

**Fix:** Collapse to one atomic pop: `deleteFrom('kvStorage').where('key','=',k).where('expires','>',new Date()).returning('value')`. Better: skip the DB entirely when the request arrived without a session cookie (a brand-new session cannot have flashes) — combined with F12 this makes anonymous static-page hits DB-free.

### F22. `kvStorage` grows without bound — ✅ Fixed (PR #22): hourly expiry sweep
`server/middleware/session-middleware.ts:30-36,43`

Expired rows are deleted only if that exact key is read again. Every abandoned session (crawlers, bounced visitors) leaves rows forever — and this is the table the hottest query path (F21) hits.

**Fix:** Periodic sweep — `DELETE FROM kv_storage WHERE expires < now()` on a `setInterval` at startup (fine at this scale). Confirm `key` has a unique index (the upsert requires it).

### F23. Static assets: gzip-on-the-fly per request, no ETag, unversioned 30-day cache — ✅ Fixed (PR #24): versioned+immutable htmx, ETag revalidation, moderate TTL for unversioned
`server/server.ts:41,45-46`, `server/middleware/static-cache-middleware.ts:4-14`

`compress()` wraps `serveStatic`, so the 51 KB `htmx.min.js` runs through `CompressionStream` on every request. Hono's `serveStatic` sets no ETag/Last-Modified, so no 304s ever happen (the 304 branch in static-cache-middleware is dead code). Cache-Control is `public, max-age=2592000` — 30 days, no `immutable`, unversioned filenames, so a patched htmx won't reach returning users for up to a month. (CLAUDE.md says 1 hour; the code says 30 days — see F35.)

**Fix:** Commit `.gz`/`.br` siblings and use `serveStatic({ root: './static', precompressed: true })` (supported by this Hono version); add `hono/etag` ahead of it; either version the filenames + `immutable`, or drop the TTL to something honest.

### F24. Email sending: client and template re-created per send; response blocks on Postmark — ✅ Fixed (PR #15 moved the send after commit + non-fatal; PR #21 constructs the client once and caches templates)
`server/api/email-api.ts:42,47`, `server/routes/sign-up-routes.ts:119`

`sendEmail` constructs a new `Postmark.ServerClient` and re-reads the template file from disk on every call. Sign-up latency = bcrypt + 2 inserts + a cross-internet Postmark round trip; a Postmark outage turns sign-ups into 500s after the user row committed (F9).

**Fix:** Construct the client once in the `EmailAPI` constructor; cache template text in the existing `templates` map. Send after responding, or treat failure as non-fatal per F9.

### F25. Secrets and PII flow into logs (shipped to Axiom in prod); no `redact` configured — ✅ Fixed (PR #3 removed validate-account token logs; PR #14 dropped the email payload and added a pino `redact` config with a route-preserving `url` censor)
`server/routes/sign-up-routes.ts:160-171`, `server/routes/sign-in-routes.ts:40`, `server/api/email-api.ts:40`, `server/config.ts:49-73`

The `/validate-account` failure paths log the raw token at `warn` — the line-160 path fires while the token is still **valid and unclaimed**, so live secrets land in logs. Sign-in failures log the attempted email. `email-api.ts:40` debug-logs the full email payload including the validation URL. Neither pino config sets `redact`.

**Fix:** Log token hashes/last-4 only; drop the email `data` payload from the debug log; add `redact: { paths: ['req.headers.cookie', '*.password', '*.token', '*.url'], censor: '[redacted]' }` (tune paths).

### F26. pino wiring: dev multistream is dead code; prod multistream can drop debug; `c.var.logger` type is wrong — ✅ Fixed (PR #22 prod async stdout; PR #29 removed the dead dev multistream, gave prod streams explicit levels, and retyped `c.var.logger` to `PinoLogger`)
`server/index.ts:8-21`, `server/server.ts:19`, `server/middleware/logger-middleware.ts:5-9`

Three distinct issues: (a) in dev, `config.pino` contains `transport: pino-pretty`, and pino silently discards the passed multistream when a transport is set — the dev multistream is dead code. (b) In prod, `pino.multistream` entries default to level `info`, so `LOG_LEVEL=debug` emits nothing at debug; the bare `process.stdout` stream is also synchronous. (c) `ContextVariableMap` declares `logger: pino.Logger` but hono-pino stores its own `PinoLogger` wrapper — no `.child()`, `.level`, etc.; the type system will accept calls that crash at runtime. Also: several handlers use the module-scope startup logger instead of `c.var.logger`, losing request context, and hono-pino logs every static-asset request (noise + Axiom cost — largely solved by F12).

**Fix:** Build the stream in one place (dev: pretty transport only; prod: per-entry explicit `level`, `pino.destination({ sync: false })` for stdout). Type the context as hono-pino's `PinoLogger`. Use `c.var.logger` consistently in handlers.

### Library idioms

### F27. Zod: v3-style transforms produce NaN instead of validation errors; hand-rolled form validation — ✅ Fixed (PR #29): `z.coerce.number()`/`z.url()`/`z.email()`, `message:`→`error:`, `validateFormData` uses `z.flattenError`
`server/config.ts:8-25`, `server/utils.ts:77-93`, `server/routes/sign-up-routes.ts:25,60`

`z.string().default('3000').transform(Number)` for PORT and pool sizes: `Number('abc')` silently yields NaN — no validation. Zod 4's idiom is `z.coerce.number().int().positive().default(3000)`; also `z.url()` for `DATABASE_URL`/`BASE_LINK_URL`, `z.email()` for `FROM_EMAIL`. `validateFormData` hand-reimplements `z.flattenError` and returns an unsound cast (see F15). `z.email({ message: ... })` uses the deprecated v3 param name — v4 renamed it to `error`. `@hono/zod-validator` (`zValidator('form', schema, hook)`) would replace the whole formData→cast→validate dance including the error re-render.

### F28. Kysely: nullable columns typed as non-nullable or `undefined` — ✅ Fixed (PR #3 + #5 `claimed`; PR #26 `lastLogin`/`imageUrl`/`linkUrl`/`linkText` + collapsed the `ColumnType<X,X,X>` triples)
`server/data/account-validation-token-data.ts:7`, `server/data/password-recovery-token-data.ts:7`, `server/data/user-data.ts:21`, `server/data/post-data.ts:11-13`

`claimed` is typed `ColumnType<Date, never, Date>` but is NULL until claimed — the validate-account code relies on its falsiness, contradicting the type. `lastLogin` is non-null `Date` but never written. `imageUrl` selects as `string | undefined`; pg returns `null`. These types will type-check code that breaks at runtime (`claimed.getTime()` on null). Minor consistency notes: `ColumnType<X,X,X>` triples should just be `X`; `posts.uid` is db-generated while `users.uid`/`comments.uid` are app-supplied — pick one convention; `relations.updated`/`postTargets.updated` are never-updateable unlike every other table.

**Fix:** Use `| null` for nullable select types throughout; prefer `.executeTakeFirstOrThrow()` over `const [user] = ...execute()` (sign-up-routes.ts:97). Optionally wire Kysely's `log` option to pino for query/error visibility.

### F29. jsonwebtoken (CommonJS) instead of `hono/jwt`; double-signing — ✅ Fixed (PR #28): migrated to `hono/jwt` (Web-Crypto), dropped `jsonwebtoken` + `@types/jsonwebtoken`
`server/middleware/auth-middleware.ts:5,36,40`

Hono ships a Web-Crypto, zero-dep `hono/jwt` (`sign`/`verify`, async). The current setup also double-signs: JWT signature *inside* an HMAC-signed cookie — one of the layers is redundant. Migrating to `hono/jwt` (or even just a signed cookie holding a JSON payload + expiry) also drops the `@types/jsonwebtoken` dependency from F2. Do this together with F3/F5 since it touches the same lines.

### Frontend / accessibility

### F30. No feedback for failed or in-flight requests — ✅ Fixed (PR #17): hx-indicator, hx-disabled-elt, and a transport-error listener
Repo-wide (verified: zero `htmx:sendError`/`responseError`/`timeout` listeners; zero `hx-indicator`/`hx-disabled-elt`)

Network-level failures (offline, server down) do nothing visible — button stays enabled, no message. Slow submits (bcrypt + Postmark) have no loading state and no double-submit protection; a second click fires another POST.

**Fix:** A global `htmx:sendError` listener (in flash.js, injecting a flash-style error); `hx-disabled-elt="find button"` + `hx-indicator` on both forms with a `.htmx-request` style.

### F31. Form accessibility gaps — ✅ Fixed (PR #17): aria wiring, nav label, AA placeholder contrast
`templates/components/text-input.tsx:26-48`, `templates/components/navigation.tsx:8-10`, `server/styles/css/form-style.ts:37-45`, `server/styles/_colors.ts:6,13`

- Field errors render as a sibling `<ul>` with no `id`; inputs get no `aria-invalid`/`aria-describedby` — screen-reader users can't reach the error text; color is the only error signal (WCAG 1.4.1).
- No `autocomplete` attributes anywhere — sign-in needs `email`/`current-password`, sign-up `new-password` etc. (WCAG 1.3.5; browsers may suggest the current password on sign-up).
- The nav toggle button's only content is `≡` — no accessible name. Add `aria-label="Menu"`.
- Focus is lost after error re-render (`outerHTML` swap removes the focused element); the form-errors container should be `role="alert"` and/or focus the first errored input after swap.
- Measured contrast failures: placeholder `#66758a` on `#3d4656` = **2.03:1**; error placeholder = 2.12:1 (AA needs 4.5:1). All other measured pairs pass AA.

### F32. Biome check currently fails (8 errors)
Repo-wide — ✅ **Fixed** (PR #4): `biome check .` exits clean; email templates parse via `html.parser.interpolation`; dead `user` prop removed.

One real lint hit (`main-layout.tsx:19` — `user` prop destructured, never used), formatting drift in three files, and Biome's HTML parser tripping on `{{url}}` in `templates/email/*.html` (exclude that dir or enable `html.parser.interpolation`). Consider enabling type-aware `noFloatingPromises` — it would have caught F11 mechanically.

---

## P3 — Low

- **F33. Pool and shutdown hardening** — `poolConfig` has no `connectionTimeoutMillis` (saturated pool = requests queue forever; add ~5000) or explicit `idleTimeoutMillis` (`server/config.ts:43-47`). `shutdown` calls `server.stop()` with no deadline — a lingering keep-alive stalls SIGTERM until SIGKILL, skipping `db.destroy()`; race it against a ~10 s force-stop (`server/utils.ts:26-52`). `assertPortFree` is a racy TOCTOU dial-out that leaks the socket on error and duplicates `Bun.serve`'s own EADDRINUSE throw — drop it (`server/utils.ts:54-75`).
- **F34. tsconfig baseline** — ✅ Fixed (PR #27, light touch: explicit `module`/`moduleResolution`/`target`/`lib`/`noEmit`; the rippling `verbatimModuleSyntax`/`noUncheckedIndexedAccess` deferred). Original finding: only paths/strict/jsx are set; tsc runs with legacy CommonJS/node10 defaults and only works because Hono ships fallback types. Adopt Bun's baseline: `"module": "Preserve"`, `"moduleResolution": "bundler"`, `"target": "ESNext"`, `"noEmit": true`, `"verbatimModuleSyntax": true`; consider `noUncheckedIndexedAccess` (`tsconfig.json`).
- **F35. CLAUDE.md drift** — says static cache is 1 hour (code: 30 days); middleware list omits session/flash/layout; the flash system is undocumented.
- **F36. Dead code** — ✅ Mostly fixed (PR #26 deleted `card.tsx` + the `cachedQueries` type; PR #29 renamed `APP_NAME`; `Layout.user` removed back in #4). Deliberately kept: `baseImageUrl` (forward-looking, matches the schema's image columns) and `auth.getUser` (legitimate documented API); `passwordRecoveryTokens` is live (#19). Original finding: `templates/components/card.tsx` (unused; signature is wrong anyway — takes `txt: string`, not props), `cachedQueries` table type (zero usage; either delete or implement deliberately — for hot small values an in-process Map beats a DB round trip on a single-instance app), `auth.getUser` (never called — though F4/F5's fix may start using it), `config.baseImageUrl`, `passwordRecoveryTokens` + its email template (pairs with F14), `APP_NAME = 'bun-hono-htmx'` boilerplate name leaking into every log line, `Layout`'s unused `user` prop.
- **F37. Misc hardening/hygiene** — authenticated pages carry no `Cache-Control: no-store` (staticCache only touches static fallthrough); session id never rotated at sign-in (hygiene; no privilege attaches to it today); `getStyle`'s cache key is order-sensitive (`slice().sort().join('-')`); `renderCSS` appends `px` to any bare number (`fontWeight: 700` → `700px` — currently dodged by quoting everything); email template substitution uses `String.replace` with `$`-pattern and no HTML-escaping (safe with today's regex-restricted inputs; use a replacer function before templating freeform fields); Hono route groups use the Express-style mutate-the-root-app pattern rather than `app.route('/user', subApp)` (works; the Hono idiom composes/tests better); vendored htmx 2.0.10 is behind the 2.0.x patch line; public pages lack `og:`/twitter meta; `templates/pages/user.tsx` has no `<h1>` (placeholder); `nav.js` captures element refs once at load (fine until the header ever becomes a swap target — flash.js's document-delegation is the swap-proof model).

---

## What's already good

Worth keeping and not churning:

- **No SQL injection surface** — zero raw SQL; everything through Kysely's parameterized builder; schema name from config, never requests.
- **No XSS found** — Hono JSX auto-escapes; the only `dangerouslySetInnerHTML` is the compile-time CSS string; flash content is server-authored; client JS does no `innerHTML`.
- **Password handling** — `Bun.password` bcrypt cost 10, async (off the event loop); strong Zod password policy; identical sign-in failure messages.
- **Cookie integrity** — HMAC-signed cookies everywhere, `httpOnly` + `SameSite=Strict`; tampered cookies never reach `jwt.verify`.
- **Architecture** — typed `ContextVariableMap` (the documented Hono pattern), small single-purpose middleware, per-file route groups, `utils.redirect`'s HX-Redirect/303 + the 204 `swap:false` config is exactly the documented HTMX pattern, `hx-target="this"`/`outerHTML` form re-render is the canonical inline-validation shape.
- **Auth middleware does no DB work per request** — claims come from the cookie; `getUser()` is lazy.
- **Ops** — Axiom shipping runs in a worker thread off the request path; `.env` is gitignored and absent from git history; error pages gate stack traces to dev; static serving uses Hono's traversal-safe `serveStatic`; style-combination caching works.
- **Frontend** — correct doctype/lang/viewport/titles; deferred scripts; no duplicate runtime IDs; no nested forms; flash.js uses swap-proof document delegation; nav.js keyboard behavior (Escape, focus return, outside-click) is right; `:focus-visible` styles present; `prefers-reduced-motion` respected; main color pairs pass WCAG AA (measured).
- **Hygiene** — `tsc --noEmit` passes; no `any` in server/ or templates/; no TODO/FIXME markers.

---

## Testing strategy (no suite exists today)

`bun:test` is zero-setup. In order of value:

1. **`/validate-account` integration test** — would have caught F1 immediately. Seed a user + token with **non-aligned ids**; assert activation, claim-by-token, reuse rejection, wrong-uid rejection, expiry.
2. **Sign-up POST** — happy path, duplicate email/username (case variants, gmail dot/plus aliases via normalize-email), malformed payloads (missing fields — currently 500s per F15), failure-after-insert behavior (F9).
3. **Sign-in POST + auth round-trip** — wrong password, unknown email, pending/deleted status (encodes the F4 fix), cookie/JWT round-trip, garbage/rotated-secret cookie (encodes the F3 fix).
4. **Flash + session lifecycle** — add→render→cleared semantics, expiry, the redirect race (encodes the F11 fix), first-visit parallel-request session behavior (encodes the F12 fix).
5. **Error middleware branching** — HTMX vs full-page for 404/4xx/500, 401 → `/sign-in` with and without `HX-Request`, stack detail dev-only.

Write each test *before* its fix where practical — F1, F3, F4, F11, F15 all have crisp reproducible failure cases.
