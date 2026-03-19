# Phase 1: Foundation - Context

**Gathered:** 2026-03-15
**Status:** Ready for planning

<domain>
## Phase Boundary

Backbone completo: auth JWT, recepción de webhooks idempotente, BullMQ async queue, ChannelAdapter interface abstracta, y mensajería outbound via Kapso.ai. Sin lógica de negocio de bot. Entrega: el equipo puede autenticarse y el sistema recibe, deduplica y encola mensajes de WhatsApp de forma confiable.

Requirements: AUTH-01, AUTH-02, AUTH-03, INFRA-01, INFRA-02, INFRA-03, INFRA-04

</domain>

<decisions>
## Implementation Decisions

### Idempotency key storage
- **Dual-layer**: Redis SET (hot path) + DB unique constraint en `externalMessageId` (durable fallback)
- Si Redis falla o se reinicia, pueden entrar jobs duplicados al queue, pero el DB unique constraint intercepta duplicados antes de cualquier procesamiento de negocio duradero
- Key pattern en Redis: `wh:msg:{messageId}` donde `messageId` = `message.id` del payload de Kapso
- TTL de 24 horas (cubre la ventana de sesión de WhatsApp y cualquier retry storm de Kapso)

### Duplicate detection behavior
- Al detectar duplicado: retornar HTTP 200 inmediatamente, no encolar, no retornar error
- Razón: Kapso reintenta en respuestas non-200 — retornar 409 causaría retry loop infinito
- Loggear el skip como structured log para poder monitorear frecuencia de duplicados

### Idempotency key source
- Campo: `message.id` del webhook payload (WhatsApp asigna ID único por mensaje)
- Si Kapso expone header `X-Kapso-Idempotency-Key`: preferir ese. Si no, usar `message.id`

### Claude's Discretion
- Auth token storage (cookie httpOnly vs Bearer header) — Claude decide implementación
- Deployment target — Claude configura para Railway/Render con variables de entorno estándar
- Database schema scope — Claude decide si define schema completo v1 o solo Phase 1 entities
- ChannelAdapter interface method signatures — Claude diseña según research

</decisions>

<code_context>
## Existing Code Insights

### Reusable Assets
- Ninguno — proyecto greenfield, no hay código existente

### Established Patterns
- Ninguno establecido aún — Phase 1 define los patrones base

### Integration Points
- Webhook endpoint → BullMQ queue → Worker (procesamiento async)
- ChannelAdapter interface → KapsoAdapter implementation (Phase 1) → bot services (Phase 2+)
- Auth JWT → protege endpoints del CRM backend

</code_context>

<specifics>
## Specific Ideas

No specific requirements — open to standard approaches

</specifics>

<deferred>
## Deferred Ideas

None — discussion stayed within phase scope

</deferred>

---

*Phase: 01-foundation*
*Context gathered: 2026-03-15*
