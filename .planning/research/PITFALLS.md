# Pitfalls Research

**Domain:** WhatsApp CRM + AI-powered quotation automation (NestJS + Kapso.ai + DeepSeek)
**Researched:** 2026-03-15
**Confidence:** HIGH (webhook/idempotency, AI latency) | MEDIUM (multi-channel abstraction, HITL state) | LOW (Kapso-specific undocumented limits)

---

## Critical Pitfalls

### Pitfall 1: Webhook Duplicate Processing — Sending the Same Message Twice

**What goes wrong:**
WhatsApp delivers webhooks at-least-once, not exactly-once. Kapso.ai also confirms using `X-Idempotency-Key` headers (SHA256 hash of payload) as a deduplication signal — implying duplicates are an expected operating condition. If the handler processes the same inbound message twice, the bot starts a second parallel conversation thread with the same client, generates a duplicate AI quotation call (extra cost), and may send the client two conflicting messages.

**Why it happens:**
Developers assume webhooks arrive exactly once and skip deduplication. The default NestJS controller processes the payload inline without checking if it was already seen. The Kapso webhook is also auto-paused if failure rate exceeds 85% in a 15-minute window — so a transient server error causes retries that hit an already-recovered endpoint, triggering duplicates.

**How to avoid:**
- Immediately return HTTP 200 before any async processing — never let Kapso/WhatsApp time out waiting for a response.
- Persist a `processed_message_ids` set in Redis with a TTL of 24 hours (matches session window). Key: `wh:msg:{messageId}`. On every incoming webhook, check existence before enqueuing.
- Use the `@node-idempotency/nestjs` interceptor or a NestJS guard that wraps the webhook endpoint.
- Never process webhook payloads synchronously inside the HTTP handler.

**Warning signs:**
- Client complains about receiving duplicate bot messages.
- AI cost logs show double invocations for the same `conversationId` within seconds.
- Database has two `Quotation` rows with the same `externalMessageId`.

**Phase to address:** Core infrastructure / webhook ingestion phase (before any business logic is built on top of it).

---

### Pitfall 2: DeepSeek Latency Spike — Bot Goes Silent for 30-120 Seconds

**What goes wrong:**
DeepSeek's official API has documented instability under load — timeouts of 120 seconds have been reported on Azure and on the direct API. For a WhatsApp CRM where the client is waiting for a reply, a 30-120 second silence reads as "bot is broken." If the NestJS service hangs waiting for DeepSeek with no timeout configured, the HTTP worker thread (or BullMQ job) stalls, cascading to queue backpressure.

**Why it happens:**
- No explicit `timeout` is set on the HTTP client calling DeepSeek.
- No user-feedback message is sent ("Analizando tu proyecto, dame un momento...") before the AI call begins.
- No fallback or retry strategy for transient 5xx or rate-limit (429) errors.
- Using DeepSeek-R1 (reasoning/thinking mode) instead of DeepSeek-V3 chat for conversational replies — thinking mode can produce very long chain-of-thought before responding.

**How to avoid:**
- Set an explicit `timeout` of 25-30 seconds on the DeepSeek HTTP client.
- Before calling DeepSeek, always send an acknowledgment message via Kapso: "Estoy preparando tu cotización, dame un momento."
- Use DeepSeek-V3 (chat, non-thinking mode, 8K output limit) for conversational flows. Reserve reasoning mode only if explicitly needed for complex pricing.
- Implement exponential backoff retries (max 3 attempts) for 429 and 5xx using a BullMQ job with `attempts: 3, backoff: { type: 'exponential', delay: 2000 }`.
- If all retries fail, notify the partner via the CRM dashboard and send the client a fallback message: "Estamos revisando tu caso manualmente."

**Warning signs:**
- BullMQ job `active` time exceeds 30 seconds on AI quotation jobs.
- DeepSeek response logs show >25% of calls over 20 seconds.
- Clients send follow-up messages like "¿Sigues ahí?" within 60 seconds of the last bot message.

