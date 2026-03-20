---
gsd_state_version: 1.0
milestone: v1.0
milestone_name: milestone
status: executing
stopped_at: Completed 02.1-03-PLAN.md
last_updated: "2026-03-20T02:09:53.807Z"
last_activity: "2026-03-20 — Completed Phase 02.1 Plan 02.1-03 (owner consultation, draft regeneration, and approved-delivery guardrail)"
progress:
  total_phases: 9
  completed_phases: 5
  total_plans: 19
  completed_plans: 18
  percent: 95
---

# Project State

## Project Reference

See: .planning/PROJECT.md (updated 2026-03-15)

**Core value:** El bot nunca deja a un cliente sin respuesta y toda cotización pasa por validación del socio antes de enviarse — garantizando rentabilidad sin sacrificar velocidad de respuesta.
**Current focus:** Phase 02.1 AI sales-agent configuration is complete with WhatsApp-first owner consultation and explicit approval blocking; the next dependency chain can consume this state from Phase 3 and the remaining frontend/manual-reply work.

## Current Position

Phase: 02.1 of 9 (AI Sales Agent Configuration)
Plan: 3 of 3 in current phase
Status: In progress
Last activity: 2026-03-20 — Completed Phase 02.1 Plan 02.1-03 (owner consultation, draft regeneration, and approved-delivery guardrail)

Progress: [██████████] 95%

## Performance Metrics

**Velocity:**

- Total plans completed: 18
- Average duration: 8 min
- Total execution time: 137 min

**By Phase:**

| Phase | Plans | Total | Avg/Plan |
|-------|-------|-------|----------|
| 1. Foundation | 4 | 27 min | 7 min |
| 1.1. Frontend Foundation | 3 | 27 min | 9 min |
| 5. Frontend integration with current backend | 4 | 38 min | 10 min |
| 05.1. Integración real de Kapso y flujo inbound end-to-end | 3 | 26 min | 9 min |
| 05.2. Manual Reply from CRM | 1 | 14 min | 14 min |
| 02.1. AI Sales Agent Configuration | 3 | 19 min | 6 min |

**Recent Trend:**

- Last 5 plans: 02.1-03 (8 min), 02.1-02 (8 min), 02.1-01 (3 min), 05-04 (14 min), 05.1-03 (19 min)
- Trend: Phase 02.1 is now complete, giving the roadmap a durable owner-review/regeneration loop and a reusable approval guardrail ahead of formal delivery work.

*Updated after each plan completion*
| Phase 05 P02 | 5m | 2 tasks | 4 files |
| Phase 05 P03 | 5m | 2 tasks | 6 files |
| Phase 05 P04 | 14min | 2 tasks | 2 files |
| Phase 05.1 P01 | 3m | 2 tasks | 6 files |
| Phase 05.1 P02 | 4min | 2 tasks | 4 files |
| Phase 05.1 P03 | 19 min | 2 tasks | 4 files |
| Phase 05.2 P01 | 14 min | 2 tasks | 8 files |
| Phase 02.1 P01 | 3min | 3 tasks | 10 files |
| Phase 02.1-ai-sales-agent-configuration P02 | 8min | 3 tasks | 11 files |
| Phase 02.1-ai-sales-agent-configuration P03 | 8min | 3 tasks | 13 files |

## Accumulated Context

### Decisions

Decisions are logged in PROJECT.md Key Decisions table.
Recent decisions affecting current work:

