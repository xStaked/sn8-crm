---
phase: 01-foundation
plan: 04
subsystem: infra
tags: [nestjs, webhooks, kapso, hmac, bullmq, redis, prisma, ioredis]

requires:
  - phase: 01-foundation
    provides: backend scaffold + global Prisma/Redis modules + BullMQ root connection (01-01)
  - phase: 01-foundation
    provides: ChannelAdapter + KapsoAdapter normalization contract (01-03)
provides:
  - Kapso webhook ingress endpoint with HMAC verification (`POST /webhooks/kapso`)
  - Dual-layer idempotent enqueue flow using Redis `SET NX EX 86400` + BullMQ job handoff
  - BullMQ WorkerHost that normalizes inbound payloads and persists asynchronously via Prisma (P2002 treated as success)
affects: [01-foundation, bot, approvals, crm, observability]

tech-stack:
  added: []
  patterns:
    - Raw-body capture for signature verification via `express.json({ verify })`
    - Webhook hot path: Redis reservation + BullMQ enqueue only (no DB writes)
    - Worker path: normalize inbound -> Prisma create; P2002 treated as duplicate success

key-files:
  created:
    - apps/backend/src/webhooks/dto/kapso-webhook.dto.ts
    - apps/backend/src/webhooks/webhooks.service.ts
    - apps/backend/src/webhooks/webhooks.controller.ts
    - apps/backend/src/webhooks/webhooks.module.ts
    - apps/backend/src/messaging/processors/message.processor.ts
    - apps/backend/src/webhooks/webhooks.service.spec.ts
    - apps/backend/test/webhooks.e2e-spec.ts
    - apps/backend/src/messaging/processors/message.processor.spec.ts
  modified:
    - apps/backend/src/main.ts
    - apps/backend/src/app.module.ts
    - apps/backend/src/messaging/messaging.module.ts

key-decisions:
  - "Accept `X-Webhook-Signature` as either raw hex or `sha256=`-prefixed value; allow hex or base64 signatures for resilience"

patterns-established:
  - "Idempotency key: prefer `X-Kapso-Idempotency-Key` then `payload.message.id`; Redis key `wh:msg:${messageId}`"
  - "Structured duplicate-skip log: `{ event: 'webhook_duplicate_skipped', messageId, redisKey }`"
  - "Worker duplicate handling: Prisma `P2002` treated as successful no-op"

requirements-completed: [INFRA-01, INFRA-02, INFRA-03]

duration: 6m
completed: 2026-03-18
---

# Phase 1: Foundation Summary

**Kapso webhook ingress with HMAC verification, Redis-backed idempotent BullMQ enqueue, and async inbound persistence in a worker.**

## Performance

- **Duration:** 6m
- **Started:** 2026-03-18T21:01:07Z
- **Completed:** 2026-03-18T21:07:21Z
- **Tasks:** 2
- **Files modified:** 11

## Accomplishments

- Implemented `POST /webhooks/kapso` with raw-body HMAC verification via `KAPSO_WEBHOOK_SECRET`.
- Added dual-layer idempotency: Redis reservation (`SET NX EX 86400`) in the webhook hot path plus DB unique constraint handling in the worker.
- Added BullMQ `MessageProcessor` that normalizes inbound payloads through `ChannelAdapter.normalizeInbound` and persists via Prisma, treating `P2002` as duplicate success.

## Task Commits

Each task was committed atomically (TDD-style: RED then GREEN):

1. **Task 1: Webhook ingress, HMAC verification, and queue handoff**
   - `b53d397` (test)
   - `bfa1bb0` (feat)
2. **Task 2: BullMQ worker persistence for inbound messages**
   - `ab04f2b` (test)
   - `5389844` (feat)

## Files Created/Modified

- `apps/backend/src/webhooks/webhooks.controller.ts` - HMAC signature verification + enqueue/ack responses
- `apps/backend/src/webhooks/webhooks.service.ts` - Redis idempotency reservation + BullMQ enqueue + retryable failure behavior
- `apps/backend/src/webhooks/webhooks.module.ts` - Webhooks feature module importing `MessagingModule`
- `apps/backend/src/messaging/processors/message.processor.ts` - WorkerHost persistence + P2002 duplicate handling
- `apps/backend/src/main.ts` - Raw body capture via `express.json({ verify })` for signature verification
- `apps/backend/src/messaging/messaging.module.ts` - Registers `incoming-messages` queue and provides worker processor
- `apps/backend/src/webhooks/webhooks.service.spec.ts` - Service-level idempotency and observability tests
- `apps/backend/test/webhooks.e2e-spec.ts` - HTTP contract + latency budget test (< 100ms)
- `apps/backend/src/messaging/processors/message.processor.spec.ts` - Worker persistence behavior tests

## Decisions Made

- Accepted hex or base64 signatures (and `sha256=` prefix) to reduce brittleness across Kapso signature formats while still requiring a valid HMAC.

## Deviations from Plan

None.

## Issues Encountered

- E2E test execution required opening an ephemeral local port; in this environment that required escalated execution permissions for the Jest run.

## User Setup Required

None (tests use in-memory mocks for Redis and queue; production requires `KAPSO_WEBHOOK_SECRET` in env).

## Next Phase Readiness

- Phase 1 is complete: auth + outbound messaging + inbound webhook + async persistence are all in place.
- Ready for Phase 2 to consume persisted inbound messages and implement the conversation engine.

## Self-Check: PASSED

- Key files exist on disk and match plan must-haves.
- Verification commands executed successfully (`tsc` + targeted `jest` suites).

---
*Phase: 01-foundation*
*Completed: 2026-03-18*

