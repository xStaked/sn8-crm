# Architecture Research

**Domain:** WhatsApp CRM with AI-powered quotation automation and human-in-the-loop approval
**Researched:** 2026-03-15
**Confidence:** HIGH (patterns well-established; Kapso.ai-specific details MEDIUM due to limited public docs)

## Standard Architecture

### System Overview

```
┌─────────────────────────────────────────────────────────────────────┐
│                        EXTERNAL LAYER                                │
│  ┌──────────────┐   ┌──────────────┐   ┌──────────────────────────┐ │
│  │  Kapso.ai    │   │  DeepSeek    │   │  CRM Operator (Browser)  │ │
│  │  (WhatsApp)  │   │  AI API      │   │  Next.js Dashboard       │ │
│  └──────┬───────┘   └──────┬───────┘   └────────────┬─────────────┘ │
└─────────┼─────────────────┼────────────────────────┼────────────────┘
          │ webhooks         │ HTTP calls              │ REST/WS
          ▼                  ▼                         ▼
┌─────────────────────────────────────────────────────────────────────┐
│                     NESTJS BACKEND (API)                             │
│  ┌──────────────────────────────────────────────────────────────┐   │
│  │                   Webhook Controller                          │   │
│  │   POST /webhooks/kapso  (verify + enqueue, returns 200 fast) │   │
│  └──────────────────────────┬───────────────────────────────────┘   │
│                              │ enqueue                               │
│  ┌───────────────────────────▼──────────────────────────────────┐   │
│  │              BullMQ Message Queue (Redis-backed)              │   │
│  │              Queues: [message-inbound, notification-outbound] │   │
│  └───────────────────────────┬──────────────────────────────────┘   │
│                              │ worker picks up job                   │
│  ┌───────────────────────────▼──────────────────────────────────┐   │
│  │                   Conversation Processor                      │   │
│  │  1. Load conversation state from Redis                        │   │
│  │  2. Run FSM transition logic                                  │   │
│  │  3. Call DeepSeek if AI step needed                           │   │
│  │  4. Persist to PostgreSQL                                     │   │
│  │  5. Save updated state to Redis                               │   │
│  │  6. Send reply via Kapso.ai outbound API                      │   │
│  └───────────────────────────────────────────────────────────────┘   │
│                                                                       │
│  ┌────────────────┐  ┌────────────────┐  ┌────────────────────────┐  │
│  │ Contacts/CRM   │  │ Quotation      │  │ Approval               │  │
│  │ Module         │  │ Module         │  │ Module                 │  │
│  └────────────────┘  └────────────────┘  └────────────────────────┘  │
└──────────────────────────────────────┬──────────────────────────────┘
                                       │
          ┌────────────────────────────┴────────────────────────┐
          ▼                                                      ▼
┌──────────────────────┐                             ┌──────────────────────┐
│   PostgreSQL         │                             │   Redis              │
│   (Prisma ORM)       │                             │   - Conversation     │
│   - contacts         │                             │     state (FSM)      │
│   - conversations    │                             │   - BullMQ queues    │
│   - messages         │                             │   - Session cache    │
│   - quotations       │                             └──────────────────────┘
│   - approvals        │
└──────────────────────┘
```

### Component Responsibilities

| Component | Responsibility | Implementation |
|-----------|----------------|----------------|
| Webhook Controller | Receives Kapso.ai events, validates signature, enqueues job, returns 200 immediately | NestJS Controller + guard |
| BullMQ Queue | Decouples webhook receipt from processing; handles retries, backpressure | `@nestjs/bullmq` + Redis |
| Conversation Processor | Orchestrates FSM transitions, AI calls, DB writes, outbound replies | BullMQ Worker (NestJS Processor) |
| Conversation FSM | Tracks conversation progress (GREETING → QUALIFYING → QUOTING → PENDING_APPROVAL → DONE) | Redis hash per phone number |
| DeepSeek Client | Extracts requirements from conversation, generates draft quote | HTTP module wrapper service |
| Kapso.ai Client | Sends outbound WhatsApp messages (text, templates, media) | HTTP module wrapper service |
| Contacts Module | Owns contact/lead lifecycle; upserts contacts on first message | NestJS module + Prisma |
| Quotation Module | Creates/stores quotations; exposes quote data to approval flow | NestJS module + Prisma |
| Approval Module | Creates approval requests, stores owner decisions, triggers bot resume | NestJS module + Prisma |
| CRM API | REST endpoints for Next.js dashboard (contacts, pipeline, quotes, approvals) | NestJS Controllers |
| Next.js Dashboard | CRM UI: conversation viewer, approval queue, pipeline kanban | Next.js App Router + React |
| Channel Adapter (future) | Normalizes events from WhatsApp / Instagram into a unified InboundMessage shape | Interface + implementations |

