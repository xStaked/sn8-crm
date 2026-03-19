# Project Research Summary

**Project:** SN8 WPP CRM — WhatsApp CRM with AI-powered quotation automation
**Domain:** Conversational CRM with human-in-the-loop AI workflow (WhatsApp + NestJS + Next.js)
**Researched:** 2026-03-15
**Confidence:** HIGH (stack, architecture, pitfalls) / MEDIUM (feature prioritization)

## Executive Summary

This is a purpose-built WhatsApp CRM for a software agency (SN8 Labs) that automates client qualification and quotation generation while keeping a human approval gate before any quote reaches a client. The core loop is: inbound WhatsApp message via Kapso.ai → multi-turn bot qualification via DeepSeek V3 → AI-generated structured quotation → mandatory partner review and approval → approved quote delivered back to client via WhatsApp. The entire system runs as a NestJS monolith backed by PostgreSQL + Redis, with a Next.js CRM dashboard for the approval interface. The stack is largely pre-decided; research confirmed the correct supporting libraries, version constraints, and architectural patterns.

The recommended approach is a phased build ordered by dependency: infrastructure and state plumbing first, bot conversation engine second, AI quotation generation third, human approval flow fourth, and the CRM dashboard last. This order is non-negotiable — each phase produces a working artifact that the next phase extends. Skipping phases or building the dashboard before the bot is wired produces nothing deployable. The channel abstraction (multi-channel readiness for Instagram v2) must be baked into the data model and service boundaries in Phase 1, or the Instagram migration becomes a full rewrite.

The two highest-risk areas are webhook reliability and AI correctness. WhatsApp delivers webhooks at-least-once, so idempotency guards must be in place before any business logic runs on top of them. DeepSeek can exhibit latency spikes of 30-120 seconds and will hallucinate pricing without a structured output schema and sanity bounds. Both risks are well-understood and fully preventable with patterns documented in the research — they require discipline in Phase 1 and Phase 3 respectively, not architectural innovation.

---

## Key Findings

### Recommended Stack

See full detail: `.planning/research/STACK.md`

The stack is pre-decided at the core level (NestJS 11, Next.js 16, PostgreSQL 16, Redis 7, DeepSeek API, Kapso.ai). Research confirmed the correct supporting library choices for each layer and identified critical version constraints. The single most important version decision: use Prisma 6 (not 7) because Prisma 7 ships as ESM by default and NestJS uses CommonJS, creating friction that is not yet resolved upstream.

**Core technologies:**
- NestJS 11: Backend API, webhook handler, WebSocket gateway — module boundaries map cleanly to domain (WhatsApp, AI, CRM, Auth)
- Next.js 16: CRM dashboard — App Router with Server Components reduces client bundle on data-heavy views; Turbopack is stable default
- PostgreSQL 16: Primary persistent store — relational model fits CRM data; JSONB handles semi-structured quotation payloads
- Redis 7: Conversation state cache + BullMQ queue backend + Socket.IO adapter — three responsibilities, one service already required
- DeepSeek API (deepseek-chat V3.2): AI qualification and quotation generation — use the `openai` Node SDK with `baseURL: "https://api.deepseek.com"`, no separate SDK
- Kapso.ai (@kapso/whatsapp-cloud-api): Official Meta Cloud API proxy — SDK provides `verifySignature()` for HMAC validation and conversation/contact sync endpoints
- Prisma 6: ORM and migrations — do NOT upgrade to Prisma 7 until NestJS ships native ESM support
- BullMQ (@nestjs/bullmq v10): Job queue — Bull is maintenance-only since 2022; BullMQ is the TypeScript-native successor
- TanStack Query v5 + Zustand v5: Frontend data and UI state — half the boilerplate of Redux with no architectural disadvantage at 1-5 agent scale
- shadcn/ui + Tailwind v4: Component library — use `tw-animate-css`, not the deprecated `tailwindcss-animate`

### Expected Features

See full detail: `.planning/research/FEATURES.md`

The feature set is well-defined by business requirement and validated against competing WhatsApp CRM products (respond.io, Wati, Kommo, AiSensy). The core differentiator is the mandatory human approval gate — no competitor enforces this by default, and for SN8's pricing complexity it is a hard business requirement.

