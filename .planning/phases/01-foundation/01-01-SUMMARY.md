---
phase: 01-foundation
plan: 01
subsystem: infra
tags: [nestjs, prisma, bullmq, redis, ioredis, postgres, monorepo]

requires: []
provides:
  - NestJS backend workspace scaffolded at apps/backend with required dependencies installed
  - Prisma schema with Phase 1 core entities (User, Message) and idempotency-friendly constraint
  - Shared infrastructure wiring (ConfigModule, PrismaModule, RedisModule, BullMQ root connection)
  - NestJS bootstrap baseline (cookie parsing, Helmet, ValidationPipe, CORS for frontend auth)
affects: [01-foundation, auth, webhooks, messaging, deployment]

tech-stack:
  added: [nestjs, prisma6, bullmq, ioredis, helmet, cookie-parser]
  patterns:
    - npm workspaces root with backend app at apps/backend
    - global modules for shared infra (PrismaModule, RedisModule)
    - BullModule.forRootAsync configured from env

key-files:
  created:
    - package.json
    - .env.example
    - prisma/schema.prisma
    - apps/backend/src/main.ts
    - apps/backend/src/app.module.ts
    - apps/backend/src/prisma/prisma.module.ts
    - apps/backend/src/prisma/prisma.service.ts
    - apps/backend/src/redis/redis.module.ts
    - apps/backend/src/redis/redis.constants.ts
  modified:
    - apps/backend/package.json
    - apps/backend/package-lock.json

key-decisions:
  - "Keep Redis as a separate ioredis singleton (REDIS_CLIENT token) vs reusing BullMQ's internal connection"
  - "CORS credentials enabled with origin from FRONTEND_URL to support cookie-based auth in Phase 01-02"

patterns-established:
  - "Global Redis provider: `REDIS_CLIENT` token exported from a Global RedisModule"
  - "PrismaService lifecycle hooks: connect/disconnect in Nest module init/destroy"

requirements-completed: [INFRA-01, INFRA-02, INFRA-03]

duration: 3m
completed: 2026-03-18
---

# Phase 1: Foundation Summary

**NestJS backend scaffold with Prisma schema + shared Prisma/Redis/BullMQ wiring and security/CORS bootstrap baseline.**

## Performance

- **Duration:** 3m
- **Started:** 2026-03-18T20:37:13Z
- **Completed:** 2026-03-18T20:39:49Z
- **Tasks:** 2
- **Files modified:** 17

## Accomplishments

- Created an `apps/backend` NestJS workspace with scripts, tsconfigs, and installed Phase 1 infra dependencies.
- Added `prisma/schema.prisma` with `User` + `Message` (including `externalMessageId @unique` and `channel @default("whatsapp")`).
- Implemented global `PrismaModule`, global `RedisModule` (`REDIS_CLIENT`), BullMQ root connection, and `main.ts` security/CORS baseline.

## Task Commits

Each task was committed atomically:

1. **Task 1: Scaffold NestJS monorepo and install all dependencies** - `6901f01` (chore)
2. **Task 2: Prisma schema, PrismaService, root AppModule with shared infrastructure** - `1fd811e` (feat)

## Files Created/Modified

- `package.json` - Root workspace config pointing to `apps/backend`.
- `.env.example` - Documented env contract for DB/Redis/JWT/Kapso/App.
- `apps/backend/package.json` - Backend scripts, dependencies, and Prisma schema pointer.
- `apps/backend/tsconfig.json` / `apps/backend/tsconfig.build.json` - TS compilation settings for CommonJS Nest.
- `apps/backend/nest-cli.json` - Nest CLI configuration.
- `prisma/schema.prisma` - Phase 1 core models (`User`, `Message`) + idempotency constraint.
- `apps/backend/src/prisma/prisma.service.ts` - `PrismaService` extending `PrismaClient` with lifecycle hooks.
- `apps/backend/src/redis/redis.module.ts` - Global ioredis singleton configured from env.
- `apps/backend/src/app.module.ts` - ConfigModule + PrismaModule + RedisModule + BullModule.forRootAsync wiring.
- `apps/backend/src/main.ts` - cookie parser + Helmet + ValidationPipe + CORS bootstrap.

## Decisions Made

None beyond what’s captured above; followed the plan’s stack and wiring.

## Deviations from Plan

### Auto-fixed Issues

**1. Workspace install hoisted `node_modules` to repo root**
- **Found during:** Task 1 verification
- **Issue:** `node -e "require('./node_modules/@nestjs/core')"` failed because npm workspaces hoisted deps to root `node_modules/`.
- **Fix:** Ran `npm install --workspaces=false` inside `apps/backend` to ensure `apps/backend/node_modules` exists for the plan’s verification path.
- **Verification:** Plan’s exact verification command succeeded.
- **Committed in:** `6901f01` (Task 1 commit)

**2. cookie-parser import form didn’t typecheck**
- **Found during:** Task 2 TypeScript verification
- **Issue:** `import * as cookieParser from 'cookie-parser'` was not callable with current `@types/cookie-parser`.
- **Fix:** Switched to `import cookieParser from 'cookie-parser'` (tsconfig already supports default interop).
- **Verification:** `npx tsc --noEmit` passes.
- **Committed in:** `1fd811e` (Task 2 commit)

**3. Prisma validate didn’t load DATABASE_URL from repo root `.env`**
- **Found during:** Task 2 Prisma verification
- **Issue:** `npx prisma validate --schema ../../prisma/schema.prisma` run from `apps/backend` didn’t see `DATABASE_URL`.
- **Fix:** Copied `.env` into `apps/backend/.env` for local tooling.
- **Verification:** `npx prisma validate ...` passes.
- **Committed in:** Not committed (`.env` is gitignored).

**4. Prisma generate required writing to user cache outside sandbox**
- **Found during:** Task 2 Prisma generate
- **Issue:** Sandbox blocked Prisma from touching `~/.cache/prisma/.../libquery-engine`.
- **Fix:** Re-ran `npx prisma generate` with escalated permissions.
- **Verification:** Prisma client generated successfully.
- **Committed in:** Not applicable (verification only).

---

**Total deviations:** 4 (2 code changes, 2 environment/tooling adjustments)
**Impact on plan:** All deviations were required to satisfy the plan’s verification steps and TypeScript correctness. No scope creep.

## Issues Encountered

- `npm audit` reports 6 moderate vulnerabilities in transitive dev dependencies (left as-is for now; no production runtime code depends on them directly).
- Prisma CLI warns `package.json#prisma` is deprecated (kept per plan; migrate to Prisma config before Prisma 7).

## User Setup Required

None (no external services configured yet). Local tooling expects `.env` (copied from `.env.example`).

## Next Phase Readiness

- Ready for `01-02` (JWT auth core + seed) with Prisma + cookie/CORS baseline in place.
- Ready for `01-04` (webhook idempotency + queue) with Redis token + BullMQ root wiring available.

## Self-Check: PASSED

- Key files exist on disk and match the plan’s must-haves.
- `git log --oneline --all --grep="01-01"` returns the expected task commits.

---
*Phase: 01-foundation*
*Completed: 2026-03-18*