## Recommended Project Structure

### Backend (NestJS)

```
src/
├── main.ts                      # Bootstrap
├── app.module.ts                # Root module
│
├── channel/                     # Multi-channel abstraction
│   ├── channel.interface.ts     # IChannel: normalize inbound, send outbound
│   ├── kapso/                   # WhatsApp via Kapso.ai
│   │   ├── kapso.module.ts
│   │   ├── kapso-webhook.controller.ts
│   │   ├── kapso-client.service.ts  # Outbound HTTP calls
│   │   └── kapso.guard.ts           # Signature verification
│   └── instagram/               # Stubbed for v2
│       └── instagram.module.ts
│
├── conversation/                # Core bot logic
│   ├── conversation.module.ts
│   ├── conversation.processor.ts    # BullMQ worker — orchestrates everything
│   ├── conversation-fsm.service.ts  # State machine transitions
│   ├── conversation.service.ts      # DB ops for conversations/messages
│   └── states/                      # One file per FSM state
│       ├── greeting.state.ts
│       ├── qualifying.state.ts
│       ├── quoting.state.ts
│       └── pending-approval.state.ts
│
├── ai/                          # DeepSeek integration
│   ├── ai.module.ts
│   ├── ai.service.ts            # HTTP wrapper for DeepSeek API
│   └── prompts/                 # Prompt templates
│       ├── requirements-extractor.prompt.ts
│       └── quote-generator.prompt.ts
│
├── quotation/                   # Quotation domain
│   ├── quotation.module.ts
│   ├── quotation.service.ts
│   └── quotation.dto.ts
│
├── approval/                    # Human-in-the-loop domain
│   ├── approval.module.ts
│   ├── approval.service.ts      # Create approval, handle decision
│   ├── approval.controller.ts   # REST: POST /approvals/:id/approve|reject
│   └── approval.gateway.ts      # WebSocket: push notification to dashboard
│
├── contacts/                    # CRM contact management
│   ├── contacts.module.ts
│   ├── contacts.service.ts
│   └── contacts.controller.ts
│
├── pipeline/                    # Sales pipeline stages
│   ├── pipeline.module.ts
│   └── pipeline.service.ts
│
├── queue/                       # Queue configuration
│   ├── queue.module.ts
│   └── queue.constants.ts       # Queue name enums
│
└── prisma/                      # Database
    ├── prisma.module.ts
    ├── prisma.service.ts
    └── schema.prisma
```

### Frontend (Next.js)

```
app/
├── layout.tsx
├── (dashboard)/
│   ├── page.tsx                  # Pipeline overview
│   ├── conversations/
│   │   ├── page.tsx              # Conversation list
│   │   └── [id]/page.tsx         # Conversation detail + message history
│   ├── approvals/
│   │   ├── page.tsx              # Pending approval queue
│   │   └── [id]/page.tsx         # Review quote + approve/reject with feedback
│   ├── contacts/
│   │   └── page.tsx
│   └── quotations/
│       └── page.tsx
└── api/                          # Next.js API routes (thin proxies to NestJS)
```

### Structure Rationale

- **channel/:** Isolated so adding Instagram v2 means only a new adapter, zero changes to core bot logic
- **conversation/states/:** Each FSM state in its own file — easy to add/remove conversation steps independently
- **ai/prompts/:** Prompts are configuration, not code — separate files make iteration fast without touching logic
- **approval/:** Completely separate domain; approval flow is a business requirement that may change independently

## Architectural Patterns

### Pattern 1: Webhook Enqueue-and-Return

