# SaaS Transformation Master Plan

## Project
SN8 CRM → Sales Bot SaaS

## Purpose
Este documento será la guía maestra para transformar el proyecto actual en un SaaS de bot de ventas orientado inicialmente a WhatsApp.

No está pensado solo como visión. Está diseñado para servir como documento de orquestación, priorización y ejecución por fases.

---

# 1. Product Direction

## Product Thesis
El proyecto debe evolucionar de un CRM/bot interno para SN8 Labs hacia un **Sales Bot SaaS**.

## New Product Definition
Una plataforma SaaS que permite a un negocio:
- crear su workspace
- configurar uno o más bots comerciales
- conectar canales como WhatsApp
- cargar su base de conocimiento
- diseñar un flujo comercial con bloques simples
- operar conversaciones desde un inbox
- capturar y calificar leads
- escalar a humano cuando sea necesario
- activar opcionalmente módulos de oferta/cotización

## Core Promise
"Crea un bot de ventas para WhatsApp con base de conocimiento y flujos visuales, sin programar."

---

# 2. Strategic Principles

1. Generalizar el core sin volver la UX excesivamente genérica.
2. Resolver ventas primero, no CRM total.
3. Hacer de la knowledge base una capacidad de primer nivel.
4. Mantener el builder simple en el MVP.
5. Convertir cotizaciones en módulo opcional.
6. Diseñar multi-tenancy desde el núcleo.
7. Evitar personalizaciones por cliente como base del producto.

---

# 3. Current State Summary

## Valuable assets already built
- backend NestJS
- frontend Next.js
- inbound/outbound messaging pipeline
- WhatsApp integration path
- conversation persistence
- conversation state engine
- AI sales orchestration
- human approval workflow
- CRM inbox shell
- PDF generation capabilities
- AI ↔ human operational handoff patterns

## Current limitations
- dominio muy acoplado a SN8 Labs
- flujo comercial centrado en venta de software
- esquema y brief orientados a software projects
- lógica de pricing demasiado verticalizada
- ausencia de entidades multi-tenant reales
- ausencia de módulo explícito de knowledge base reusable
- el producto aún no está organizado como plataforma SaaS

---

# 4. Target Product Shape

## SaaS Core Modules
1. Workspace / SaaS Core
2. Bot Management
3. Channel Connections
4. Knowledge Base
5. Flow Builder
6. Conversations & Inbox
7. Leads / Sales Pipeline
8. Offers / Quotes (optional)

## Initial Channel Focus
- WhatsApp first

## Future Expansion
- Instagram
- Webchat
- otros canales

---

# 5. Target Domain Model

## Core entities
- `User`
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
- `Message`
- `ConversationState`
- `Lead`
- `LeadField`
- `LeadFieldValue`
- `Opportunity` (optional or later)

## Optional commercial entities
- `OfferDraft`
- `OfferReviewEvent`
- `OfferDocument`
- `PricingTemplate`

---

# 6. Transition Map

## Keep with adaptation
- `Message`
- `ConversationState`
- `User`

## Rename / reinterpret
- `CommercialBrief` → `LeadProfile` or absorbed into `Lead`
- `QuoteDraft` → `OfferDraft`
- `QuoteReviewEvent` → `OfferReviewEvent`
- `PricingRule` → `PricingTemplate`

## Move to optional module
- quote generation
- offer review workflow
- pricing rules
- proposal PDF as commercial offer output

## Create new
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

# 7. MVP Definition

## Core MVP
The first SaaS MVP should include:
- workspace creation
- workspace membership and roles
- one bot per workspace minimum
- one WhatsApp connection per workspace minimum
- knowledge base management
- lightweight flow builder with constrained blocks
- inbox with AI/human control
- lead capture
- lead qualification
- basic dashboard/analytics

## Not required in core MVP
- advanced quoting for all customers
- multi-channel expansion
- advanced automation marketplace
- complex analytics
- billing sophistication
- industry template marketplace

---

# 8. MVP Builder Scope

## Allowed block types in MVP
- start
- send message
- ask question
- capture field
- condition
- search knowledge base
- ai response
- qualify lead
- assign to human
- call to action / scheduling
- webhook
- end

## Product rule
No construir un builder universal en la primera versión.
Construir un builder comercial restringido.

---

# 9. Knowledge Base Scope

## Knowledge must support
- FAQs
- services/products
- objections
- policies
- pricing guidance
- company information
- documents

## Recommended content strategy
Soportar tanto:
- contenido estructurado
- contenido libre/documental

Esto permite mejor control y mejores respuestas del bot.

---

# 10. Technical Architecture Principles

1. Toda entidad de negocio principal debe pertenecer a un `workspaceId`.
2. Los bots deben ser configurables por workspace.
3. Los canales deben aislarse por workspace.
4. La knowledge base debe aislarse por workspace.
5. El motor de ofertas no debe contaminar el core.
6. El sistema debe seguir funcionando aunque el módulo de ofertas esté deshabilitado.
7. El modelo de conversación debe ser explícito y reusable.

---

# 11. Execution Strategy

La transformación no debe hacerse como reescritura total.
Debe ejecutarse por capas y fases.

## Recommended order
1. SaaS foundation and multi-tenant core
2. Bot + knowledge base layer
3. Flow builder MVP
4. SaaS operating surface (UI/UX)
5. Optional offer/quote module

---

# 12. Phased Execution Plan