**Must have (table stakes) — v1 launch:**
- Kapso.ai webhook receiver + contact auto-create on phone number
- Bot conversation handler: greet, qualify, capture requirements (guided via DeepSeek)
- AI quotation draft generation with SN8 pricing context in system prompt
- Partner quotation approval UI: view draft, edit line items, approve or reject
- Notification to partner when a quotation is pending approval (real-time via WebSocket)
- Send approved quotation to client via Kapso.ai
- Unified conversation inbox with full message history
- Conversation status pipeline (Lead → Quoted → Closed-Won / Closed-Lost)
- Conversation assignment to agent
- Basic contact search by name/phone

**Should have (add after core loop is validated) — v1.x:**
- Quotation version history
- AI conversation summary for partner handoff (reduces transcript reading)
- Typed service catalog admin UI (partners update services without touching config)
- Partner correction feedback logging (logs original AI quote vs. final approved quote)

**Defer (v2+):**
- Instagram channel activation (architecture is ready from day 1; activate when leads arrive)
- Prompt/pricing config UI (manageable via config file at current team size)
- Automated AI improvement from correction logs
- Broadcast/outbound campaigns (only if SN8 pivots to outbound marketing)

**Anti-features to explicitly avoid in v1:**
- Fully autonomous quoting without approval — violates hard business requirement
- In-app payment collection — PCI compliance out of scope
- Mobile native app — Next.js responsive web is sufficient
- Visual chatbot flow builder — significant product in itself, not needed at SN8 scale

### Architecture Approach

See full detail: `.planning/research/ARCHITECTURE.md`

The architecture is a NestJS monolith with domain-segregated modules, a BullMQ async processing layer between webhook receipt and business logic, and Redis as both the conversation FSM state store and queue backend. The central pattern is: receive webhooks asynchronously (return 200 in under 100ms, enqueue to BullMQ, process in a worker), run a Redis-backed finite state machine (GREETING → QUALIFYING → QUOTING → PENDING_APPROVAL → CLOSED) for conversation flow, and use PostgreSQL as the audit trail for all entities.

**Major components:**
1. Webhook Controller — signature verification + enqueue only; returns 200 immediately; never blocks
2. BullMQ Message Queue (Redis-backed) — decouples webhook receipt from processing; handles retries and backpressure
3. Conversation Processor (BullMQ worker) — orchestrates FSM transitions, AI calls, DB writes, and outbound replies
4. Conversation FSM — Redis hash per phone number; single writer is ConversationFSMService
5. DeepSeek Client — HTTP wrapper; called only inside BullMQ workers, never in webhook controller
6. Kapso.ai Client / Channel Adapter — implements `ChannelAdapter` interface; all business logic uses the interface, never the concrete Kapso class
7. Approval Module — creates/stores approvals, handles owner decisions, re-enqueues resume job via BullMQ (never imports ConversationProcessor to avoid circular dependency)
8. CRM API (NestJS REST) + WebSocket Gateway — serves Next.js dashboard; WebSocket only for real-time approval push notifications
9. Next.js Dashboard — approval queue, conversation viewer, pipeline, contacts

**Key patterns:**
- Webhook Enqueue-and-Return: always return 200 before any processing
- Redis FSM for conversation state: survives restarts, scales to multiple workers
- Return-of-Control for human approval: bot pauses at PENDING_APPROVAL; partner resumes via BullMQ job
- Channel Adapter interface: `ChannelAdapter` token injected via NestJS DI; `KapsoAdapter` never referenced outside `kapso/` module

### Critical Pitfalls

See full detail: `.planning/research/PITFALLS.md`

1. **Webhook duplicate processing** — WhatsApp delivers at-least-once. Prevent with a Redis `processed_message_ids` set (TTL 24h) checked before enqueuing. Must be in place before any business logic is built on top of the webhook handler. Cost: duplicate AI calls + duplicate messages sent to clients.

2. **DeepSeek latency spike (30-120s)** — DeepSeek V3 has documented instability under load. Prevent with a 25-30 second explicit timeout on the HTTP client, an acknowledgment message sent to the client before the AI call begins, exponential backoff retries (max 3, BullMQ `attempts: 3`), and a fallback human-handoff message if all retries fail. Always use `deepseek-chat` (V3), never R1 reasoning mode for conversational flows.

