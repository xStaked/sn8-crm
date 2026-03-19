# Stack Research

**Domain:** WhatsApp CRM with AI-powered quotation automation
**Researched:** 2026-03-15
**Confidence:** HIGH (core stack pre-decided) / MEDIUM (supporting libraries)

---

## Recommended Stack

### Core Technologies

| Technology | Version | Purpose | Why Recommended |
|------------|---------|---------|-----------------|
| NestJS | 11.x | Backend API + webhook handler + WebSocket gateway | Non-negotiable per project constraints. v11 is the current stable release (Jan 2025). Module-based architecture maps cleanly to domain boundaries: WhatsApp, AI, CRM, Auth. Built-in support for queues, WebSockets, and microservices without third-party glue. |
| Next.js | 16.x | CRM frontend dashboard | Non-negotiable per project constraints. v16 is current stable (Oct 2025), ships with Turbopack as default bundler (stable), React 19.2, and App Router as the standard. Server Components reduce client bundle size — important for a data-heavy CRM. |
| PostgreSQL | 16.x | Primary persistent store | Relational model fits CRM data: conversations, clients, quotations, pipeline stages. Strong JSON support for storing AI-generated quotation payloads. Mature, zero operational surprise at this scale (< 50 conversations/day). |
| Redis | 7.x | Conversation state cache + BullMQ queue backend + Socket.IO adapter | Conversation state (current flow step per contact) must survive NestJS restarts and be readable in <5ms for bot response logic. BullMQ requires Redis. Socket.IO multi-instance scaling requires Redis adapter. Three responsibilities, one service. |
| DeepSeek API | deepseek-chat (V3.2) | AI quotation generation + conversation guidance | Non-negotiable per project constraints. deepseek-chat is OpenAI-API-compatible: configure the official `openai` Node.js SDK with `baseURL: "https://api.deepseek.com"`. 128K context window — sufficient for full conversation history plus quotation instructions. Cost is substantially lower than GPT-4o at similar quality for Spanish-language business tasks. |
| Kapso.ai | @kapso/whatsapp-cloud-api (latest) | WhatsApp messaging layer | Non-negotiable per project constraints. Official Meta Cloud API proxy via Kapso. SDK provides `WhatsAppClient` with Kapso proxy config, unlocking `client.conversations`, `client.messages.listByConversation`, and `client.contacts` — critical for CRM history sync. Webhook events are signed with `X-Webhook-Signature`; SDK provides `verifySignature()`. |

---

### Supporting Libraries — Backend (NestJS)

| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| @nestjs/bullmq | ^10.x | Job queue for async AI processing | Decouple webhook receipt from AI processing. Webhook ACKs in <200ms (Kapso requirement), AI call happens in background job. Always use when calling DeepSeek. |
| bullmq | ^5.x | BullMQ peer dependency | Required alongside @nestjs/bullmq. Use BullMQ, not legacy Bull — Bull is maintenance-only since 2022. |
| @nestjs/websockets + @nestjs/platform-socket.io | ^11.x | Real-time push to CRM dashboard | Required for live conversation updates in the CRM without polling. NestJS @WebSocketGateway wraps Socket.IO. |
| socket.io | ^4.x | Socket.IO server | Peer dependency for @nestjs/platform-socket.io. |
| @nestjs/jwt | ^10.x | JWT issuance and verification | Issue partner/agent tokens on login. Use with global JwtAuthGuard defaulting to protected, mark public routes with @Public() decorator. |
| passport-jwt | ^4.x | JWT Passport strategy | Standard NestJS auth pattern with @nestjs/passport. Validate() loads user from DB on each protected request. |
| bcrypt | ^5.x | Password hashing | Hash partner login passwords. Never store plaintext. Use 12 salt rounds. |
| prisma | ^6.x | ORM + migrations | Prisma 6 is the production-stable version. Prisma 7 requires ESM workaround for NestJS CommonJS setup (moduleFormat: cjs). Use Prisma 6 to avoid the ESM/CJS friction until NestJS ships native ESM. |
| @prisma/client | ^6.x | Prisma query client | Extend PrismaService from PrismaClient, inject via NestJS DI. |
| openai | ^4.x | DeepSeek API calls | DeepSeek is OpenAI-API-compatible. Configure with `baseURL: "https://api.deepseek.com"` and DeepSeek API key. Zero additional SDK needed. |
| ioredis | ^5.x | Direct Redis client | Used for conversation state reads/writes outside BullMQ context (e.g., checking current flow step before dispatching a queue job). |
| @nestjs/config | ^3.x | Environment config management | Load .env with ConfigModule.forRoot({ isGlobal: true }). Access KAPSO_API_KEY, DEEPSEEK_API_KEY, JWT_SECRET, DATABASE_URL, REDIS_URL from typed ConfigService. |
| class-validator + class-transformer | ^0.14.x | DTO validation | Validate incoming webhook payloads and API request bodies. Use with NestJS ValidationPipe globally. |
| helmet | ^7.x | HTTP security headers | Apply globally in main.ts for standard HTTP hardening. |
| @nestjs/swagger | ^8.x | API documentation | Auto-generate OpenAPI docs from decorators. Useful for partner onboarding and debugging webhook integration. |

