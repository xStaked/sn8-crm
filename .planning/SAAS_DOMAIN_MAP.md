# SAAS_DOMAIN_MAP

## Propósito

Definir el mapa de dominio SaaS para la transformación de `sn8-crm` desde una solución single-tenant orientada a SN8 Labs hacia una plataforma multi-tenant de bot comercial para WhatsApp.

Este documento aterriza la Fase 01 y fija:
- el centro real del dominio
- los bounded contexts principales
- ownership de entidades
- fronteras entre core y módulos opcionales
- transición desde el modelo actual

---

## 1. Centro del dominio

El nuevo centro del producto ya no es la cotización ni el brief comercial.

El nuevo centro del dominio es:

`Workspace + Bot + Knowledge + Flow + Conversation + Lead`

### Interpretación
- `Workspace` representa al negocio cliente dentro del SaaS.
- `Bot` representa la unidad operativa conversacional configurada por ese negocio.
- `Knowledge` representa la memoria comercial y operativa que alimenta respuestas.
- `Flow` representa la lógica guiada y reusable de atención/calificación.
- `Conversation` representa la ejecución real sobre un canal.
- `Lead` representa el registro comercial reusable derivado de la conversación.

La cotización deja de ser el eje del sistema y pasa a ser una capacidad opcional de una capa comercial.

---

## 2. Tenant root

## Entidad raíz

La entidad raíz del SaaS debe ser `Workspace`.

### Responsabilidades de Workspace
- identidad del cliente dentro de la plataforma
- aislamiento de datos
- configuración operativa base
- ownership lógico de bots, canales, knowledge, flows, conversaciones y leads
- punto de control para permisos y membresías

### Regla base
Toda entidad de negocio principal debe pertenecer directa o indirectamente a un `workspaceId`.

---

## 3. Bounded contexts propuestos

## A. SaaS Core

### Responsabilidad
Gobernar tenancy, usuarios, membresías, permisos, branding y configuración del workspace.

### Entidades
- `Workspace`
- `WorkspaceMember`
- `WorkspaceSettings`
- `User`

### Notas
- `User` es global a la plataforma.
- `WorkspaceMember` materializa la relación usuario ↔ workspace.
- los roles deben vivir aquí, no embebidos en módulos comerciales.

---

## B. Bot Management

### Responsabilidad
Configurar el comportamiento operativo del bot por workspace.

### Entidades
- `Bot`
- `BotVersion` (opcional posterior, recomendable)
- `BotPersona` (puede empezar embebida en Bot)

### Ownership
- `Bot.workspaceId`

### Notas
- en MVP puede existir un bot principal por workspace, pero el modelo debe permitir varios.
- prompts, tono, reglas y modo operativo deben migrar a configuración por bot, no global del sistema.

---

## C. Channel Connections

### Responsabilidad
Gestionar las conexiones entre bots/workspaces y canales externos.

### Entidades
- `ChannelConnection`
- `ChannelCredential` (puede ser implícita al inicio)
- `ChannelWebhookEndpoint` (si luego se requiere)

### Ownership
- `ChannelConnection.workspaceId`
- opcionalmente `ChannelConnection.botId` cuando una conexión esté asignada a un bot específico

### Notas
- WhatsApp es el primer canal.
- el dominio debe quedar listo para Instagram, webchat y futuros canales sin contaminar el core.

---

## D. Knowledge

### Responsabilidad
Gestionar conocimiento comercial reusable por workspace.

### Entidades
- `KnowledgeBase`
- `KnowledgeDocument`
- `KnowledgeSource`
- `KnowledgeChunk` o abstracción equivalente de indexación

### Ownership
- todas con `workspaceId`
- `KnowledgeBase` puede ser la raíz funcional del contexto

### Notas
- debe soportar contenido estructurado y contenido documental libre.
- este contexto será fundamental en Fase 02.

---

## E. Flow Builder

### Responsabilidad
Definir y versionar los flujos comerciales que gobiernan captura, calificación y handoff.

### Entidades
- `Flow`
- `FlowVersion`
- `FlowNode`
- `FlowEdge`
- `FlowExecution`

### Ownership
- todas con `workspaceId`
- `FlowExecution` además referencia `conversationId`

### Notas
- el builder MVP debe ser restringido, no universal.
- la versión inicial debe enfocarse en ventas, no automatización genérica.

---

## F. Conversations & Inbox

### Responsabilidad
Persistir la conversación real, su estado operativo y la interacción AI ↔ humano.

### Entidades
- `Conversation`
- `Message`
- `ConversationState`
- `ConversationAssignment` (posterior)
- `ConversationParticipant` (posterior o implícita)

### Ownership
- `Conversation.workspaceId`
- `Message.workspaceId`
- `ConversationState.workspaceId`

### Notas
- hoy `Message` existe sin tenancy explícita y `conversationId` vive como convención de aplicación.
- esta capa debe pasar a un modelo explícito de conversación.

---

## G. Leads / Sales CRM

### Responsabilidad
Representar el activo comercial reusable derivado de conversaciones.

### Entidades
- `Lead`
- `LeadField`
- `LeadFieldValue`
- `Opportunity` (opcional posterior)
- `Tag` (opcional)

### Ownership
- todas con `workspaceId`

### Notas
- `CommercialBrief` no debe seguir siendo el modelo central.
- su contenido debe migrar a `Lead`, `LeadProfile` o una combinación de campos configurables.

---

## H. Offers Module (opcional)

