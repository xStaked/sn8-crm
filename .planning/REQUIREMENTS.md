# Requirements: SN8 WPP CRM

**Defined:** 2026-03-15
**Core Value:** El bot nunca deja a un cliente sin respuesta y toda cotización pasa por validación del socio antes de enviarse — garantizando rentabilidad sin sacrificar velocidad de respuesta.

## v1 Requirements

Requirements para el lanzamiento inicial. Cada uno mapea a fases del roadmap.

### Authentication

- [ ] **AUTH-01**: El socio puede iniciar sesión con email y contraseña
- [ ] **AUTH-02**: La sesión persiste entre recargas del navegador
- [ ] **AUTH-03**: El socio puede cerrar sesión desde cualquier página

### Infrastructure

- [ ] **INFRA-01**: El sistema recibe webhooks de Kapso.ai (mensajes entrantes de WhatsApp)
- [ ] **INFRA-02**: Los webhooks tienen protección idempotente (mensajes duplicados no se procesan dos veces)
- [ ] **INFRA-03**: Los mensajes entrantes se encolan en BullMQ para procesamiento asíncrono (webhook retorna 200 en < 100ms)
- [ ] **INFRA-04**: El sistema puede enviar mensajes outbound por WhatsApp via Kapso.ai

### Frontend Foundation

- [ ] **FE-01**: El socio puede hacer login desde /login con email/contraseña (conectando a POST /auth/login de Phase 1 API)
- [ ] **FE-02**: Las rutas del CRM están protegidas — si no hay sesión activa (httpOnly cookie), se redirige a /login
- [ ] **FE-03**: El socio puede hacer logout y la sesión queda destruida (DELETE /auth/logout + cookie eliminada)
- [ ] **FE-04**: El CRM shell muestra un inbox básico con lista de contactos/conversaciones desde la API

### Bot / Conversación

- [ ] **BOT-01**: El bot responde automáticamente a mensajes entrantes con saludo y menú de opciones
- [ ] **BOT-02**: El bot guía al cliente a través de un flujo de calificación (nombre, tipo de proyecto, descripción, presupuesto aproximado)
- [ ] **BOT-03**: El bot maneja mensajes inesperados o fuera de flujo con respuestas por defecto apropiadas
- [ ] **BOT-04**: El estado de la conversación persiste entre mensajes (flujo no se reinicia con cada mensaje)

### AI / Requisitos

- [ ] **AI-01**: DeepSeek analiza la conversación y extrae los requisitos del proyecto en formato estructurado
- [ ] **AI-02**: El sistema genera un resumen del proyecto para presentar al socio antes de cotizar
- [ ] **AI-03**: El sistema envía un mensaje de "procesando" al cliente antes de llamar a la IA (latencia visible)

### AI Sales Agent

- [x] **SALES-AI-01**: El agente de IA conduce la conversación con tono premium y consultivo como experto en ventas de desarrollo de software
- [x] **SALES-AI-02**: El agente profundiza y consolida un brief comercial estructurado con problema, alcance, presupuesto, urgencia y restricciones clave
- [x] **SALES-AI-03**: El agente genera una cotización preliminar usando un formato definido por el socio y la marca explícitamente como pendiente de revisión
- [x] **SALES-AI-04**: El agente consulta la cotización al socio, incorpora correcciones y puede iterar varias veces antes de aprobación
- [x] **SALES-AI-05**: El agente nunca envía una cotización al cliente sin aprobación explícita del socio

### Cotización

- [ ] **COT-01**: DeepSeek genera una cotización (descripción, alcance, precio estimado, tecnologías sugeridas) a partir de los requisitos extraídos
- [ ] **COT-02**: La cotización pasa por validación Zod con sanity bounds (rangos mínimo/máximo por categoría de proyecto) antes de presentarse al socio
- [ ] **COT-03**: La cotización se guarda en base de datos con estado (pendiente_aprobacion / aprobada / rechazada / enviada)

### Aprobación