---

### Supporting Libraries — Frontend (Next.js)

| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| shadcn/ui | latest (CLI-based) | Component library | Not a package — components are copied into the project. Built on Radix UI primitives. Fully compatible with Tailwind v4 and Next.js 16. Use for all UI: data tables, dialogs, forms, badges, command palette. |
| tailwindcss | ^4.x | Utility CSS | Required by shadcn/ui. v4 is the current standard; projects initialized with shadcn CLI in 2025/2026 get v4 by default. Replaces tailwind.config.js with @theme in CSS. |
| tw-animate-css | latest | CSS animations | Replaces deprecated tailwindcss-animate in shadcn v4 projects. |
| @tanstack/react-query | ^5.x | Server state management | Cache and sync all API calls (conversations list, quotation history, pipeline data). Provides automatic background refetch. Use for all data fetching — do not use useEffect + fetch directly. |
| zustand | ^5.x | Client/UI state management | Manage UI state that doesn't live on the server: selected conversation, notification panel open, approval modal state. Pair with TanStack Query (Query = server state, Zustand = client state). |
| socket.io-client | ^4.x | Real-time updates | Connect to NestJS WebSocket gateway for live message push and notification of new incoming WhatsApp messages without polling. |
| react-hook-form | ^7.x | Form state management | Manage the quotation editor form, partner login, and client edit forms. Integrates with zod for schema validation. |
| zod | ^3.x | Schema validation | Validate form inputs on the frontend (mirrors backend DTO validation). Use with react-hook-form's zodResolver. |
| @tanstack/react-table | ^8.x | Data tables | Render the pipeline table, conversation history table, quotation list. Headless — styled with shadcn table components. |
| recharts | ^2.x | Charts | Pipeline funnel, conversion stats. Works with shadcn Chart component wrappers. |
| date-fns | ^3.x | Date formatting | Format timestamps on messages and quotations. Lightweight, tree-shakeable. |

---

### Development Tools

| Tool | Purpose | Notes |
|------|---------|-------|
| TypeScript | ^5.4 | Type safety across backend + frontend | Both NestJS and Next.js ship TS-first. Prisma generates typed client. Use strict: true. |
| pnpm | ^9.x | Monorepo package manager | Faster installs than npm, native workspaces for backend + frontend packages in a single repo. |
| Docker Compose | local dev environment | Run PostgreSQL + Redis locally without system installs. Use official postgres:16 and redis:7 images. |
| Prettier + ESLint | Code formatting and linting | NestJS scaffold includes eslint config. Add prettier with eslint-config-prettier to avoid conflicts. |
| ngrok / localtunnel | Webhook development | Expose localhost to Kapso.ai webhooks during development. ngrok is more reliable for teams. |

---

## Installation

