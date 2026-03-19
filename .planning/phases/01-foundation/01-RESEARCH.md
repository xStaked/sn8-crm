# Phase 1: Foundation - Research

**Researched:** 2026-03-15
**Domain:** NestJS + Prisma 6 + BullMQ + Kapso.ai webhook infrastructure + JWT authentication
**Confidence:** HIGH (core stack verified via official docs and Context7; Kapso.ai details verified against official docs)

---

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions

- **Idempotency key storage:** Dual-layer — Redis SET (hot path, TTL 24h, key `wh:msg:{messageId}`) + DB unique constraint on `externalMessageId` (durable fallback)
- **Duplicate detection behavior:** Return HTTP 200 immediately, do not enqueue, do not return error. Log the skip as structured log.
- **Idempotency key source:** `message.id` from webhook payload. If Kapso exposes `X-Kapso-Idempotency-Key` header: prefer that. Fallback to `message.id`.
- **Tech stack:** NestJS (backend) + Next.js (frontend CRM) + Kapso.ai (WhatsApp) — non-negotiable
- **ORM:** Prisma 6 (not 7) — Prisma 7 ESM default conflicts with NestJS CommonJS
- **Queue:** BullMQ (not Bull) — Bull is maintenance-only since 2022
- **ChannelAdapter interface:** Must be defined in Phase 1 — retrofitting post-Phase 2 makes Instagram v2 a rewrite

### Claude's Discretion

- Auth token storage (cookie httpOnly vs Bearer header) — Claude decides implementation
- Deployment target — Claude configures for Railway/Render with standard env vars
- Database schema scope — Claude decides if defining full v1 schema or only Phase 1 entities
- ChannelAdapter interface method signatures — Claude designs according to research

### Deferred Ideas (OUT OF SCOPE)

None — discussion stayed within phase scope.
</user_constraints>

---

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|-----------------|
| AUTH-01 | El socio puede iniciar sesión con email y contraseña | NestJS Passport local strategy + bcrypt/argon2 password verification |
| AUTH-02 | La sesión persiste entre recargas del navegador | JWT stored in httpOnly cookie; access token + optional refresh token pattern |
| AUTH-03 | El socio puede cerrar sesión desde cualquier página | DELETE /auth/logout endpoint that clears cookie; JwtAuthGuard protects all CRM routes |
| INFRA-01 | El sistema recibe webhooks de Kapso.ai (mensajes entrantes de WhatsApp) | POST /webhooks/kapso endpoint; HMAC-SHA256 signature verification with `X-Webhook-Signature` |
| INFRA-02 | Los webhooks tienen protección idempotente (mensajes duplicados no se procesan dos veces) | Dual-layer: Redis SETNX with 24h TTL + DB unique constraint on `externalMessageId` |
| INFRA-03 | Los mensajes entrantes se encolan en BullMQ para procesamiento asíncrono (webhook retorna 200 en < 100ms) | BullMQ `@nestjs/bullmq`; webhook handler enqueues job and returns 200 immediately |
| INFRA-04 | El sistema puede enviar mensajes outbound por WhatsApp via Kapso.ai | `@kapso/whatsapp-cloud-api` SDK; POST to `https://api.kapso.ai/meta/whatsapp/v24.0/{phone_number_id}/messages` with `X-API-Key` |
</phase_requirements>

---

## Summary

Phase 1 establishes the complete technical backbone: JWT authentication, idempotent webhook reception, async message queuing via BullMQ, and a ChannelAdapter abstraction for multi-channel messaging. The stack is NestJS v10 (CommonJS) + Prisma 6 + PostgreSQL + Redis + BullMQ. There is no existing code — this phase defines all base patterns.

The key risk is Kapso.ai's retry behavior: it retries at 10s, 40s, and 90s for any non-200 response. The idempotency layer (Redis + DB unique constraint) must be in place before the webhook is exposed. The webhook endpoint must return 200 in under 100ms (INFRA-03), meaning all processing must be async via BullMQ — no synchronous DB writes in the webhook handler.

