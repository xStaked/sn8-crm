# Roadmap: SN8 WPP CRM

## Overview

El sistema se construye en cinco fases principales ordenadas por dependencia estricta, con tres inserciones decimales para adelantar trabajo crítico sin renumerar todo el roadmap. La Fase 1 establece el backbone completo: autenticación, recepción de webhooks idempotente, cola asíncrona y el adaptador de canal abstracto. La Fase 2 construye el motor conversacional sobre esa base sin introducir IA — el FSM de conversación debe estar estable antes de añadir una fuente de fallos nueva. La Fase 2.1 inserta el agente comercial experto: una IA consultiva/premium que guía la conversación de venta de software, captura el brief comercial y prepara una cotización en formato definido por el socio sin enviarla todavía al cliente. La Fase 3 cierra el loop de valor central: esa cotización se valida, persiste y entra en un flujo de aprobación humana donde solo llega al cliente cuando el socio lo aprueba explícitamente. La Fase 4 expone el CRM operativo completo en Next.js. La Fase 5 conecta ese frontend con el backend real actual para reemplazar mocks y dejar flujos funcionales end-to-end. La Fase 05.1 endurece la entrada real de Kapso para que los mensajes inbound persistan y reaparezcan en el CRM actual sin rediseñar la superficie frontend. Cada fase entrega un artefacto desplegable y verificable.

## Phases

**Phase Numbering:**
- Integer phases (1, 2, 3): Planned milestone work
- Decimal phases (2.1, 2.2): Urgent insertions (marked with INSERTED)

Decimal phases appear between their surrounding integers in numeric order.

- [x] **Phase 1: Foundation** - Backbone completo: auth, webhooks idempotentes, BullMQ, adaptador de canal, schema multi-canal
- [x] **Phase 1.1: Frontend Foundation** (INSERTED) - Next.js app shell con login, protección de rutas y conexión a Phase 1 API
- [ ] **Phase 2: Bot Conversation Engine** - FSM Redis-backed completa los estados GREETING → QUALIFYING → handoff sin IA
- [x] **Phase 2.1: AI Sales Agent Configuration** (INSERTED) - Agente IA experto en ventas de desarrollo de software guía la conversación, captura el brief comercial y prepara una cotización en formato definido por el socio para revisión humana (completed 2026-03-20)
- [ ] **Phase 3: AI Quotation + Approval Loop** - DeepSeek genera cotización validada, socio aprueba/rechaza, bot entrega al cliente
- [ ] **Phase 4: CRM Dashboard** - Panel Next.js con inbox, pipeline, cola de aprobación y tiempo real
- [x] **Phase 5: Frontend integration with current backend** - Reemplazar datos mock del frontend por consumo real del backend actual y cerrar flujos end-to-end (completed 2026-03-20)
- [x] **Phase 05.1: Integración real de Kapso y flujo inbound end-to-end** (INSERTED) - Conectar el webhook real/simulado de Kapso al backend actual y probar que los mensajes inbound persistidos aparecen en APIs y CRM (completed 2026-03-19)
- [ ] **Phase 05.2: Manual Reply from CRM** (INSERTED) - El socio puede responder mensajes inbound desde el panel de detalle del CRM: backend outbound endpoint + UI de reply integrada

## Phase Details

### Phase 1: Foundation
**Goal**: El equipo puede autenticarse y el sistema recibe, deduplica y encola mensajes de WhatsApp de forma confiable antes de cualquier lógica de negocio
**Depends on**: Nothing (first phase)
**Requirements**: AUTH-01, AUTH-02, AUTH-03, INFRA-01, INFRA-02, INFRA-03, INFRA-04
**Success Criteria** (what must be TRUE):
  1. El socio puede iniciar sesión con email/contraseña y la sesión persiste entre recargas del navegador
  2. El socio puede cerrar sesión desde cualquier página y queda protegido el acceso
  3. Un mensaje entrante de WhatsApp dispara el endpoint de webhook y retorna 200 en menos de 100ms
  4. El mismo mensaje enviado dos veces al webhook es procesado exactamente una vez (idempotencia verificable en logs)
  5. El sistema puede enviar un mensaje outbound por WhatsApp via Kapso.ai
**Plans**: 4 plans

Plans:
- [x] 01-01-PLAN.md — NestJS monorepo scaffold, Prisma schema (User + Message), shared modules (Config, Prisma, BullMQ root)
- [x] 01-02-PLAN.md — JWT auth core + first-user bootstrap seed (AUTH-01, AUTH-02, AUTH-03)
- [x] 01-03-PLAN.md — ChannelAdapter abstraction, KapsoAdapter, MessagingService outbound facade (INFRA-04)
- [x] 01-04-PLAN.md — Webhook endpoint with dual-layer idempotency, BullMQ WorkerHost, and latency verification (INFRA-01–03)

