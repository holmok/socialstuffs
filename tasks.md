# Tasks — from the 2026-08-09 audit

Prioritized, reasonably small chunks. IDs reference [audit.md](audit.md). Effort: S ≈ under an hour, M ≈ a half-day.

## P0 — Security holes & bugs

- [ ] **1. Lock down data-export ZIPs** (SEC-1, M) — serve exports via an authenticated streaming route (or V4 signed URLs + random path segment); stop writing them to the public image bucket. `server/api/user-data-api.ts`, `server/routes/user-routes.ts`, `templates/pages/user/data.tsx`
- [ ] **2. Require current password for sensitive changes** (SEC-2, M) — add a current-password field to settings; verify before password change, email change, and account deletion. `templates/components/user/settings-form.tsx`, `server/routes/user-routes.ts`
- [ ] **3. Fix settings self-match uniqueness bug** (PP-1, S) — exclude the current user's id from the in-use checks; share one username-normalize helper with sign-up. `server/routes/user-routes.ts:228-255`
- [ ] **4. Restrict `linkUrl` to http/https** (SEC-3, S) — tighten the Zod schema (and optionally scheme-check at render). `server/routes/post-routes.ts:27`
- [ ] **5. Set `maxRequestBodySize` on Bun.serve (~25MB)** (SEC-6, S) — closes the 128MB pre-check buffering window. `server/index.ts`
- [ ] **6. Cap decoded image dimensions** (PERF-1, S) — reject images over ~8000px/side after decode, before resize. `server/api/image-api.ts`
- [ ] **7. Fix `throw new Response` → `HTTPException`** (PP-2, S) — five sites in `server/routes/user-routes.ts`

## P1 — High-impact quick wins

- [ ] **8. Add resend-validation escape hatch** (UX-1, S) — link on the sign-in form footer + pending-status error. `templates/components/sign-in-form.tsx`, `server/routes/sign-in-routes.ts`
- [ ] **9. Stop auto-dismissing error flashes** (UX-7, S) — skip the 10s timer for `.flash-error`. `static/js/flash.js`
- [ ] **10. Drop the feed/profile count query** (PERF-2, S) — fetch `POSTS_PER_PAGE + 1` rows, derive `hasOlder`. `server/routes/public-routes.ts`, `server/routes/profile-routes.ts`
- [ ] **11. Index migration for feed/profile sorts** (PERF-3, S) — `(status, created DESC, id DESC)` + `(userUid, created DESC)` on posts; drop the standalone status index. New file in `migrations/`
- [ ] **12. kvStorage + nullability migration** (PERF-7, PP-7, S) — drop duplicate `idx_kvStorage_key`, add expires index; `SET NOT NULL` on `comments.post_id`, `kv_storage.value`, `posts.updated`. New file in `migrations/`
- [ ] **13. A11y naming pass** (UI-1, UI-2, UI-8, S) — aria-labels on lightbox links + lightbox dialog, `aria-labelledby` on confirm dialogs, real label on the delete-confirm input. `templates/pages/*`, `static/js/lightbox.js`
- [ ] **14. Single user lookup per request** (PERF-4, S) — `authorize()` caches the full row; `getUser()` returns it. `server/middleware/auth-middleware.ts`
- [ ] **15. Add HSTS + Referrer-Policy** (SEC-8, S) — `server/server.ts` secureHeaders options
- [ ] **16. Trusted-proxy IP resolution for the rate limiter** (SEC-4, M) — honor XFF only behind a configured trusted proxy; document the deployment invariant. `server/middleware/rate-limit-middleware.ts`
- [ ] **17. Stop logging user content and emails** (SEC-9, S) — log length/category in language-api; drop or redact emails on auth paths. `server/api/language-api.ts`, auth routes
- [ ] **18. Hoist Vision client + parallelize the upload path** (PERF-5, S) — client to constructor; `Promise.all` moderation/image work and the GCS delete loop. `server/api/image-api.ts`, `server/routes/post-routes.ts`

## P2 — Flow & consistency improvements