- [Init]: Channel adapter interface (`ChannelAdapter`) must be defined in Phase 1 — retrofitting post-Phase 2 makes Instagram v2 a rewrite
- [Init]: Prisma 6 (not 7) — Prisma 7 ESM default conflicts with NestJS CommonJS
- [Init]: BullMQ (not Bull) — Bull is maintenance-only since 2022
- [Init]: Aprobación humana obligatoria — cotizaciones no se envían sin `approve` explícito del socio
- [Phase 1.1]: Dashboard selection state is stored in the URL query string so the detail pane can reflect the active conversation without global client state
- [Phase 1.1]: Keep `next.config.mjs` in `apps/web` because Next.js 14 rejected `next.config.ts` during production builds
- [Phase 05]: Conversation summaries keep contactName as the normalized phone string and unreadCount at 0 until read-state exists.
- [Phase 05]: Conversation summaries use stable ids derived from participant phone identity.
- [Phase 05]: Conversation history reuses the participant-phone stable id contract from GET /conversations.
- [Phase 05]: Conversation history returns chronological lightweight message DTOs so the detail panel can render directly.
- [Phase 05]: Frontend CRM reads treat backend 401s as session expiry and route back to /login.
- [Phase 05]: Production inbox/detail views expose loading, empty, unauthorized, and generic failure states instead of falling back to canned mock data.
- [Phase 05]: Conversation e2e coverage stubs BullMQ queue and registrar providers instead of requiring Redis for read-contract verification.
- [Phase 05]: Phase 05 browser proof runs against http://localhost:3000 so the frontend origin matches the backend CORS allowlist.
- [Phase 05.1]: Webhook id resolution keeps X-Kapso-Idempotency-Key precedence and falls back to nested entry/change/message ids.
- [Phase 05.1]: Kapso inbound normalization now scans nested entry/change/message arrays so real fixtures reach a stable NormalizedMessage contract.
- [Phase 05.1]: Inbound persistence now falls back to the original webhook payload when normalized rawPayload is absent.
- [Phase 05.1]: Conversation read proof reuses MessageProcessor-backed durable rows instead of introducing a parallel projection path.
- [Phase 05.1]: Kapso local verification is satisfied by one documented signed smoke flow plus optional real tunnel delivery; no extra backend script was needed.
- [Phase 05.1]: CRM freshness for inbound Kapso proof stays in the existing SWR hooks with 5-second revalidation instead of a UI rewrite or contract change.
- [Phase 05.2]: Manual reply persistence stores the configured KAPSO_PHONE_NUMBER_ID as fromPhone when present and falls back to a crm marker without changing the Message schema.
- [Phase 02.1]: AI sales state stays separate from Message so transcript history remains transport truth and review rules stay queryable.
- [Phase 02.1]: DeepSeek access is localized behind AiProvider so later plans can swap prompt/orchestration behavior without provider coupling.
- [Phase 02.1]: The owner quotation template remains an explicit pending contract instead of an invented format, so SALES-AI-03 is not overstated.
- [Phase 02.1]: Qualification handoff is a queue job keyed by conversationId so Phase 2 can trigger ai-sales without coupling to request lifetime.
- [Phase 02.1]: Customer-visible AI sales messaging stays limited to persisted pending-review status updates; quote bodies remain internal until approval.
- [Phase 02.1]: Owner review v1 runs through WhatsApp using AI_SALES_OWNER_PHONE instead of waiting for the CRM approval UI.
- [Phase 02.1]: Owner commands use explicit text syntax (SN8 APPROVE|REVISE <conversationId> v<version>) so approval stays machine-readable and attributable.
- [Phase 02.1]: Customer-facing quote release stays behind prepareApprovedCustomerDelivery so delivery remains blocked until the latest draft is explicitly approved.

### Roadmap Evolution

- Phase 5 added: Frontend integration with current backend
- Phase 05.1 inserted after Phase 5: Integración real de Kapso y flujo inbound end-to-end (URGENT)

### Pending Todos

None yet.

### Blockers/Concerns

- [Phase 1]: Kapso.ai rate limits y comportamiento de retry no están documentados públicamente — validar empíricamente durante Phase 1 o contactar soporte
- [Phase 3]: Fiabilidad de DeepSeek structured output en contexto español/agencia no verificada empíricamente — reservar tiempo de prompt iteration en Phase 3

## Session Continuity

Last session: 2026-03-20T02:09:53.805Z
Stopped at: Completed 02.1-03-PLAN.md
Resume file: None