**Phase to address:** AI quotation generation phase. Implement timeout + fallback before wiring approval flow.

---

### Pitfall 3: AI Hallucination on Pricing — Bot Sends Absurd Numbers to Approval

**What goes wrong:**
DeepSeek generates a quotation with wildly incorrect pricing (e.g., a landing page quoted at $50,000 or a full CRM at $500). The partner sees it in the approval interface, assumes the system is working, and approves without reading carefully — or the quotation goes through a misconfigured auto-path. Client receives an obviously wrong number, destroying trust.

**Why it happens:**
- System prompt does not constrain the output range with hard price floors/ceilings per project category.
- No structured output schema is enforced — the model returns free-form text with a number embedded in prose.
- The AI call includes the full raw conversation (with irrelevant messages) rather than a structured requirements summary.
- No validation step between AI response and persistence.

**How to avoid:**
- Enforce structured JSON output from DeepSeek with a Zod schema: `{ estimatedMin: number, estimatedMax: number, breakdown: LineItem[], reasoning: string }`. Parse and validate with Zod before storing.
- Include hard sanity checks in the NestJS service: if `estimatedMin < 100` or `estimatedMax > 500000` (configurable env vars), flag the quotation as `NEEDS_REVIEW` and block auto-progression to partner notification.
- System prompt must include a reference pricing guide with category ranges: "Landing page: $500-$3000. CRM básico: $3000-$15000..." sourced from real SN8 Labs pricing data.
- The approval interface must display the breakdown, not just the total — partners will catch breakdowns faster than totals.

**Warning signs:**
- Quotation estimates with `estimatedMin > estimatedMax`.
- Any quotation with `estimatedMin < $200` for any project type (too low to be real).
- Partner rejections with comments like "precio incorrecto" at high frequency.

**Phase to address:** AI quotation generation phase. The schema validation and sanity bounds must ship before the first real quotation is generated.

---

### Pitfall 4: Approval State Corruption — Partner Acts on a Stale Quotation

**What goes wrong:**
The partner opens the CRM dashboard, sees a pending quotation for Client A, and clicks "Approve" — but meanwhile, the client sent three more messages in WhatsApp changing the requirements. The bot queued those messages and is mid-flight updating the conversation state. The partner approves a quotation that is now invalid. The bot then sends the outdated quotation to the client.

**Why it happens:**
- No locking or version check on the `Quotation` entity before approval action is applied.
- The approval endpoint does not validate that the underlying `Conversation` state is still compatible (e.g., client has not replied since the quotation was generated).
- Bot and partner actions share the same mutable state without concurrency guards.

**How to avoid:**
- Add an optimistic lock on `Quotation`: use TypeORM `@VersionColumn()`. The approval action must supply the current version; a mismatch returns 409, forcing the frontend to reload.
- Define a `Conversation` state machine with explicit valid transitions: `AWAITING_REQUIREMENTS → GENERATING_QUOTE → PENDING_APPROVAL → SENDING → CLOSED`. Any client message received while in `PENDING_APPROVAL` transitions back to `AWAITING_REQUIREMENTS` and **invalidates** (sets status `SUPERSEDED`) any in-flight quotations.
- The approval interface must show a "Conversation has new messages — quotation invalidated" warning with a re-generate button.
- Never allow the `PENDING_APPROVAL` state to coexist with an active message-processing job for the same conversation.

**Warning signs:**
- Client replies "eso no es lo que pedí" after receiving a quotation.
- Database has `Quotation` rows in status `SENT` for conversations where `lastClientMessageAt > quotationGeneratedAt`.
- Concurrency errors on the `quotations` table version column under load.

**Phase to address:** Human-in-the-loop approval phase. The state machine must be fully defined before building the approval UI.

---

### Pitfall 5: Conversation State Lost on Restart — Bot Forgets Mid-Conversation

**What goes wrong:**
The team deploys a new version at 2pm. A client is mid-conversation (bot has asked 3 of 5 questions). After the restart, the in-memory conversation step counter is gone. The bot either starts over from question 1 (confusing the client) or crashes trying to access `undefined` state.