3. **AI hallucination on pricing** — DeepSeek will generate absurd numbers without constraints. Prevent with Zod schema validation on every AI response (`{ estimatedMin, estimatedMax, breakdown, reasoning }`), configurable sanity bounds (if `estimatedMin < 100` or `estimatedMax > 500000` → flag as `NEEDS_REVIEW`), and a reference pricing guide in the system prompt.

4. **Approval state corruption** — Partner approves a quote while the client has already sent new messages changing requirements. Prevent with optimistic locking on the `Quotation` entity (version column) and a state machine rule: any client message in `PENDING_APPROVAL` state immediately invalidates in-flight quotations and notifies the partner.

5. **Multi-channel abstraction deferred** — Hardcoding Kapso types in business logic makes Instagram v2 a rewrite. Prevent by defining the `ChannelAdapter` interface in Phase 1 and enforcing a code-review gate: zero imports of `KapsoAdapter` or `KapsoWebhookPayload` outside the `kapso/` module.

---

## Implications for Roadmap

Research strongly suggests a 6-phase build ordered by dependency. The architecture research explicitly maps components to phases; the pitfall research confirms which safeguards must exist before each phase's features run in production.

### Phase 1: Infrastructure Foundation

**Rationale:** Everything else depends on this. The webhook handler must be idempotent and the channel adapter must be abstracted before any bot logic is written on top of them. Retrofitting these later is high-cost and high-risk. The Prisma schema must include `channel` fields from day 1 to avoid data model migrations mid-build.

**Delivers:** Running NestJS app that receives Kapso.ai webhooks, validates signatures, deduplicates messages, enqueues to BullMQ, and persists contacts and conversations to PostgreSQL. The `ChannelAdapter` interface is in place. Redis and BullMQ are wired. Authentication (JWT) is working.

**Addresses (from FEATURES.md):** Kapso.ai webhook receiver, contact auto-create on phone number, multi-channel data model abstraction (day-1 data model decision)

**Avoids (from PITFALLS.md):** Webhook duplicate processing (Pitfall 1), conversation state lost on restart (Pitfall 5), multi-channel abstraction deferred (Pitfall 7), media URL expiry (store media on receipt)

**Research flag:** Skip deeper research — patterns are well-documented (NestJS + BullMQ + Prisma setup is standard)

---

### Phase 2: Conversation Engine (Bot Core)

**Rationale:** The bot's multi-turn qualification flow is the system's core value and its most complex moving part. It must work reliably before AI is introduced — AI adds a new failure mode (latency, hallucination) that should not be debugged alongside FSM bugs. Ship GREETING and QUALIFYING states with simple rule-based responses first.

**Delivers:** End-to-end bot flow: WhatsApp message arrives → FSM transitions through GREETING and QUALIFYING states → bot asks structured questions → collected fields accumulate in Redis state → conversation and messages persisted in PostgreSQL. No AI yet. Bot can complete a full qualification sequence and reach the handoff point.

**Addresses (from FEATURES.md):** Bot auto-response to inbound messages, requirements capture via guided conversation, conversation status lifecycle, conversation assignment to agent

**Avoids (from PITFALLS.md):** In-memory conversation state shortcut (must use Redis + DB from day 1), missing human takeover escape hatch ("agente" keyword must be wired in this phase)

**Research flag:** May benefit from a brief phase research session on DeepSeek prompt structuring for requirement extraction before wiring AI in Phase 3

---

### Phase 3: AI Quotation Generation

**Rationale:** AI is the product's value proposition but also its biggest operational risk. DeepSeek latency handling, structured output schema validation, pricing sanity bounds, and context windowing must all ship together — not as iterative additions. An AI integration without all four in place is a liability in production.

**Delivers:** DeepSeek integration that extracts requirements from the qualifying conversation via structured prompts, generates a quotation draft as a validated JSON payload (`estimatedMin`, `estimatedMax`, `breakdown`, `reasoning`), persists the quotation to PostgreSQL, and pauses the conversation at `PENDING_APPROVAL`. Acknowledgment message is sent to the client before the AI call. Timeout + fallback behavior is implemented and tested.

**Addresses (from FEATURES.md):** AI-generated quotation draft, profitability-aware AI quoting (SN8 pricing in system prompt), typed project service catalog (in system prompt or DB config)

