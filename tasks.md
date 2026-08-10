# Tasks — from the 2026-08-09 audit

Prioritized, reasonably small chunks. IDs reference [audit.md](audit.md). Effort: S ≈ under an hour, M ≈ a half-day.

## P0 — Security holes & bugs (all done 2026-08-09)

- [x] **1. Lock down data-export ZIPs** (SEC-1, M) — export paths now carry a 32-char random token (capability URL, same model as image filenames); older exports — including legacy predictable paths — are deleted on the next export, and account deletion's glob covers both formats. `server/api/user-data-api.ts`
- [x] **2. Require current password for sensitive changes** (SEC-2, M) — settings verifies the current password before email/password changes; the delete-account modal requires the password alongside typing "delete", re-verified server-side. `templates/components/user/settings-form.tsx`, `templates/pages/user/data.tsx`, `static/js/delete-confirm.js`, `server/routes/user-routes.ts`
- [x] **3. Fix settings self-match uniqueness bug** (PP-1, S) — in-use checks exclude the current user's id; `utils.normalizeUsername` shared with sign-up. `server/routes/user-routes.ts`, `server/utils.ts`
- [x] **4. Restrict `linkUrl` to http/https** (SEC-3, S) — Zod schema now protocol-restricted. `server/routes/post-routes.ts`
- [x] **5. Set `maxRequestBodySize` on Bun.serve (25MB)** (SEC-6, S) — `server/index.ts`
- [x] **6. Cap decoded image dimensions** (PERF-1, S) — 8000px/side, enforced by a header-only probe (PNG/GIF/JPEG) *before* decode so a decompression bomb never allocates, with a post-decode backstop. `server/api/image-api.ts`
- [x] **7. Fix `throw new Response` → `HTTPException`** (PP-2, S) — five sites in `server/routes/user-routes.ts`

## P1 — High-impact quick wins (all done 2026-08-09)

- [x] **8. Add resend-validation escape hatch** (UX-1, S) — "Resend it" link in the sign-in footer; pending-status error points at it. `templates/components/sign-in-form.tsx`, `server/routes/sign-in-routes.ts`
- [x] **9. Stop auto-dismissing error flashes** (UX-7, S) — `.flash-error` items keep their close button but no timer. `static/js/flash.js`
- [x] **10. Drop the feed/profile count query** (PERF-2, S) — both routes fetch `POSTS_PER_PAGE + 1` rows and derive `hasOlder` from the extra row.
- [x] **11. Index migration for feed/profile sorts** (PERF-3, S) — `migrations/1786330471000_posts-feed-indexes.ts`, applied.
- [x] **12. kvStorage + nullability migration** (PERF-7, PP-7, S) — `migrations/1786330472000_kv-index-and-not-nulls.ts`, applied (with stray-NULL cleanup before each `SET NOT NULL`).
- [x] **13. A11y naming pass** (UI-1, UI-2, S) — lightbox links labeled + `aria-haspopup`, lightbox dialog named, confirm dialogs `aria-labelledby`, delete-confirm input labeled.
- [x] **14. Single user lookup per request** (PERF-4, S) — `auth.getUserRow()` memoizes the full row; `authorize()` and `getUser()` share it.
- [x] **15. ~~Add HSTS + Referrer-Policy~~** (SEC-8, S) — finding was inaccurate: hono's defaults already send both (verified on the wire); HSTS now pinned explicitly at one year. See the correction in audit.md.
- [x] **16. Trusted-proxy IP resolution** (SEC-4, M) — new required `TRUST_PROXY` env var; XFF honored only when true, socket peer otherwise. `server/middleware/rate-limit-middleware.ts`, `server/config.ts`
- [x] **17. Stop logging user content and emails** (SEC-9, S) — language-api logs length/category only; email fields dropped from auth-path logs.
- [x] **18. Hoist Vision client + parallelize deletes** (PERF-5, S) — client lives on the API instance; GCS delete loop is `Promise.all`. Deliberately kept text moderation *before* image upload (overlapping them would orphan uploaded files when text is flagged) — revisit with the P2 pipeline refactor (task 27).

## P2 — Flow & consistency improvements (all done 2026-08-09 via PRs #40–#44)

Merge order: **#42 → #43 → #44 → #40 → #41 → docs PR** (#43 and #44 are stacked on #42's branch).

