# socialstuffs — Audit Follow-up Tasks

**Date:** 2026-08-08
**How this was produced:** After all audit PRs (#1–#34, Phases 1–7) merged to main, six parallel verification agents re-checked every finding in [audit.md](audit.md) (F1–F37) against the actual code — not the ✅ annotations — plus the deferred items in [tasks.md](tasks.md), doc accuracy, and test coverage. Verdict: **24 findings fully resolved**, the rest are the partials, conscious deferrals, and doc staleness below, plus 7 new findings surfaced during verification.

Task numbering is FU-*n*; F-numbers reference audit.md. Grouped into suggested PRs by priority and locality.

---

## P1 — Real gaps to close now

### PR A — Recover-password forms parity (FU-1) ⚠️ highest priority

- [x] **FU-1 Bring the two password-recovery forms up to the standard the other forms got** (F10, F30, F31 residuals) — *done, PR [#35](https://github.com/holmok/socialstuffs/pull/35) (merged): native `action`/`method` fallbacks, `hx-disabled-elt` + indicator, `role="alert"`, `autocomplete` on both forms; markup regression tests pin it. CLAUDE.md's "all auth forms" sentence is accurate again*
  `recover-password-form.tsx` and `set-password-form.tsx` landed in PR #19 *after* the form-hardening PR #17 and never got its treatment. Verified missing on both:
  - No native `action`/`method` fallback — if htmx fails to load, the browser default-submits **GET to the current URL**: the recover form leaks the email into the query string; the set-password form leaks the **new password** (`password` + `confirmPassword`) into the URL, browser history, and server/Axiom logs — the exact hazard F10 was about (`templates/components/recover-password-form.tsx:10`, `set-password-form.tsx:11`).
  - No `hx-disabled-elt` / `hx-indicator` / indicator span — no double-submit protection; a second click on set-password fires a second POST that fails on the already-claimed token, showing an error to a user whose reset actually succeeded.
  - No `role="alert"` on the form-errors divs; no `autocomplete="email"` (recover) / `autocomplete="new-password"` (both set-password fields — the deferred trivial from tasks.md line 78).
  Copy the attributes from `sign-in-form.tsx`. This also makes CLAUDE.md's "all auth forms carry native fallbacks and autocomplete" sentence true again (it is currently false). Add a test asserting the rendered forms carry `action`/`method`.

### PR B — Session revocation (FU-2, FU-3)

- [x] **FU-2 Password reset does not invalidate existing sessions/JWTs** (new finding, medium) — *done, PR [#36](https://github.com/holmok/socialstuffs/pull/36) (merged): a `pwv` claim (SHA-256 fingerprint of `passwordHash`) is signed into the JWT at sign-in; `authorize()` compares it to the current hash, so a reset revokes all earlier tokens. No schema change needed. End-to-end test in `recover-password-flow.test.ts`*
  `recover-password-routes.ts:237-252` only updates `passwordHash`. A stolen auth cookie keeps working for up to 7 days *after* the victim resets their password — the exact scenario a reset should end. Fix: add a `passwordChangedAt` (or `tokenVersion`) check in `authenticate()` against the JWT `iat` so tokens minted before the reset are rejected; optionally also delete the user's kv session rows. (Needs a column in the externally-managed schema.)
- [x] **FU-3 Close the 7-day revocation window generally** (F5 accepted residual) — *done, PR [#36](https://github.com/holmok/socialstuffs/pull/36) (merged): `authorize()` re-checks the DB on gated routes (one indexed SELECT by uid) — missing row, non-active status, or `pwv` mismatch → 401 + cookie cleared; role checks use the DB role. Ungated pages still do no auth DB work. Six revocation tests in `auth-middleware.test.ts`*
  `authorize()` trusts JWT claims — banning/demoting a user has no effect until `exp`. Same mechanism as FU-2 solves both (`tokenVersion`/`passwordChangedAt` re-check, a cached DB status lookup, or short-lived JWTs with sliding refresh — `auth.getUser()` already exists and is never called). Test: flip a user's DB status to `inactive` and assert the next request 401s without waiting for expiry.

### PR C — Brute-force hardening (FU-4, FU-5)

- [ ] **FU-4 Per-account sign-in throttling + failed-login backoff** (F7 residual)
  The audit asked for per-IP **and** per-account limiting plus backoff; only per-IP landed. A distributed attacker (many IPs) can credential-stuff one account at full speed. Add a second limiter keyed on `sign-in-acct:${normalizedEmail}`, incremented only on failures (e.g. 10 failures/15 min), optionally kvStorage-backed so it survives restarts. Test: one account locks across distinct `X-Forwarded-For` values.
- [ ] **FU-5 Rate-limiter overflow wipes all limiter state** (new finding)
  `rate-limit-middleware.ts:42` — `if (windows.size > MAX_TRACKED_KEYS) windows.clear()` resets *every* counter, including windows currently blocking an attacker; a key-flood converts the memory cap into a limiter-bypass primitive. Evict expired/oldest entries instead, or refuse new keys at capacity. Test: a key-flood does not reset an already-blocked key.

---

## P2 — Worth doing soon

### PR D — Auth/session hygiene (FU-6, FU-7, FU-8)

- [ ] **FU-6 `Cache-Control: no-store` on authenticated pages + session rotation at sign-in** (F37 residuals)
  Only static assets set Cache-Control; authenticated HTML goes out with none (back-button/bfcache exposure after sign-out). Set `no-store` when `c.var.auth.user` is present. Also: the pre-auth session id survives sign-in (no `rotate()` API on `SessionContext`) — low impact today (only flashes attach to it) but cheap to fix in the same PR.
- [ ] **FU-7 Clear the auth cookie when its HMAC fails** (new finding)
  `authenticate()` clears the cookie only in the JWT-verify catch. If the *signed-cookie* HMAC fails (e.g. `COOKIE_SECRET` rotation), `getSignedCookie` returns falsy, the branch is skipped, and the dead cookie sits in the browser for its full 7-day maxAge. When the raw cookie exists but the signed read fails, clear it the same way (`auth-middleware.ts:46-54`).
- [ ] **FU-8 Invalidate a user's other outstanding recovery tokens on successful reset** (new finding)
  A successful reset claims only the presented token; older unclaimed `passwordRecoveryTokens` rows stay live for their full 48h — a reset link in a compromised inbox works even after the user already reset via a newer link. Mark the user's other unclaimed rows claimed inside the reset transaction (same for `accountValidationTokens` on validation, optionally).

### PR E — Error page + logging polish (FU-9, FU-10, FU-11)

- [ ] **FU-9 Styled CSRF-403 page** (F13 known limit — tasks.md 2.4 says "tracked separately" but no task existed until now)
  `csrf()` runs before `layoutContext()`, so a CSRF-rejected non-HTMX request renders as a bare unstyled fragment. Either have `errorHandler` return a self-contained full-document error page when the layout renderer never ran, or reorder the chain. Test: cross-origin POST to `/sign-in` returns a full styled HTML document.
- [ ] **FU-10 Stop logging static-asset requests** (F26 residual — the audit's "largely solved by F12" annotation was wrong)
  `loggerContext` registers at `server.ts:38`, *before* the static handlers at :54-70, so every `/js/*`/favicon/robots request still emits a hono-pino info line — shipped to Axiom in prod. Move the static registrations above the logger (or path-scope the logger away from static). Verify a page load logs only the page request.
- [ ] **FU-11 Scrub email PII from logs** (F25 residual)
  Attempted emails flow to Axiom with no matching redact path: `sign-in-routes.ts:53` (warn, every failed sign-in), `sign-up-routes.ts:225` (info), `recover-password-routes.ts:102` (info), `email-api.ts:49` (`to`/`from` at debug). Drop/hash them, or add `normalizedEmail`/`to`/`*.email` to the redact paths in `config.ts`.

### PR F — Test gaps (FU-12)

- [ ] **FU-12 Missing test cases found by the coverage sweep**
  - Sign-in with a **nonexistent email** (explicitly named in audit.md's testing strategy) — the F20 dummy-bcrypt path is unexercised; assert generic error + no auth cookie.
  - POST `/user/sign-out` has no test (cookie cleared + redirect; HTMX variant gets `HX-Redirect`) — `user-routes.ts` has no test file at all.
  - Smoke test: public pages (`/`, etc.) return 200 with the layout.

---

## P3 — Low / decide-and-close

These are small; several are "either do the one-line fix or record the acceptance in audit.md and close the finding."

- [ ] **FU-13 Sign-up email oracle** (F20 residual) — sign-up still confirms whether an email is registered ("Email is already in use."), gated only by 10/hr/IP in-memory limiting. Either neutralize (return the neutral "check your email" response and send an "you already have an account" email; username collisions can stay visible) or accept and document permanently in audit.md.
- [ ] **FU-14 JWT-in-signed-cookie double-signing** (F29 residual) — every authenticated request pays two HMAC verifications; the audit called one layer redundant and no decision was recorded. Either drop the cookie signing for the auth cookie (JWT already provides integrity + expiry) or document the double layer as deliberate and close F29.
- [ ] **FU-15 `renderCSS` bare-number px hazard** (F37) — `styles/index.ts:57` appends `px` to any number; the first `fontWeight: 700` silently renders `700px`. Add a unitless-property allowlist + a unit test.
- [ ] **FU-16 htmx timeout listener is dead wiring** (new finding) — `flash.js` listens for `htmx:timeout` but the htmx-config meta never sets a `timeout`, so the event can't fire; hung requests surface nothing. Add `"timeout": 15000` to the htmx-config meta (or drop the listener).
- [ ] **FU-17 Vendored htmx 2.0.10 patch bump** (F37) — the versioned-filename cache-bust makes this mechanical: vendor the latest 2.0.x as `htmx.min.2.0.N.js`, update the `<script>` ref in `main-layout.tsx` + the biome.json glob, smoke-test the forms.
- [ ] **FU-18 `og:`/`twitter:` meta on public pages** (F37) — derive from the existing title/description props + `baseLinkUrl`/`baseImageUrl` in `main-layout.tsx`.
- [ ] **FU-19 Kysely `log` hook → pino** (Phase 6 deferral) — pass a `log` handler in `data/index.ts` (debug for queries with duration, error for failures). **Do not log `event.query.parameters`** — it would leak password hashes/tokens past the field-name-keyed redact config.
- [ ] **FU-20 `verbatimModuleSyntax` (+ optionally `noUncheckedIndexedAccess`)** (F34 deferral) — one sequential PR; the codebase already uses `import type` widely so the diff is likely smaller than feared.
- [ ] **FU-21 Kysely `updated` type consistency** (F28 residual) — `relations.updated` and `postTargets.updated` are typed never-updateable, unlike every other table. Decide immutable-by-design (add a comment) or align to `ColumnType<Date, never, Date>`. Minutes; verify against the external schema.

**Blocked/deferred until the feature exists** (keep, don't schedule): `posts.uid` generated-vs-supplied convention (needs a posts insert site + a schema decision); `user.tsx` `<h1>` (placeholder page); nav.js document-delegation refactor (only matters if the header ever becomes a swap target); email-template HTML-escaping replacer (only before templating any freeform field); `app.route()` composition idiom (works fine as is).

**Verified-accepted residuals (no action, already documented in code):** resend-validation and recover-password timing side-channels (rate-limited, leak only the bit F20 already exposes — revisit only if FU-13 closes the sign-up oracle); precompressed static siblings (traded for `compress()` + immutable caching, immaterial at this scale).

---

## Docs staleness (fold into whichever PR merges first)

- [x] **FU-22** *(done, folded into PR [#36](https://github.com/holmok/socialstuffs/pull/36), merged)* `tasks.md:13` still says "Phase 7 open for review (not yet merged)" — #31–#34 are merged. `audit.md:16` still lists "Remaining: Phase 7 (tests)"; the resolution-status block has no Phase 7 line; the `audit.md:323` heading still says "Testing strategy (**no suite exists today**)" despite 15 test files. CLAUDE.md and README were verified accurate on every other checked claim (commands, middleware order, TTLs, env vars, rate limits, styles) — only fix CLAUDE.md's "all auth forms" sentence via FU-1's code fix, not a doc edit.

---

## Fully verified resolved (no action)

F1, F2, F3, F4, F6, F8, F9, F11 (all eight current `addFlash` sites awaited), F12, F14 (recovery flow verified: 32-char tokens, expiry at both GET and POST, atomic uid-bound claim, neutral responses), F15, F16, F17, F18, F19, F21, F22, F23, F24, F27, F32, F36, F37-getStyle-cache-key, coverage tooling — each confirmed in code with file:line evidence, not from annotations.