**Avoids (from PITFALLS.md):** DeepSeek latency spike (Pitfall 2), AI hallucination on pricing (Pitfall 3), growing context window costs (Pitfall 6 — implement MAX_CONTEXT_MESSAGES and log cache hit rate from day 1)

**Research flag:** Needs phase research — DeepSeek structured output patterns, prompt engineering for Spanish-language software agency context, pricing prompt design

---

### Phase 4: Human-in-the-Loop Approval

**Rationale:** The approval flow is a separate domain with its own state machine concerns. It must be built after the quotation module exists (Phase 3 output) and requires careful concurrency handling. The BullMQ-based decoupling between ApprovalService and ConversationProcessor must be implemented correctly to avoid a circular NestJS dependency.

**Delivers:** Approval module with create/approve/reject operations, WebSocket gateway that pushes notifications to the CRM dashboard, REST endpoints for approval actions, conversation FSM correctly handling the `PENDING_APPROVAL` → `CLOSED` (approved) and `PENDING_APPROVAL` → `QUALIFYING` (rejected) transitions, and invalidation logic when the client sends new messages while a quotation is pending.

**Addresses (from FEATURES.md):** Partner quotation approval interface, notification to partner when bot needs approval, send approved quotation to client via WhatsApp, quotation version history (append-only)

**Avoids (from PITFALLS.md):** Approval state corruption (Pitfall 4), circular dependency between approval and conversation modules (BullMQ decoupling), polling-based notifications (WebSocket required)

**Research flag:** Skip deeper research — HITL approval patterns are well-documented; NestJS circular dependency resolution via BullMQ is a standard pattern

---

### Phase 5: CRM Dashboard

**Rationale:** The dashboard is a consumer of the backend, not a producer of it. Building it before the backend APIs are stable wastes effort on rework. By Phase 5, all REST and WebSocket endpoints are defined and working — the frontend is a clean integration exercise.

**Delivers:** Next.js 16 CRM dashboard with: unified conversation inbox (list + detail with message history), approval review queue (view draft, edit line items, approve/reject), pipeline view (Lead → Quoted → Closed), contacts list with search, real-time approval notification via Socket.IO.

**Addresses (from FEATURES.md):** Unified conversation inbox, contact record with conversation history, contact search and lookup, conversation status pipeline, partner correction logging (log delta between AI draft and approved quote)

**Research flag:** Skip deeper research — Next.js + shadcn/ui + TanStack Query patterns are well-documented; focus on approval UI interaction design which is product-specific

---

### Phase 6: Polish, Hardening, and Multi-Channel Prep

**Rationale:** Operational readiness issues (reminder notifications, idempotency edge cases, error handling, media handling) should not block core loop delivery but must be resolved before production launch. Multi-channel interface extraction in this phase confirms the abstraction holds and prepares for Instagram activation.

**Delivers:** 24-hour approval timeout reminder (partner WhatsApp notification), idempotency integration tests passing, graceful error handling with fallback bot messages, media downloaded and stored to object storage on receipt, `IChannel` interface formally extracted with `KapsoAdapter` implementing it, security hardening (webhook throttling, PII masking in logs, JWT expiry), "Looks Done But Isn't" checklist from PITFALLS.md fully verified.

**Addresses (from FEATURES.md):** Multi-channel architecture readiness confirmed at code level; all v1 table stakes verified end-to-end in production-like environment

**Avoids (from PITFALLS.md):** Media URL expiry (final verification), Kapso webhook auto-pause (monitoring + alerting), WhatsApp 24h window compliance (template vs. free-form), missing human takeover escape hatch (final UX QA)

**Research flag:** Skip deeper research — operational patterns are documented; Kapso-specific rate limits and webhook resume API may require consulting Kapso.ai docs directly

---

### Phase Ordering Rationale

- **Phases 1-2 before Phase 3:** The conversation FSM and state persistence must be stable and tested before AI is introduced as a new failure mode. Debugging FSM bugs and AI latency simultaneously is high-friction.
- **Phase 3 before Phase 4:** The Approval module requires a `Quotation` entity to exist. Phase 3 produces that entity; Phase 4 consumes it.
- **Phase 4 before Phase 5:** The dashboard is a consumer of all backend APIs. Building it before APIs are stable means building against a moving target.
- **Phase 6 last:** Polish and hardening is most valuable when the full loop exists to harden.
- **Channel abstraction in Phase 1, not Phase 6:** This is a day-1 data model and interface decision. Deferring it to Phase 6 means Phases 2-5 all accumulate channel-specific debt.

