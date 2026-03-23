# Phase 2: Bot Conversation Engine - Research

**Researched:** 2026-03-23
**Domain:** Redis-backed conversation FSM, WhatsApp greeting/menu routing, qualification orchestration, and recovery semantics
**Confidence:** HIGH

## Summary

Phase 2 should not replace the current AI-sales flow. The repo already has a working `ConversationFlowService` that extracts a commercial brief, continues discovery, and hands qualified conversations into Phase 2.1 quote orchestration. The missing capability is the routing layer in front of that service: a durable bot conversation state machine that decides when to greet, when to show service information, when to hand off to a human, when to continue qualification, and how to recover after restarts or idle expiry.

The current `MessageProcessor` still persists every inbound message and then immediately calls `conversationFlowService.planReply(...)` inline for any non-owner inbound text. That is too flat for Phase 2. It cannot distinguish first contact from returning lead, cannot keep off-flow retry counters, cannot send a reply-button greeting, and cannot recover stage-specific state from Redis or the database.

The correct planning shape is:

1. Add a dedicated bot-conversation domain with durable state in Redis plus database backup.
2. Insert a routing boundary between `MessageProcessor` and the existing AI-sales qualification flow.
3. Add greeting/info/handoff states and outbound interactive-message support.
4. Add recovery rules so active conversations resume, expired conversations re-greet, and Redis loss can be reconstructed from the database.

One important nuance emerged during research: the roadmap summary says Phase 2 is "sin IA", but the locked context for this phase explicitly chose AI-assisted intent classification, AI-assisted off-flow redirection, and delegation into the already-implemented AI discovery flow. The practical interpretation is: Phase 2 does not introduce new quote-generation scope, but it may reuse the existing AI layer for bounded routing and qualification behavior. Plans should preserve that boundary rather than trying to force a fully non-AI implementation that contradicts the approved context.

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|-----------------|
| BOT-01 | El bot responde automáticamente a mensajes entrantes con saludo y menú de opciones | Requires a first-contact/expired-contact detector, outbound interactive reply-button support, and a GREETING state persisted by conversation identity |
| BOT-02 | El bot guía al cliente a través de un flujo de calificación (nombre, tipo de proyecto, descripción, presupuesto aproximado) | Requires QUALIFYING state routing that delegates to the existing `ConversationFlowService` without losing state ownership |
| BOT-03 | El bot maneja mensajes inesperados o fuera de flujo con respuestas por defecto apropiadas | Requires off-flow counters, contextual redirect behavior, media fallback, and automatic escalation after repeated failures |
| BOT-04 | El estado de la conversación persiste entre mensajes (flujo no se reinicia con cada mensaje) | Requires Redis primary storage plus database backup/reconstruction keyed by stable conversation identity |
</phase_requirements>

## Current Codebase Findings

### What already exists

#### 1. Inbound transport and transcript persistence are already solid

- `apps/backend/src/webhooks/webhooks.service.ts`
  - Reserves idempotency keys in Redis.
  - Enqueues inbound work into BullMQ queue `incoming-messages`.
- `apps/backend/src/messaging/processors/message.processor.ts`
  - Normalizes inbound payloads through `ChannelAdapter`.
  - Persists inbound rows in Prisma `Message`.
  - Skips owner commands and non-text auto-replies.

Implication:
- Phase 2 does not need a new ingestion path. It needs a smarter decision layer after persistence.

#### 2. Redis infrastructure already exists, but only as a raw client

- `apps/backend/src/redis/redis.module.ts`
  - Exposes `REDIS_CLIENT` globally via `ioredis`.

Implication:
- The repo already has the dependency needed for active-session storage.
- What is missing is a bot-conversation repository/service that owns key naming, serialization, TTL, and fallback behavior.

#### 3. The qualification + AI-sales flow is already implemented

- `apps/backend/src/ai-sales/conversation-flow.service.ts`
  - Reads transcript history from `ConversationsService`.
  - Extracts or updates `CommercialBrief`.
  - Continues discovery when fields are missing.
  - Enqueues Phase 2.1 quote work once the brief is complete.
- `apps/backend/src/ai-sales/ai-sales.orchestrator.ts`
  - Handles the post-qualification queue handoff and owner review request.

Implication:
- QUALIFYING should delegate to this flow rather than re-implementing discovery logic inside Phase 2.

#### 4. Owner notification and outbound send patterns already exist

- `apps/backend/src/ai-sales/owner-review.service.ts`
  - Sends internal WhatsApp notifications to the owner and persists outbound `Message` rows.
- `apps/backend/src/messaging/messaging.service.ts`
  - Wraps channel sends with stable `sendText(...)`.

Implication:
- HUMAN_HANDOFF should reuse this notification/persistence pattern instead of inventing a second outbound path.

### What does NOT exist yet