```bash
# --- Backend (NestJS) ---

# Core NestJS
npm install @nestjs/common @nestjs/core @nestjs/platform-express reflect-metadata rxjs

# Database
npm install prisma @prisma/client
npx prisma init

# Auth
npm install @nestjs/jwt @nestjs/passport passport passport-jwt bcrypt
npm install -D @types/passport-jwt @types/bcrypt

# Queue
npm install @nestjs/bullmq bullmq ioredis

# WebSocket
npm install @nestjs/websockets @nestjs/platform-socket.io socket.io

# AI (OpenAI SDK pointed at DeepSeek)
npm install openai

# WhatsApp (Kapso)
npm install @kapso/whatsapp-cloud-api

# Config + Validation
npm install @nestjs/config class-validator class-transformer

# Security + Docs
npm install helmet
npm install @nestjs/swagger swagger-ui-express

# --- Frontend (Next.js) ---

# Bootstrap
npx create-next-app@latest --typescript --tailwind --app --src-dir

# shadcn/ui (initialize, then add components as needed)
npx shadcn@latest init

# Server state
npm install @tanstack/react-query

# Client state
npm install zustand

# Real-time
npm install socket.io-client

# Forms + Validation
npm install react-hook-form zod @hookform/resolvers

# Tables + Charts
npm install @tanstack/react-table recharts

# Utilities
npm install date-fns
```

---

## Alternatives Considered

| Recommended | Alternative | When to Use Alternative |
|-------------|-------------|-------------------------|
| Prisma 6 | Drizzle ORM | Use Drizzle if bundle size or serverless cold-start is a constraint. For this app (dedicated server, not serverless), Prisma's DX and auto-migrations justify the binary overhead. |
| Prisma 6 | Prisma 7 | Use Prisma 7 only after NestJS natively supports ESM. v7 requires a `moduleFormat: cjs` workaround that introduces friction. |
| BullMQ (@nestjs/bullmq) | Bull (@nestjs/bull) | Bull is maintenance-only (bug fixes only). Use BullMQ — it's the successor, written in TypeScript, with superior flow control. |
| deepseek-chat (via openai SDK) | LangChain | Use LangChain only if you need multi-step RAG pipelines or tool-calling orchestration. For this app's use case (structured quotation prompts with conversation context), the bare OpenAI SDK is simpler, cheaper in tokens, and easier to debug. |
| Socket.IO (@nestjs/platform-socket.io) | Native WS (@nestjs/platform-ws) | Socket.IO preferred because it has built-in Redis adapter for horizontal scaling, automatic reconnection, and browser compatibility. Native WS is leaner but requires manual reconnection logic. |
| TanStack Query + Zustand | Redux Toolkit + RTK Query | RTK is heavier, requires more boilerplate, and offers no meaningful advantage for a 1-5 agent CRM. TanStack Query + Zustand has half the learning curve. |
| PostgreSQL | MongoDB | MongoDB's document model would work for conversation history but adds operational complexity. PostgreSQL's JSONB handles semi-structured quotation data while keeping relational integrity for the CRM pipeline. |

---

## What NOT to Use

| Avoid | Why | Use Instead |
|-------|-----|-------------|
| whatsapp-web.js | Uses browser automation (Puppeteer) to scrape WhatsApp Web — violates Meta ToS, high ban risk, fragile. Breaks on WhatsApp UI updates. | @kapso/whatsapp-cloud-api (official Meta Cloud API) |
| @nestjs/bull (legacy Bull) | Maintenance-only since 2022. No new features, TypeScript support is thin, active NestJS community has migrated to BullMQ. | @nestjs/bullmq |
| TypeORM | In NestJS context: poorly typed, migrations are unreliable, decorator-heavy schema diffs from Prisma's schema file approach. Community consensus in 2025 has moved firmly to Prisma or Drizzle. | Prisma 6 |
| Redux / Redux Toolkit | Overkill for a 1-5 agent CRM. Significant boilerplate with no architectural advantage over Zustand + TanStack Query at this scale. | Zustand + @tanstack/react-query |
| Prisma 7 (today) | Ships as ESM by default; NestJS uses CommonJS. Requires moduleFormat: cjs hack. Wait for NestJS native ESM before upgrading. | Prisma 6 |
| Pages Router (Next.js) | App Router is the default and recommended since Next.js 13. Pages Router is legacy. Server Components and streaming Suspense (needed for CRM data tables) require App Router. | App Router (Next.js 16 default) |
| Axios (frontend) | Redundant when TanStack Query is the data layer. TanStack Query works natively with fetch. Adding Axios is extra weight with no benefit. | TanStack Query + native fetch |

---

## Stack Patterns by Variant