**Why it happens:**
- Conversation state (current step, collected requirements, partial data) is stored in-process memory rather than persisted to database or Redis.
- Common early shortcut: `const sessions = new Map<string, ConversationState>()` in the service class.

**How to avoid:**
- All conversation state must be persisted to the database from day 1. The `Conversation` entity stores: `currentStep: string`, `collectedData: jsonb`, `lastBotMessageAt: timestamp`.
- On every inbound message, load state from DB — never assume memory is warm.
- Use Redis only as a read cache with a short TTL (60 seconds) if latency from DB reads becomes an issue at scale.
- Write an integration test that simulates a mid-conversation restart by instantiating a new service and verifying state recovery.

**Warning signs:**
- Clients start conversations from step 1 multiple times.
- Error logs show `Cannot read property 'step' of undefined` after a deploy.
- Any `Map` or in-memory object used to store per-conversation state in a NestJS service.

**Phase to address:** Core conversation engine phase, before any multi-step flow is built.

---

### Pitfall 6: Growing Context Window = Growing Costs = Silent Budget Drain

**What goes wrong:**
DeepSeek's API is stateless. On every AI call, the entire conversation history is re-sent. A conversation with 40 exchanges (each ~100 tokens) sends ~4000 tokens of history per call, plus the system prompt (~800 tokens), plus the requirements summary. After 10 such quotation generations per day, context costs accumulate. Worse, as conversations age, the history sent grows, making later calls more expensive than earlier ones without any change in business value.

**Why it happens:**
- Naively passing `conversation.messages` directly as the context array without windowing.
- No awareness of DeepSeek's pricing differential: cache miss ($0.28/M) vs. cache hit ($0.028/M) — 10x cost difference.

**How to avoid:**
- Set a hard `MAX_CONTEXT_MESSAGES = 20` (last 20 messages) for conversational turns. For quotation generation, send only the structured requirements summary, not the raw conversation.
- Structure the DeepSeek system prompt so it is identical across all quotation calls (enabling context caching at prefix level — 90% cheaper for the repeated system prompt portion).
- Log `prompt_cache_hit_tokens` and `prompt_cache_miss_tokens` from every DeepSeek response. Alert if cache hit rate drops below 50%.
- Add a monthly cost budget alert. At <50 conversations/day and <3 AI calls per conversation, DeepSeek V3 cost should stay well under $5/month — if it exceeds $20/month, investigate context bloat.

**Warning signs:**
- DeepSeek cost per quotation growing week-over-week with no change in conversation complexity.
- API responses showing `prompt_tokens > 5000` for a standard quotation request.
- `prompt_cache_hit_tokens = 0` in any response log (system prompt not being cached).

**Phase to address:** AI quotation generation phase, when DeepSeek integration is first built.

---

### Pitfall 7: Multi-Channel Abstraction Deferred — Instagram Migration Becomes a Rewrite

**What goes wrong:**
All channel-specific logic (Kapso webhook parsing, WhatsApp message formatting, template IDs) is written directly into the business logic service. When Instagram (v2) is added, every service must be touched. What should be a new adapter becomes a 2-week refactor touching conversation handlers, message senders, and notification services.

**Why it happens:**
- "We'll clean this up when we add Instagram" — that day never comes until it's too late.
- Channel-specific objects (Kapso `WebhookPayload`, Kapso `SendMessageDto`) are typed and referenced throughout the codebase instead of behind a canonical interface.

**How to avoid:**
- Define a `ChannelAdapter` interface from day 1: `parseInbound(raw: unknown): NormalizedMessage`, `sendText(to: string, text: string): Promise<void>`, `sendTemplate(to: string, templateId: string, vars: Record<string, string>): Promise<void>`.
- `KapsoAdapter` implements `ChannelAdapter`. All business logic receives `ChannelAdapter`, never `KapsoAdapter`.
- The `NormalizedMessage` type is the canonical message shape used by all conversation services.
- When Instagram is added, only a new `InstagramAdapter` needs to be written — zero changes to business logic.
- Enforce this boundary with a NestJS custom token (`CHANNEL_ADAPTER`) injected via `useClass`, not direct class injection.

