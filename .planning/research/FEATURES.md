# Feature Research

**Domain:** WhatsApp CRM with AI-powered quotation automation (software agency)
**Researched:** 2026-03-15
**Confidence:** MEDIUM-HIGH — core features verified across multiple WhatsApp CRM products (respond.io, Wati, Kommo, AiSensy, NetHunt). Human-in-the-loop approval pattern confirmed by HITL workflow literature. Some complexity estimates are judgment calls for this specific stack.

---

## Feature Landscape

### Table Stakes (Users Expect These)

Features the operators (SN8 partners) assume exist. Missing any of these makes the product feel broken or unfinished.

| Feature | Why Expected | Complexity | Notes |
|---------|--------------|------------|-------|
| Unified conversation inbox | Every WhatsApp CRM shows all inbound conversations in one place; agents expect to not hunt across WhatsApp app + CRM separately | LOW | Single table/view filtered by status, assignee. Kapso.ai webhook pushes messages in. |
| Contact record with full conversation history | Partners need to know who the client is and what was said before they jump in | MEDIUM | Contact entity linked to conversation threads; store message log as JSON or linked message rows. |
| Conversation assignment to agent | With 2+ partners, agents need to claim or be assigned conversations to avoid duplicate replies | LOW | Simple assignee FK on conversation; no routing engine needed at this scale. |
| Conversation status lifecycle | Lead, In-progress, Quoted, Closed-Won, Closed-Lost — partners mentally track this today | LOW | Enum field on conversation/deal; Kanban view is nice but list view suffices for v1. |
| Bot auto-response to inbound messages | Core promise: no client goes unanswered. Partners expect the bot to handle initial contact automatically | HIGH | Kapso.ai webhook → NestJS handler → DeepSeek prompt chain → Kapso.ai reply. Error handling and retry logic are non-trivial. |
| Requirements capture via guided conversation | Bot must gather project type, scope, timeline, budget range before quoting. Without this, the AI generates garbage quotes | HIGH | Conversation state machine or LLM-managed context window. Must persist partial state across messages (Redis or DB). |
| AI-generated quotation draft | The whole value prop: DeepSeek produces a quote from captured requirements | HIGH | Prompt engineering is the hard part. Quote must include line items, total, optional notes. Output must be parseable by approval flow. |
| Partner quotation approval interface | Hard requirement from PROJECT.md: no quote ships without human approval. Partners expect to review, edit, approve/reject | MEDIUM | Web UI in Next.js CRM: show quote draft, allow edits, confirm/reject buttons. Triggers bot to send or revise. |
| Send approved quotation to client via WhatsApp | The final delivery step. Client expects to receive a quote over the same channel they used | LOW | Kapso.ai send-message API call with quote text or PDF link. |
| Client/contact search and lookup | Partners need to find existing clients quickly before or during a call | LOW | Simple search by name/phone. WhatsApp phone number is the natural unique identifier. |
| Notification to partner when bot needs approval | Partner must know a quote is waiting. Without push notification, the approval loop stalls | MEDIUM | In-app notification badge + optional browser push or email. Real-time via WebSocket or polling. |

### Differentiators (Competitive Advantage)

These features are not universal across off-the-shelf WhatsApp CRMs. They create the specific advantage for SN8's context.

| Feature | Value Proposition | Complexity | Notes |
|---------|-------------------|------------|-------|
| Profitability-aware AI quoting | Generic AI quotes by feature count. SN8's bot knows that "basic CRM vs CRM with pipeline" have very different prices. System prompt carries SN8's pricing logic and margin floors | HIGH | Requires a carefully maintained pricing prompt/config that SN8 partners can update. Version-controlled prompt config file is a practical approach. |
| Partner correction feed-back loop | When a partner edits a quote before approving, the delta (what was changed) can be logged and used to improve future prompts over time | MEDIUM | Log original AI quote + final approved quote. Even manual analysis of this log is valuable. Automated fine-tuning is v2+. |
| Conversation context handoff to partner | When partner takes over manually, they see a brief AI-generated summary of the conversation so far, not the raw transcript | MEDIUM | Summarization call to DeepSeek before surfacing the conversation in the CRM inbox. Reduces cognitive load significantly. |
| Multi-channel architecture readiness (Instagram v2) | Competitors that bolt on Instagram later break or require re-architecture. SN8 ships v1 with clean channel abstraction | MEDIUM | Abstract `channel` concept at the data model level. Conversation has `channel_type` (whatsapp, instagram). Message routing layer is channel-agnostic. Kapso.ai already supports Instagram. |
| Quotation version history | Partners want to see that a quote went through 3 revisions before being sent. Builds internal accountability | LOW | Append-only quote_versions table. Display as revision history in UI. |
| Typed project service catalog | Bot qualifies by selecting from known service types (app, automation, ecommerce, landing, white-label). Constrains scope and improves quote accuracy | MEDIUM | Configurable service catalog in DB or config. Bot uses structured list in its prompt. Partners can add/edit services without code changes. |

