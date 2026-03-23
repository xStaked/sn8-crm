---
phase: 02-bot-conversation-engine
plan: 02
subsystem: api
tags: [nestjs, bullmq, whatsapp, kapso, prisma, redis, fsm]
requires:
  - phase: 02-01
    provides: "Redis-backed bot conversation repository and durable ConversationState backup"
provides:
  - "Interactive greeting button transport and inbound button normalization"
  - "BotConversationService routing for greeting, info-services, qualifying resume, and human handoff"
  - "MessageProcessor integration through the bot conversation FSM boundary"
affects: [02-03, 02-04, ai-sales, messaging, kapso]
tech-stack:
  added: []
  patterns: ["state-aware worker routing", "dedicated human handoff notifier", "interactive button channel contract"]
key-files:
  created: ["apps/backend/src/bot-conversation/human-handoff.service.ts", "apps/backend/src/bot-conversation/prompts/greeting-messages.ts"]
  modified: ["apps/backend/src/channels/channel.adapter.ts", "apps/backend/src/channels/kapso/kapso.client.ts", "apps/backend/src/channels/kapso/kapso.adapter.ts", "apps/backend/src/channels/kapso/normalized-message.interface.ts", "apps/backend/src/messaging/messaging.service.ts", "apps/backend/src/messaging/processors/message.processor.ts", "apps/backend/src/bot-conversation/bot-conversation.service.ts", "apps/backend/src/bot-conversation/bot-conversation.module.ts"]
key-decisions:
  - "Greeting transport uses a narrow reply-button contract instead of a generic interactive builder."
  - "MessageProcessor persists outbound bot replies with source, state, and kind metadata while delegating routing to BotConversationService."
  - "Human handoff owner alerts use a dedicated notifier that reuses MessagingService plus Prisma persistence without calling OwnerReviewService."
patterns-established:
  - "Inbound WhatsApp button taps are normalized into interactiveReply id/title plus messageType before worker routing."
  - "Phase 2 routing decisions return explicit outbound plans (text vs interactive-buttons) that the worker executes and persists."
requirements-completed: [BOT-01, BOT-04]
duration: 9 min
completed: 2026-03-23
---

# Phase 02 Plan 02: Greeting/Menu Routing Summary

**Interactive WhatsApp greeting buttons, state-aware bot routing, and worker-to-FSM integration for first-contact, resume, info-services, and human-handoff flows**

## Performance

- **Duration:** 9 min
- **Started:** 2026-03-23T15:34:00Z
- **Completed:** 2026-03-23T15:43:07Z
- **Tasks:** 2
- **Files modified:** 10

## Accomplishments
- Added truthful Phase 2 greeting transport support with reply buttons on the channel and messaging abstractions.
- Expanded inbound normalization so the router can distinguish text, media, and interactive button taps with explicit reply metadata.
- Routed `MessageProcessor` auto-replies through `BotConversationService`, including new/expired greetings, active QUALIFYING resume, INFO_SERVICES responses, and HUMAN_HANDOFF owner/customer messaging.

## Task Commits

Each task was committed atomically:

1. **Task 1: Extend the channel contracts for interactive greeting buttons and inbound button normalization** - `c31feb6` (feat)
2. **Task 2: Route first-contact, returning, info-services, and human-handoff messages through the FSM service** - `f4656ba` (feat)

## Files Created/Modified
- `apps/backend/src/channels/channel.adapter.ts` - Added the narrow interactive button outbound contract.
- `apps/backend/src/channels/kapso/kapso.client.ts` - Implemented Kapso reply-button sending against the SDK’s `sendInteractiveButtons(...)` helper.
- `apps/backend/src/channels/kapso/kapso.adapter.ts` - Normalized inbound message type and button reply metadata for routing.
- `apps/backend/src/messaging/messaging.service.ts` - Exposed interactive button sends to higher-level services.
- `apps/backend/src/messaging/processors/message.processor.ts` - Swapped direct AI-sales reply planning for `BotConversationService` decisions and persisted state-aware outbound metadata.
- `apps/backend/src/bot-conversation/bot-conversation.service.ts` - Added greeting, resume, info-services, qualifying, and human-handoff routing behavior.
- `apps/backend/src/bot-conversation/human-handoff.service.ts` - Added dedicated owner notification with the same outbound persistence pattern used elsewhere.
- `apps/backend/src/bot-conversation/prompts/greeting-messages.ts` - Centralized locked Phase 2 greeting buttons and copy variants.

## Decisions Made

- Kept the channel abstraction narrow to Phase 2 needs: reply buttons only, not a generic interactive flow API.
- Used button ids `QUOTE_PROJECT`, `INFO_SERVICES`, and `HUMAN_HANDOFF` as the routing contract between transport normalization and the FSM.
- Let the worker own outbound delivery/persistence while `BotConversationService` owns state transitions and outbound decisions.

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered

- Parallel `git add` calls intermittently created `.git/index.lock`; staging was completed safely with single-command retries and did not affect repository content.

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness

- Phase 2 now has a real greeting/menu entry layer with durable state-aware routing in front of `ConversationFlowService`.
- Plan 02-03 can build on the normalized `messageType` and `interactiveReply` contract for off-flow handling, media fallback, and deeper QUALIFYING behavior without reopening the worker/channel seams.

## Self-Check: PASSED

- Verified `.planning/phases/02-bot-conversation-engine/02-02-SUMMARY.md` exists.
- Verified task commits `c31feb6` and `f4656ba` exist in git history.

---
*Phase: 02-bot-conversation-engine*
*Completed: 2026-03-23*