**Warning signs:**
- Any import of `KapsoWebhookPayload` outside of `kapso.adapter.ts` or `kapso.module.ts`.
- Business logic services that call `this.kapsoService` instead of `this.channelAdapter`.
- A `switch (channel)` block inside a conversation handler.

**Phase to address:** Core infrastructure phase, before any conversation flow is built.

---

## Technical Debt Patterns

Shortcuts that seem reasonable but create long-term problems.

| Shortcut | Immediate Benefit | Long-term Cost | When Acceptable |
|----------|-------------------|----------------|-----------------|
| In-memory conversation state (`Map<string, State>`) | Faster to build, no DB schema design | Lost state on restart, untestable, breaks horizontal scaling | Never — even for MVP |
| Hardcoded Kapso types in business logic | Saves abstraction boilerplate | Full rewrite when Instagram is added | Never |
| No idempotency guard on webhook endpoint | Simpler code, faster to ship | Duplicate messages, duplicate AI calls, duplicate quotations in DB | Never |
| Skipping DeepSeek response schema validation | No Zod dependency, faster | Hallucinated pricing reaches partner approval queue | Never |
| Synchronous DeepSeek call inside webhook handler | Simpler flow, easier to trace | Request timeouts cause Kapso webhook retries, causing duplicate processing | Never |
| No conversation state machine — just `if/else` steps | Faster initial implementation | Impossible to add states (PENDING_APPROVAL, ESCALATED) without rewriting flow | MVP only if states ≤ 3, plan refactor before Phase 3 |
| No message queue for AI calls | No Redis/BullMQ to set up | Single server restart drops all in-flight AI requests | Acceptable only in very early local testing |
| Polling for partner approval (frontend polls every 5s) | No WebSocket complexity | Unnecessary DB load, delayed UX | Acceptable in MVP if partner count ≤ 2 and conversation volume ≤ 10/day |

---

## Integration Gotchas

Common mistakes when connecting to external services.

| Integration | Common Mistake | Correct Approach |
|-------------|----------------|------------------|
| Kapso.ai webhooks | Processing payload synchronously before returning 200 | Return 200 immediately, enqueue to BullMQ, process async |
| Kapso.ai webhooks | Not handling `409 Conflict` when sending a message while another is in-flight for same recipient | Implement retry with 1-2 second delay on 409; Kapso enforces sequential delivery per recipient |
| Kapso.ai media | Storing the media download URL from the webhook payload | URL expires in 4 minutes — download and store in S3/object storage on webhook receipt |
| Kapso.ai webhook health | Ignoring webhook pause events | Monitor webhook failure rate; Kapso auto-pauses at 85% failure rate — implement alerting and auto-resume |
| DeepSeek API | No `max_tokens` limit set on output | Non-thinking mode defaults can produce unexpectedly large outputs; set `max_tokens: 1024` for conversational replies, `max_tokens: 2048` for quotation generation |
| DeepSeek API | Using reasoning/R1 mode for conversational turns | R1 adds chain-of-thought tokens (up to 64K output) — costs 3-4x more and is 5-10x slower; use `deepseek-chat` (V3) for all conversational use |
| DeepSeek API | Sending raw conversation messages array as context | Always send a structured requirements summary for quotation generation; raw history inflates token count with irrelevant messages |
| WhatsApp 24h window | Sending template messages for in-session proactive follow-up | Within 24h of last client message, free-form messages are allowed; templates are only needed for business-initiated messages after the 24h window closes |
| WhatsApp messaging limits | Sending to new numbers from a fresh API number | New phone numbers start at Tier 1 (1,000 unique recipients/day); expect slow ramp — not relevant at <50 conversations/day, but plan for Tier 2 upgrade |

---

## Performance Traps

Patterns that work at small scale but fail as usage grows.