### Phase 1.1: Frontend Foundation (INSERTED)
**Goal**: El socio puede autenticarse desde el navegador, accede a un shell de CRM protegido por rutas, y el frontend se conecta correctamente a la API de Phase 1 (login/logout/session)
**Depends on**: Phase 1
**Requirements**: FE-01, FE-02, FE-03, FE-04
**Success Criteria** (what must be TRUE):
  1. El socio puede hacer login desde /login con email/contraseña y es redirigido al CRM dashboard
  2. Rutas protegidas redirigen a /login si no hay sesión activa (httpOnly cookie)
  3. El socio puede hacer logout y la sesión queda destruida (cookie eliminada)
  4. El CRM shell muestra un inbox básico con la lista de contactos/conversaciones desde la API
**Plans**: 3 plans

Plans:
- [x] 01.1-01-PLAN.md — Next.js 14 scaffold, shadcn/ui dark theme init, root layout, API fetch wrapper
- [x] 01.1-02-PLAN.md — Login page + Next.js middleware route protection (FE-01, FE-02)
- [x] 01.1-03-PLAN.md — CRM dashboard shell: 3-column layout, sidebar with logout, conversation list, detail panel (FE-03, FE-04)

### Phase 2: Bot Conversation Engine
**Goal**: Un cliente que escribe por WhatsApp recibe saludo automático, es guiado a través del flujo de calificación completo, y el estado de la conversación sobrevive reinicios del servidor
**Depends on**: Phase 1
**Requirements**: BOT-01, BOT-02, BOT-03, BOT-04
**Success Criteria** (what must be TRUE):
  1. Un mensaje nuevo a un número desconocido genera saludo automático y menú de opciones sin intervención humana
  2. El bot guía al cliente por nombre, tipo de proyecto, descripción y presupuesto — completando el flujo de calificación
  3. Un mensaje inesperado o fuera de flujo recibe respuesta por defecto apropiada (no silencio, no error)
  4. Si el servidor se reinicia a mitad de conversación, el cliente puede continuar desde donde estaba (estado persiste en Redis)
**Plans**: TBD

### Phase 2.1: AI Sales Agent Configuration (INSERTED)
**Goal**: Tras completar la calificación base, un agente de IA con tono premium y consultivo asume la conversación comercial, profundiza el brief del proyecto de software, genera una cotización preliminar en el formato definido por el socio y se la consulta internamente hasta obtener aprobación explícita
**Depends on**: Phase 2
**Requirements**: SALES-AI-01, SALES-AI-02, SALES-AI-03, SALES-AI-04, SALES-AI-05
**Success Criteria** (what must be TRUE):
  1. El agente responde como asesor comercial experto en desarrollo de software y mantiene un tono premium/consultivo consistente durante toda la conversación
  2. El agente captura un brief comercial estructurado suficiente para cotizar: tipo de proyecto, problema, alcance deseado, presupuesto, urgencia y restricciones clave
  3. El agente genera una cotización preliminar usando el formato definido por el socio y deja claro al cliente que está siendo revisada antes de cualquier envío final
  4. El socio recibe la cotización preliminar para revisión, puede pedir ajustes, y la IA la regenera incorporando correcciones antes de cualquier envío externo
  5. Ninguna cotización preliminar ni final se envía al cliente sin aprobación explícita del socio
**Plans**: 3 plans

Plans:
- [x] 02.1-01-PLAN.md — AI sales domain foundation: durable brief/draft/review state, DeepSeek provider contract, and quotation-format configuration surface
- [x] 02.1-02-PLAN.md — Qualification handoff into AI orchestration: structured brief extraction, quote draft generation, and pending-review customer messaging
- [x] 02.1-03-PLAN.md — WhatsApp-first owner consultation, draft regeneration from feedback, and hard no-send guardrail before approval

### Phase 3: AI Quotation + Approval Loop
**Goal**: La cotización preliminar generada por la IA se valida, persiste y entra en un loop operativo de aprobación/rechazo para que el socio la gestione de forma auditable antes de que el cliente la reciba
**Depends on**: Phase 2.1
**Requirements**: AI-01, AI-02, AI-03, COT-01, COT-02, COT-03, APPR-01, APPR-02, APPR-03, APPR-04, APPR-05
**Success Criteria** (what must be TRUE):
  1. Al completar el flujo de calificación, el cliente recibe mensaje de "procesando" y DeepSeek produce una cotización con descripción, alcance, precio estimado y tecnologías sugeridas
  2. Una cotización con precio fuera de sanity bounds (< $100 o > $500,000) es bloqueada automáticamente y no llega al socio sin revisión de rango
  3. El socio recibe notificación por WhatsApp cuando hay una cotización pendiente de aprobación, con resumen y precio propuesto
  4. El socio puede aprobar la cotización y esta se envía al cliente; o rechazarla con comentarios y el bot regenera la cotización incorporando las correcciones
  5. Ninguna cotización llega al cliente sin que el socio la haya aprobado explícitamente
**Plans**: TBD