- [x] **19. Full-page renders for no-JS form errors** (UX-2, M) — `utils.formErrorResponse` branches on `HX-Request`; every form error path renders a full page for plain posts. *(PR #42)*
- [x] **20. Return-to destination through sign-in** (UX-3, M) — 401s carry a validated `?next=` through sign-in; open-redirects rejected. *(PR #40)*
- [x] **21. New Post in nav + empty-feed CTA** (UX-4, S) — nav item for signed-in users; empty feed links to /posts/new. *(PR #40)*
- [x] **22. Post actions return you to where you were** (UX-5, S/M) — validated `?return=` through edit/delete; published creates land on the new post's page. *(PR #43)*
- [x] **23. Warn when a picked file is dropped on error re-render** (UX-6, S) — "Your photo needs to be re-selected." note when a failed submit carried a file. *(PR #42)*
- [x] **24. Preserve typed input on 429s** (UX-8, M) — `onLimit` handlers re-render with the typed values (passwords never echoed). *(PR #42)*
- [x] **25. Sort out GIF handling** (UX-9, S) — hints now state that animated GIFs become a still image. *(PR #42)*
- [x] **26. Consolidate duplicated route helpers** (PP-3, S) — `displayImageUrl`, `POSTS_PER_PAGE`, `TOKEN_TTL_MS` in utils; recover-password composes `utils.passwordSchema`. *(PR #42)*
- [x] **27. Extract shared moderation/upload helpers** (PP-4, M) — `server/routes/form-helpers.ts`: `moderateFields` + `validateAndUploadImage`, used by post + profile forms. *(PR #42)*
- [x] **28. Extract token check/claim helpers** (PP-5, M) — `server/routes/token-helpers.ts`: `checkToken`/`claimToken` over both token tables; validate-account gained the freshness predicate. *(PR #44)*
- [x] **29. Heading hierarchy** (UI-3, S) — h1 on the four /user pages *(PR #41)* and the post view *(PR #43)*.
- [x] **30. Restore focus after HTMX swaps** (UI-4, M) — `static/js/focus-restore.js`: first `[aria-invalid]` input, else swapped profile-action button. *(PR #41)*
- [x] **31. Mobile footer + touch targets** (UI-5, UI-6, S) — static auto-height footer on mobile; ≥32–41px hit areas on flash-close/actions/tabs/pagination. *(PR #41)*
- [x] **32. Shared flash region for OOB errors** (UX-12, S) — permanent `#flash-region` in the layout; OOB errors append into it; transport errors reuse it. *(PR #41)*
- [x] **33. Post photo alt text** (UI-7, S) — `utils.postPhotoAlt(authorName)` on all post images; alt form field remains future work. *(PR #43)*
- [x] **34. Guard the comment cap atomically** (PP-11, S) — `FOR UPDATE` on the post row serializes comment inserts; redundant view count dropped. *(PR #43)*
- [x] **35. Comment anchor on redirect** (UX-11, S) — comments carry `id="comment-<uid>"`; redirect targets the new comment's anchor. *(PR #43)*
- [x] **36. DB re-check on the home feed** (SEC-5, S) — revoked/banned users get signed out and see the anonymous home page immediately. *(PR #40)*

## P3 — Cleanups & polish (all done 2026-08-10 via PRs #46–#50)

Merge order: **#46 → #47 → #48 → #49 → #50 (docs)**. Each code PR was written by an implementer agent and adversarially reviewed (with fixes) before opening.

- [x] **37. Remove dead code** (PP-8, S) — `cachedQueries` dropped via migration (faithful `down()`), `templates/pages/user.tsx` deleted, `DenormalizedInfo` scrub removed (git-history pickaxe confirmed no writer ever existed). *(PR #46)*
- [x] **38. Session tests + renderCSS test + info-page smoke** (PP-9, M) — session-middleware tests in *(PR #47)*; renderCSS unit tests + info-page smoke tests in *(PR #48)*.
- [x] **39. Type `users.info` properly** (PP-6, M) — column typed `UserProfileInfo & UserMeta`; all 11 casts removed; copy-before-mutate fixed. *(PR #46)*
- [x] **40. One form-parsing idiom + one error-handling rule** (PP-10, M) — `utils.formStrings` at all six cast sites; sign-in/sign-up/reset-POST catch-alls removed so unexpected throws hit the errorHandler (deliberate catches kept and commented). *(PR #49)*
- [x] **41. Copy fixes** (UX-10, S) — success/info flash consistency, sign-in placeholder, upfront password-rule notes, four-audience marketing copy, styled CSRF 403 via new `csrfProtect()` middleware. *(PR #48)*
- [x] **42. Style mixins + flattened renderCSS** (UI-9, M) — `_mixins.ts` (hairline/avatar/accent-button/card-surface), form-style `h1` scoped to `.form-heading`, empty `src` dropped, and renderCSS now emits flat descendant selectors (older-browser safe; CSS-parity diff showed zero unintended changes). *(PR #48)*
- [x] **43. AT feedback details** (UI-8, S) — "Working…" indicators are polite live regions, char counters wired via `aria-describedby` + live region, skip-to-content link added. *(PR #48)*
- [x] **44. Rotate/clear session across auth boundary** (SEC-7, S) — `session.rotate()` on sign-in and inside `signOut()`; review pass also hardened the kv-row cleanup against LIKE metacharacters. *(PR #47)*
- [x] **45. Flash pop fast-path** (PERF-6, M) — marker cookie set by `addFlash`; `getFlashes` skips the kv DELETE when absent. *(PR #47)*
- [x] **46. Bound the favorites strip & export downloads** (PERF-8, M) — strip capped at 20 with an "…and more" indicator; export images download 4-at-a-time (chunk-boundary test added in review). *(PR #46)*
- [x] **47. Lazy rate-limiter sweep** (PERF-9, S) — per-key eviction on access + time-gated/at-cap full sweeps; security properties test-locked. *(PR #47)*
- [x] **48. Housekeeping** (PP-12, S) — modal/danger-button/form-note CSS moved to global, `style` union derived from `stylesMap` *(PR #48)*; `dotenv` dep documented and migration conventions noted in CLAUDE.md *(PR #50, docs)*.