| Trap | Symptoms | Prevention | When It Breaks |
|------|----------|------------|----------------|
| Loading full conversation history from DB on every message (no pagination) | Slow response times for long-running conversations | Limit DB query to last N messages; store `collectedData` as structured JSON, not embedded in message log | ~200 messages per conversation (uncommon but possible for complex projects) |
| BullMQ workers with concurrency > 1 on AI queue | Two DeepSeek calls for same conversation in parallel, race condition on state update | Set `concurrency: 1` per conversation using job grouping (BullMQ Flow or job name partitioning by `conversationId`) | Any volume where two messages arrive within the processing window of a single message |
| No index on `Conversation.externalId` (phone number / chat ID) | Webhook handler DB lookup slows down linearly with conversation count | Add DB index on `externalId` and `channelType` from day 1 | ~1,000 conversations (months away, but cheap to prevent) |
| Polling-based approval notifications (partner refreshes dashboard) | Partners miss quotations needing approval; slow UX | Use Server-Sent Events or WebSocket for real-time approval notifications in the CRM | Immediately noticeable with 2+ active partners on same account |
| Storing all WhatsApp media files in the application server filesystem | Disk fills up; media lost on server replace | Use object storage (S3-compatible, e.g. Cloudflare R2) for media from day 1 | ~1GB of media (days at active usage) |

---

## Security Mistakes

Domain-specific security issues beyond general web security.

| Mistake | Risk | Prevention |
|---------|------|------------|
| No webhook signature verification on Kapso endpoint | Any attacker who discovers the endpoint can inject fake messages, trigger AI calls, create fraudulent quotations | Verify `X-Kapso-Signature` header on every webhook request before processing; fail with 401 on mismatch |
| Quotation approval endpoint accessible without auth | Anyone with the URL can approve or reject quotations | Partner-facing CRM endpoints must require JWT auth; approval action must validate the approving user is a partner with access to that conversation |
| Storing DeepSeek API key in code or `.env` committed to repo | Key leak = unlimited AI spend charged to the account | Use environment secrets (Railway/Render secrets, or a secrets manager); never commit `.env.production` |
| Logging full conversation content (including client PII) to stdout | Log aggregation services store client names, phone numbers, project details in plaintext | Mask PII in logs: phone numbers → `+52***1234`, names → `[REDACTED]`. Log only `conversationId`, not raw message content |
| No rate limiting on the webhook endpoint | Malicious flood of fake webhook calls exhausts BullMQ queue and DeepSeek budget | Apply NestJS `ThrottlerGuard` on the webhook endpoint (e.g., 100 requests/minute per IP) |
| Partner approves quotation from a shared/public device without session expiry | Another person approves or rejects quotations | Set short JWT expiry (8 hours) and implement logout-on-tab-close for the CRM dashboard |

---

## UX Pitfalls

Common user experience mistakes in this domain.

| Pitfall | User Impact | Better Approach |
|---------|-------------|-----------------|
| Bot starts gathering requirements immediately with no greeting | Client feels like they hit an IVR, low trust | Start every new conversation with a human-feeling greeting: "Hola! Soy el asistente de SN8 Labs. ¿En qué proyecto puedo ayudarte?" |
| Bot asks all questions in sequence without confirming understanding | Client loses thread, feels interrogated | After every 2-3 questions, summarize what was collected: "Perfecto, entonces necesitas una app móvil con login y pagos..." |
| Approval notification is only visible inside the CRM — partner is away from desk | Quotation sits pending for hours, client perceives slow response | Send a WhatsApp message to the partner's own phone when a quotation needs approval — use the same Kapso integration |
| Bot sends the partner-approved quotation as a wall of text | Client can't parse it; no clear CTA | Format quotation as a structured WhatsApp message: bold section headers, separate message for each major section, final message with CTA |
| No "human takeover" signal — client can't reach a real person | Frustration, deal lost | Every bot message should include "Responde 'agente' para hablar con nosotros directamente" and honor that immediately |
| Conversation marked "closed" after quotation sent — no follow-up tracking | Leads go cold with no pipeline visibility | Pipeline status (lead → cotizado → cerrado/perdido) must be updated by partner, not auto-closed by bot |

