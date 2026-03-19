# Phase 5: Frontend Integration With Current Backend - Research

**Researched:** 2026-03-18  
**Scope:** Replace the frontend inbox mocks with real backend read models, keep auth/session wired to the NestJS API, and preserve the current CRM shell UX.  
**Confidence:** HIGH for auth/session and current frontend behavior; MEDIUM for the inbox read-model shape because the backend does not expose conversation read APIs yet.

---

## Executive Summary

Phase 5 is not a UI redesign. It is a read-model integration phase.

The frontend already has the shell, the login/logout flow, and a SWR hook that points at `/conversations`, but it still falls back to mock inbox data when the API is absent. The backend currently persists raw `Message` rows only; it does not yet expose a conversation list endpoint or a message-history endpoint. That means the phase should be planned around two things:

1. Build a thin backend projection over `Message` rows that can answer inbox queries quickly.
2. Swap the frontend off mock fallbacks and onto those read endpoints without changing the shell structure.

The main planning risk is the data model gap. The current `Message` table can derive last message text and timestamp, but it cannot truthfully provide a stable conversation id, contact name, or unread count without a read model or extra tables.

---

## Standard Stack

- Frontend data fetching should stay on SWR, because `apps/web` already depends on it and the shell is client-driven.
- Frontend API calls should keep using `apiFetch()` with `credentials: "include"` so the httpOnly cookie session continues to work.
- Backend read endpoints should be NestJS controllers backed by Prisma queries over `Message`.
- Do not introduce a second client cache library just for Phase 5.

---

## Existing Contract Surface

| File | Current Role | Phase 5 Implication |
|------|--------------|---------------------|
| [`apps/web/src/hooks/use-conversations.ts`](/Users/xstaked/Desktop/projects/sn8-projects/sn8-wpp-crm/apps/web/src/hooks/use-conversations.ts) | SWR fetcher for `/conversations` with mock fallback | This is the primary seam to replace mocks |
| [`apps/web/src/components/shell/conversation-list.tsx`](/Users/xstaked/Desktop/projects/sn8-projects/sn8-wpp-crm/apps/web/src/components/shell/conversation-list.tsx) | Inbox list, selection by query param | Needs a stable backend conversation id |
| [`apps/web/src/components/shell/detail-panel.tsx`](/Users/xstaked/Desktop/projects/sn8-projects/sn8-wpp-crm/apps/web/src/components/shell/detail-panel.tsx) | Current "detail" view still derives from list summary | Will need a real messages endpoint if Phase 5 wants actual history |
| [`apps/backend/src/auth/auth.controller.ts`](/Users/xstaked/Desktop/projects/sn8-projects/sn8-wpp-crm/apps/backend/src/auth/auth.controller.ts) | `POST /auth/login`, `GET /auth/me`, `DELETE /auth/logout` | Auth plumbing already exists |
| [`apps/backend/src/messaging/processors/message.processor.ts`](/Users/xstaked/Desktop/projects/sn8-projects/sn8-wpp-crm/apps/backend/src/messaging/processors/message.processor.ts) | Persists normalized inbound messages | This is the only persisted source for inbox data today |
| [`prisma/schema.prisma`](/Users/xstaked/Desktop/projects/sn8-projects/sn8-wpp-crm/prisma/schema.prisma) | `Message` and `User` only | No `Contact`, `Conversation`, or read-state model yet |

Important observation: `apps/web/middleware.ts` already exists and protects `/dashboard/*` via `GET /auth/me`. Phase 5 should preserve that guard behavior while wiring the dashboard to real data endpoints.

---

## Minimal Backend Read APIs

### Strict minimum to replace the current mock list

- `GET /conversations`
- Response should include a stable conversation id, display name, last message preview, last activity timestamp, and unread count.

### Minimum to make the detail panel real

- `GET /conversations/:conversationId/messages`
- Response should return the chronological message history for the selected conversation.

### Existing dependency that must keep working

- `GET /auth/me`
- This already exists and remains the route guard source of truth for logged-in state.

### Recommended response shape

```ts
type ConversationSummaryDto = {
  id: string; // stable conversation key, not Message.id
  contactName: string;
  lastMessage: string;
  lastMessageAt: string;
  unreadCount: number;
};

type ConversationMessageDto = {
  id: string;
  conversationId: string;
  direction: "inbound" | "outbound";
  body: string | null;
  createdAt: string;
};
```

The important part is the `id`: it must be a stable conversation key that survives refreshes. Using `Message.id` would make the inbox selection meaningless.

---

## Data Model Gaps

| Frontend Field | Current Source in Backend | Gap / Consequence |
|---------------|---------------------------|-------------------|
| `Conversation.id` | No conversation table exists | Must be derived from phone/contact identity; cannot use `Message.id` |
| `contactName` | Not stored in `Message` | Will fall back to phone number unless a contact/read model is added |
| `lastMessage` | `Message.body` on latest message | Derivable from `Message` rows |
| `lastMessageAt` | `Message.createdAt` on latest message | Derivable from `Message` rows |
| `unreadCount` | No read-state or last-read cursor | Not truthfully computable today |
| Full message history | `Message` rows exist, but no endpoint | Need a detail read API |

What this means in practice:

- The backend can ship a useful inbox without a full CRM schema rewrite.
- `lastMessage` and `lastMessageAt` can be projected from `Message`.
- `contactName` is the first real product gap. If Kapso payloads do not provide a usable display name, the phase should either show phone numbers or add a small contact projection.
- `unreadCount` should not be presented as authoritative unless the phase also adds a read cursor or read-state table.

---

## Architecture Patterns

### 1. Read-model projection over the `Message` table

Use one backend projection to answer inbox list queries. That projection should group messages by conversation key, sort by the latest message timestamp, and emit a compact summary DTO for the frontend.

This is the fastest route because it does not require a new write model. It is also the right level of abstraction for Phase 5, which is about integration, not new business behavior.

### 2. Split summary and history endpoints

The list endpoint should stay small and fast. Message history belongs in a second endpoint for the selected conversation.

That keeps the inbox list cheap to load and avoids forcing the frontend to fetch every message just to render the left column.

### 3. Keep SWR as the frontend cache

The current UI already uses SWR. The cleanest plan is to keep SWR and define one key for the conversation list and one key for the selected conversation history.

Do not move to a new cache library just to wire the backend.

---

## Don't Hand-Roll

- Do not keep mock fallback data as the primary production path. It will hide backend regressions and make QA misleading.
- Do not couple the UI to `Message.id`. The selection state must point at a stable conversation identity.
- Do not build unread counts in the browser. If unread state matters, it needs a backend source of truth.
- Do not duplicate the same fetch in both list and detail components if one SWR cache key can own the result.

---

## Common Pitfalls

1. **No stable conversation identity**  
   If the backend uses raw message ids, the inbox selection will break on refresh. Use a stable conversation key derived from participant identity.

2. **Unread badges without read-state**  
   The current schema cannot tell whether a conversation is unread. Shipping a number that is really a guess will create trust issues fast.

3. **Contact names missing from payloads**  
   If inbound webhooks do not carry a display name, the list will degrade to phone numbers unless a contact projection is added.

4. **Double-fetching list and detail**  
   The current shell calls `useConversations()` from both the list and detail panel. Once the backend exists, centralize that data flow or split it into separate summary/detail hooks.

5. **Silent mock fallback in production**  
   A fallback that renders mock data when the API fails will conceal outages. Keep any fallback dev-only.

6. **Auth/CORS mismatch**  
   The frontend depends on cookie credentials. If the backend origin or cookie config changes, the dashboard will appear logged out even when login works.

---

## Recommended Plan Breakdown

### Plan 1: Backend inbox read model

**Goal:** Add a stable `GET /conversations` endpoint and the query layer behind it.  
**Depends on:** Current `Message` persistence and auth/session plumbing.  
**Deliverable:** A compact conversation summary projection derived from `Message`.

This is the first blocking step because the frontend cannot replace mocks until the backend can answer list queries.

### Plan 2: Frontend hook swap

**Goal:** Replace the mock fallback in `use-conversations` with the real backend response and keep the existing inbox shell intact.  
**Depends on:** Plan 1.  
**Deliverable:** The inbox list renders actual backend data, with real loading and empty/error states.

Keep this scoped to the current shell. Do not redesign the dashboard while swapping the data source.

### Plan 3: Detail history endpoint and panel wiring

**Goal:** Add `GET /conversations/:conversationId/messages` and wire the detail panel to actual history.  
**Depends on:** Plan 1, and ideally the stable conversation key from Plan 1.  
**Deliverable:** Clicking a conversation shows real message history instead of summary-only placeholder content.

If this is not in the current acceptance bar, keep the detail panel summary-only and backlog the full history.

### Plan 4: Auth, contract, and smoke verification

**Goal:** Prove the end-to-end flow works in the browser with cookies, CORS, and stable inbox data.  
**Depends on:** Plans 1-3.  
**Deliverable:** Login, dashboard load, inbox list, detail selection, and logout all succeed against the real backend.

This phase should not be treated as optional polish. It is the actual integration validation.

---

## Sequencing Constraints

- Verify session auth first. The inbox fetches use `credentials: "include"`, so broken cookie handling will look like a data bug.
- Add the backend list endpoint before removing the mock fallback. Otherwise the shell becomes an empty error state during development.
- Introduce the stable conversation id before wiring query-param selection deeper into the UI.
- Only add detail history after the list endpoint is stable. The list is the first user-visible proof that the backend connection works.
- Keep any mock fallback dev-only if you need it at all.

---

## Verification Strategy

- Backend unit test: group multiple `Message` rows into one conversation summary and confirm ordering by latest activity.
- Backend unit test: ensure the conversation id stays stable across inbound and outbound message mixes.
- API contract test: confirm `/conversations` returns the exact fields the frontend expects.
- Browser smoke test: login, load dashboard, select a conversation, verify the panel updates, logout, then verify `/dashboard` is no longer accessible.
- Error-path test: force `/conversations` to return 401 and confirm the app sends the user back to `/login`.

If unread counts stay out of scope, the verification should explicitly confirm that the UI handles `0` or omitted counts gracefully instead of inventing a badge.

---

## Confidence

- **HIGH:** Auth/session wiring already exists on the backend; the frontend shell still uses a mock fallback; no conversation read endpoints exist today.
- **MEDIUM:** Whether Phase 5 should ship a truthful unread count, or defer that until a dedicated read-state model exists.
- **MEDIUM:** Whether contact names should come from webhook payload metadata now or from a dedicated contact projection later.

---

*Research completed: 2026-03-18*  
*Ready for planning: yes*