- [ ] **19. Full-page renders for no-JS form errors** (UX-2, M) — shared helper that branches on `HX-Request`: fragment vs. full page. All form routes
- [ ] **20. Return-to destination through sign-in** (UX-3, M) — stash the 401'd path; honor on sign-in success. `server/middleware/error-middleware.ts`, `server/routes/sign-in-routes.ts`
- [ ] **21. New Post in nav + empty-feed CTA** (UX-4, S) — `templates/components/navigation.tsx`, `templates/pages/home-user.tsx`
- [ ] **22. Post actions return you to where you were** (UX-5, S/M) — validated return param through edit links; land on the post page after create. `server/routes/post-routes.ts`, `templates/pages/profile/user.tsx`
- [ ] **23. Warn when a picked file is dropped on error re-render** (UX-6, S) — "your photo needs to be re-selected" note. `server/routes/post-routes.ts`, `server/routes/user-routes.ts`, form components
- [ ] **24. Preserve typed input on 429s** (UX-8, M) — read the body in `onLimit`, re-render with values. Auth routes
- [ ] **25. Sort out GIF handling** (UX-9, S) — stop advertising GIF or state the still-image conversion in the hint. `templates/components/post/post-form.tsx`, accept lists
- [ ] **26. Consolidate duplicated route helpers** (PP-3, S) — `displayImageUrl`, image constants, `POSTS_PER_PAGE`, token TTL → shared module; reuse `utils.passwordSchema` in recover-password. Four route files + `server/utils.ts`
- [ ] **27. Extract shared moderation/upload helpers** (PP-4, M) — `moderateFields` + `validateAndUploadImage` used by both post and profile forms. `server/routes/post-routes.ts`, `server/routes/user-routes.ts`
- [ ] **28. Extract token check/claim helpers** (PP-5, M) — shared across validate-account and recover-password; add the missing freshness predicate to validate-account. `server/routes/sign-up-routes.ts`, `server/routes/recover-password-routes.ts`
- [ ] **29. Heading hierarchy** (UI-3, S) — h1 on the four /user pages and the post view. `templates/pages/user/*`, `templates/pages/post/view.tsx`
- [ ] **30. Restore focus after HTMX swaps** (UI-4, M) — delegated `htmx:afterSwap` refocus of the first `[aria-invalid]` input / swapped action button. New snippet in `static/js/`
- [ ] **31. Mobile footer + touch targets** (UI-5, UI-6, S) — auto-height footer under 640px; min-height bumps on flash-close, profile actions, tabs, pagination. `server/styles/css/*`
- [ ] **32. Shared flash region for OOB errors** (UX-12, S) — permanent `#flash-region` in the layout; OOB `beforeend` into it. `templates/layouts/main-layout.tsx`, `templates/components/error-oob-fragment.tsx`
- [ ] **33. Post photo alt text** (UI-7, S now / M proper) — generic "Photo posted by {author}" now; optional alt field on the post form later. Post render sites
- [ ] **34. Guard the comment cap atomically** (PP-11, S) — guarded insert or transaction; reuse one count builder; drop the view's redundant count. `server/routes/post-routes.ts`
- [ ] **35. Comment anchor on redirect** (UX-11, S) — `#comment-<uid>` + ids on comment items. `server/routes/post-routes.ts`, `templates/pages/post/view.tsx`
- [ ] **36. DB re-check on the home feed** (SEC-5, S) — apply the authorize-style status/pwv check to the feed branch. `server/routes/public-routes.ts`

## P3 — Cleanups & polish

- [ ] **37. Remove dead code** (PP-8, S) — drop `cachedQueries` (migration), delete `templates/pages/user.tsx`, remove the `DenormalizedInfo` scrub. `migrations/`, `server/api/user-data-api.ts`
- [ ] **38. Session tests + renderCSS test + info-page smoke** (PP-9, M) — `server/middleware/session-middleware.test.ts`, `server/styles/index.test.ts`
- [ ] **39. Type `users.info` properly** (PP-6, M) — kill the ~10 `as UserProfileInfo` casts via the table type or one owning accessor. `server/data/user-data.ts` + call sites
- [ ] **40. One form-parsing helper + one error-handling rule** (PP-10, M) — `formStrings()`; align sign-in/sign-up try/catch style with the rest. Auth + form routes
- [ ] **41. Copy fixes** (UX-10, S) — success/info flash consistency, sign-in placeholder, upfront password-rule hint, marketing audience sentence, styled CSRF 403.
- [ ] **42. Style mixins** (UI-9, M) — `hairline`, `avatar(size)`, accent button, card surface in a `_mixins.ts`; scope form-style's bare `h1` rule; drop empty `src=""`; decide on the CSS-nesting browser baseline.
- [ ] **43. AT feedback details** (UI-8, S) — un-hide the "Working…" indicators as `aria-live=polite`, wire char counters via `aria-describedby` + live region, add a skip-to-content link.
- [ ] **44. Rotate/clear session across auth boundary** (SEC-7, S) — fresh id on sign-in; clear cookie + kv rows on sign-out. `server/middleware/auth-middleware.ts`, `session-middleware.ts`
- [ ] **45. Flash pop fast-path** (PERF-6, M) — "has-flash" cookie gate before the kv DELETE-per-page-render. `server/middleware/flash-middleware.ts`
- [ ] **46. Bound the favorites strip & export downloads** (PERF-8, M) — LIMIT + "see all"; bounded-concurrency image fetches. `server/routes/profile-routes.ts`, `server/api/user-data-api.ts`
- [ ] **47. Lazy rate-limiter sweep** (PERF-9, S) — stop iterating the whole map per request. `server/middleware/rate-limit-middleware.ts`
- [ ] **48. Housekeeping** (PP-12, S) — move delete-modal CSS out of the `user` bundle, derive the `style` union from `stylesMap`, verify/document the `dotenv` dep, note migration conventions (timestamptz, index naming) in CLAUDE.md.