---

## "Looks Done But Isn't" Checklist

Things that appear complete but are missing critical pieces.

- [ ] **Webhook handler:** Returns 200 immediately — verify handler does NOT await any DB writes or AI calls before the response is sent.
- [ ] **Idempotency:** Duplicate message test — send the same Kapso webhook payload twice within 5 seconds, verify only one conversation record and one AI call result.
- [ ] **Conversation state persistence:** Restart the NestJS server mid-conversation (after step 2 of 5), send next message, verify bot continues from step 3 (not step 1).
- [ ] **Quotation schema validation:** Send a DeepSeek mock response with a malformed JSON structure, verify Zod throws and the error is caught without crashing the conversation flow.
- [ ] **Approval state machine:** Have the client send a new message while the quotation is `PENDING_APPROVAL`, verify the quotation is invalidated and partner sees the warning in the CRM.
- [ ] **DeepSeek timeout fallback:** Mock DeepSeek to respond in 35 seconds, verify the bot sends a fallback message to the client and the job is retried without duplicate processing.
- [ ] **Channel adapter boundary:** Search the codebase for any import of `KapsoAdapter` or `KapsoWebhookPayload` outside of `kapso/` module — must be zero.
- [ ] **Media URL expiry:** Receive a media message from WhatsApp, wait 5 minutes, verify the file is accessible from object storage (not via the expired Kapso URL).
- [ ] **Partner approval notification:** A new quotation is created, verify partner receives a WhatsApp notification on their phone within 60 seconds without opening the CRM.
- [ ] **24h window compliance:** Simulate a conversation started 25 hours ago, verify the bot uses a pre-approved template (not free-form text) to re-engage.

---

## Recovery Strategies

When pitfalls occur despite prevention, how to recover.

| Pitfall | Recovery Cost | Recovery Steps |
|---------|---------------|----------------|
| Duplicate messages already sent to client | LOW | Identify duplicate `Quotation` rows by `externalMessageId`; manually mark extras as `CANCELLED`; add DB unique constraint on `(conversationId, externalMessageId)` retroactively |
| Quotation with hallucinated pricing already approved and sent | HIGH | Partner contacts client directly via WhatsApp to correct; log the incident; audit system prompt and add stricter pricing bounds; add sanity check validation that was missing |
| Conversation state lost (in-memory) on production restart | MEDIUM | Clients experiencing this get a re-introduction message ("Hola de nuevo, ¿podemos retomar tu proyecto?"); migrate to DB-persisted state immediately |
| DeepSeek outage — bot stops responding | LOW | Enable a fallback mode where bot replies: "Nuestro equipo está revisando tu proyecto manualmente. Te contactamos en menos de 2 horas." Partner notified via WhatsApp; process manually in CRM |
| Kapso webhook auto-paused due to high failure rate | MEDIUM | Fix the server error causing failures; call Kapso resume endpoint; replay missed events from Kapso delivery logs (available via their Logs API endpoint) |
| Partner approved stale quotation sent to client | MEDIUM | Partner sends correction directly via WhatsApp; quotation marked `SUPERSEDED` in CRM; add version lock to prevent recurrence |

---

## Pitfall-to-Phase Mapping

How roadmap phases should address these pitfalls.