### Anti-Features (Things to Deliberately NOT Build in v1)

| Feature | Why Requested | Why Problematic | Alternative |
|---------|---------------|-----------------|-------------|
| Fully autonomous quoting (no approval) | Faster, less friction for the partner | Pricing complexity at SN8 is too high for full automation. A wrong quote either loses the client (too expensive) or kills margin (too cheap). This is a hard business requirement, not a technical limitation. | Keep mandatory human approval. Make the approval UX fast (one-click if quote looks good). |
| In-app payment collection | Clients could pay directly from WhatsApp | Out of scope in PROJECT.md. Adds PCI compliance surface, payment gateway integration, and legal complexity. SN8's deal closes happen outside the system. | Link to external invoice tool (e.g., a PDF with bank details) in v1. Payments in v2+ if validated. |
| Mobile native app | Agents want to approve quotes on the phone | Next.js web app is responsive and works fine on mobile browser. Native app doubles the maintenance surface for a 2-person team. | Ensure Next.js CRM is mobile-responsive. PWA if needed. |
| Broadcast / mass messaging campaigns | Competitive feature in AiSensy, Wati. "We should have it" | SN8 is an inbound-driven agency, not a marketing company. Broadcast adds WhatsApp policy compliance risk (spam flagging). Distraction from core use case. | Defer to v2 only if there is a validated marketing use case. |
| Deep CRM integrations (HubSpot, Salesforce, Zoho) | Enterprise CRM sync seems professional | SN8 has 1-5 agents. The built-in CRM IS the system of record. External sync creates data consistency problems and engineering overhead with zero immediate benefit. | Use SN8's own DB as source of truth. Add export (CSV) if partners need to report somewhere. |
| Chatbot builder UI (visual flow editor) | "Let non-technical people edit the bot" | At SN8 scale, the two partners ARE technical. A visual flow builder is a significant build (essentially a product in itself). The conversation logic lives in a well-structured prompt config. | Prompt configuration via an editable config file or a simple admin form. No drag-and-drop flow editor in v1. |
| Multi-language bot | "What if clients write in English?" | All SN8 clients are Spanish-speaking (Latin America context). DeepSeek handles Spanish natively. Adding language detection/switching is complexity without current value. | DeepSeek responds in the language the client writes in by default. No explicit language switching needed. |
| SLA / ticket escalation engine | Looks professional, helpdesk-like | SN8 is not a support team. SLA tracking, breach alerts, and escalation rules solve a problem SN8 does not have at its scale. | Simple "unread for 2h" notification badge is sufficient for v1. |

---

## Feature Dependencies

```
[Bot auto-response to inbound messages]
    └──requires──> [Kapso.ai webhook integration]
    └──requires──> [Conversation state persistence]
                       └──requires──> [Contact record with conversation history]

[Requirements capture via guided conversation]
    └──requires──> [Bot auto-response to inbound messages]
    └──requires──> [Conversation state persistence]

[AI-generated quotation draft]
    └──requires──> [Requirements capture via guided conversation]
    └──requires──> [DeepSeek API integration]
    └──requires──> [Typed project service catalog]  (enhances accuracy)

[Partner quotation approval interface]
    └──requires──> [AI-generated quotation draft]
    └──requires──> [Notification to partner when bot needs approval]

[Send approved quotation to client via WhatsApp]
    └──requires──> [Partner quotation approval interface]
    └──requires──> [Kapso.ai send-message API]

[Quotation version history]
    └──enhances──> [Partner quotation approval interface]

[Conversation context handoff to partner]
    └──enhances──> [Unified conversation inbox]
    └──requires──> [DeepSeek summarization call]

[Multi-channel architecture readiness]
    └──must be built with──> [Bot auto-response to inbound messages]
    └──must be built with──> [Conversation state persistence]
    (retrofit is expensive — must be day-1 data model decision)

[Partner correction feedback loop]
    └──requires──> [AI-generated quotation draft]
    └──requires──> [Partner quotation approval interface]
    └──requires──> [Quotation version history]
```

