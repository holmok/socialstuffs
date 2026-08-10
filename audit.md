# Project Audit — socialstuffs

**Date:** 2026-08-09
**Method:** Five parallel review passes — security, performance, user experience, UI/accessibility, and code patterns/practices — each verifying findings against the actual code with file references. Findings that surfaced in more than one pass are merged and cross-referenced.
**Scope:** `server/`, `templates/`, `static/`, `migrations/`, `scripts/`.

## Executive summary

The codebase is in good shape overall: auth/session revocation, token flows, CSRF, enumeration hygiene, log redaction, test coverage of the main flows, and the static-asset pipeline all verified solid (see [Verified strengths](#verified-strengths)). The audit surfaced **9 high-severity findings** and a larger tail of mediums/lows, clustering into five themes:

1. **Two real security holes** — data-export ZIPs live at a predictable path in the public image bucket (full PII disclosure), and sensitive account changes (password/email/delete) never re-verify the current password.
2. **One functional bug** — the settings form's uniqueness check matches the user's own row, making case-only username/email changes impossible.
3. **Request-path costs that grow with data** — the feed runs its expensive visibility predicate twice per page view, image processing runs unbounded on the event loop, and a few hot queries lack supporting indexes.
4. **Flow dead ends** — a pending user has no discoverable path to re-request a validation email, and the no-JS fallback renders unstyled fragments on any validation error.
5. **Copy-paste drift** — helpers, constants, schemas, and the moderation/upload pipeline are duplicated across route files, with a few spots already diverging.

---

## Security

### SEC-1 (High) — Export ZIPs are publicly downloadable at a predictable path
`server/api/user-data-api.ts:50-52,116`, `server/routes/user-routes.ts:352-372`
Uploaded images are served directly from the public GCS bucket (no signed URLs, no per-object ACLs), and the data-export ZIP is written to that same bucket at `user_data/dt=<date>/<userUid>_data.zip`. User uids are public (they appear in profile URLs), and the date stamp has ~365 possibilities per year — so anyone can enumerate and download any user's export, which contains their email, role/status, all posts **including drafts**, and all comments. Image filenames carry random suffixes and are not enumerable; the export path is the outlier.
**Fix:** keep exports out of the public bucket — serve through an authenticated route that streams after an ownership check, or use short-lived V4 signed URLs with a random token in the object path (ideally a separate private bucket).

### SEC-2 (High) — No current-password re-authentication for sensitive changes
`server/routes/user-routes.ts:196-340,374-401`, `templates/components/user/settings-form.tsx`
Password change, email change, and account deletion require only a live session (deletion asks you to type "delete"). A stolen or borrowed session can silently reset the password (full takeover) or change the email. The courtesy notice to the old email on change is good but insufficient.
**Fix:** add a current-password field to the settings form and verify with `Bun.password.verify` before applying password/email changes or deletion.

### SEC-3 (Medium) — `linkUrl` accepts `javascript:`/`data:` URLs
`server/routes/post-routes.ts:27`; rendered in `templates/pages/post/view.tsx:58`, `templates/pages/profile/user.tsx:104`, `templates/pages/home-user.tsx`
`z.url()` accepts `javascript:alert(1)` and `data:` URLs, which are stored and rendered as clickable anchors for other users. The CSP currently blocks `javascript:` navigation in modern browsers, but that's fragile defense-in-depth and `data:text/html` top-level navigation isn't reliably covered.
**Fix:** constrain the schema to http/https and/or scheme-check at render time.

### SEC-4 (Medium) — Per-IP rate limiting trusts client-supplied X-Forwarded-For
`server/middleware/rate-limit-middleware.ts:33-44`
The limiter keys on the **last** XFF entry, which is only trustworthy behind the production ngrok tunnel. Deployed any other way (or exposed directly), an attacker rotates the header per request and defeats the throttles on sign-up, resend-validation, and recover-password (sign-in keeps its kv-backed per-account lockout as a backstop).
**Fix:** derive client IP from the socket peer or a configured trusted-proxy hop count; only honor forwarded headers from a known proxy. At minimum, document the deployment invariant.

### SEC-5 (Low) — Banned/deleted users keep personalized feed access until JWT expiry
`server/routes/public-routes.ts:60-140`, `server/middleware/auth-middleware.ts:101-133`
The DB re-check that revokes stale sessions runs only inside `authorize()`; the home feed renders from JWT claims alone, so a banned/deleted user keeps read access to their personalized feed for up to 7 days. All mutations are still blocked.
**Fix:** apply the same status/pwv re-check on the feed branch (or any claim-only authenticated page).

### SEC-6 (Medium, also PERF) — No server body-size limit; 20MB image cap enforced after full buffering
`server/index.ts:35-39`, `server/routes/post-routes.ts:65,105-108`, `server/routes/user-routes.ts:89,137-146`
`Bun.serve` runs with its ~128MB default `maxRequestBodySize`, and `c.req.formData()` buffers the whole multipart body before the 20MB check runs — a memory-pressure DoS lever for any authenticated client.
**Fix:** pass `maxRequestBodySize: ~25MB` to `Bun.serve`; optionally reject on `Content-Length` before parsing.

### SEC-7 (Low) — Session id never rotated across the auth boundary
`server/middleware/auth-middleware.ts:82-89`, `server/routes/sign-in-routes.ts:91-97`
Sign-in doesn't regenerate the session id and sign-out clears only the JWT cookie, leaving the session cookie and kv rows intact. Low impact (the session holds no authorization data), but it's session-fixation-adjacent.
**Fix:** mint a fresh session id on sign-in; clear session cookie + kv rows on sign-out.

### SEC-8 (Low) — Missing HSTS and Referrer-Policy headers
`server/server.ts:42-54`
`secureHeaders()` sets CSP and `X-Frame-Options` but no `Strict-Transport-Security` or `Referrer-Policy`.
**Fix:** add both to the secureHeaders options (`max-age=31536000; includeSubDomains`; `strict-origin-when-cross-origin`).

### SEC-9 (Low, from patterns pass) — Flagged user content and emails logged verbatim
`server/api/language-api.ts:31-34`; `server/routes/sign-in-routes.ts:65`, `sign-up-routes.ts:98,207`, `recover-password-routes.ts:102`
Moderation-flagged post/comment text ships verbatim to stdout and Axiom, and several auth paths log email addresses — inconsistent with the otherwise careful redact config.
**Fix:** log `{ length, category, confidence }` instead of content; add emails to redact paths or drop them from log objects.

---

## Performance

### PERF-1 (High) — Image pipeline decodes unbounded pixels on the event loop
`server/api/image-api.ts:58-60`; callers in `post-routes.ts:105-119`, `user-routes.ts:137-164`
Jimp decode/resize/encode is pure-JS CPU work on Bun's single event-loop thread — a 20MB image stalls every request for seconds. The 20MB cap limits *compressed* size only: a small decompression-bomb PNG (20k×20k) decodes to ~1.6GB RGBA and can OOM the process. Three copies of the image coexist in memory.
**Fix:** reject images above a pixel-dimension cap (e.g. 8000px/side) after decode metadata; move processing to a `Worker` (or a native library like sharp).

### PERF-2 (High) — Feed and profile execute the full visibility query twice per page view
`server/routes/public-routes.ts:75-106`, `server/routes/profile-routes.ts:113-150`
Each page view runs the row query *and* a `count(*)` that re-evaluates up to four correlated EXISTS subqueries over every published post — solely to compute the boolean `hasOlder`. Cost grows linearly with total posts.
**Fix:** drop the count; fetch `POSTS_PER_PAGE + 1` rows and derive `hasOlder` from the extra row.

### PERF-3 (Medium) — No index supports the feed/profile sort
`migrations/1779735138258_posts.ts:24-25` vs. the queries in public/profile routes
Posts have only single-column indexes on `userUid` and `status`. The feed filters `status='published'` (matches most rows) and sorts `created DESC, id DESC` — a scan + top-N sort of all published posts per request.
**Fix:** add `(status, created DESC, id DESC)` and `(userUid, created DESC)`; drop the standalone `status` index.

### PERF-4 (Medium) — Two users-table lookups per authenticated request
`server/middleware/auth-middleware.ts:77-81,116-125` and nearly every gated handler
`authorize()` SELECTs the user row for revocation checks; handlers then call `auth.getUser()` which SELECTs the same row again. Profile actions add a third lookup for the target.
**Fix:** have `authorize()` cache the full row on context and `getUser()` return it (or memoize `getUser()` per request).

### PERF-5 (Medium) — Post-with-image save serializes three external services; Vision client rebuilt per upload
`server/api/image-api.ts:27,62,72-75`, `server/routes/post-routes.ts:84-119`
Text moderation → Jimp → `new Vision.ImageAnnotatorClient()` (fresh gRPC channel + auth handshake per call) → SafeSearch → sequential GCS deletes → GCS save, all serial; easily 1.5–3s per post.
**Fix:** hoist the Vision client to the constructor (like Storage); `Promise.all` text moderation with image processing and the delete loop.

### PERF-6 (Low) — Flash pop issues a kvStorage DELETE on every full-page render
`server/middleware/layout-middleware.tsx:17`, `flash-middleware.ts:21-28`
Every full-page response with a session cookie runs `DELETE ... RETURNING` against kvStorage even when no flash exists (the common case).
**Fix:** gate the pop behind a tiny "has-flash" cookie set by `addFlash`, or move flashes into a short-lived cookie.

### PERF-7 (Low) — kvStorage carries a duplicate key index and lacks an expires index
`migrations/1777738584701_kv-storage.ts:8-15`, sweep in `server/utils.ts:26-34`
`key` has both a unique constraint and an explicit index (two indexes maintained on the busiest write table); the hourly `expires < now()` sweep has no index at all. The unused `cachedQueries` migration repeats the duplicate-index pattern.
**Fix:** drop `idx_kvStorage_key`, add an index on `expires`.

### PERF-8 (Low) — Unbounded queries: profile favorites strip and export image loop
`server/routes/profile-routes.ts:114-122`, `server/api/user-data-api.ts:100-111`
The profile renders *all* favorites with no LIMIT; the export downloads every image sequentially and holds the full zip in memory (mitigated by the once-daily rate limit).
**Fix:** LIMIT the favorites strip; bounded-concurrency downloads for exports.

### PERF-9 (Low) — Minor request-path costs
`server/middleware/rate-limit-middleware.ts:49-51`; `server/routes/post-routes.ts:350-354`
The IP limiter iterates its whole map (up to 10k entries) on every rate-limited request; the post view runs a second COUNT over comments that's derivable from `rows.length === COMMENT_LIMIT`.
**Fix:** lazy/periodic limiter sweeps; drop the extra count.

---

## User experience

### UX-1 (High) — Resend-validation is a dead end
`sign-up-routes.ts:150`, `sign-in-form.tsx:55-59`, `sign-in-routes.ts:80`
Sign-up's email-failure flash says "request a new link from the sign-in page," but the sign-in page has no such link, and the pending-user sign-in error offers no path either. `/resend-validation` is only linked from a page a stuck user can never reach.
**Fix:** add a "Didn't get a validation email? Resend it" link to the sign-in form footer and/or the pending-status error.

### UX-2 (High) — No-JS validation errors return bare unstyled fragments
All form error paths (`sign-in-routes.ts:46,66`, `sign-up-routes.ts:83,156`, `post-routes.ts:71-73,406`, `user-routes.ts:104,204`, `recover-password-routes.ts:189`)
Forms carry native fallbacks, but every validation/moderation failure responds with `c.html(fragment)` — with all CSS inlined by the layout, a non-HTMX submit that fails renders an unstyled form with no header or nav.
**Fix:** branch on `HX-Request` (as `utils.redirect` does): fragment for HTMX, full `c.render(...)` page otherwise; a shared helper keeps it to one change per route.

### UX-3 (Medium) — Deep links are lost through sign-in
`error-middleware.ts:38-44`, `sign-in-routes.ts:102`
A signed-out user opening a shared `/posts/:uid` or `/profile/:uid` link gets bounced to `/sign-in`, then always lands on `/` — the shared link (the app's only discovery mechanism) is discarded.
**Fix:** stash the requested path (session or validated local `?next=`) in the 401 handler; honor it on sign-in success.

### UX-4 (Medium) — No create CTA in nav or feed; empty feed offers nothing actionable
`navigation.tsx:11-37`, `home-user.tsx:33-37`, `profile/user.tsx:85-89`
"New Post" only exists on your own profile (three clicks from home). The empty-feed state suggests favoriting people but there is no user search/browse surface anywhere.
**Fix:** add New Post to the authenticated nav and a CTA to the empty feed; user discovery is a larger follow-on.

### UX-5 (Medium) — Post actions always dump you on profile page 1
`post-routes.ts:233,310,323`
Create/edit/archive/delete all redirect to `/profile/<uid>` with no page or return context — editing from page 4 of your profile, or posting from the feed, loses your place.
**Fix:** carry a validated return/`?p=` param through edit links and honor it on redirect.

### UX-6 (Medium) — Picked image silently lost on form-error re-renders
`post-routes.ts:71-73`, `post-form.tsx:132-136`, `edit-profile-form.tsx:47-49`
File inputs can't be server-prefilled, so an error re-render comes back with "No file selected" and no warning — fix your typo, resubmit, and your post publishes without the photo.
**Fix:** show a "your photo needs to be re-selected" note when the failed request contained a file (or upload first and thread the URL through like edit does).

### UX-7 (Medium) — Error flashes auto-dismiss after 10 seconds like successes
`static/js/flash.js:17-32`
The auto-dismiss timer applies to `role="alert"` errors too (e.g. "Something went wrong deleting your account") — glance away and you missed it, and may assume the action succeeded. Also runs against WCAG user-control expectations.
**Fix:** skip (or greatly lengthen) the timer for `.flash-error`; keep the close button.

### UX-8 (Medium) — Rate-limit 429s wipe everything the user typed
`onLimit` handlers in `sign-in-routes.ts:31`, `sign-up-routes.ts:70,172`, `recover-password-routes.ts:54`
Every `onLimit` re-renders the form with errors only — attempt 11 on sign-up throws away username, email, and both password fields. Every other error path preserves input.
**Fix:** read the form body in `onLimit` and pass values back into the component.

### UX-9 (Medium) — GIFs accepted but silently flattened to static JPEG
`post-routes.ts:23,112-119`, `user-routes.ts:51,156-164`, hint in `post-form.tsx:136`
The form invites GIF uploads but every image is re-encoded as JPEG — animated GIFs become a still of frame one, PNG transparency is lost, with no warning.
**Fix:** stop advertising GIF, preserve GIF format, or state the conversion in the hint.

### UX-10 (Low) — Misc copy/consistency
- Success feedback mixes `info` and `success` flash types for equivalent actions (`user-routes.ts:183,338` vs `post-routes.ts:232,309,322`).
- Password/username rules only surface via failed submits; sign-in placeholder says "Enter a strong password..." (`sign-in-form.tsx:46`).
- Marketing pitch lists three of the four audience options (`home-anon.tsx:52`).
- CSRF-rejected 403s render as bare unstyled fragments (`server.ts:72`, already noted in CLAUDE.md).

### UX-11 (Low) — After commenting you land back at the top of the post page
`post-routes.ts:443`, `view.tsx:70-102`
The redirect scrolls to the top; the new comment is at the bottom of up to 30 items.
**Fix:** redirect to `/posts/<uid>#comment-<newUid>` with ids on comment list items.

### UX-12 (Low, also UI) — OOB error flashes stack duplicate containers
`error-oob-fragment.tsx:11` vs. the reuse logic in `flash.js:37-44`
The OOB fragment always inserts a fresh `.flash` div before `<main>`; repeated errors (or an existing page-load flash) stack containers with doubled padding. The transport-error path already reuses an existing container — the two paths disagree.
**Fix:** give the layout a permanent `#flash-region` and OOB-swap `beforeend` into it.

---

## UI & accessibility

### UI-1 (High) — Lightbox image links have no accessible name
`profile/user.tsx:97-99`, `post/view.tsx:51-53`, `home-user.tsx:50-52`
The image-link anchors contain only `alt=""` images — an unnamed link on every photo post. Avatar links in the same files do carry labels.
**Fix:** `aria-label="View photo full size"` (+ optionally `aria-haspopup="dialog"`).

### UI-2 (High) — Delete-account confirm input has no label
`user/data.tsx:59`
The gating control for the most destructive action relies on a placeholder for its name; every other input uses a proper label via `TextInput`.
**Fix:** add a real `<label for="delete-confirm-input">`.

### UI-3 (Medium) — No `<h1>` on user pages or the post view
`user/settings.tsx:13`, `user/my-profile.tsx:19`, `user/edit-profile.tsx:13`, `user/data.tsx:18`, `post/view.tsx:71`
All four `/user` tabs start at `<h2>`; the post page's only heading is "Comments" — the post itself has no heading. Marketing/auth pages are correct, so outlines are inconsistent.
**Fix:** promote the page headings (visual style can stay identical).

### UI-4 (Medium) — Keyboard focus lost after every HTMX form swap
All forms (`hx-target="this"` + `outerHTML`), `profile/actions.tsx:20`
The focused element is destroyed by the swap, resetting focus to `<body>` after validation errors and favorite/approve toggles.
**Fix:** a small delegated `htmx:afterSwap` handler that refocuses the first `[aria-invalid]` input or the swapped action button.

### UI-5 (Medium) — Fixed-height footer overflows on narrow viewports
`global-style.ts:166-197`, `footer.tsx:4-15`
Below ~470px the footer content wraps but the box stays 52px, overflowing onto page content; no mobile rule exists for it.
**Fix:** `height: auto` (+ body padding adjustment) in the mobile media query.

### UI-6 (Medium) — Touch/click targets below guidelines
`.flash-close` (~20px), `.profile-action`/`.user-tab a`/`.profile-pagination a` (~31px tall)
The flash dismiss misses WCAG 2.5.8's 24px minimum; primary actions (approve/favorite) sit well under comfortable touch size on a mobile-first app.
**Fix:** min-height/padding bumps (negative margins preserve visual density).

### UI-7 (Medium) — Post photos hard-coded `alt=""` with no alt mechanism
Post renders in all three pages + `lightbox.js:34`; no alt field in `post-form.tsx`
Image posts' primary content is invisible to screen readers, and the lightbox inherits the empty alt.
**Fix:** short-term generic alt ("Photo posted by {author}"); properly, an optional alt/caption field on the post form.

### UI-8 (Low) — A11y detail cluster
- Confirm dialogs lack `aria-labelledby`; lightbox dialog unnamed (`user/data.tsx:53`, `post/edit.tsx:11`, `lightbox.js:9-11`).
- "Working…" indicators are `aria-hidden` — no in-flight feedback for AT users (all 9 forms).
- Char counters aren't live regions and aren't referenced by `aria-describedby` until errors exist.
- No skip-to-content link despite the fixed header (`main-layout.tsx:42-46`).
- `fgError` (#e06c75) on `bgSurface` computes ≈4.51:1 — passes AA by a hair; `fgMuted` over `bgSurfaceLight` (3.65:1) is a latent trap, currently unused.

### UI-9 (Low) — Style-system cleanups
- The hairline border recipe is re-derived in 8 modules; avatar circles and the accent button are copy-pasted with only size differing (`post-style.ts`, `home-style.ts`, `profile-style.ts`, `user-style.ts`, `form-style.ts`) — extract mixins.
- `form-style.ts:6-8` centers **every** `h1` on any page that loads the `auth` bundle — scope it.
- `renderCSS` emits native CSS nesting (`.form { label { … } }`), which silently drops all nested rules on browsers older than ~Chrome 120/Safari 17.2/Firefox 117 — flatten selectors or document the baseline.
- Hidden post-image preview renders `src=""` (`post-form.tsx:114`) — omit the attribute instead.

---

## Patterns & practices

### PP-1 (High, functional bug) — Settings uniqueness checks match the user's own row
`server/routes/user-routes.ts:228-255`
The change-detection compares email/username case-sensitively, then the uniqueness query doesn't exclude the current user — so changing only the case of your own username or email ('Bob' → 'bob') is rejected as "already in use." Settings also normalizes the username slightly differently than sign-up.
**Fix:** add `.where('id', '!=', user.id)` to both in-use checks; share one normalize helper with sign-up.

### PP-2 (Medium) — `throw new Response(...)` bypasses the error handler
`user-routes.ts:66,97,226,355,377` (vs. `HTTPException` in every other route file)
Hono only routes `Error` instances to `onError`; a thrown `Response` escapes `app.fetch` unhandled. These are "should never happen" guards, but the trap is already copy-pasted five times.
**Fix:** replace with `throw new HTTPException(401)`.

### PP-3 (Medium) — Cross-file duplication of helpers and constants
- `displayImageUrl` — four byte-identical copies (post-, profile-, public-, user-routes), each with a "mirrors X" comment.
- `MAX_IMAGE_BYTES`/`allowedImageTypes`/image uid minting — post-routes and user-routes.
- `POSTS_PER_PAGE = 5` — public-routes and profile-routes. `TOKEN_TTL` (48h) — sign-up and recover-password.
- `setPasswordSchema` re-declares all seven `utils.passwordSchema` rules verbatim (`recover-password-routes.ts:19-35`).
- Templates: `isEdited` ×3, `commentLabel` ×2, and the post-card markup near-duplicated between feed and profile; `class=` vs `className=` split across files.
**Fix:** hoist shared helpers/constants into `server/utils.ts` (or `routes/shared.ts`); reuse `utils.passwordSchema`; extract a shared PostCard/helpers module.

### PP-4 (Medium) — Moderation + upload pipeline implemented twice
`post-routes.ts:84-125` vs `user-routes.ts:110-170`
The moderate-fields → fail-closed → size/type-check → upload → map-ImageUploadError sequence exists as `processPostForm` in one file and inline (five re-render branches) in the other, with identical strings.
**Fix:** extract `moderateFields(...)` and `validateAndUploadImage(...)` helpers.

### PP-5 (Medium) — Token validation triplicated with a real divergence
`sign-up-routes.ts:232-282`, `recover-password-routes.ts:127-162,207-257`
The same four-way token check + atomic claim appears three times across two structurally identical tables — and the recovery claim includes a freshness predicate the validate-account claim lacks.
**Fix:** shared `checkToken`/`claimToken` helpers; add the freshness predicate to validate-account for parity.

### PP-6 (Medium) — `users.info` jsonb consumed via ~10 unchecked casts
`user-data.ts` types `info` as `Record<string, unknown>`; casts in post/profile/public/user routes and user-data-api
Every consumer casts to `UserProfileInfo` unvalidated; two call sites mutate the shared object in place while another defensively copies.
**Fix:** type the column as `UserProfileInfo & UserMeta` in the table type (removing casts), or one owning accessor in utils that casts and copies.

### PP-7 (Medium) — Migrations allow NULL where the TS layer promises non-null
`comments.postId`, `kvStorage.value`, `posts.updated` nullable in DDL but non-null in Kysely types
Code never inserts NULLs, but nothing prevents them, and `JSON.parse(value)` / `updated.getTime()` would throw on one.
**Fix:** a tightening migration (`SET NOT NULL` × 3) — or widen the types.

### PP-8 (Medium) — Dead code
- `cachedQueries` table (migration `1784466114593`): not in the `Database` type, zero references.
- `templates/pages/user.tsx`: superseded stub, unreferenced.
- `user-data-api.ts:19-22,131-150`: the `DenormalizedInfo` scrub cleans `info.favorites`/`info.relations` lists that no code path ever writes — dead transaction work that misleads readers about where relationship state lives.
**Fix:** drop the table, delete the stub, remove the scrub (or document the legacy data it targets).

### PP-9 (Medium) — Test coverage gaps
No direct tests for: session middleware (expiry-on-read, pop semantics, cookie minting), `renderCSS`/`getStyle` (the single generator for all page CSS), the layout renderer, and the four static info pages. Everything else — all four APIs, the other middleware, and full flows including export/delete — is well covered.
**Fix:** `session-middleware.test.ts`, a small renderCSS unit test, and a smoke test for the info pages.

### PP-10 (Medium) — Inconsistent form parsing and error-handling strategies
`Object.fromEntries(formData.entries()) as Record<string, string>` (five sites — unsound when a File is posted) vs. the field-whitelist loop (two sites); sign-in wraps its whole handler in try/catch, sign-up wraps only the insert, everything else relies on the error middleware.
**Fix:** one `formStrings(formData, fields)` helper; document one error-handling rule and align the auth routes.

### PP-11 (Low) — Comment cap is check-then-insert without a transaction
`post-routes.ts:427-439` (+ duplicated count subquery at :332-354)
Concurrent submissions can exceed the advertised hard 30 limit; the view also runs a redundant COUNT (see PERF-9).
**Fix:** guarded insert (`insert ... where (select count(*)) < 30`) or transaction; reuse one count builder.

### PP-12 (Low) — Fragile conventions
- Shared delete-modal CSS lives in the `user` style bundle; unrelated pages must know to include it (`user-style.ts:152-186`).
- Adding a style module requires editing both the `style` union and `stylesMap` — derive the union from `keyof typeof stylesMap`.
- `dotenv` devDependency has no direct import — it likely exists for the `node-pg-migrate` CLI; verify and either remove or document.
- Migration hygiene: `realations` filename typo (permanent, note only), `timestamp` vs `timestamptz` mix, index-naming drift — standardize for future migrations.

---

## Verified strengths

Confirmed working by the reviews (kept brief; don't re-litigate these):

- **Auth:** pwv-fingerprint + DB re-check revocation on gated routes; JWT re-sign gotcha handled at its one call site; bcrypt via `Bun.password` with dummy-hash timing equalization; kv-backed per-account lockout; cookie flags (httpOnly, sameSite=strict, secure in prod).
- **Injection:** all SQL through Kysely's builder (the one raw fragment has no interpolated input); JSX auto-escaping with a single, safe `dangerouslySetInnerHTML` (CSS); email template substitution not template-controllable.
- **Tokens:** 32-char CSPRNG tokens, atomic single-use claims in transactions, dual GET/POST expiry checks, neutral enumeration-safe responses with the residual timing channel documented.
- **Access control:** post edit/delete ownership-scoped; post view audience-enforced; profile actions block self-targeting; uploads/deletes prefix-scoped per user in GCS.
- **Performance:** page queries parallelized; point lookups all index-backed; CSS rendered once and cached; static assets versioned/immutable ahead of the auth chain; export zips on worker threads.
- **UX/A11y:** transport-failure flashes; OOB error fragments preserve form input; consistent label/aria wiring via `TextInput` (with tests); native `<dialog>` modals; mobile nav disclosure with focus restoration; `prefers-reduced-motion` respected; coherent dark theme; core palette passes AA on the surfaces actually used.
- **Practices:** flow-test suite is genuinely comprehensive; scripts are manifest-based and honest; CLAUDE.md matched the implementation on every claim checked.
