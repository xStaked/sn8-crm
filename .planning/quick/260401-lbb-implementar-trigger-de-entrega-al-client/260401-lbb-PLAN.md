---
phase: quick
plan: 260401-lbb
type: execute
wave: 1
depends_on: []
files_modified:
  - apps/backend/src/ai-sales/owner-review.service.ts
  - apps/backend/src/ai-sales/owner-review.service.spec.ts
autonomous: true
must_haves:
  truths:
    - "After SN8 APPROVE, the approved quote is sent to the customer via WhatsApp"
    - "The quote draft reviewStatus is updated to delivered_to_customer after sending"
    - "The outbound message to the customer is persisted in the Message table"
    - "The owner ACK message reflects that the quote was delivered to the customer"
  artifacts:
    - path: "apps/backend/src/ai-sales/owner-review.service.ts"
      provides: "Customer delivery trigger in approveDraft flow"
      contains: "prepareApprovedCustomerDelivery"
    - path: "apps/backend/src/ai-sales/owner-review.service.spec.ts"
      provides: "Test coverage for customer delivery after approval"
      contains: "delivered_to_customer"
  key_links:
    - from: "handleOwnerCommand (APPROVE branch)"
      to: "prepareApprovedCustomerDelivery"
      via: "called after approveDraft completes"
    - from: "approveDraft"
      to: "messagingService.sendText"
      via: "sends rendered quote to customer conversationId"
    - from: "approveDraft"
      to: "quoteDraft.update"
      via: "sets reviewStatus to delivered_to_customer"
---

<objective>
Wire the customer delivery trigger after owner approval. Currently `approveDraft()` marks the draft as approved but never calls `prepareApprovedCustomerDelivery()` or sends the quote to the customer. After this plan, `SN8 APPROVE` will: approve the draft, send the rendered quote to the customer via WhatsApp, persist the outbound message, and update reviewStatus to `delivered_to_customer`.

Purpose: Close the gap where approved quotes never reach the customer.
Output: Modified `owner-review.service.ts` with delivery trigger and updated tests.
</objective>

<execution_context>
@$HOME/.claude/get-shit-done/workflows/execute-plan.md
@$HOME/.claude/get-shit-done/templates/summary.md
</execution_context>

<context>
@apps/backend/src/ai-sales/owner-review.service.ts
@apps/backend/src/ai-sales/owner-review.service.spec.ts
@apps/backend/src/ai-sales/ai-sales.orchestrator.ts

<interfaces>
From apps/backend/src/ai-sales/owner-review.service.ts:
```typescript
// prepareApprovedCustomerDelivery already exists (line 381) — returns:
type ApprovedCustomerDeliveryPayload = {
  conversationId: string;  // the customer phone / conversation identifier
  quoteDraftId: string;
  version: number;
  body: string;            // the rendered quote text to send
};

// MessagingService.sendText signature:
async sendText(to: string, body: string, senderPhoneNumberId?: string): Promise<string>;
// Returns externalMessageId

// handleOwnerCommand calls approveDraft then sendOwnerAck with a hardcoded ACK message
// The ACK message currently says "La cotizacion queda marcada como aprobada para pasos posteriores controlados."
```

From prisma/schema.prisma:
```prisma
enum QuoteReviewStatus {
  pending_owner_review
  changes_requested
  approved
  ready_for_recheck
  delivered_to_customer   // <-- target status after sending
}
```
</interfaces>
</context>

<tasks>