### Phase 4: CRM Dashboard
**Goal**: El socio gestiona todo el pipeline de ventas desde un panel web: ve conversaciones activas, historial de contactos, mueve leads en el pipeline y aprueba/rechaza cotizaciones desde la misma interfaz — sin recargar la página para ver actualizaciones
**Depends on**: Phase 3
**Requirements**: CRM-01, CRM-02, CRM-03, CRM-04, CRM-05
**Success Criteria** (what must be TRUE):
  1. El socio puede ver un inbox con todas las conversaciones activas y el historial completo de mensajes y cotizaciones de cualquier contacto
  2. El socio puede ver y mover conversaciones entre estados del pipeline (lead → cotizado → cerrado / perdido) desde el CRM
  3. El socio puede ver la cola de cotizaciones pendientes con la información necesaria para aprobar o rechazar sin salir del CRM
  4. Las nuevas conversaciones y cotizaciones aparecen en el CRM sin necesidad de recargar la página (tiempo real)
**Plans**: TBD

## Progress

**Execution Order:**
Phases execute in numeric order: 1 → 1.1 → 2 → 2.1 → 3 → 4 → 5 → 5.1

| Phase | Plans Complete | Status | Completed |
|-------|----------------|--------|-----------|
| 1. Foundation | 4/4 | Complete | 2026-03-18 |
| 1.1. Frontend Foundation | 3/3 | Complete | 2026-03-18 |
| 2. Bot Conversation Engine | 0/TBD | Not started | - |
| 2.1. AI Sales Agent Configuration | 3/3 | Complete | 2026-03-20 |
| 3. AI Quotation + Approval Loop | 0/TBD | Not started | - |
| 4. CRM Dashboard | 0/TBD | Not started | - |
| 5. Frontend integration with current backend | 4/4 | Complete | 2026-03-20 |
| 05.1. Integración real de Kapso y flujo inbound end-to-end | 3/3 | Complete    | 2026-03-19 |
| 05.2. Manual Reply from CRM | 1/2 | In Progress | - |

### Phase 5: Frontend integration with current backend

**Goal:** El frontend deja de depender de datos mock y consume el backend actual de forma confiable para autenticación, inbox, detalle y acciones principales del CRM
**Requirements**: FE-BE-01, FE-BE-02, FE-BE-03, FE-BE-04
**Depends on:** Phase 4
**Plans:** 4 plans

Plans:
- [x] 05-01-PLAN.md — Backend conversations read model and authenticated GET /conversations summary endpoint
- [x] 05-02-PLAN.md — Backend conversation history endpoint and API contract verification
- [x] 05-03-PLAN.md — Frontend inbox/detail integration against real backend data and auth-aware error handling
- [x] 05-04-PLAN.md — End-to-end verification for login, inbox, detail, and logout against the current backend

### Phase 05.2: Manual Reply from CRM (INSERTED)

**Goal:** El socio puede responder mensajes inbound desde el panel de detalle del CRM — el backend expone un endpoint outbound autenticado via Kapso y el frontend integra una UI de composición que persiste el mensaje enviado en el historial sin recargar la página
**Depends on:** Phase 05.1
**Requirements**: REPLY-01, REPLY-02, REPLY-03
**Success Criteria** (what must be TRUE):
  1. El socio puede escribir y enviar un mensaje desde el panel de detalle del CRM
  2. El mensaje se envía via Kapso.ai y retorna confirmación (messageId de Kapso)
  3. El mensaje enviado aparece en el historial de la conversación inmediatamente después de enviar
**Plans:** 1/2 plans executed

Plans:
- [x] 05.2-01-PLAN.md — Backend outbound send chain (sendText returns wamid), POST endpoint, DTO, service method, module wiring (REPLY-02)
- [ ] 05.2-02-PLAN.md — Frontend compose area in detail panel with SWR mutate for instant history update (REPLY-01, REPLY-03)

### Phase 05.1: Integración real de Kapso y flujo inbound end-to-end (INSERTED)

**Goal:** Un mensaje inbound real o simulado de Kapso entra por el webhook actual, se valida, se normaliza, se persiste idempotentemente y luego aparece en las mismas APIs y vistas CRM ya integradas en frontend
**Requirements**: KAPSO-E2E-01, KAPSO-E2E-02, KAPSO-E2E-03, KAPSO-E2E-04, KAPSO-E2E-05
**Depends on:** Phase 5
**Success Criteria** (what must be TRUE):
  1. Un POST válido de Kapso al webhook actual es aceptado solo si la firma/secret es correcta
  2. El payload inbound real de Kapso se normaliza a un formato interno consistente sin introducir una arquitectura nueva
  3. El mismo evento repetido no duplica registros en `Message` gracias a `externalMessageId`
  4. La conversación se resuelve con la misma regla estable de `conversationId` basada en identidad telefónica
  5. El mensaje persistido aparece luego en `GET /conversations` y `GET /conversations/:conversationId/messages`
  6. El CRM frontend ya integrado muestra la conversación y el detalle actualizados sin rediseñar inbox ni detail panel
  7. El flujo puede probarse hoy localmente con variables reales o dummy controladas y queda documentado paso a paso
**Plans:** 3/3 plans complete

Plans:
- [x] 05.1-01-PLAN.md — Harden Kapso webhook ingress, signature validation, and real-payload normalization coverage
- [x] 05.1-02-PLAN.md — Persist inbound messages idempotently and prove conversation read models update from the stored message
- [x] 05.1-03-PLAN.md — Document local Kapso setup and verify webhook → APIs → CRM end-to-end with minimal frontend refresh glue only if needed