**What:** The webhook controller does ONLY signature verification + job enqueue, then immediately returns HTTP 200. All actual processing happens in a BullMQ worker.

**When to use:** Always for messaging webhooks. Kapso.ai (and WhatsApp API in general) expects sub-second response or will retry the webhook, causing duplicate processing.

**Trade-offs:** Adds BullMQ dependency; gains retry logic, backpressure handling, and decoupling for free.

```typescript
// kapso-webhook.controller.ts
@Post('webhook')
@UseGuards(KapsoSignatureGuard)
async handleWebhook(@Body() payload: KapsoWebhookDto) {
  await this.messageQueue.add('process-inbound', payload, {
    attempts: 3,
    backoff: { type: 'exponential', delay: 2000 },
  });
  return { status: 'ok' }; // Return fast — never block here
}
```

### Pattern 2: Redis FSM for Conversation State

**What:** Each conversation has a current state stored in Redis as a hash. The Conversation Processor reads state, determines which handler to invoke, executes it, and writes the new state back. State includes: current FSM step, collected fields so far, pending quote ID, message count.

**When to use:** Any multi-turn bot conversation where context must survive across separate webhook calls.

**Trade-offs:** Redis becomes a dependency for bot logic; but Redis is already required for BullMQ, so no new infrastructure.

```typescript
// conversation-fsm.service.ts
interface ConversationState {
  phoneNumber: string;
  step: 'GREETING' | 'QUALIFYING' | 'QUOTING' | 'PENDING_APPROVAL' | 'CLOSED';
  collectedFields: Partial<ProjectRequirements>;
  pendingQuotationId?: string;
  assignedAgentId?: string;
  messageCount: number;
  lastActivityAt: string; // ISO timestamp
}

// State stored at key: conversation:{phoneNumber}
// TTL: 7 days of inactivity
```

### Pattern 3: Return-of-Control for Human Approval

**What:** When the AI generates a quote, the bot sends a preview message to the client ("Let me prepare a quote for you, I'll be in touch shortly"), then creates an `Approval` record in PostgreSQL with status `PENDING` and pauses — the conversation FSM is set to `PENDING_APPROVAL`. The bot does NOT proceed until the owner acts.

The dashboard polls or receives a WebSocket push for new approvals. The owner reviews, edits line items if needed, then calls `POST /approvals/:id/approve` or `POST /approvals/:id/reject` with optional feedback. The approval service then re-enqueues a synthetic job to the conversation processor to resume the flow (approved → send quote to client; rejected → loop back to qualifying or re-generate).

**When to use:** Required by business constraint — no quote leaves without owner sign-off.

**Trade-offs:** Owner must be available; bot waits indefinitely (acceptable for SN8 team size). If no action in 24h, a reminder notification should fire.

```typescript
// approval.service.ts
async createApproval(quotationId: string, conversationId: string) {
  const approval = await this.prisma.approval.create({
    data: { quotationId, conversationId, status: 'PENDING' },
  });
  // Notify dashboard via WebSocket
  this.approvalGateway.notifyPendingApproval(approval);
  return approval;
}

async approve(approvalId: string, agentId: string, notes?: string) {
  await this.prisma.approval.update({
    where: { id: approvalId },
    data: { status: 'APPROVED', agentId, notes, resolvedAt: new Date() },
  });
  // Resume the conversation processor
  await this.messageQueue.add('resume-conversation', {
    conversationId: approval.conversationId,
    decision: 'APPROVED',
  });
}
```

## Data Flow

### Inbound Message Flow (Happy Path)

```
Client sends WhatsApp message
    ↓
Kapso.ai delivers POST /webhooks/kapso
    ↓
KapsoSignatureGuard validates HMAC signature
    ↓
WebhookController enqueues job → BullMQ (Redis)
    ↓ returns 200 immediately
BullMQ Worker (ConversationProcessor) picks up job
    ↓
Load ConversationState from Redis
    ↓
ConversationFSM.transition(state, message)
    ├── If GREETING:   reply with greeting, advance to QUALIFYING
    ├── If QUALIFYING: extract fields via DeepSeek, accumulate, advance when complete
    ├── If QUOTING:    call DeepSeek.generateQuote(), save Quotation, create Approval,
    │                  set state → PENDING_APPROVAL, send "preparing quote" to client
    └── If PENDING_APPROVAL: ignore inbound (or send "still reviewing" auto-reply)
    ↓
Persist message to PostgreSQL (messages table)
Upsert contact in PostgreSQL (contacts table)
Save updated state to Redis
    ↓
KapsoClient.sendMessage() → Kapso.ai outbound API → client's WhatsApp
```