<task type="auto" tdd="true">
  <name>Task 1: Add customer delivery trigger after approveDraft and update tests</name>
  <files>apps/backend/src/ai-sales/owner-review.service.ts, apps/backend/src/ai-sales/owner-review.service.spec.ts</files>
  <behavior>
    - Test: approveDraft sends the rendered quote to the customer via messagingService.sendText using the conversationId as recipient
    - Test: approveDraft updates reviewStatus to 'delivered_to_customer' after successful send
    - Test: approveDraft persists the outbound customer message in prisma.message.create with source 'ai-sales-customer-delivery'
    - Test: approveDraft throws and does NOT update to delivered_to_customer if prepareApprovedCustomerDelivery fails (e.g. no rendered quote body)
  </behavior>
  <action>
    1. In owner-review.service.spec.ts, update the existing "approves only the active draft version" test:
       - After the existing assertions, add: the mock for quoteDraft.findFirst should also be set up so that a SECOND call (from prepareApprovedCustomerDelivery -> assertLatestDraftApproved) returns the draft with reviewStatus 'approved' and a renderedQuote body.
       - Assert messagingService.sendText was called with (conversationId, rendered quote body, senderPhoneNumberId).
       - Assert prisma.quoteDraft.update was called a SECOND time with reviewStatus 'delivered_to_customer'.
       - Assert prisma.message.create was called with data containing toPhone=conversationId, body=rendered quote, source='ai-sales-customer-delivery'.

    2. Add a new test: "does not mark delivered_to_customer when rendered quote body is empty" — mock the approved draft with renderedQuote as null/empty, expect approveDraft to throw BadRequestException from prepareApprovedCustomerDelivery, and reviewStatus should remain 'approved' (no second update).

    3. In owner-review.service.ts, modify `approveDraft()`:
       - After the existing $transaction block and logger.log, add:
         ```
         const delivery = await this.prepareApprovedCustomerDelivery(command.conversationId);
         const senderPhoneNumberId = this.config.get<string>('KAPSO_PHONE_NUMBER_ID')?.trim() || undefined;
         const externalMessageId = await this.messagingService.sendText(
           delivery.conversationId,
           delivery.body,
           senderPhoneNumberId,
         );
         await this.prisma.quoteDraft.update({
           where: { id: delivery.quoteDraftId },
           data: { reviewStatus: 'delivered_to_customer' },
         });
         await this.prisma.message.create({
           data: {
             externalMessageId,
             direction: 'outbound',
             fromPhone: senderPhoneNumberId ?? 'ai-sales',
             toPhone: delivery.conversationId,
             body: delivery.body,
             channel: 'whatsapp',
             rawPayload: {
               externalMessageId,
               direction: 'outbound',
               fromPhone: senderPhoneNumberId ?? 'ai-sales',
               toPhone: delivery.conversationId,
               body: delivery.body,
               source: 'ai-sales-customer-delivery',
               quoteDraftId: delivery.quoteDraftId,
               version: delivery.version,
             },
           },
         });
         ```

    4. In handleOwnerCommand (APPROVE branch), update the ACK message to:
       `Aprobacion registrada para ${command.conversationId} v${command.version}. La cotizacion fue enviada al cliente.`
       This informs the owner that the quote was actually delivered, not just marked.

    NOTE: The delivery happens OUTSIDE the approval $transaction intentionally — the approval is durable regardless of delivery success. If delivery fails, the draft stays 'approved' and can be retried. This matches the existing pattern where requestOwnerReview is also called outside the transaction in processRevisionJob.
  </action>
  <verify>
    <automated>cd /Users/xstaked/Desktop/projects/sn8-projects/sn8-wpp-crm && npx jest --no-coverage apps/backend/src/ai-sales/owner-review.service.spec.ts --verbose 2>&1 | tail -30</automated>
  </verify>
  <done>
    - approveDraft calls prepareApprovedCustomerDelivery and sends the quote to the customer
    - reviewStatus transitions from approved to delivered_to_customer
    - Outbound message persisted with source ai-sales-customer-delivery
    - Owner ACK updated to reflect delivery
    - All existing and new tests pass
  </done>
</task>

</tasks>

<verification>
- `npx jest --no-coverage apps/backend/src/ai-sales/owner-review.service.spec.ts` — all tests pass
- `npx tsc --noEmit -p apps/backend/tsconfig.json` — no type errors
</verification>

<success_criteria>
- SN8 APPROVE triggers customer delivery: quote sent via WhatsApp, message persisted, status set to delivered_to_customer
- All existing tests continue to pass (no regressions in revision flow, version mismatch, etc.)
- New tests verify the delivery trigger and edge case (empty body)
</success_criteria>

<output>
After completion, create `.planning/quick/260401-lbb-implementar-trigger-de-entrega-al-client/260401-lbb-SUMMARY.md`
</output>