- [ ] **APPR-01**: El bot notifica al socio por WhatsApp cuando hay una cotización lista para revisar (con resumen y precio propuesto)
- [ ] **APPR-02**: El socio puede aprobar la cotización desde el CRM
- [ ] **APPR-03**: El socio puede rechazar la cotización con comentarios/correcciones desde el CRM
- [ ] **APPR-04**: Si se rechaza, el bot re-genera la cotización incorporando las correcciones del socio
- [ ] **APPR-05**: El bot envía la cotización al cliente solo después de que el socio la aprueba explícitamente

### CRM Dashboard

- [ ] **CRM-01**: El socio puede ver un inbox con todas las conversaciones activas de WhatsApp
- [ ] **CRM-02**: El socio puede ver el historial completo de conversaciones y cotizaciones de un contacto
- [ ] **CRM-03**: El socio puede ver y mover conversaciones en un pipeline de ventas (lead → cotizado → cerrado / perdido)
- [ ] **CRM-04**: El socio puede ver una cola de cotizaciones pendientes de aprobación con la información necesaria para decidir
- [ ] **CRM-05**: El CRM se actualiza con nuevas conversaciones/cotizaciones sin necesidad de recargar la página

### Frontend Integration With Current Backend

- [x] **FE-BE-01**: El frontend mantiene autenticacion real con el backend actual durante toda la navegacion del CRM y redirige a /login si la sesion deja de ser valida
- [x] **FE-BE-02**: El inbox del CRM consume conversaciones reales agregadas desde el backend actual sin depender de mocks en produccion
- [x] **FE-BE-03**: El panel de detalle muestra historial real de mensajes de la conversacion seleccionada desde el backend actual y conserva las acciones principales del shell
- [x] **FE-BE-04**: El flujo login → inbox → detalle → logout queda verificado end-to-end contra el backend actual

### Manual Reply from CRM

- [ ] **REPLY-01**: El socio puede enviar un mensaje de texto a un contacto desde el panel de detalle del CRM
- [x] **REPLY-02**: El backend expone un endpoint autenticado `POST /conversations/:id/messages` que envia el mensaje outbound via Kapso.ai y lo persiste en la base de datos
- [ ] **REPLY-03**: El mensaje enviado aparece en el historial de la conversación en el CRM sin recargar la página completa

### Kapso Real Inbound Integration

- [x] **KAPSO-E2E-01**: El webhook actual de Kapso solo acepta requests con firma/secret validos y resuelve el idempotency key tanto para payloads Kapso flatten como para payloads estilo Meta webhook
- [x] **KAPSO-E2E-02**: Un mensaje inbound de Kapso se normaliza a un formato interno consistente y se persiste exactamente una vez en `Message` usando `externalMessageId`
- [x] **KAPSO-E2E-03**: La persistencia inbound actualiza correctamente las proyecciones de conversacion usando el mismo `conversationId` estable basado en identidad telefonica
- [x] **KAPSO-E2E-04**: El inbox y el detail panel actuales reflejan el mensaje inbound persistido sin rediseñar el frontend ni romper los contratos `GET /conversations` y `GET /conversations/:conversationId/messages`
- [x] **KAPSO-E2E-05**: Existe una prueba local reproducible hoy, con variables reales o dummy controladas, que demuestra webhook → persistencia → APIs → CRM

## v2 Requirements

Aplazados para versión futura. Identificados pero fuera del roadmap actual.

### Multi-Canal

- **CANAL-01**: Integración con Instagram Direct via canal adicional
- **CANAL-02**: Channel-agnostic data model con `channel_type` en schema ⚠️ *Nota: diferir esto aumenta el costo de la integración Instagram v2 — considerar hacerlo en v1 a bajo costo*

### CRM Avanzado

- **CRM-06**: Asignación manual de conversaciones a agentes específicos
- **CRM-07**: Notificaciones en tiempo real via WebSocket/push (actualmente polling o refresh manual)
- **CRM-08**: Búsqueda y filtros avanzados de contactos

### Cotizaciones Avanzadas

- **COT-04**: Exportar cotización como PDF
- **COT-05**: Catálogo de servicios configurable desde el CRM (con precios base por categoría)
- **COT-06**: Historial de versiones de cotización (v1, v2, v3 tras rechazos)

