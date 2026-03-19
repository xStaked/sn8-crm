---
phase: 01-foundation
plan: 03
subsystem: messaging
tags: [whatsapp, kapso, nestjs, adapter, di, jest, typescript]

requires:
  - phase: 01-foundation
    provides: backend NestJS scaffold + ConfigService baseline (01-01)
provides:
  - ChannelAdapter abstraction for provider-agnostic outbound messaging
  - KapsoClient wrapper around @kapso/whatsapp-cloud-api (proxy mode) for sending outbound messages
  - KapsoAdapter implementing ChannelAdapter (sendText/sendTemplate + inbound normalization stub)
  - MessagingService facade that delegates outbound messaging through ChannelAdapter
affects: [01-foundation, webhooks, bot, approvals, instagram-v2]

tech-stack:
  added: []
  patterns:
    - Abstract class used as Nest DI token (`ChannelAdapter`)
    - Provider SDK isolated behind client + adapter (`KapsoClient` + `KapsoAdapter`)
    - Application-facing facade delegates through adapter (`MessagingService` -> `ChannelAdapter`)

key-files:
  created:
    - apps/backend/src/channels/channel.adapter.ts
    - apps/backend/src/channels/channels.module.ts
    - apps/backend/src/channels/kapso/kapso.client.ts
    - apps/backend/src/channels/kapso/kapso.adapter.ts
    - apps/backend/src/channels/kapso/normalized-message.interface.ts
    - apps/backend/src/channels/kapso/kapso.adapter.spec.ts
    - apps/backend/src/messaging/messaging.service.ts
    - apps/backend/src/messaging/messaging.module.ts
    - apps/backend/src/messaging/messaging.service.spec.ts
  modified:
    - apps/backend/tsconfig.json

key-decisions:
  - "Use ChannelAdapter abstract class as the DI token to keep later phases provider-agnostic"
  - "Kapso outbound uses Kapso proxy baseUrl + KAPSO_API_KEY + KAPSO_PHONE_NUMBER_ID; throw a clear error if unset"

patterns-established:
  - "Outbound flow: MessagingService -> ChannelAdapter -> KapsoAdapter -> KapsoClient -> WhatsAppClient.messages.*"

requirements-completed: [INFRA-04]

duration: 8m
completed: 2026-03-18
---

# Phase 1: Foundation Summary

**Provider-agnostic outbound WhatsApp messaging via `MessagingService` facade backed by a `ChannelAdapter` abstraction and Kapso adapter/client wiring.**

## Performance

- **Duration:** 8m
- **Started:** 2026-03-18T20:46:00Z
- **Completed:** 2026-03-18T20:54:14Z
- **Tasks:** 2
- **Files modified:** 10

## Accomplishments

- Added `ChannelAdapter` as a stable abstraction for outbound messaging and inbound normalization.
- Implemented Kapso outbound delivery via `KapsoClient` (SDK wrapper) + `KapsoAdapter` (ChannelAdapter implementation).
- Added `MessagingService` facade so later phases can send outbound messages without importing Kapso-specific code.

## Task Commits

Each task was committed atomically:

1. **Task 1: ChannelAdapter contract and Kapso outbound implementation** - `72a407e` (feat)
2. **Task 2: MessagingService outbound facade** - `43fa27a` (feat)

## Files Created/Modified

- `apps/backend/src/channels/channel.adapter.ts` - Abstract channel contract + `NormalizedMessage` export
- `apps/backend/src/channels/channels.module.ts` - Binds `ChannelAdapter` to `KapsoAdapter` and exports the token
- `apps/backend/src/channels/kapso/kapso.client.ts` - Kapso proxy `WhatsAppClient` wrapper with `sendText` / `sendTemplate`
- `apps/backend/src/channels/kapso/kapso.adapter.ts` - Adapter delegating outbound calls + normalizing inbound payloads
- `apps/backend/src/messaging/messaging.service.ts` - Facade delegating outbound sends via `ChannelAdapter`
- `apps/backend/src/messaging/messaging.module.ts` - Exports `MessagingService` for later phases
- `apps/backend/tsconfig.json` - Excludes `*.spec.ts`/`*.test.ts` from main `tsc --noEmit` verification

## Decisions Made

None beyond what’s captured above; followed the plan as specified.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] `tsc --noEmit` could fail due to Jest globals in non-plan spec files**
- **Found during:** Task 1 verification
- **Issue:** `apps/backend/tsconfig.json` included `*.spec.ts`; unrelated specs required Jest global typings.
- **Fix:** Excluded `**/*.spec.ts` and `**/*.test.ts` from the main tsconfig so the plan’s `npx tsc --noEmit` check is stable.
- **Verification:** `cd apps/backend && npx tsc --noEmit` passes.
- **Committed in:** `72a407e`

---

**Total deviations:** 1 auto-fixed (Rule 3)
**Impact on plan:** Required to make the plan’s TypeScript verification deterministic. No scope creep.

## Issues Encountered

- `ts-jest` emits a warning about `isolatedModules` deprecation due to existing `apps/backend/jest.config.cjs` config; tests still pass.

## User Setup Required

None (no external Kapso credentials were configured as part of this plan).

## Next Phase Readiness

- Ready for `01-04` to accept inbound Kapso webhooks and enqueue processing, using the same normalization contract.
- Ready for later bot workflows to send outbound WhatsApp messages by injecting `MessagingService`.

## Self-Check: PASSED

- `git log --oneline --all --grep="feat(01-03):"` returns the two expected task commits.
- Plan verification commands executed successfully (`tsc` + targeted `jest` specs).

---
*Phase: 01-foundation*
*Completed: 2026-03-18*