**For the WhatsApp bot flow (incoming message → AI → response):**
- Receive webhook in NestJS controller → verify `X-Webhook-Signature` with `verifySignature()` → respond 200 immediately
- Dispatch BullMQ job with message payload
- Worker: load conversation state from Redis → build DeepSeek prompt with history → call DeepSeek API → update state → send reply via `WhatsAppClient.messages.sendText()`
- Persist conversation + message to PostgreSQL via Prisma

**For the approval flow (quotation requires partner sign-off):**
- Bot reaches "quotation ready" step → emits Socket.IO event to CRM dashboard
- Partner approves or edits in CRM → NestJS API saves approved quotation
- Bot sends approved quotation to client via WhatsApp

**For multi-channel v2 (Instagram):**
- Model the channel as an enum on the Conversation entity (WHATSAPP | INSTAGRAM)
- Each channel gets its own NestJS module (WhatsAppModule, InstagramModule) implementing a shared ChannelService interface
- The AI and quotation logic live in a ChannelAgnosticModule that accepts normalized message DTOs — no channel-specific code leaks in

---

## Version Compatibility

| Package | Compatible With | Notes |
|---------|-----------------|-------|
| NestJS 11.x | Node.js 20.x / 22.x | Node 22.11.0+ recommended per 2025 docs |
| Prisma 6.x | Node.js 18.x / 20.x / 22.x, TypeScript 5.1+ | Do not use Prisma 7 with NestJS until ESM transition |
| Next.js 16.x | React 19.2, Tailwind v4, Node.js 20+ | Turbopack is stable default bundler in v16 |
| shadcn/ui (latest) | Tailwind v4, React 19, Next.js 16 | tailwindcss-animate replaced by tw-animate-css |
| @tanstack/react-query v5 | React 18+/19 | v5 has breaking changes from v4 — use v5 from the start |
| socket.io v4 + socket.io-client v4 | Must match major versions | Client and server socket.io must be the same major version |
| bullmq v5 + @nestjs/bullmq v10 | Redis 6.2+ (Redis 7 recommended) | BullMQ v5 requires Redis 6.2 minimum for stream commands |
| openai SDK v4 | DeepSeek API (baseURL override) | Point baseURL to `https://api.deepseek.com` — no other changes needed |

---

## Sources

- NestJS official releases: https://github.com/nestjs/nest/releases — NestJS 11.x confirmed current (MEDIUM confidence — WebSearch)
- Next.js 16 release blog: https://nextjs.org/blog/next-16 — v16 stable with Turbopack default (MEDIUM confidence — WebSearch)
- DeepSeek API docs: https://api-docs.deepseek.com/ — OpenAI-compatible, deepseek-chat = V3.2, 128K context (HIGH confidence — official docs + multiple corroborating sources)
- Kapso.ai SDK: https://github.com/gokapso/whatsapp-cloud-api-js — `@kapso/whatsapp-cloud-api` npm package, Kapso proxy config pattern (HIGH confidence — official GitHub)
- Kapso.ai TypeScript SDK intro: https://docs.kapso.ai/docs/whatsapp/typescript-sdk/introduction — SDK installation and proxy config (HIGH confidence — official docs)
- shadcn/ui Tailwind v4 compat: https://ui.shadcn.com/docs/tailwind-v4 — confirmed v4 support, tw-animate-css replaces tailwindcss-animate (HIGH confidence — official docs)
- Prisma 7 NestJS compatibility: https://dev.to/manendrav/how-to-set-up-nestjs-with-prisma-and-postgresql-2026-complete-guide-2da7 — moduleFormat: cjs issue documented (MEDIUM confidence — community source)
- BullMQ vs Bull: https://dev.to/ronak_navadia/level-up-your-nestjs-app-with-bullmq-queues-dlqs-bull-board-5hnn — Bull maintenance-only, BullMQ is successor (HIGH confidence — multiple sources agree)
- ORM comparison 2025: https://dev.to/sasithwarnakafonseka/best-orm-for-nestjs-in-2025-drizzle-orm-vs-typeorm-vs-prisma-229c — Prisma DX vs Drizzle performance tradeoffs (MEDIUM confidence — community source)

---

*Stack research for: WhatsApp CRM with AI quotation automation (SN8 WPP CRM)*
*Researched: 2026-03-15*