## Phase 1 - SaaS Foundation Refactor

### Goal
Desacoplar el sistema del modelo single-tenant actual y preparar el núcleo multi-tenant.

### Deliverables
- definición oficial del dominio SaaS
- introducción de `Workspace`
- introducción de `WorkspaceMember`
- estrategia de `workspaceId` en el core
- documentación de bounded contexts
- separación conceptual entre core y módulo de ofertas

### Main work
- diseñar nuevo modelo core
- mapear entidades actuales contra entidades SaaS
- preparar plan de migración de esquema
- definir naming final del dominio

### Success criteria
- existe un modelo multi-tenant claro
- el proyecto deja de depender conceptualmente de SN8 como único negocio
- el módulo de ofertas queda desacoplado en diseño

---

## Phase 2 - Bot and Knowledge Core

### Goal
Crear el núcleo funcional del producto SaaS alrededor de bots configurables y knowledge base.

### Deliverables
- modelo `Bot`
- modelo `ChannelConnection`
- modelo `KnowledgeBase`
- modelo `KnowledgeDocument`
- configuración de tono/persona del bot
- relación bot ↔ knowledge base

### Main work
- mover branding/prompts a configuración
- diseñar interfaz de configuración del bot
- crear contratos internos de retrieval/knowledge usage
- dejar al bot consumiendo conocimiento configurable por workspace

### Success criteria
- un workspace puede tener su bot propio
- el bot puede responder usando knowledge configurable
- la identidad comercial del bot deja de estar hardcodeada

---

## Phase 3 - Flow Builder MVP

### Goal
Permitir que cada cliente defina el comportamiento comercial del bot con bloques simples.

### Deliverables
- modelo `Flow`
- modelo `FlowNode`
- modelo `FlowEdge`
- modelo `FlowExecution`
- contrato de bloques soportados
- versión publicable de flujo

### Main work
- definir DSL/contrato interno del builder
- construir motor de ejecución de flujo
- conectar el runtime conversacional al flujo publicado
- soportar preguntas, captura y condiciones

### Success criteria
- un bot ejecuta un flujo configurable
- el flujo no depende de código manual por cliente
- existe una base sólida para builder visual

---

## Phase 4 - SaaS Operating Surface

### Goal
Convertir la interfaz actual en una superficie operativa SaaS usable por clientes reales.

### Deliverables
- onboarding de workspace
- navegación SaaS
- pantalla de bots
- pantalla de knowledge base
- pantalla de channels
- inbox multi-tenant
- leads view
- settings del workspace

### Main work
- reorganizar frontend por módulos SaaS
- mantener inbox como pieza central operativa
- agregar pantallas de configuración
- exponer estados de publicación y operación

### Success criteria
- un cliente puede entrar, configurar y operar su bot
- la experiencia deja de ser CRM-interno-only
- el producto ya se ve como SaaS y no como herramienta interna

---

## Phase 5 - Optional Offers Module

### Goal
Reintroducir ofertas/cotizaciones como módulo opcional y monetizable.

### Deliverables
- `OfferDraft`
- `OfferReviewEvent`
- `OfferDocument`
- `PricingTemplate`
- configuración para activar/desactivar módulo por workspace/plan

### Main work
- migrar el quote engine actual a un módulo desacoplado
- adaptar revisión humana al nuevo modelo
- reconectar PDF comercial como salida opcional

### Success criteria
- el sistema funciona sin módulo de ofertas
- el módulo de ofertas puede activarse sin ensuciar el core
- agencias o equipos que sí cotizan pueden usarlo como premium capability

---

# 13. Suggested Execution Discipline

## Rules for implementation
- no abrir varias fases grandes al mismo tiempo
- cerrar diseño mínimo de cada fase antes de codificar demasiado
- preferir cambios que preserven continuidad del sistema actual
- evitar scope creep en builder y analytics
- documentar decisiones de naming y dominio antes de migraciones profundas

---

# 14. Immediate Next Deliverables

## Next recommended documents
1. `SAAS_DOMAIN_MAP.md`
2. `SAAS_PRISMA_PROPOSAL.md`
3. `PHASE_01_SAAS_FOUNDATION_PLAN.md`

## Recommended next action
Start with:
**Phase 1 planning document for SaaS Foundation Refactor**

That should become the first execution artifact for the transformation.

---

# 15. Orchestration Notes

Este archivo se usará como documento madre.

Cada fase nueva debe producir:
- un documento de alcance
- decisiones clave
- entregables
- criterios de éxito
- riesgos
- estado de ejecución

Suggested convention:
- `PHASE_01_SAAS_FOUNDATION_PLAN.md`
- `PHASE_02_BOT_KNOWLEDGE_PLAN.md`
- `PHASE_03_FLOW_BUILDER_PLAN.md`
- `PHASE_04_SAAS_OPERATING_SURFACE_PLAN.md`
- `PHASE_05_OFFERS_MODULE_PLAN.md`

---

# 16. Bottom Line

La transformación correcta no es convertir SN8 CRM en un CRM genérico.
La transformación correcta es convertirlo en un **Sales Bot SaaS**.

El activo principal del proyecto no es el quote engine.
El activo principal es la combinación de:
- mensajería
- estado conversacional
- IA comercial
- knowledge-driven answers
- inbox operativo
- control AI ↔ humano

La misión ahora es reorganizar eso como plataforma reusable, multi-tenant y vendible.