### Dependency Notes

- **Requirements capture requires conversation state persistence:** The bot collects info across multiple messages. State must survive between webhook calls. Redis session or DB-backed conversation object both work; Redis is simpler for ephemeral state.
- **AI quotation draft requires typed project service catalog:** Without constrained service types in the prompt, DeepSeek hallucinates scope. Catalog also enables structured line items in the output.
- **Partner approval interface requires real-time notification:** If the partner doesn't know a quote is pending, the approval loop stalls and the client waits. Notification is a functional dependency, not just nice-to-have.
- **Multi-channel readiness conflicts with channel-specific quick wins:** Adding WhatsApp-specific hacks (e.g., hardcoding "whatsapp" in message routing) in v1 creates debt for Instagram v2. The `channel_type` abstraction must be in the data model from day one even if only WhatsApp is active.

---

## MVP Definition

### Launch With (v1)

Minimum viable product — validates that the bot + approval loop works end-to-end in production.

- [ ] Kapso.ai webhook receiver — inbound message enters system
- [ ] Contact auto-create or match on phone number
- [ ] Bot conversation handler: greet, qualify, capture requirements (guided flow via DeepSeek)
- [ ] AI quotation generation via DeepSeek with SN8 pricing context
- [ ] Quotation draft storage with pending-approval status
- [ ] In-CRM notification for pending approvals
- [ ] Partner approval UI: view draft, edit, approve or reject
- [ ] Bot sends approved quotation to client via Kapso.ai
- [ ] Unified inbox: list conversations, see history, assign to agent
- [ ] Conversation status pipeline (Lead → Quoted → Closed-Won / Closed-Lost)
- [ ] Basic contact search by name/phone

### Add After Validation (v1.x)

Add once core loop is proven working in production with real clients.

- [ ] Quotation version history — trigger: partners start asking "what did the AI originally propose?"
- [ ] Conversation AI summary for partner handoff — trigger: partners complain about reading long transcripts
- [ ] Typed service catalog admin UI — trigger: partners want to update services without touching config files
- [ ] Partner correction logging — trigger: enough approved quotes exist to start analyzing AI accuracy
- [ ] PDF quotation generation — trigger: clients request a more formal document instead of WhatsApp text

### Future Consideration (v2+)

Defer until product-market fit with v1 is established.

- [ ] Instagram channel integration — architecture is ready, activate when SN8 starts getting Instagram leads
- [ ] Prompt/pricing config UI — currently manageable via config file; build UI when non-technical staff join
- [ ] Automated AI improvement from correction logs — requires enough data volume to be meaningful
- [ ] Broadcast / outbound campaigns — only if SN8 pivots to outbound marketing
- [ ] External CRM export / sync — only if SN8 adopts a separate system of record

---

## Feature Prioritization Matrix

| Feature | User Value | Implementation Cost | Priority |
|---------|------------|---------------------|----------|
| Bot auto-response to inbound messages | HIGH | HIGH | P1 |
| Requirements capture via guided conversation | HIGH | HIGH | P1 |
| AI quotation draft generation | HIGH | HIGH | P1 |
| Partner quotation approval interface | HIGH | MEDIUM | P1 |
| Send approved quotation via WhatsApp | HIGH | LOW | P1 |
| Unified conversation inbox | HIGH | LOW | P1 |
| Contact record with conversation history | HIGH | LOW | P1 |
| Notification to partner on pending approval | HIGH | MEDIUM | P1 |
| Conversation status pipeline | MEDIUM | LOW | P1 |
| Conversation assignment to agent | MEDIUM | LOW | P1 |
| Contact search and lookup | MEDIUM | LOW | P1 |
| Multi-channel data model abstraction | HIGH (future) | LOW (if done early) | P1 — day-1 architectural decision |
| Quotation version history | MEDIUM | LOW | P2 |
| AI conversation summary for partner | MEDIUM | MEDIUM | P2 |
| Typed service catalog (DB-backed) | MEDIUM | MEDIUM | P2 |
| Partner correction feedback logging | LOW | LOW | P2 |
| PDF quotation generation | LOW | MEDIUM | P2 |
| Instagram activation | HIGH (future) | MEDIUM | P3 |
| Prompt config admin UI | LOW | MEDIUM | P3 |

