# Phase 2: Bot Conversation Engine - Context

**Gathered:** 2026-03-23
**Status:** Ready for planning

<domain>
## Phase Boundary

Un cliente que escribe por WhatsApp recibe saludo automático con opciones interactivas, es guiado a través del flujo de calificación completo (delegando al AI discovery existente de Phase 2.1), y el estado de la conversación sobrevive reinicios del servidor mediante Redis + DB.

Esta fase agrega un FSM formal como capa de enrutamiento sobre el flujo de AI sales ya implementado. No reemplaza ConversationFlowService — lo envuelve.

</domain>

<decisions>
## Implementation Decisions

### Greeting Experience
- WhatsApp interactive buttons (reply buttons) para el primer contacto
- 3 opciones: "Cotizar proyecto" / "Conocer servicios" / "Hablar con alguien"
- Si el cliente escribe texto libre en vez de tocar un botón, AI clasifica el intent y enruta al estado correcto
- Clientes que regresan después de expiración (24h) reciben un "Hola de nuevo" personalizado + los mismos 3 botones
- Clientes con estado activo (dentro de 24h) retoman donde se quedaron sin greeting repetido

### FSM Integration with Existing AI Flow
- Lightweight FSM wrapper que enruta mensajes al handler correcto según estado
- Estados principales: GREETING → QUALIFYING → AI_SALES → HUMAN_HANDOFF → INFO_SERVICES
- "Cotizar proyecto" transiciona directo a QUALIFYING que delega a ConversationFlowService existente (AI discovery)
- "Conocer servicios" va a INFO_SERVICES, un estado separado con prompt informativo de AI. Cuando el cliente está listo, transiciona a QUALIFYING
- "Hablar con alguien" va a HUMAN_HANDOFF: notifica al owner por WhatsApp + mensaje de espera al cliente
- Clientes que regresan retoman desde su último estado guardado — no se fuerza greeting
- No se agrega paso de pre-screen no-AI antes de la AI discovery — el flujo existente ya maneja calificación naturalmente

### Off-Flow Message Handling
- AI genera respuesta contextual que reconoce lo que dijo el cliente y lo guía de vuelta al paso actual
- Máximo 3 reintentos consecutivos off-flow antes de escalar a human handoff automático (notifica owner)
- En estado GREETING: si el cliente escribe texto libre, AI clasifica intent en vez de reenviar botones
- Mensajes de media (imágenes, audios, documentos) reciben "Por ahora solo procesamos mensajes de texto" y el flujo continúa
- El contador de reintentos se resetea cuando el cliente da una respuesta válida

### State Persistence Strategy
- Redis como almacenamiento primario para lectura/escritura rápida durante conversaciones activas
- DB (Prisma model) como backup — cada transición de estado se persiste para reconstruir si Redis se pierde
- TTL de 24 horas en Redis alineado con la ventana de mensajería de WhatsApp
- Después de 24h sin actividad, el estado expira en Redis y se marca como expirado en DB
- Key pattern: `bot:fsm:${phone}` → `{ state, metadata, offFlowCount, lastTransition }`

### Claude's Discretion
- Diseño interno del FSM (tabla de transiciones, event handlers)
- Formato exacto de los mensajes de greeting y redirect
- Prompt del AI para clasificación de intent en GREETING
- Prompt del AI para respuestas off-flow contextuales
- Prompt del AI para INFO_SERVICES (conversación informativa sobre servicios SN8)
- Estructura del modelo Prisma para ConversationState backup
- Decisión de si el BullMQ worker inline se refactoriza o se mantiene el patrón actual

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Existing conversation flow (Phase 2.1)
- `apps/backend/src/ai-sales/conversation-flow.service.ts` — Current reply planner; QUALIFYING state delegates to this
- `apps/backend/src/ai-sales/ai-sales.orchestrator.ts` — Handoff target; enqueueQualifiedConversation triggers quote generation
- `apps/backend/src/ai-sales/ai-provider.interface.ts` — AI provider contract (extractBrief, discoveryReply, quoteDraft)
- `apps/backend/src/ai-sales/owner-review.service.ts` — Owner notification pattern reusable for HUMAN_HANDOFF

### Message processing pipeline
- `apps/backend/src/messaging/processors/message.processor.ts` — Primary insertion point; currently calls conversationFlowService.planReply() directly at line ~98
- `apps/backend/src/webhooks/webhooks.service.ts` — Webhook handler with idempotency and owner command routing
- `apps/backend/src/messaging/messaging.service.ts` — sendText() and sendTemplate() for outbound messages

### Infrastructure
- `apps/backend/src/redis/redis.module.ts` — Global Redis module with REDIS_CLIENT injection token
- `apps/backend/src/channels/kapso/kapso.adapter.ts` — Channel adapter with normalizeInbound and interactive message support
- `apps/backend/src/channels/channel.adapter.ts` — Abstract ChannelAdapter class

### Schema
- `apps/backend/prisma/schema.prisma` — Will need ConversationState model addition

</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets
- `REDIS_CLIENT` global injection token: Ready for FSM state storage, no setup needed
- `MessagingService.sendText()`: For bot replies in all states
- `ConversationFlowService.planReply()`: Entire QUALIFYING state delegates here
- `AiSalesOrchestrator.enqueueQualifiedConversation()`: Handoff already built, accepts 'phase-2-handoff' trigger
- `OwnerReviewService` notification pattern: Reusable for HUMAN_HANDOFF owner alerts
- `KapsoAdapter`: Supports interactive messages (buttons) via Kapso WhatsApp Cloud API

### Established Patterns
- NestJS module per domain: `*.module.ts`, `*.service.ts`, optional `*.processor.ts`
- Abstract adapter pattern: `ChannelAdapter` → `KapsoAdapter`
- `AI_PROVIDER` symbol token with `useExisting` binding
- BullMQ queues: `incoming-messages`, `ai-sales`
- Structured JSON logging with `Logger`
- `forwardRef()` for circular module dependencies

### Integration Points
- `MessageProcessor.process()` line ~98: Replace direct `planReply()` call with FSM router
- `ConversationFlowService`: QUALIFYING state delegates here unchanged
- `AiSalesOrchestrator`: QUALIFYING→AI_SALES handoff already works
- New `src/bot-conversation/` module with FSM service, wired into MessagingModule

</code_context>

<specifics>
## Specific Ideas

- El greeting debe sentirse como un asesor comercial profesional de SN8 Labs, no como un bot genérico
- La clasificación de intent por AI en GREETING debe ser tolerante — ante la duda, asumir "cotizar proyecto" para no perder leads
- El flujo INFO_SERVICES debe ser conversacional y educativo, posicionando a SN8 Labs como expertos antes de ofrecer cotizar
- El mensaje de handoff humano debe dar confianza: "Un asesor de nuestro equipo te contactará pronto" (no "no puedo ayudarte")
- Los 3 reintentos off-flow deben ser progresivamente más directos: primer intento suave, tercer intento explícito con opciones

</specifics>

<deferred>
## Deferred Ideas

None — discussion stayed within phase scope

</deferred>

---

*Phase: 02-bot-conversation-engine*
*Context gathered: 2026-03-23*
