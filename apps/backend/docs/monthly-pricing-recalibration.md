# Monthly Pricing Recalibration Cycle

This runbook defines the monthly feedback loop for quote estimation quality.

## Inputs

- Quote outcomes (`won`, `lost`, `pending`) captured from CRM.
- Estimate snapshots linked to each closure (min/target/max).
- Review events (`approved`, `changes_requested`) from owner review flow.

## Monthly Procedure

1. Export last-month outcomes grouped by `category + complexity + integrationType`.
2. Compute KPIs:
- Mean absolute error (%): `abs(final - target) / target`.
- Average delta amount: `final - target`.
- Approval and rework rates from review events.
- Average quote turnaround hours: `draft.createdAt -> deliveredToCustomerAt|approvedAt`.
3. Flag segments for rule update when either condition is true:
- `MAE >= 5%`, or
- sustained negative/positive average delta indicating systematic under/over-estimation.
4. Create a new pricing rule version for flagged segments (do not edit historical versions).
5. Activate the new rule version and archive previous active version for the same key.
6. Publish a brief change log with:
- affected segment(s),
- previous vs new margins,
- expected impact on approval/rework and precision.

## Operational Notes

- Keep at least 12 months of historical outcomes for trend analysis.
- Never delete historical outcomes/snapshots; they are the audit trail for pricing decisions.
- Run this process in the first business week of each month.
