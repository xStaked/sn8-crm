---
phase: quick
plan: 260401-lbb
subsystem: ai-sales
tags: [customer-delivery, owner-review, whatsapp, quote-approval]
dependency_graph:
  requires: []
  provides: [customer-delivery-after-approval]
  affects: [owner-review.service.ts]
tech_stack:
  added: []
  patterns: [delivery-outside-transaction, tdd-red-green]
key_files:
  created: []
  modified:
    - apps/backend/src/ai-sales/owner-review.service.ts
    - apps/backend/src/ai-sales/owner-review.service.spec.ts
decisions:
  - "Customer delivery is triggered outside the approval $transaction so approval is durable regardless of delivery failure"
  - "reviewStatus transitions approved -> delivered_to_customer only after successful sendText call"
metrics:
  duration: 12min
  completed: 2026-04-01
  tasks: 1
  files: 2
---

# Phase quick Plan 260401-lbb: Implementar Trigger de Entrega al Cliente Summary

**One-liner:** Customer delivery trigger wired into approveDraft — SN8 APPROVE now sends the rendered quote to the customer via WhatsApp, persists the outbound message, and updates reviewStatus to delivered_to_customer.

## What Was Built

After `SN8 APPROVE`, the `approveDraft()` method now:
1. Calls `prepareApprovedCustomerDelivery(conversationId)` to fetch the approved draft and validate the rendered body
2. Sends the rendered quote to the customer via `messagingService.sendText(conversationId, body, senderPhoneNumberId)`
3. Updates `reviewStatus` to `delivered_to_customer` on the QuoteDraft
4. Persists an outbound Message record with `source: 'ai-sales-customer-delivery'`
5. Owner ACK updated to inform the owner the quote was delivered, not just marked

## Tasks Completed

| Task | Name | Commit | Files |
|------|------|--------|-------|
| RED | Add failing tests for customer delivery | 0b38f22 | owner-review.service.spec.ts |
| GREEN | Implement delivery trigger in approveDraft | 818d056 | owner-review.service.ts |

## Verification

- `npx jest --no-coverage src/ai-sales/owner-review.service.spec.ts` — 7/8 pass (1 pre-existing failure on jobId format in `requestChanges` test, unrelated to this plan)
- `npx tsc --noEmit -p apps/backend/tsconfig.json` — no type errors

## Deviations from Plan

None — plan executed exactly as written.

## Known Stubs

None. The delivery is fully wired through the messaging service.

## Pre-existing Issues (Out of Scope)

The `records requested changes and enqueues a regeneration job` test was already failing before this plan due to a jobId format mismatch (`owner-revision:draft_2:evt_2` expected vs `owner-revision_draft_2_evt_2` actual in the service). This is logged for a future fix.

## Self-Check: PASSED
