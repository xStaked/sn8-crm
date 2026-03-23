---
phase: 02-bot-conversation-engine
plan: 03
subsystem: api
tags: [nestjs, bullmq, whatsapp, kapso, prisma, redis, fsm, ai-sales]
requires:
  - phase: 02-01
    provides: "Redis-backed bot conversation state and durable ConversationState reconstruction"
  - phase: 02-02
    provides: "Interactive greeting routing and MessageProcessor delegation into BotConversationService"
provides:
  - "Greeting free-text classification with safe quote bias"
  - "QUALIFYING delegation into ConversationFlowService from the FSM"
  - "Bounded off-flow guidance, media fallback, and 3-strike human escalation"
affects: [02-04, ai-sales, messaging, whatsapp-routing]
tech-stack:
  added: []
  patterns: ["constrained intent classifier", "off-flow retry counter with escalation", "worker passes non-text fallback through FSM"]
key-files:
  created: ["apps/backend/src/bot-conversation/intent-classifier.service.ts", "apps/backend/src/bot-conversation/prompts/info-services.prompt.ts", "apps/backend/src/bot-conversation/prompts/off-flow.prompt.ts"]
  modified: ["apps/backend/src/bot-conversation/bot-conversation.module.ts", "apps/backend/src/bot-conversation/bot-conversation.service.ts", "apps/backend/src/bot-conversation/bot-conversation.service.spec.ts", "apps/backend/src/bot-conversation/prompts/greeting-messages.ts", "apps/backend/src/messaging/processors/message.processor.ts", "apps/backend/src/messaging/processors/message.processor.spec.ts"]
key-decisions:
  - "Greeting free text uses a constrained classifier with a safe default to quote_project so ambiguous leads continue into qualification."
  - "Off-flow counting stays in BotConversationService, while MessageProcessor only ensures inbound media reaches the FSM instead of being dropped."
  - "INFO_SERVICES remains an informational branch with explicit readiness cues that can re-enter QUALIFYING without reopening Phase 2.1 scope."
patterns-established:
  - "Valid routed turns reset offFlowCount, while invalid or media turns increment it until automatic human escalation."
  - "Media fallback is a first-class outbound decision source (`bot-media-fallback`) rather than a worker-side special case."
requirements-completed: [BOT-02, BOT-03]
duration: 6 min
completed: 2026-03-23
---

# Phase 02 Plan 03: Qualification Routing and Off-Flow Summary

**Greeting free-text intent routing into AI-sales qualification plus bounded off-flow recovery, media fallback, and automatic human escalation**

## Performance

- **Duration:** 6 min
- **Started:** 2026-03-23T15:47:04Z
- **Completed:** 2026-03-23T15:53:00Z
- **Tasks:** 2
- **Files modified:** 9

## Accomplishments
- Added a dedicated greeting intent classifier that routes free-text leads into `quote_project`, `learn_services`, or `human_handoff`, with ambiguity biased toward qualification.
- Delegated valid quote-path turns from the FSM into `ConversationFlowService.planReply(...)` while resetting retry state on successful routing.
- Implemented deterministic off-flow handling with contextual guidance, media-aware text fallback, and automatic escalation to `HUMAN_HANDOFF` on the third consecutive miss.

## Task Commits

Each task was committed atomically:

1. **Task 1: Add greeting intent classification and QUALIFYING delegation** - `8424d87` (feat)
2. **Task 2: Implement off-flow, media fallback, and automatic escalation rules** - `479900a` (feat)

## Files Created/Modified
- `apps/backend/src/bot-conversation/intent-classifier.service.ts` - Adds the constrained greeting classifier with safe quote bias.
- `apps/backend/src/bot-conversation/bot-conversation.service.ts` - Routes greeting free text, resets retry counters on valid turns, handles off-flow/media fallback, and escalates after three misses.
- `apps/backend/src/bot-conversation/prompts/info-services.prompt.ts` - Centralizes the bounded informational branch copy.
- `apps/backend/src/bot-conversation/prompts/off-flow.prompt.ts` - Defines retry-limit and fallback builders for contextual guidance and media responses.
- `apps/backend/src/messaging/processors/message.processor.ts` - Allows inbound non-text payloads to continue into the FSM fallback path while keeping owner/command guards intact.
- `apps/backend/src/bot-conversation/bot-conversation.service.spec.ts` - Covers greeting classification, retry increments, media fallback, and 3-strike escalation.
- `apps/backend/src/messaging/processors/message.processor.spec.ts` - Verifies inbound media now reaches the FSM and sends the approved text-only fallback.

## Decisions Made

- Used a narrow classifier contract inside the bot module instead of widening the Phase 2.1 AI-sales provider surface.
- Kept off-flow semantics in the FSM so retry state remains durable and auditable across transports and worker retries.
- Preserved INFO_SERVICES as a separate branch, only returning to QUALIFYING on explicit readiness cues instead of auto-pushing every informational turn into sales discovery.

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered

None.

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness

- Phase 2 can now recover from free-text greeting turns, messy informational replies, and media uploads without leaving the lead unanswered.
- Plan 02-04 can build on stable FSM routing contracts (`bot-off-flow`, `bot-media-fallback`, retry resets, and handoff escalation) instead of reopening worker or AI-sales boundaries.

## Self-Check: PASSED

- Verified `.planning/phases/02-bot-conversation-engine/02-03-SUMMARY.md` exists.
- Verified task commits `8424d87` and `479900a` exist in git history.

---
*Phase: 02-bot-conversation-engine*
*Completed: 2026-03-23*
