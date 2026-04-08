# Monthly Pricing Recalibration Cycle

This runbook defines the operational monthly loop to improve quote precision and sales review quality.

Related baseline: `docs/commercial-quality-telemetry.md`.

## Inputs (required)

- Quote outcomes (`won`, `lost`, `pending`) captured from CRM.
- Estimate snapshots (`estimatedMin/Target/Max`) linked to each closure.
- Owner review events (`approved`, `changes_requested`).
- Active pricing-rule versions by `category + complexity + integrationType`.

## Step 1 - Extract monthly KPI snapshot

1. Query backend KPI summary:

```bash
curl -s "http://localhost:3000/quote-metrics/summary?from=2026-03-01T00:00:00.000Z&to=2026-03-31T23:59:59.999Z"
```

2. Export raw closures and outcomes from CRM for the same window.
3. Group results by `category + complexity + integrationType`.

## Step 2 - Evaluate recalibration triggers

For each segment, mark `needs_recalibration=true` when either is true:

- `meanAbsoluteErrorPct >= 5` with at least 5 outcomes in the month.
- `avgDeltaAmount` is consistently positive/negative for two consecutive monthly windows.

Also escalate to review when:

- `reworkRatePct >= 35`.
- repeated `customer_delivery_pdf_link_failed` events show delivery friction.

## Step 3 - Create new rule version

1. Do not edit historical rules in place.
2. Create a new version with adjusted margins/weights.
3. Activate the new version and archive the previous active rule for that same segment key.

API path:

- `POST /pricing-rules` to create version `n+1`.
- `POST /pricing-rules/:id/activate` to set active rule if needed.

## Step 4 - Validate and publish

1. Run test suite before release:

```bash
pnpm exec jest src/quote-metrics/quote-metrics.service.spec.ts src/ai-sales/commercial-quality.service.spec.ts --runInBand
```

2. Post change log for commercial/support:
  - impacted segments
  - old margins -> new margins
  - KPI baseline before change
  - expected impact (precision + approval/rework)

3. Update this runbook if process or thresholds changed.

## Step 5 - Operational checklist

- [ ] KPI snapshot exported for full calendar month.
- [ ] Segment-level thresholds evaluated.
- [ ] New pricing-rule versions created for flagged segments.
- [ ] Active versions switched without deleting history.
- [ ] Regression tests passed.
- [ ] Change log shared with sales/support.

## Guardrails

- Keep at least 12 months of outcome history.
- Never delete `quote_outcome` or `quote_estimate_snapshot` records.
- Execute this cycle in the first business week of each month.
