---
phase: 05-frontend-integration-with-current-backend
plan: 03
subsystem: ui
tags: [nextjs, react, swr, crm, auth, conversations]
requires:
  - phase: 05-01
    provides: authenticated conversation summaries endpoint and frontend/backend contract baseline
  - phase: 05-02
    provides: authenticated conversation history endpoint and stable conversation id contract
provides:
  - Backend-backed inbox summaries in the CRM shell
  - Backend-backed message history rendering in the detail panel
  - Auth-aware frontend fetch handling for expired CRM sessions
affects: [phase-05, frontend-shell, auth-navigation, conversations]
tech-stack:
  added: []
  patterns:
    - Centralized authenticated JSON fetches via src/lib/api.ts
    - SWR hooks expose explicit UI states instead of silently masking API failures
key-files:
  created:
    - apps/web/src/hooks/use-conversation-messages.ts
  modified:
    - apps/web/src/lib/api.ts
    - apps/web/src/types/conversation.ts
    - apps/web/src/hooks/use-conversations.ts
    - apps/web/src/components/shell/conversation-list.tsx
    - apps/web/src/components/shell/detail-panel.tsx
key-decisions:
  - "Frontend CRM reads treat backend 401s as session expiry and route back to /login."
  - "Production inbox/detail views must expose loading, empty, unauthorized, and generic failure states instead of falling back to canned mock data."
patterns-established:
  - "Conversation hooks share typed DTOs and central API helpers so the shell does not duplicate raw fetch logic."
  - "Shell panels render explicit backend state feedback while preserving the existing query-param selection model."
requirements-completed: [FE-BE-01, FE-BE-02, FE-BE-03]
duration: 5min
completed: 2026-03-18
---

# Phase 5 Plan 03: Frontend inbox and detail integration summary

**SWR-backed CRM inbox summaries and chronological message history now load from the current backend with auth-aware redirects and explicit failure states**

## Performance

- **Duration:** 5 min
- **Started:** 2026-03-18T23:32:00Z
- **Completed:** 2026-03-18T23:36:56Z
- **Tasks:** 2
- **Files modified:** 6

## Accomplishments
- Replaced the production mock inbox path with typed backend summaries fetched through the shared API helper.
- Added a real message-history hook and rendered chronological backend messages inside the existing detail panel.
- Preserved CRM auth flow by redirecting expired sessions to `/login` from frontend read hooks and keeping logout behavior intact.

## Task Commits

Each task was committed atomically:

1. **Task 1: Replace mock inbox fallback with real conversation summaries** - `1fb7bb6` (feat)
2. **Task 2: Wire the detail panel to real message history** - `23ce3eb` (feat)

## Files Created/Modified
- `apps/web/src/lib/api.ts` - Added typed API errors and JSON fetch helper for authenticated frontend reads.
- `apps/web/src/types/conversation.ts` - Centralized summary/message DTOs and explicit UI state types.
- `apps/web/src/hooks/use-conversations.ts` - Switched inbox loading to SWR + real backend data with auth/error state handling.
- `apps/web/src/hooks/use-conversation-messages.ts` - Added SWR-backed conversation history fetcher keyed by selected conversation id.
- `apps/web/src/components/shell/conversation-list.tsx` - Rendered loading, empty, unauthorized, and backend failure states without production mock fallback.
- `apps/web/src/components/shell/detail-panel.tsx` - Replaced placeholder copy with chronological backend message rendering and matching panel states.

## Decisions Made
- Redirect frontend read flows to `/login` on backend `401` responses instead of leaving the shell in an ambiguous broken state.
- Keep the existing shell structure and query-param selection behavior intact while replacing only the data source and state handling.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] Cleared stale Next.js build artifacts before production verification**
- **Found during:** Task 2 (Wire the detail panel to real message history)
- **Issue:** `npm run build` failed with `PageNotFoundError: Cannot find module for page: /_document` due to stale local `.next` output, preventing plan verification.
- **Fix:** Isolated the existing `.next` and `.next.prebuild` artifacts, reran a clean build, and moved the stale backups out of the workspace without changing source code.
- **Files modified:** None
- **Verification:** `cd apps/web && npm run build`
- **Committed in:** Not committed (verification environment cleanup only)

---

**Total deviations:** 1 auto-fixed (1 blocking)
**Impact on plan:** The deviation was limited to local build output cleanup required to complete verification. No source-level scope creep.

## Issues Encountered
- `next build` initially failed because stale generated output made Next resolve `/_document` incorrectly. A clean rebuild resolved it and the final production build passed.

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness
- Phase 5 frontend now reads real inbox and history data from the backend while preserving session-aware CRM navigation.
- Plan `05-04` can focus on end-to-end verification for login, inbox, detail, and logout against the running backend.

## Self-Check
PASSED
- Found summary file at `.planning/phases/05-frontend-integration-with-current-backend/05-03-SUMMARY.md`
- Verified frontend task commits `1fb7bb6` and `23ce3eb` in `apps/web`

---
*Phase: 05-frontend-integration-with-current-backend*
*Completed: 2026-03-18*