---

## Confidence Assessment

| Area | Confidence | Notes |
|------|------------|-------|
| Stack | HIGH | Core stack pre-decided by project constraints; supporting library choices confirmed via official docs and strong community consensus. One risk: Prisma 6 vs 7 constraint is based on a MEDIUM-confidence community source, but multiple independent sources confirm the ESM friction. |
| Features | MEDIUM-HIGH | Core features validated against multiple WhatsApp CRM products. Complexity estimates are judgment calls. Feature dependencies map is synthesized from first principles, not from a single authoritative source. |
| Architecture | HIGH | Webhook enqueue-and-return, Redis FSM, HITL approval patterns are established and well-documented. Kapso.ai-specific webhook behavior (idempotency key, 409 handling, auto-pause threshold) is MEDIUM confidence due to limited public documentation. |
| Pitfalls | HIGH (most) / LOW (Kapso specifics) | DeepSeek latency, webhook idempotency, AI hallucination patterns are well-documented across multiple production-grade sources. Kapso-specific limits (rate limits, exact retry behavior) have LOW confidence — official docs are sparse. |

**Overall confidence:** HIGH

### Gaps to Address

- **Kapso.ai rate limits and retry behavior:** Publicly undocumented. During Phase 1 implementation, test empirically or contact Kapso.ai support to confirm limits on outbound messages per second and webhook retry intervals. Build the `KapsoClient` with conservative retry logic from the start.
- **DeepSeek structured output reliability in Spanish:** Research confirms structured JSON output via the OpenAI SDK works. Reliability for Spanish-language software agency pricing has not been empirically verified — allocate time during Phase 3 for prompt iteration before the approval flow is wired.
- **Kapso.ai conversation history sync:** The SDK provides `client.conversations` and `client.messages.listByConversation`. These APIs are documented in the official GitHub but specific pagination behavior and limits are not confirmed. Validate during Phase 1 when wiring the initial contact/conversation sync.
- **WhatsApp messaging tier limits:** New numbers start at Tier 1 (1,000 unique recipients/day). Not relevant at current volume (<50/day) but confirm the current account tier to avoid surprise limits.

---

## Sources

### Primary (HIGH confidence)
- DeepSeek API docs (api-docs.deepseek.com) — OpenAI-compatible API, V3 model, 128K context, context caching pricing
- Kapso.ai official SDK (github.com/gokapso/whatsapp-cloud-api-js) — SDK installation, proxy config, method signatures
- Kapso.ai official docs (docs.kapso.ai) — webhook behavior, idempotency key, media URL expiry (4 minutes), auto-pause threshold
- NestJS official releases (github.com/nestjs/nest/releases) — v11 confirmed stable
- shadcn/ui official docs (ui.shadcn.com/docs/tailwind-v4) — Tailwind v4 compatibility, tw-animate-css
- BullMQ official docs (docs.bullmq.io) — concurrency, NestJS integration, worker patterns
- NestJS official docs (docs.nestjs.com/techniques/queues) — queue patterns
- Human-in-the-loop architecture patterns (agentpatterns.tech, ideafloats.com)
- Channel Adapter pattern (enterpriseintegrationpatterns.com)

### Secondary (MEDIUM confidence)
- Next.js 16 release blog (nextjs.org/blog/next-16) — v16 stable, Turbopack default
- Prisma 7 NestJS compatibility issue (dev.to community article) — ESM/CJS friction confirmed
- WhatsApp CRM competitor analysis (respond.io, chatmaxima.com, nethunt.com) — feature landscape
- DeepSeek API instability analysis (api7.ai) — latency spike patterns
- ORM comparison 2025 (dev.to) — Prisma vs Drizzle vs TypeORM
- BullMQ vs Bull migration (dev.to) — Bull maintenance-only status confirmed

### Tertiary (LOW confidence)
- Kapso.ai rate limits — not publicly documented; inferred from general WhatsApp Cloud API behavior
- DeepSeek performance in Spanish-language agency context — inferred from general multilingual performance data

---

*Research completed: 2026-03-15*
*Ready for roadmap: yes*