**Priority key:**
- P1: Must have for launch
- P2: Should have, add when core loop is validated
- P3: Nice to have, future consideration

---

## Competitor Feature Analysis

Products analyzed: respond.io, Wati, Kommo, AiSensy, NetHunt CRM.

| Feature | respond.io / Wati / Kommo | Our Approach |
|---------|---------------------------|--------------|
| Shared inbox | Yes — standard feature across all | Same, but simpler (1-5 agents vs enterprise scale) |
| Chatbot flow builder | Visual drag-and-drop builder | No visual builder. Conversation logic lives in DeepSeek prompt with structured state. Lower build cost, sufficient for agency context. |
| AI responses | Generic LLM auto-reply | Domain-specific: SN8 pricing knowledge baked into system prompt. Quotation output is structured, not free-form. |
| Quotation/document generation | Kommo has document generator bots. Others rely on CRM integrations. | Built-in: AI generates quote, partner approves, bot sends. The approval step is unique to SN8's requirement. |
| Human approval gate for quotes | Not a standard feature — most platforms aim to automate | Core differentiator: mandatory approval before any quote reaches the client. Protects margin. |
| Multi-channel support | respond.io supports 10+ channels. Wati: WhatsApp + Instagram. | v1: WhatsApp only. v2: Instagram. Data model is channel-agnostic from day one. |
| CRM pipeline | Yes — all platforms offer Kanban pipeline | Same. Simple pipeline (Lead → Quoted → Closed). No complex deal stages needed at SN8 scale. |
| Contact history | Yes — universal | Same. Full conversation transcript linked to contact. |
| Pricing | $99-$199/month SaaS | Self-hosted. Zero SaaS fees. Partners own the data and the system. |

---

## Sources

- [NetHunt CRM — Guide to WhatsApp CRM system 2026](https://nethunt.com/blog/whatsapp-crm/) — MEDIUM confidence (vendor blog, but feature list is consistent with other sources)
- [ChatMaxima — 10 Best WhatsApp CRM Systems 2026](https://chatmaxima.com/blog/10-best-whatsapp-crm-systems-2026/) — MEDIUM confidence
- [respond.io — Best WhatsApp CRM Systems](https://respond.io/blog/best-whatsapp-crm) — MEDIUM confidence (vendor, but most detailed feature breakdown found)
- [respond.io — Wati vs respond.io comparison](https://respond.io/blog/wati-vs-respondio) — LOW confidence (vendor comparison, biased toward respond.io)
- [Zapier — Human-in-the-loop in AI workflows](https://zapier.com/blog/human-in-the-loop/) — HIGH confidence (well-sourced patterns article)
- [Propeller — AI Quote & Approval Engine (CPQ)](https://propeller-commerce.com/features/ai-quote-management) — MEDIUM confidence (validates approval workflow pattern)
- [ReachMax — WhatsApp Invoice Automation & Quotes](https://www.reachmax.app/use-cases/sending-quotes-and-invoices-with-whatsapp/) — MEDIUM confidence
- [BotPenguin — Best Practices for WhatsApp Chatbots for Lead Generation](https://botpenguin.com/blogs/best-practices-for-whatsapp-chatbots-for-lead-generation) — MEDIUM confidence
- [respond.io — WhatsApp AI Chatbot for Lead Management](https://respond.io/blog/whatsapp-ai-chatbot-for-lead-management) — MEDIUM confidence
- [Clientify — How to send a quotation via WhatsApp](https://clientify.com/en/blog/communication/how-to-send-a-budget-via-whatsapp) — MEDIUM confidence

---

*Feature research for: WhatsApp CRM with AI quotation automation — SN8 Labs*
*Researched: 2026-03-15*