#### 1. No bot conversation state model or repository

There is no `ConversationState`-style Prisma model and no domain module under `apps/backend/src/` for bot routing. Redis is used for webhook idempotency only, not for durable conversational stage.

Implication:
- Phase 2 must introduce first-class bot state, not scatter state fields across unrelated services.

#### 2. No interactive outbound contract

The locked context explicitly asks for WhatsApp reply buttons in the greeting, but the current channel abstraction only exposes:

- `sendText(...)`
- `sendTemplate(...)`
- `normalizeInbound(...)`

There is no `sendInteractiveButtons(...)` or equivalent in `ChannelAdapter`, `KapsoAdapter`, or `KapsoClient`.

Implication:
- Greeting UX cannot be implemented honestly without extending the outbound channel contract.

#### 3. No inbound normalized contract for button taps or media kind

The current normalized message seam only carries:

- `externalMessageId`
- `direction`
- `fromPhone`
- `toPhone`
- `body`
- `channel`
- `rawPayload`

Adapter coverage already proves some non-text payloads normalize to `body: null`, and there is no field that captures:

- message kind (`text`, `image`, `interactive`, etc.)
- reply-button selection id/title

Implication:
- Phase 2 cannot route greeting button taps or implement media fallback cleanly unless the normalized inbound contract is expanded first.

#### 4. `MessageProcessor` owns routing inline and is too coupled to one path

Today, once an inbound text message passes the owner/empty guards, `MessageProcessor` does one thing:

1. call `conversationFlowService.planReply(...)`
2. send that reply as text
3. persist the outbound bot message

Implication:
- Phase 2 must replace this direct call with a bot-conversation orchestrator that can branch by state and still reuse `ConversationFlowService` for QUALIFYING.

## Recommended Architecture

### Pattern 1: Add a dedicated `bot-conversation` backend module

**What:** Introduce a dedicated domain module responsible for:

- conversation state enum / DTOs
- Redis repository and TTL rules
- database backup model
- router/orchestrator service
- prompt/message builders for greeting, redirect, services-info, and handoff copy

**Suggested structure:**

```text
apps/backend/src/bot-conversation/
  bot-conversation.module.ts
  bot-conversation.service.ts
  bot-conversation.repository.ts
  bot-conversation.types.ts
  prompts/
    greeting-messages.ts
    info-services.prompt.ts
    off-flow.prompt.ts
```

**Why:** `MessageProcessor` should remain the queue worker entry point, not become the permanent home of FSM state logic.

### Pattern 2: Use Redis as primary state, Prisma as backup/audit

**What:** Store the active session in Redis with a 24-hour TTL and persist every transition to Prisma for reconstruction.

**Suggested minimal backup fields:**

- `conversationId`
- `state`
- `stateVersion`
- `metadata` JSON
- `offFlowCount`
- `expiresAt`
- `lastInboundMessageId`
- `lastTransitionAt`

**Why:** The locked context explicitly requires fast active reads and restart-safe continuation. Redis alone fails the restart-loss case; Prisma alone makes every turn heavier and loses the natural TTL semantics.

### Pattern 3: Keep `MessageProcessor` as the ingress worker but insert a routing boundary

**What:** After persisting the inbound message, `MessageProcessor` should call something like:

```typescript
const decision = await this.botConversationService.handleInbound(normalized);
```

The returned decision can include:

- outbound message body or interactive payload
- whether to persist an outbound bot row
- whether owner notification is required
- resulting conversation state

**Why:** This preserves the current queue-first transport architecture while isolating bot state transitions in one place.

### Pattern 4: Delegate QUALIFYING to `ConversationFlowService`, not a new discovery engine

**What:** The FSM should own stage routing, but once the conversation is in `QUALIFYING`, it should call the existing `ConversationFlowService.planReply(...)`.

**Why:** The repo already contains the brief extraction and handoff behavior implemented in Phase 2.1. Rebuilding that logic in Phase 2 would create two qualification systems and break the approved context.

### Pattern 5: Bound AI usage to routing support, not new commercial scope

**What:** AI usage in this phase should stay limited to:

- greeting free-text intent classification
- contextual off-flow redirect copy
- INFO_SERVICES conversational guidance

**Why:** This respects the approved context while keeping Phase 2's purpose as routing/state management, not quote generation or owner-review expansion.

### Pattern 6: Expand `NormalizedMessage` before adding Phase 2 routing behavior

**What:** Extend the normalized inbound contract to carry the minimum routing metadata needed for this phase, for example:

- `messageType`
- `interactiveReplyId`
- `interactiveReplyTitle`

**Why:** Without this seam, the bot cannot distinguish a greeting button tap from free text or detect non-text payloads reliably enough to serve the approved media fallback.

### Pattern 7: Use a dedicated human-handoff notifier instead of coupling to quote review