Token storage decision (Claude's discretion): httpOnly cookie is recommended. It is XSS-safe (cannot be accessed by JavaScript), works seamlessly with Next.js SSR, and is well-supported in the NestJS ecosystem via `ExtractJwt.fromExtractors()` with a custom cookie extractor.

**Primary recommendation:** Build the NestJS backend with feature modules (auth, webhooks, messaging), a shared PrismaModule, and a shared ChannelModule containing the abstract ChannelAdapter. Wire BullMQ with Redis for async processing and use dual-layer idempotency from day one.

---

## Standard Stack

### Core

| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| `@nestjs/core` + `@nestjs/common` | ^10.x | NestJS framework | Project-mandated; CommonJS mode required for Prisma 6 |
| `@nestjs/platform-express` | ^10.x | HTTP adapter (Express) | Default NestJS HTTP layer; cookie-parser support |
| `@nestjs/jwt` | ^10.x | JWT sign/verify | Official NestJS JWT module; wraps jsonwebtoken |
| `@nestjs/passport` | ^10.x | Auth strategy framework | Official adapter; enables guard-based protection |
| `passport` | ^0.7.x | Passport core | Peer dependency of @nestjs/passport |
| `passport-local` | ^1.x | Username/password strategy | Used for login endpoint |
| `passport-jwt` | ^4.x | JWT extraction strategy | Used to protect routes via cookie or header |
| `argon2` | ^0.41.x | Password hashing | OWASP-recommended; memory-hard, superior to bcrypt for new projects |
| `@prisma/client` | ^6.x | Database ORM client | Project-mandated (not v7); stable CommonJS mode |
| `prisma` | ^6.x (devDep) | Prisma CLI for migrations | Pair with @prisma/client |
| `@nestjs/bullmq` | ^10.x | BullMQ NestJS integration | Official module; replaces deprecated @nestjs/bull |
| `bullmq` | ^5.x | Queue/worker library | Peer dep; Redis-backed async job processing |
| `ioredis` | ^5.x | Redis client | BullMQ dependency; also used directly for idempotency keys |
| `@kapso/whatsapp-cloud-api` | latest | Kapso outbound messaging SDK | Official SDK; wraps Kapso REST API |
| `cookie-parser` | ^1.x | Parse cookies in Express | Required for httpOnly cookie JWT extraction |

### Supporting

| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| `@nestjs/config` | ^3.x | Environment variable management | Always — centralizes `.env` handling via `ConfigModule.forRoot()` |
| `class-validator` | ^0.14.x | DTO validation | Always — decorators for request body validation |
| `class-transformer` | ^0.5.x | DTO transformation | Always — pairs with class-validator and NestJS ValidationPipe |
| `helmet` | ^7.x | HTTP security headers | Always — applied globally as middleware |
| `@types/passport-local` | devDep | TypeScript types | Always |
| `@types/passport-jwt` | devDep | TypeScript types | Always |
| `@types/cookie-parser` | devDep | TypeScript types | Always |
| `@types/argon2` | devDep | TypeScript types | Always |

### Alternatives Considered

| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| `argon2` | `bcrypt` | bcrypt is simpler to install (pure JS via bcryptjs); argon2 is OWASP-preferred but requires native binaries. For this small-team project either works; argon2 preferred. |
| httpOnly cookie JWT | Bearer header JWT | Bearer requires client-side localStorage (XSS risk) or manual header management in Next.js. Cookie is simpler for SSR and more secure. |
| `ioredis` direct | Only use via BullMQ | BullMQ handles its own Redis connection; separate ioredis instance needed only for idempotency key operations outside BullMQ |
| Prisma 6 | Drizzle, TypeORM | Project constraint: Prisma 6 locked. TypeORM has worse type safety; Drizzle not evaluated. |

**Installation:**
```bash
# Backend
npm install @nestjs/core @nestjs/common @nestjs/platform-express @nestjs/jwt @nestjs/passport @nestjs/config @nestjs/bullmq
npm install passport passport-local passport-jwt argon2 cookie-parser helmet
npm install @prisma/client bullmq ioredis @kapso/whatsapp-cloud-api
npm install class-validator class-transformer
npm install -D prisma @types/passport-local @types/passport-jwt @types/cookie-parser @types/express
```

---

## Architecture Patterns

### Recommended Project Structure

```
apps/
  backend/                        # NestJS app
    src/
      app.module.ts               # Root module — imports all feature modules
      main.ts                     # Bootstrap: cookie-parser, helmet, ValidationPipe
      auth/
        auth.module.ts
        auth.controller.ts        # POST /auth/login, DELETE /auth/logout
        auth.service.ts           # validateUser(), login(), logout()
        strategies/
          local.strategy.ts       # passport-local: validates email+password
          jwt.strategy.ts         # passport-jwt: extracts JWT from cookie
        guards/
          local-auth.guard.ts
          jwt-auth.guard.ts
        dto/
          login.dto.ts
      webhooks/
        webhooks.module.ts
        webhooks.controller.ts    # POST /webhooks/kapso (public, no JWT guard)
        webhooks.service.ts       # Idempotency check → enqueue → return 200
        dto/
          kapso-webhook.dto.ts
      messaging/
        messaging.module.ts
        messaging.service.ts      # Outbound send — delegates to ChannelAdapter
        processors/
          message.processor.ts    # BullMQ WorkerHost — processes incoming jobs
      channels/
        channels.module.ts
        channel.adapter.ts        # abstract class ChannelAdapter (interface)
        kapso/
          kapso.adapter.ts        # KapsoAdapter implements ChannelAdapter
          kapso.client.ts         # Wraps @kapso/whatsapp-cloud-api
      prisma/
        prisma.module.ts          # Global module
        prisma.service.ts         # extends PrismaClient, onModuleInit/Destroy
  frontend/                       # Next.js app (Phase 4+)
prisma/
  schema.prisma
.env
```

### Pattern 1: Dual-Layer Idempotency Check

**What:** Check Redis first (fast); if Redis misses (restart/expiry), DB unique constraint catches the duplicate before INSERT.
**When to use:** In webhooks.service.ts before calling BullMQ `queue.add()`

```typescript
// Source: decisions from 01-CONTEXT.md + Redis SETNX pattern
async handleWebhook(payload: KapsoWebhookDto): Promise<void> {
  const messageId = payload.message?.id ?? payload['X-Idempotency-Key'];
  const redisKey = `wh:msg:${messageId}`;

  // Layer 1: Redis hot path (SETNX = SET if Not eXists)
  const isNew = await this.redis.set(redisKey, '1', 'EX', 86400, 'NX');
  if (!isNew) {
    this.logger.log({ event: 'webhook_duplicate_skipped', messageId });
    return; // Return 200 implicitly — Kapso retries on non-200
  }

  try {
    // Layer 2: DB unique constraint enforced on INSERT in worker
    await this.messageQueue.add('process-message', {
      messageId,
      payload,
      timestamp: Date.now(),
    });
  } catch (err) {
    // If queue fails, Redis key was already set — safe to return 200
    // Worker will see DB duplicate on retry
    this.logger.error({ event: 'webhook_enqueue_failed', messageId, err });
  }
}
```

### Pattern 2: BullMQ Worker (WorkerHost)

**What:** NestJS processor that extends `WorkerHost`, processes jobs from the queue.
**When to use:** One processor per queue; handles all incoming WhatsApp message logic.

```typescript
// Source: https://docs.nestjs.com/techniques/queues + https://docs.bullmq.io/guide/nestjs
import { Processor, WorkerHost, OnWorkerEvent } from '@nestjs/bullmq';
import { Job } from 'bullmq';

@Processor('incoming-messages')
export class MessageProcessor extends WorkerHost {
  async process(job: Job): Promise<void> {
    const { messageId, payload } = job.data;
    // Layer 2 idempotency: Prisma upsert or unique constraint
    // Will throw on duplicate externalMessageId — BullMQ marks job failed
    await this.prisma.message.create({
      data: { externalMessageId: messageId, ... }
    });
  }

  @OnWorkerEvent('failed')
  onFailed(job: Job, err: Error) {
    this.logger.error({ jobId: job.id, err });
  }
}
```

### Pattern 3: ChannelAdapter Abstract Class

**What:** Abstract class (not interface) to enable NestJS dependency injection with a token.
**When to use:** All outbound messaging goes through this abstraction; Phase 2 bot uses it; Phase 5+ Instagram adapter implements it.

```typescript
// Source: NestJS DI patterns — abstract class as injection token
// https://dev.to/bilelsalemdev/why-you-should-inject-interfaces-not-classes-in-nestjs-applications--c21
export abstract class ChannelAdapter {
  abstract sendText(to: string, body: string): Promise<void>;
  abstract sendTemplate(to: string, templateName: string, params: string[]): Promise<void>;
  abstract normalizeInbound(rawPayload: unknown): NormalizedMessage;
}

// In channels.module.ts:
@Module({
  providers: [
    KapsoAdapter,
    { provide: ChannelAdapter, useClass: KapsoAdapter },
  ],
  exports: [ChannelAdapter],
})
export class ChannelsModule {}
```

### Pattern 4: JWT in httpOnly Cookie

**What:** Access token stored in httpOnly cookie; extracted by JwtStrategy using custom extractor.
**When to use:** All auth flows for the CRM frontend (Next.js).

```typescript
// Source: https://tigran.tech/nestjs-cookie-based-jwt-authentication/
// jwt.strategy.ts
@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy) {
  constructor(config: ConfigService) {
    super({
      jwtFromRequest: ExtractJwt.fromExtractors([
        (req: Request) => req?.cookies?.access_token ?? null,
      ]),
      secretOrKey: config.get('JWT_SECRET'),
    });
  }
  async validate(payload: JwtPayload) {
    return { userId: payload.sub, email: payload.email };
  }
}

// auth.controller.ts — login
@Post('login')
@UseGuards(LocalAuthGuard)
async login(@Request() req, @Res({ passthrough: true }) res: Response) {
  const { access_token } = await this.authService.login(req.user);
  res.cookie('access_token', access_token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'strict',
    maxAge: 8 * 60 * 60 * 1000, // 8 hours
  });
  return { message: 'ok' };
}

// logout
@Delete('logout')
@UseGuards(JwtAuthGuard)
logout(@Res({ passthrough: true }) res: Response) {
  res.clearCookie('access_token');
  return { message: 'ok' };
}
```

### Pattern 5: Kapso Webhook Signature Verification

**What:** HMAC-SHA256 guard middleware on the webhook endpoint.
**When to use:** Applied before the webhook handler; validates every request from Kapso.

```typescript
// Source: https://docs.kapso.ai/docs/platform/webhooks/overview
import * as crypto from 'crypto';

function verifyKapsoSignature(secret: string, payload: Buffer, signature: string): boolean {
  const expected = crypto
    .createHmac('sha256', secret)
    .update(payload)
    .digest('hex');
  return crypto.timingSafeEqual(Buffer.from(expected), Buffer.from(signature));
}
```

### Anti-Patterns to Avoid

- **Synchronous DB writes in webhook handler:** Any write in the webhook path adds latency. All persistence must happen in the BullMQ worker. The webhook only writes to Redis and enqueues.
- **Returning non-200 on duplicate detection:** Kapso retries on any non-200 (at 10s, 40s, 90s). Always return 200 for duplicates, log the skip.
- **Using `@nestjs/bull` instead of `@nestjs/bullmq`:** Bull is maintenance-only. Use `@nestjs/bullmq` which ships `WorkerHost` pattern.
- **Using Prisma 7:** Breaks CommonJS compatibility with NestJS. Stay on Prisma 6.
- **Injecting interface types:** TypeScript interfaces are erased at runtime. Use abstract classes as injection tokens for ChannelAdapter.
- **Storing JWT in localStorage:** XSS accessible. Always use httpOnly cookie.

---

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Password hashing | Custom hash function | `argon2` | Memory-hard, OWASP-recommended, handles salting internally |
| JWT sign/verify | Raw `jsonwebtoken` calls | `@nestjs/jwt` | Lifecycle management, ConfigService integration, standard patterns |
| Auth strategy wiring | Manual middleware | `@nestjs/passport` + `passport-local` + `passport-jwt` | Guards, DI, strategy pattern; handles 401 responses |
| Queue persistence | In-memory queue / custom Redis pub-sub | `bullmq` + `@nestjs/bullmq` | Retries, dead-letter, concurrency control, job state, monitoring |
| HMAC verification | Custom timing-safe comparison | `crypto.timingSafeEqual()` (Node built-in) | Prevents timing attacks; no external dep needed |
| WhatsApp outbound messaging | Direct Meta API calls | `@kapso/whatsapp-cloud-api` | Official SDK handles auth, request format, error parsing |
| ORM / query building | Raw SQL | Prisma 6 | Type safety, migrations, generated client |
| Env var management | `process.env.X` directly | `@nestjs/config` + `ConfigService` | Validation, typing, injection |

**Key insight:** The queue + idempotency combination has significant edge-case complexity (race conditions, partial failures, Redis restart scenarios). Lean on BullMQ's job ID deduplication as a secondary layer and let the DB unique constraint be the final authority.

---

## Common Pitfalls

### Pitfall 1: Race Condition in Idempotency Check

**What goes wrong:** Two simultaneous webhook requests for the same `messageId` both pass the Redis SETNX check before either completes (Redis race).
**Why it happens:** Redis SET NX is atomic, but if Redis is unavailable, both requests fall through to the DB layer.
**How to avoid:** Redis `SET NX EX` is atomic — concurrent requests are safe. Redis unavailability falls back to DB unique constraint (the Prisma create will throw `P2002`). Handle `P2002` in the worker and treat it as a duplicate (log and complete the job without error).
**Warning signs:** Duplicate `Message` rows in DB; `P2002` errors in worker logs.

### Pitfall 2: Kapso Retry Storm

**What goes wrong:** Webhook endpoint returns non-200 for any reason (validation error, exception) → Kapso retries 3 times → each retry creates a new job unless idempotency is correct.
**Why it happens:** Missing error handling that lets exceptions bubble to 500.
**How to avoid:** Wrap the entire webhook handler in try/catch. Return 200 even on internal errors (log them). The message won't be lost — Kapso will retry, and idempotency will let it through if it wasn't processed.
**Warning signs:** Logs show same `messageId` processed multiple times within a 2-minute window.

### Pitfall 3: Prisma 7 ESM Conflict

**What goes wrong:** Installing `prisma@7` or `@prisma/client@7` breaks the NestJS build with ESM module resolution errors.
**Why it happens:** Prisma 7 changed defaults to ESM; NestJS uses CommonJS by default.
**How to avoid:** Pin `"prisma": "^6"` and `"@prisma/client": "^6"` in package.json. Do not run `npm update` without pinning major.
**Warning signs:** `SyntaxError: Cannot use import statement in a module` or `ERR_REQUIRE_ESM` at startup.

### Pitfall 4: BullMQ Connection Reuse

**What goes wrong:** BullMQ opens many Redis connections (one per Queue, one per Worker, one per QueueEvents). Exceeds Redis connection limit on free-tier providers.
**Why it happens:** Each BullMQ entity creates its own connection by default.
**How to avoid:** Use `BullModule.forRoot({ connection: { host, port } })` at app root — this shared connection config is reused. For the ioredis direct instance (idempotency keys), use a separate singleton connection.
**Warning signs:** `ECONNREFUSED` or Redis connection limit errors under load.

### Pitfall 5: Cookie Not Sent in Next.js API Calls

**What goes wrong:** Next.js frontend makes API calls to NestJS backend; cookie is not attached because requests are cross-origin.
**Why it happens:** Browser blocks cross-origin cookie sending by default; CORS not configured correctly.
**How to avoid:** In NestJS `main.ts`: `app.enableCors({ origin: process.env.FRONTEND_URL, credentials: true })`. In Next.js fetch calls: `{ credentials: 'include' }`. Cookie must be `sameSite: 'none'` only if frontend and backend are on different domains in production.
**Warning signs:** 401 on authenticated endpoints after successful login.

### Pitfall 6: ChannelAdapter Interface vs Abstract Class

**What goes wrong:** Defining `ChannelAdapter` as a TypeScript `interface` → NestJS DI cannot use it as an injection token at runtime (interfaces are erased).
**Why it happens:** TypeScript interfaces have no runtime representation.
**How to avoid:** Define `ChannelAdapter` as an `abstract class`. Use it as the provider token: `{ provide: ChannelAdapter, useClass: KapsoAdapter }`.
**Warning signs:** `Nest can't resolve dependencies` error at bootstrap.

---

## Code Examples

Verified patterns from official sources:

### PrismaService (standard NestJS pattern)

```typescript
// Source: https://www.prisma.io/docs/guides/nestjs
import { Injectable, OnModuleInit, OnModuleDestroy } from '@nestjs/common';
import { PrismaClient } from '@prisma/client';

@Injectable()
export class PrismaService extends PrismaClient implements OnModuleInit, OnModuleDestroy {
  async onModuleInit() {
    await this.$connect();
  }
  async onModuleDestroy() {
    await this.$disconnect();
  }
}
```

### BullMQ Module Registration

```typescript
// Source: https://docs.nestjs.com/techniques/queues
// app.module.ts
BullModule.forRoot({
  connection: {
    host: process.env.REDIS_HOST,
    port: parseInt(process.env.REDIS_PORT, 10),
  },
}),
BullModule.registerQueue({ name: 'incoming-messages' }),
```

### Kapso Outbound Send

```typescript
// Source: https://docs.kapso.ai/docs/whatsapp/typescript-sdk/introduction
import { WhatsAppClient } from '@kapso/whatsapp-cloud-api';

const client = new WhatsAppClient({
  baseUrl: 'https://app.kapso.ai/api/meta/',
  kapsoApiKey: process.env.KAPSO_API_KEY,
});

await client.messages.sendText({
  phoneNumberId: process.env.KAPSO_PHONE_NUMBER_ID,
  to: recipientPhone,
  body: 'Hello from SN8!',
});
```

### Prisma Schema — Phase 1 Entities

```prisma
// prisma/schema.prisma
generator client {
  provider = "prisma-client-js"
}

datasource db {
  provider = "postgresql"
  url      = env("DATABASE_URL")
}

model User {
  id           String   @id @default(cuid())
  email        String   @unique
  passwordHash String
  createdAt    DateTime @default(now())
  updatedAt    DateTime @updatedAt
}

model Message {
  id                String   @id @default(cuid())
  externalMessageId String   @unique   // DB-layer idempotency constraint
  direction         String   // "inbound" | "outbound"
  fromPhone         String
  toPhone           String
  body              String?
  rawPayload        Json
  processedAt       DateTime?
  createdAt         DateTime @default(now())
}
```

Note on schema scope (Claude's discretion): Defining only Phase 1 entities (`User`, `Message`) keeps migrations clean and avoids premature schema decisions. Phase 2 will add `Conversation`, `Contact`. Phase 3 adds `Quote`. This is the recommended approach.

---

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| `@nestjs/bull` (Bull v4) | `@nestjs/bullmq` (BullMQ) | Bull deprecated 2022 | BullMQ has `WorkerHost`, better TypeScript, active maintenance |
| `Processor` class with `@Process()` | `WorkerHost` + `process()` method | `@nestjs/bullmq` v1+ | Single entry point, cleaner pattern |
| `bcrypt` for passwords | `argon2` (argon2id variant) | OWASP PHC 2015, mainstream 2022+ | Memory-hard, GPU/ASIC resistant |
| Bearer token in localStorage | JWT in httpOnly cookie | SSR era (Next.js 13+) | XSS-safe; works with SSR |
| Prisma 5 `PrismaService.$on` lifecycle | `onModuleInit`/`onModuleDestroy` | Prisma 5+ deprecation | Cleaner NestJS lifecycle hooks |

**Deprecated/outdated:**
- `@nestjs/bull` and `bull` package: Maintenance mode, no new features. Do not use.
- `passport-local` callback style: NestJS wraps it cleanly; use the strategy class pattern.
- `prisma@7`: ESM-default breaks NestJS CommonJS. Locked to v6.

---

## Open Questions

1. **Kapso.ai rate limits for outbound messages**
   - What we know: API exists at `https://api.kapso.ai/meta/whatsapp/v24.0/{phone_number_id}/messages`; authentication via `X-API-Key`
   - What's unclear: Rate limits and retry behavior for outbound sends are not documented publicly (flagged in STATE.md as a known blocker)
   - Recommendation: Implement basic retry with exponential backoff in `KapsoAdapter.sendText()`. Validate empirically during Phase 1 testing or contact Kapso support before Phase 2.

2. **Kapso.ai `X-Kapso-Idempotency-Key` header availability**
   - What we know: Documentation shows `X-Idempotency-Key` header exists on Kapso webhook requests as a unique UUID; `message.id` exists at `payload.message.id` in format `"wamid.123"`
   - What's unclear: Whether the header is consistently named `X-Idempotency-Key` or `X-Kapso-Idempotency-Key` as referenced in CONTEXT.md
   - Recommendation: Implement header check for both `X-Idempotency-Key` and `X-Kapso-Idempotency-Key`; fallback to `payload.message.id`. Log which source was used.

3. **Database schema completeness for Phase 1**
   - What we know: Claude's discretion allows full v1 schema or Phase 1 only
   - What's unclear: Whether defining `channel_type` field now (for CANAL-02 v2 requirement) is worth the marginal cost
   - Recommendation: Add `channel` field (`String @default("whatsapp")`) to the `Message` model now. Zero migration cost at Phase 1; avoids a data migration when Instagram v2 lands. The REQUIREMENTS.md note on CANAL-02 explicitly flags this.

---

## Sources

### Primary (HIGH confidence)
- [Kapso Webhooks Overview](https://docs.kapso.ai/docs/platform/webhooks/overview) — retry behavior, HMAC verification, X-Idempotency-Key header
- [Kapso Event Types](https://docs.kapso.ai/docs/platform/webhooks/event-types) — `whatsapp.message.received` payload structure, `message.id` field
- [Kapso TypeScript SDK](https://docs.kapso.ai/docs/whatsapp/typescript-sdk/introduction) — `@kapso/whatsapp-cloud-api` installation, `sendText()` method
- [NestJS Queues (BullMQ)](https://docs.nestjs.com/techniques/queues) — `@nestjs/bullmq`, `WorkerHost`, `@Processor`, `BullModule.forRoot()`
- [BullMQ Deduplication](https://docs.bullmq.io/patterns/deduplication) — deduplication patterns, job ID strategy
- [Prisma + NestJS Guide](https://www.prisma.io/docs/guides/nestjs) — PrismaService pattern, `onModuleInit`/`onModuleDestroy`
- [BullMQ NestJS Official Docs](https://docs.bullmq.io/guide/nestjs) — WorkerHost pattern

### Secondary (MEDIUM confidence)
- [NestJS Auth docs](https://docs.nestjs.com/security/authentication) — Passport strategy architecture (page rendered partially; cross-verified with official NestJS recipes)
- [Cookie-based JWT NestJS](https://tigran.tech/nestjs-cookie-based-jwt-authentication/) — httpOnly cookie extraction pattern; cross-verified with multiple sources
- [OWASP Argon2 recommendation](https://guptadeepak.com/the-complete-guide-to-password-hashing-argon2-vs-bcrypt-vs-scrypt-vs-pbkdf2-2026/) — argon2id parameters

### Tertiary (LOW confidence — needs validation)
- Kapso.ai rate limits: Not publicly documented; validated recommendation is empirical testing
- `X-Kapso-Idempotency-Key` exact header name: Documentation shows `X-Idempotency-Key`; CONTEXT.md references `X-Kapso-Idempotency-Key` — validate against actual Kapso request headers during Phase 1

---

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH — official NestJS, BullMQ, Prisma, Kapso docs verified
- Architecture: HIGH — patterns are standard NestJS module structure; abstract class DI is well-established
- Idempotency layer: HIGH — Redis SETNX atomicity documented; DB unique constraint is deterministic
- Kapso integration: MEDIUM — SDK and API endpoint verified; rate limits and exact header names are LOW
- Pitfalls: HIGH — most are sourced from official docs or locked decisions (CONTEXT.md)

**Research date:** 2026-03-15
**Valid until:** 2026-04-15 (Kapso.ai docs may change; NestJS/BullMQ ecosystem is stable)