| Pitfall | Prevention Phase | Verification |
|---------|------------------|--------------|
| Webhook duplicate processing | Phase 1 — Infrastructure & Webhook Ingestion | Idempotency integration test: same payload twice = one DB record |
| DeepSeek latency / silent bot | Phase 2 — AI Quotation Generation | Timeout mock test; verify acknowledgment message is sent before AI call |
| AI hallucination on pricing | Phase 2 — AI Quotation Generation | Zod schema validation test; sanity bounds test with out-of-range mock response |
| Approval state corruption | Phase 3 — Human-in-the-Loop Approval | Concurrent action test: client replies while partner approves |
| Conversation state lost on restart | Phase 1 — Infrastructure & Conversation Engine | Restart test mid-conversation; verify step recovery from DB |
| Growing context window costs | Phase 2 — AI Quotation Generation | Log `prompt_cache_hit_tokens` from day 1; alert if cost per quotation exceeds threshold |
| Multi-channel abstraction deferred | Phase 1 — Infrastructure | Code review gate: zero imports of `KapsoAdapter` outside `kapso/` module |
| No real-time approval notification | Phase 3 — Human-in-the-Loop Approval | E2E test: quotation created → partner WhatsApp message received within 60s |
| Media URL expiry | Phase 1 — Infrastructure | Integration test: receive media message, wait >4 minutes, verify file accessible |
| Missing human takeover escape hatch | Phase 2 — Conversation Engine | Manual test: send "agente" in any conversation state, verify immediate handoff |

---

## Sources

- [Guide to WhatsApp Webhooks: Features and Best Practices — Hookdeck](https://hookdeck.com/webhooks/guides/implement-webhook-idempotency)
- [Building a Scalable Webhook Architecture for Custom WhatsApp Solutions — ChatArchitect](https://www.chatarchitect.com/news/building-a-scalable-webhook-architecture-for-custom-whatsapp-solutions)
- [Kapso.ai Changelog — Webhook auto-pause, 409 Conflict, idempotency key, media URL expiry](https://docs.kapso.ai/changelog)
- [DeepSeek API Instability Analysis — API7.ai](https://api7.ai/blog/analyzing-deepseek-api-instability)
- [Performance and Timeout Issues with DeepSeek R1 on Azure AI Foundry — Microsoft Q&A](https://learn.microsoft.com/en-us/answers/questions/5545726/performance-and-timeout-issues-with-deepseek-r1-on)
- [DeepSeek Models & Pricing — Official API Docs](https://api-docs.deepseek.com/quick_start/pricing)
- [DeepSeek Context Window — DataStudios](https://www.datastudios.org/post/deepseek-context-window-token-limits-memory-policy-and-2025-rules)
- [Building Reliable Stripe Subscriptions in NestJS: Webhook Idempotency and Optimistic Locking — DEV Community](https://dev.to/aniefon_umanah_ac5f21311c/building-reliable-stripe-subscriptions-in-nestjs-webhook-idempotency-and-optimistic-locking-3o91)
- [NestJS Idempotency Interceptor — Michael Guay](https://michaelguay.dev/implementing-idempotency-in-nestjs-with-an-interceptor/)
- [@node-idempotency/nestjs — npm](https://www.npmjs.com/package/@node-idempotency/nestjs)
- [BullMQ Concurrency — Official Docs](https://docs.bullmq.io/guide/workers/concurrency)
- [LLM Chat History Summarization Guide — mem0.ai](https://mem0.ai/blog/llm-chat-history-summarization-guide-2025)
- [Human-in-the-Loop AI in 2025: Proven Design Patterns — Ideafloats](https://blog.ideafloats.com/human-in-the-loop-ai-in-2025/)
- [WhatsApp 24-hour rule — DelightChat Help Center](https://www.delightchat.io/help-center/whatsapp-business-api-24-hour-rule)
- [WhatsApp Messaging Limits Changes October 2025 — Convrs.io](https://convrs.io/blog/whatsapp-messaging-limits-updates/)
- [10 NestJS Practices to Avoid at Scale — Medium / Hash Block](https://medium.com/@connect.hashblock/10-nestjs-practices-to-avoid-at-scale-d8c0f12acc8e)
- [WhatsApp AI Bot in Production: 3 Months, 50K Messages, Zero Downtime — DEV Community](https://dev.to/richard_sakaguchi_5809b6b/whatsapp-ai-bot-in-production-3-months-50k-messages-zero-downtime-3bn3)

---
*Pitfalls research for: WhatsApp CRM + AI quotation automation (NestJS + Kapso.ai + DeepSeek)*
*Researched: 2026-03-15*