**What:** Implement HUMAN_HANDOFF notifications through a small bot-conversation or messaging-facing notifier service that uses `MessagingService` + `ConfigService` and follows the same persistence pattern as owner review.

**Why:** `OwnerReviewService` is quote-draft-specific and already participates in an `AiSalesModule`/`MessagingModule` cycle. Reusing its message pattern is good; depending on its API from the new bot module is not.

## Data Model Guidance

### Recommended persistent state split

Do not overload `CommercialBrief` with routing concerns.

Use:

- `Message` for transcript/history truth
- `ConversationState` (new) for bot routing state
- `CommercialBrief` / `QuoteDraft` for AI-sales state

This keeps Phase 2 and Phase 2.1 loosely coupled but composable.

### Redis key contract

The context already proposed:

```text
bot:fsm:${phone}
```

Use the normalized stable conversation identity, not raw webhook payload ids. Persist the same normalized id in Prisma backup rows so Redis misses can reconstruct cleanly.

## Implementation Risks

### Risk 1: Interactive greeting support may not exist in the Kapso SDK wrapper used here

Research found no existing helper in the repo for reply buttons. The `@kapso/whatsapp-cloud-api` wrapper is used only for plain text and templates today.

Mitigation:
- Plan 02 should explicitly verify the SDK capabilities before coding.
- If reply buttons are unsupported in the wrapper, implement the smallest direct Kapso client method needed rather than downgrading silently to plain text without documenting it.

### Risk 2: Inbound button taps and media payloads are invisible at the current normalized seam

The current `NormalizedMessage` shape loses the information needed to route interactive replies or detect non-text payload kinds.

Mitigation:
- Expand the normalized contract in Plan 02.
- Add adapter tests proving:
  - greeting button tap normalization
  - media payload normalization with explicit message kind

### Risk 3: Two state machines can emerge if Phase 2 duplicates Phase 2.1 discovery status

`ConversationFlowService` already persists `CommercialBrief.status` and `QuoteDraft.reviewStatus`.

Mitigation:
- Keep Phase 2 state focused on conversation routing only.
- QUALIFYING delegates; it does not redefine commercial-brief completeness rules.

### Risk 4: Returning-customer behavior depends on 24-hour window semantics

The context requires:

- active state within 24 hours resumes in place
- expired state after 24 hours gets "Hola de nuevo" + buttons

Mitigation:
- Persist explicit `expiresAt` and `lastTransitionAt`.
- Add deterministic tests for resume vs expired behavior instead of relying on wall-clock intuition.

### Risk 5: Off-flow AI prompts can become too open-ended and destabilize routing

If the classifier/off-flow prompts return ambiguous outputs, the FSM can oscillate or fail to escalate.

Mitigation:
- Use constrained output enums for greeting intent classification.
- Keep off-flow escalation deterministic after 3 invalid attempts.

## Recommended Plan Breakdown

### Plan 02-01
Create the bot-conversation foundation:

- Prisma backup model for conversation routing state
- Redis repository with TTL and reconstruction contract
- state enums/metadata DTOs
- module wiring and router entry point skeleton

### Plan 02-02
Implement greeting/menu routing and outbound interactive support:

- extend channel contract for reply buttons
- extend inbound normalized-message contract for button taps and message kind
- send first-touch and post-expiry greeting
- add INFO_SERVICES and HUMAN_HANDOFF entry behavior
- replace the direct `ConversationFlowService` call in `MessageProcessor`

### Plan 02-03
Implement QUALIFYING delegation and off-flow handling:

- free-text greeting intent classification
- QUALIFYING state delegation into `ConversationFlowService`
- contextual redirect replies
- media fallback and 3-strike escalation to human handoff

### Plan 02-04
Harden persistence and recovery semantics:

- Redis miss reconstruction from Prisma backup
- active resume vs 24-hour expiry behavior
- worker/service/e2e coverage proving restart-safe continuation

## Verification Targets

Before Phase 2 can be considered complete, the repo should be able to prove:

1. A new inbound lead receives a greeting/menu without human action.
2. Reply-button taps and free-text selections both move the conversation into the correct state.
3. QUALIFYING continues through the existing AI discovery service instead of bypassing it.
4. Media inputs are recognized as non-text and receive the approved fallback instead of being silently ignored.
5. Off-flow inputs receive bounded guidance and escalate after repeated failures.
6. Restart or Redis-loss scenarios recover the conversation state without forcing the lead to restart from zero.

## Final Recommendation

Plan Phase 2 as four backend-heavy execute plans. Do not split frontend work into this phase. The risk is not UI polish; it is durable routing behavior and clean integration with the already-built AI-sales subsystem. Treat the existing Phase 2.1 code as a downstream qualification engine, not as something to unwind.