### Automatización Avanzada

- **BOT-05**: Recordatorio automático a cliente si no responde en 24h
- **BOT-06**: Integración con herramienta externa de cotización (reemplazar GPT actual)

## Out of Scope

Exclusiones explícitas para prevenir scope creep.

| Feature | Reason |
|---------|--------|
| App móvil | Web-first; Next.js cubre el caso de uso con PWA si es necesario |
| Pagos en línea | El cierre comercial ocurre fuera del sistema por ahora |
| OAuth / Magic Link | Email/password suficiente para 2 socios; complejidad innecesaria |
| Chatbot flow builder visual | Overhead de UX para un equipo de 2; el flujo se configura en código |
| Integración con CRMs externos (HubSpot, etc.) | Scope creep; este CRM es el sistema de registro |
| Video / archivos pesados en WhatsApp | Almacenamiento y complejidad; texto e imágenes básicas son suficientes para v1 |

## Traceability

Actualizado durante la creación del roadmap.

| Requirement | Phase | Status |
|-------------|-------|--------|
| FE-01 | Phase 1.1 | Pending |
| FE-02 | Phase 1.1 | Pending |
| FE-03 | Phase 1.1 | Pending |
| FE-04 | Phase 1.1 | Pending |
| AUTH-01 | Phase 1 | Pending |
| AUTH-02 | Phase 1 | Pending |
| AUTH-03 | Phase 1 | Pending |
| INFRA-01 | Phase 1 | Pending |
| INFRA-02 | Phase 1 | Pending |
| INFRA-03 | Phase 1 | Pending |
| INFRA-04 | Phase 1 | Pending |
| BOT-01 | Phase 2 | Pending |
| BOT-02 | Phase 2 | Pending |
| BOT-03 | Phase 2 | Pending |
| BOT-04 | Phase 2 | Pending |
| SALES-AI-01 | Phase 2.1 | Complete |
| SALES-AI-02 | Phase 2.1 | Complete |
| SALES-AI-03 | Phase 2.1 | Complete |
| SALES-AI-04 | Phase 2.1 | Complete |
| SALES-AI-05 | Phase 2.1 | Complete |
| AI-01 | Phase 3 | Pending |
| AI-02 | Phase 3 | Pending |
| AI-03 | Phase 3 | Pending |
| COT-01 | Phase 3 | Pending |
| COT-02 | Phase 3 | Pending |
| COT-03 | Phase 3 | Pending |
| APPR-01 | Phase 3 | Pending |
| APPR-02 | Phase 3 | Pending |
| APPR-03 | Phase 3 | Pending |
| APPR-04 | Phase 3 | Pending |
| APPR-05 | Phase 3 | Pending |
| CRM-01 | Phase 4 | Pending |
| CRM-02 | Phase 4 | Pending |
| CRM-03 | Phase 4 | Pending |
| CRM-04 | Phase 4 | Pending |
| CRM-05 | Phase 4 | Pending |
| FE-BE-01 | Phase 5 | Complete |
| FE-BE-02 | Phase 5 | Complete |
| FE-BE-03 | Phase 5 | Complete |
| FE-BE-04 | Phase 5 | Complete |
| REPLY-01 | Phase 05.2 | Pending |
| REPLY-02 | Phase 05.2 | Complete |
| REPLY-03 | Phase 05.2 | Pending |
| KAPSO-E2E-01 | Phase 05.1 | Complete |
| KAPSO-E2E-02 | Phase 05.1 | Complete |
| KAPSO-E2E-03 | Phase 05.1 | Complete |
| KAPSO-E2E-04 | Phase 05.1 | Complete |
| KAPSO-E2E-05 | Phase 05.1 | Complete |

**Coverage:**
- v1 requirements: 46 total
- Mapped to phases: 46
- Unmapped: 0 ✓

---
*Requirements defined: 2026-03-15*
*Last updated: 2026-03-19 after adding Phase 2.1 AI sales agent requirements*