### Approval Flow (Human Gate)

```
ConversationProcessor creates Quotation + Approval (status=PENDING)
    ↓
ApprovalGateway.notifyPendingApproval() → WebSocket push to dashboard
    ↓
Owner opens /approvals/:id in Next.js dashboard
    ↓
Owner reviews generated quote, optionally edits line items
    ↓
Owner clicks Approve / Reject + optional feedback note
    ↓
POST /approvals/:id/approve  OR  POST /approvals/:id/reject
    ↓
ApprovalService updates status → APPROVED / REJECTED
    ↓
Enqueue 'resume-conversation' job into BullMQ
    ↓
ConversationProcessor resumes:
    ├── APPROVED → format quote as WhatsApp message, send to client
    │              advance pipeline stage to QUOTED
    └── REJECTED → if feedback: re-run DeepSeek with feedback context
                   ask client follow-up questions
                   reset to QUALIFYING or QUOTING
```

### State Management (Redis Schema)

```
Key:    conversation:{phoneNumber}
Type:   Redis Hash
TTL:    604800s (7 days)

Fields:
  step              "QUALIFYING"
  messageCount      "5"
  collectedFields   "{\"projectType\":\"ecommerce\",\"budget\":\"open\"}"
  pendingQuoteId    "uuid-of-quotation"
  assignedAgentId   "uuid-of-agent"
  lastActivityAt    "2026-03-15T10:30:00Z"
  channel           "whatsapp"          ← enables multi-channel prep
```

### PostgreSQL Schema (Core Tables)

```
contacts
  id, phoneNumber, name, email, channel, createdAt

conversations
  id, contactId, agentId, channel, pipelineStage, createdAt, updatedAt

messages
  id, conversationId, direction (IN/OUT), content, mediaUrl, sentAt

quotations
  id, conversationId, lineItemsJson, totalAmount, currency,
  generatedByAI, aiPromptSnapshot, createdAt

approvals
  id, quotationId, conversationId, status (PENDING/APPROVED/REJECTED),
  agentId, notes, resolvedAt, createdAt
```

## Conversation State Machine

### States and Transitions

```
              ┌─────────────────────────────────────┐
              │                                     │
   [new msg]  ▼                                     │
  ─────────► GREETING ──────────────────► QUALIFYING│
              (send intro)   [ack/name]   (collect   │
                                          scope,     │
                                          tech,      │
                                          budget,    │
                                          timeline)  │
                                             │       │
                                 [fields ok]│       │
                                             ▼       │
                                          QUOTING    │
                                  (DeepSeek generates│
                                   draft quotation,  │
                                   creates Approval, │
                                   sends "preparing" │
                                   msg to client)    │
                                             │       │
                                             ▼       │
                                    PENDING_APPROVAL │
                                  (bot paused;       │
                                   human reviews in  │
                                   dashboard)        │
                                        │       │    │
                               [approve]│  [rej]│    │
                                        ▼       │    │
                                    CLOSED      │    │
                                  (quote sent   │    │
                                   to client)   │    │
                                               └────►┘
                                          (re-qualify or
                                           regenerate with
                                           agent feedback)
```

### FSM Implementation Notes

- State is stored in Redis, NOT in-memory — survives restarts and scales to multiple workers
- Each state handler is a separate class implementing a `IStateHandler` interface with a single `handle(state, message): Promise<StateTransition>` method
- The `ConversationFSM` service is the only component allowed to write conversation state to Redis
- Unknown/unexpected messages in `PENDING_APPROVAL` state trigger a polite "still reviewing" auto-reply — no state change
- `CLOSED` conversations can be re-opened if client sends a new message (creates new conversation record, does NOT reuse closed one)

## Integration Points

### External Services

