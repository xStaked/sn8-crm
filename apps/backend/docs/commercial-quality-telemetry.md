# Commercial Quality Telemetry Baseline

This document defines the baseline telemetry package for pricing accuracy and sales-script quality in SN8 CRM.

## Scope

- Pricing accuracy between quote estimate and closed deal outcome.
- Commercial review quality (approval vs rework trend).
- Sales-script compliance guardrails (MVP-first and commercial exclusions).

## Event Inventory

| Event | Emitter | Key dimensions | Purpose |
| --- | --- | --- | --- |
| `quote_metrics_outcome_recorded` | `src/quote-metrics/quote-metrics.service.ts` (`recordOutcome`) | `conversationId`, `quoteOutcomeId`, `quoteEstimateSnapshotId`, `quoteDraftId`, `pricingRuleId`, `outcomeStatus`, `currency`, `estimatedTargetAmount`, `finalAmount`, `deltaAmount`, `deltaPct`, `closedAt` | Captures pricing precision at closure time for won/lost/pending outcomes. |
| `quote_metrics_summary_generated` | `src/quote-metrics/quote-metrics.service.ts` (`getSummary`) | `from`, `to`, `totalOutcomes`, `wonOutcomes`, `lostOutcomes`, `pendingOutcomes`, `approvalRatePct`, `reworkRatePct`, `avgQuoteTurnaroundHours`, `meanAbsoluteErrorPct`, `avgDeltaAmount`, `monthlyRecalibrationRecommended` | Creates a normalized KPI snapshot for monthly operations and audits. |
| `owner_review_approved` | `src/ai-sales/owner-review.service.ts` (`approveDraftWithSource`) | `conversationId`, `version`, `reviewerPhone` | Tracks approvals by version and reviewer origin. |
| `owner_review_changes_requested` | `src/ai-sales/owner-review.service.ts` (`requestChangesWithSource`) | `conversationId`, `version`, `reviewerPhone` | Tracks rework demand and review friction. |
| `ai_sales_quote_draft_prepared` | `src/ai-sales/ai-sales.orchestrator.ts` (`enqueueQualifiedConversation`) | `conversationId`, `briefStatus`, `pricingRuleId` (when available) | Marks quote generation pipeline readiness. |
| `customer_delivery_pdf_link_sent` | `src/ai-sales/owner-review.service.ts` (`sendApprovedCustomerDelivery`) | `conversationId`, `quoteDraftId`, `version` | Confirms customer delivery milestone after approval. |
| `customer_delivery_pdf_link_failed` | `src/ai-sales/owner-review.service.ts` (`sendApprovedCustomerDelivery`) | `conversationId`, `quoteDraftId`, `version`, `error` | Flags delivery failure path for follow-up and SLA. |

## KPI Formulas

- `meanAbsoluteErrorPct`: `avg(abs(finalAmount - estimatedTargetAmount) / estimatedTargetAmount * 100)`
- `avgDeltaAmount`: `avg(finalAmount - estimatedTargetAmount)`
- `approvalRatePct`: `approvedEvents / (approvedEvents + changesRequestedEvents) * 100`
- `reworkRatePct`: `changesRequestedEvents / (approvedEvents + changesRequestedEvents) * 100`

## Minimum Operational Dashboard

Review weekly:

1. `meanAbsoluteErrorPct` by `pricingRuleId`.
2. `avgDeltaAmount` by `category + complexity + integrationType`.
3. `approvalRatePct` and `reworkRatePct` by week.
4. `customer_delivery_pdf_link_failed` count and top failure reasons.

## Alert Thresholds

- `meanAbsoluteErrorPct >= 5` for a segment with at least 5 outcomes.
- `reworkRatePct >= 35` in rolling 30-day window.
- More than 2 `customer_delivery_pdf_link_failed` events in 24h for same conversation.

## Validation

- Automated tests:
  - `src/quote-metrics/quote-metrics.service.spec.ts`
  - `src/ai-sales/commercial-quality.service.spec.ts`
- Manual monthly check:
  - Follow `docs/monthly-pricing-recalibration.md`.