### Responsabilidad
Gestionar propuestas, cotizaciones y revisión humana cuando aplique.

### Entidades
- `OfferDraft`
- `OfferReviewEvent`
- `OfferDocument`
- `PricingTemplate`

### Ownership
- todas con `workspaceId`

### Notas
- este módulo no debe contaminar el core.
- el sistema debe funcionar aunque este módulo esté apagado.
- para el estado actual del repo, este contexto nace por renombre/evolución de `QuoteDraft` y `QuoteReviewEvent`.

---

## 4. Reglas de ownership

## Regla 1
Toda entidad de negocio primaria debe tener `workspaceId` explícito.

## Regla 2
Las entidades hijas pueden heredar tenancy por relación, pero en el core operativo conviene preferir `workspaceId` explícito cuando:
- se consultan frecuentemente por tenant
- participan en políticas de acceso
- son parte del inbox o analytics
- se proyectan en colas o workers

## Regla 3
`User` no lleva `workspaceId`; la pertenencia se modela con `WorkspaceMember`.

## Regla 4
Los secretos y credenciales de canal no deben mezclarse con configuración general de negocio.

## Regla 5
Las entidades de offers/cotización no pueden ser requisito para operar bot, knowledge o conversations.

---

## 5. Mapa actual → target

## Entidades actuales que se conservan

### `User`
Se conserva como identidad global.

### `Message`
Se conserva, pero debe evolucionar para pertenecer explícitamente a:
- `workspaceId`
- `conversationId`
- opcionalmente `botId`
- opcionalmente `channelConnectionId`

### `ConversationState`
Se conserva conceptualmente, pero debe quedar anclada a una `Conversation` formal.

---

## Entidades actuales que se reinterpretan

### `CommercialBrief`
Estado actual:
- brief rígido para proyectos de software
- orientado a una lógica comercial verticalizada

Destino recomendado:
- deprecar como entidad central
- migrar hacia `Lead` + `LeadProfile` configurable
- preservar campos útiles como fuente inicial de migración

### `QuoteDraft`
Destino recomendado:
- renombrar conceptualmente a `OfferDraft`
- conservar relación con conversación/lead
- mover al módulo opcional de offers

### `QuoteReviewEvent`
Destino recomendado:
- renombrar a `OfferReviewEvent`
- mantener trazabilidad de revisión humana

### `PricingRule`
Destino recomendado:
- evolucionar a `PricingTemplate` o `OfferRule`
- evitar semántica rígida atada a servicios de software

---

## Entidades nuevas obligatorias
- `Workspace`
- `WorkspaceMember`
- `Bot`
- `ChannelConnection`
- `KnowledgeBase`
- `KnowledgeDocument`
- `Flow`
- `FlowNode`
- `FlowEdge`
- `FlowExecution`
- `Conversation`
- `Lead`
- `LeadField`
- `LeadFieldValue`

---

## 6. Frontera core vs módulo opcional

## Core obligatorio
Debe incluir:
- workspaces
- membership y roles
- bots
- conexiones de canal
- knowledge
- flows
- conversations
- messages
- lead capture y qualification

## Módulo opcional
Debe incluir:
- offers/cotizaciones
- pricing templates
- approval flows específicos de oferta
- documentos comerciales PDF

## Decisión de producto
El core debe venderse y operar sin cotizaciones.
Las cotizaciones agregan valor para ciertos segmentos, pero no deben definir el producto.

---

## 7. Naming recomendado

## Mantener
- `Workspace`
- `WorkspaceMember`
- `Bot`
- `ChannelConnection`
- `KnowledgeBase`
- `Flow`
- `Conversation`
- `Message`
- `Lead`

## Deprecar progresivamente
- `CommercialBrief`
- `QuoteDraft`
- `QuoteReviewEvent`

## Reemplazar por naming target
- `CommercialBrief` → `LeadProfile` o absorbed into `Lead`
- `QuoteDraft` → `OfferDraft`
- `QuoteReviewEvent` → `OfferReviewEvent`
- `PricingRule` → `PricingTemplate`

---

## 8. Decisiones concretas para Fase 01

Al cerrar esta fase quedan fijadas estas decisiones:

1. El tenant root es `Workspace`.
2. Toda entidad principal del negocio llevará `workspaceId`.
3. `User` sigue siendo global y se relaciona por `WorkspaceMember`.
4. `Conversation` pasa a ser entidad formal, no solo convención derivada.
5. `CommercialBrief` deja de ser el centro del dominio.
6. `QuoteDraft` y `QuoteReviewEvent` salen del core conceptual y pasan a módulo opcional de offers.
7. El núcleo del producto queda compuesto por workspace, bot, knowledge, flow, conversation y lead.

---

## 9. Implicaciones para backend y frontend

## Backend
- reorganizar módulos NestJS por bounded context
- introducir guards y services tenant-aware
- hacer que workers y pipelines reciban contexto de `workspaceId`
- separar orquestación conversacional del módulo de offers

## Frontend
- migrar de CRM de negocio único a workspace console
- introducir selector/contexto de workspace si un usuario pertenece a varios
- separar navegación SaaS core de la navegación de offers

---

## 10. Resultado esperado de esta fase

La Fase 01 queda completa cuando el equipo puede responder sin ambigüedad:
- quién es el tenant: `Workspace`
- qué entidades viven dentro del tenant: core operativo completo
- cuál es el centro del producto: workspace + bot + knowledge + flow + conversation + lead
- qué queda en core: operación comercial conversacional
- qué queda como opcional: offers/cotizaciones