| Service | Integration Pattern | Gotchas |
|---------|---------------------|---------|
| Kapso.ai (inbound) | Webhook POST from Kapso → NestJS; signature header validation required | Validate HMAC before any processing; Kapso retries on non-200 → must be idempotent (check message ID in Redis) |
| Kapso.ai (outbound) | NestJS → HTTP POST to Kapso REST API | Rate limits unknown publicly — add exponential retry; use a dedicated KapsoClient service, never call HTTP directly from processor |
| DeepSeek AI | NestJS → HTTP POST to DeepSeek Chat API | Calls can take 3-10s — must be async inside the worker, never in the webhook controller; add timeout + fallback response |
| Next.js Dashboard | NestJS REST API + WebSocket (Socket.io or NestJS Gateway) | WebSocket needed for real-time approval notifications; REST for all CRUD |

### Internal Boundaries

| Boundary | Communication | Notes |
|----------|---------------|-------|
| WebhookController ↔ ConversationProcessor | BullMQ queue (async) | Only coupling is the job payload shape (DTO) |
| ConversationProcessor ↔ ApprovalService | Direct service call within NestJS DI | Approval is a domain boundary — processor calls approval.create(), doesn't own approval logic |
| ApprovalService ↔ ConversationProcessor (resume) | BullMQ queue (async) | Keeps approval module from having a circular dependency on the conversation module |
| Backend ↔ Frontend | REST + WebSocket | REST for data; WebSocket only for push notifications (approval alerts, new message counts) |
| ConversationProcessor ↔ Redis (FSM) | Direct ioredis via ConversationFSMService | FSM service is the single writer — no other code writes conversation state to Redis |
| All modules ↔ PostgreSQL | Prisma ORM via PrismaService | All DB access through Prisma; no raw SQL except for migrations |

## Build Order Implications

The components have clear dependencies that dictate build order:

```
Phase 1 (Foundation):
  PrismaService + schema → contacts, conversations, messages tables
  Redis setup → BullMQ configuration
  KapsoClient (outbound) → needed before any bot responses
  WebhookController + signature guard → gate to everything else

Phase 2 (Bot Core):
  ConversationFSM service + Redis state
  GREETING and QUALIFYING state handlers (no AI yet)
  ConversationProcessor (BullMQ worker) wiring it all together
  End-to-end: receive WhatsApp → process → reply works

Phase 3 (AI + Quotation):
  DeepSeek AI service + prompts
  Requirements extraction in QUALIFYING state
  Quotation module + DB schema
  QUOTING state handler + AI call

Phase 4 (Human Approval):
  Approval module + DB schema
  PENDING_APPROVAL state handler
  ApprovalService (create/approve/reject)
  WebSocket gateway for push notifications
  Approval Controller (REST endpoints)

Phase 5 (CRM Dashboard):
  Next.js project setup
  API client layer (typed fetch wrappers)
  Conversation list + detail views
  Approval review UI (the critical path for owners)
  Pipeline kanban + contacts list

Phase 6 (Polish):
  Reminder notifications (24h approval timeout)
  Idempotency keys on webhook processing
  Error handling and fallback bot messages
  Multi-channel prep: extract IChannel interface, wrap Kapso behind it
```

## Scaling Considerations

| Scale | Architecture Adjustments |
|-------|--------------------------|
| < 50 conv/day (current) | Monolith NestJS + single Redis + single Postgres. No special tuning needed. BullMQ concurrency = 2-5 workers sufficient. |
| 50-500 conv/day | Add BullMQ worker concurrency. Redis read replicas. Postgres connection pooling (PgBouncer). Still monolith. |
| 500+ conv/day | Extract channel adapters to separate service. Add Postgres read replica for CRM queries. Consider horizontal pod scaling (NestJS is stateless except Redis). |

### Scaling Priorities

1. **First bottleneck:** DeepSeek API latency — calls can be slow; BullMQ absorbs spikes; add response caching for similar requirement patterns
2. **Second bottleneck:** PostgreSQL writes (every message persisted) — use write batching or a message buffer table; CRM reads can go to read replica

## Anti-Patterns

### Anti-Pattern 1: Processing in the Webhook Handler

**What people do:** Call DeepSeek, write to DB, send reply — all inside the POST /webhook controller action.

**Why it's wrong:** Response time exceeds 2-5s. Kapso.ai interprets this as a failed delivery and retries, causing duplicate bot messages. Also blocks the NestJS event loop.

**Do this instead:** Enqueue and return 200 in < 100ms. Do all work in BullMQ worker.

### Anti-Pattern 2: Storing Conversation State Only in PostgreSQL

**What people do:** Skip Redis; load full message history from Postgres on every message to determine state.

**Why it's wrong:** Slow (DB query on every webhook), expensive at scale, and misses the FSM concept — you end up with fragile "look at last N messages to guess state" logic.

**Do this instead:** Use Redis for hot state (current FSM step + in-progress fields). PostgreSQL is the archive/audit trail, not the state store.

### Anti-Pattern 3: Sending the Quote Without Approval

**What people do:** Auto-send the AI-generated quote to the client if no owner responds within X minutes.

**Why it's wrong:** Violates the hard business requirement. A badly-priced quote sent to a client cannot be unsent and damages commercial trust.

**Do this instead:** Bot sends "I'm working on your quote, we'll follow up shortly." Owner approves. No timeout auto-send. Add a reminder ping to the owner instead.

### Anti-Pattern 4: Building Channel Logic Into the Conversation Processor

**What people do:** Add `if (channel === 'whatsapp') { ... } else if (channel === 'instagram') { ... }` branches inside the state handlers.

**Why it's wrong:** Makes adding Instagram v2 a surgery on every state handler. Breaks open/closed principle.

**Do this instead:** All channel specifics live in the channel adapter (KapsoClient / future InstagramClient). The ConversationProcessor only calls `this.channel.send(phoneNumber, message)` — it does not know which channel it is using.

### Anti-Pattern 5: Circular Dependency Between Approval and Conversation Modules

**What people do:** ApprovalService imports ConversationService to resume flow; ConversationProcessor imports ApprovalService to create approvals — circular import.

**Why it's wrong:** NestJS will throw circular dependency errors, or worse, silently fail to inject.

**Do this instead:** Break the cycle with BullMQ. ConversationProcessor → calls ApprovalService (one direction). ApprovalService → enqueues a 'resume-conversation' BullMQ job (never imports ConversationProcessor directly). The queue is the decoupling mechanism.

## Sources

- [Building a Scalable Webhook Architecture for Custom WhatsApp Solutions](https://www.chatarchitect.com/news/building-a-scalable-webhook-architecture-for-custom-whatsapp-solutions)
- [Building WhatsApp Business Bots with the Official API: Architecture, Webhooks, and Automation Patterns](https://dev.to/achiya-automation/building-whatsapp-business-bots-with-the-official-api-architecture-webhooks-and-automation-1ce4)
- [Human-in-the-Loop Architecture: When Humans Approve Agent Decisions](https://www.agentpatterns.tech/en/architecture/human-in-the-loop-architecture)
- [Human-in-the-Loop AI in 2025: Proven Design Patterns for Safer, Smarter Systems](https://blog.ideafloats.com/human-in-the-loop-ai-in-2025/)
- [NestJS BullMQ Integration](https://docs.bullmq.io/guide/nestjs)
- [NestJS Queues (official docs)](https://docs.nestjs.com/techniques/queues)
- [Battle-Tested Architecture: Processing Infinite Webhook Events with Agenda.js Queue + NestJS](https://vitiya99.medium.com/battle-tested-architecture-processing-infinite-webhook-events-with-agenda-js-queue-nestjs-faaf6dc9a961)
- [Channel Adapter - Enterprise Integration Patterns](https://www.enterpriseintegrationpatterns.com/patterns/messaging/ChannelAdapter.html)
- [Applying Domain-Driven Design principles to a Nest.js project](https://dev.to/bendix/applying-domain-driven-design-principles-to-a-nest-js-project-5f7b)
- [bot-state-machine - npm (Redis-backed FSM for chatbots)](https://www.npmjs.com/package/bot-state-machine)

---
*Architecture research for: WhatsApp CRM with AI quotation automation and human-in-the-loop approval (SN8 Labs)*
*Researched: 2026-03-15*
