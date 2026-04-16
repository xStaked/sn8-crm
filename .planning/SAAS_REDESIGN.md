# SaaS Redesign Proposal - SN8 CRM → Sales Bot SaaS

## 1. Executive Summary

El proyecto actual tiene una base técnica útil, pero sigue diseñado como una operación single-tenant y verticalizada para SN8 Labs. La oportunidad real no es convertirlo en un CRM genérico, sino en un **SaaS de bot de ventas con base de conocimiento y builder visual simple**, enfocado inicialmente en WhatsApp.

La propuesta es evolucionar el producto desde un bot comercial para vender servicios de software hacia una plataforma donde cada cliente pueda:

- crear su workspace
- conectar su canal de ventas
- cargar su base de conocimiento
- configurar su identidad comercial
- armar su flujo con bloques simples
- publicar su bot y empezar a vender

La mejor estrategia es **generalizar el core** y **mantener una UX enfocada en ventas**. No conviene construir un CRM genérico ni un builder excesivamente libre en el MVP.

---

## 2. Current State Assessment

## Lo que ya existe y vale la pena conservar

El proyecto ya tiene activos importantes:

- backend NestJS
- frontend Next.js
- webhook inbound/outbound para WhatsApp
- persistencia de mensajes
- estado conversacional
- agente IA comercial
- borradores de cotización
- flujo de aprobación humana
- inbox CRM
- generación de PDF comercial
- base para handoff AI ↔ humano

Estas piezas permiten acelerar mucho un SaaS si se reorganizan correctamente.

## Principales acoplamientos actuales

Hoy el sistema está acoplado a SN8 Labs en varios niveles:

- branding y copy orientados a SN8 Labs
- flujo comercial pensado para vender desarrollo de software
- modelo de brief rígido para proyectos de software
- pricing y cotización centrados en lógica de agencia/software factory
- ausencia de entidades multi-tenant reales
- ausencia de un módulo explícito de knowledge base configurable
- experiencia operativa pensada para un solo negocio

Conclusión: el producto actual es una buena base de motor conversacional comercial, pero todavía no es una base SaaS lista para múltiples clientes.

---

## 3. New Product Direction

## Producto objetivo

**Sales Bot SaaS**

Una plataforma para crear bots de ventas entrenados con la información del negocio, conectados a WhatsApp, configurables mediante bloques visuales simples y diseñados para captar leads, responder preguntas, calificar prospectos y derivar ventas.

## Propuesta de valor

"Crea un bot de ventas para WhatsApp con base de conocimiento y flujos visuales, sin programar."

## Enfoque correcto

No construir primero un CRM genérico.
No construir primero un builder estilo n8n.
No construir primero una plataforma multiuso infinita.

Sí construir:

- un **core multi-tenant reusable**
- una **UX enfocada en bot de ventas**
- una **configuración simple pero poderosa**
- un **MVP que un cliente pueda activar rápido**

---

## 4. Strategic Positioning

## Qué deja de ser

- un bot interno para SN8 Labs
- un CRM exclusivo para vender software a medida
- un sistema de cotización pensado solo para servicios técnicos

## Qué pasa a ser

- una plataforma SaaS de automatización comercial conversacional
- una herramienta no-code/light-code para equipos de venta
- un sistema centrado en captura, calificación y avance del lead

## ICP inicial recomendado

- agencias
- clínicas
- inmobiliarias
- empresas de servicios
- educación
- negocios B2B con alto volumen por WhatsApp

---

## 5. Product Principles

1. **Generalizar el core, no la complejidad de la interfaz.**
2. **Resolver ventas primero, no CRM total.**
3. **La base de conocimiento es un activo principal del producto.**
4. **El builder debe ser simple, no universal.**
5. **Cotizaciones deben vivir como módulo opcional, no como núcleo obligatorio.**
6. **Cada cliente debe sentir el producto suyo sin requerir desarrollo a medida.**
7. **Multi-tenant y configuración por workspace deben existir desde el rediseño base.**

---

## 6. Target Functional Architecture

## Core entities to introduce

### Workspace layer
- `Workspace`
- `WorkspaceMember`
- `WorkspaceSettings`
- `SubscriptionPlan`

### Bot layer
- `Bot`
- `BotVersion`
- `BotPersona`
- `BotChannelConnection`

### Knowledge layer
- `KnowledgeBase`
- `KnowledgeDocument`
- `KnowledgeChunk` or retrieval index abstraction
- `KnowledgeSource`

### Flow layer
- `Flow`
- `FlowVersion`
- `FlowNode`
- `FlowEdge`
- `FlowExecution`

### Commercial layer
- `Lead`
- `LeadFieldValue`
- `Conversation`
- `ConversationParticipant`
- `ConversationAssignment`
- `Opportunity`
- `OfferDraft` (optional module)

### Operations layer
- `HumanHandoff`
- `AutomationRule`
- `Tag`
- `AuditEvent`

---

## 7. Core Domain Shift

## From current domain

Current domain is roughly:
- software project discovery
- software quote generation
- owner review
- WhatsApp follow-up

## To target domain

Target domain should be:
- business identity
- lead capture
- qualification
- knowledge-based answering
- sales flow orchestration
- human escalation
- optional offer/quote generation

## Recommended renames

- `CommercialBrief` → `LeadProfile` or `OpportunityProfile`
- `QuoteDraft` → `OfferDraft`
- `QuoteReviewEvent` → `OfferReviewEvent`
- `PricingRule` → `OfferRule` or `PricingTemplate`

This keeps future verticals open and avoids software-agency-only semantics.

---

## 8. What to Keep, Refactor, or Replace

## Keep

- inbound/outbound messaging pipeline
- conversation persistence
- conversation state engine
- AI/human handoff concept
- inbox CRM shell
- review workflow patterns
- PDF generation capability as optional value-added module
- backend/frontend separation

## Refactor

- brief extraction to support configurable lead schemas
- quote engine into optional offer engine
- prompts and persona into bot-level configuration
- conversation orchestration into configurable stages
- current control modes into tenant/bot aware operation modes

## Replace or abstract

- SN8-specific copy and brand logic
- software-only discovery assumptions
- rigid project quotation flow as default behavior
- internal-only ownership model

---

## 9. SaaS MVP Recommendation

## MVP goal

Un cliente puede activar un bot comercial en WhatsApp y empezar a captar, responder y calificar leads sin intervención técnica diaria.

## MVP scope

### Included
- workspace creation
- user authentication
- one bot per workspace
- one WhatsApp connection per workspace initially
- brand settings
- knowledge base upload and management
- lightweight visual builder with a restricted set of blocks
- inbox with takeover humano
- lead capture and qualification
- analytics básicos

### Optional in MVP, not core
- quote/offer generation
- PDF proposals
- advanced pipeline reporting
- multi-channel
- complex automation marketplace
- template marketplace
- advanced billing engine

---

## 10. Builder Scope for MVP

Do not build a fully open automation builder.
Build a constrained sales-flow builder.

## Recommended block types

- Start
- Send message
- Ask question
- Capture field
- Condition
- Search knowledge base
- AI response
- Qualify lead
- Assign to human
- Schedule / CTA
- Generate offer (optional)
- Webhook / integration
- End

## Why this is enough

With these blocks the platform can cover most first-sale use cases without becoming a full automation platform.

---

## 11. Knowledge Base Strategy

Knowledge must become a first-class product capability.

## Required capabilities

- create one or more knowledge bases per workspace
- upload docs / FAQs / service descriptions
- define categories or sources
- publish and version knowledge changes
- let bots use one or more knowledge bases
- retrieval-ready architecture for semantic answering

## Suggested knowledge content types

- company info
- services/products
- FAQs
- pricing guidance
- objections handling
- policies
- case studies
- scripts

---

## 12. Multi-Tenancy Requirements

This is non-negotiable for the redesign.

## Minimum requirements

- every core business entity must belong to a `workspaceId`
- access control must be workspace-scoped
- bot configuration must be isolated per workspace
- knowledge bases must be isolated per workspace
- channels must be isolated per workspace
- metrics and logs must be scoped by workspace

## Recommendation

Use row-level tenancy in the app layer first. Keep infra simple.
You do not need per-tenant database isolation in MVP.

---

## 13. Offer / Quote Module Strategy

The current quote flow is useful, but it should stop being the center of the product.

## Recommendation

Move quoting into an optional module:
- some workspaces will only want FAQ + lead qualification
- others will want appointment booking
- others will want proposal generation
- software agencies may want structured quoting like SN8

## Product implication

The product should work even if quoting is disabled.

---

## 14. UI / UX Evolution

## Current UI strength

The inbox-first CRM shell is useful and should remain.

## New UX layers to add

- onboarding wizard
- create workspace
- create bot
- upload knowledge
- configure brand/persona
- build flow visually
- test bot
- connect channel
- publish bot

## Recommended navigation for MVP

- Dashboard
- Inbox
- Leads
- Bot Builder
- Knowledge Base
- Channels
- Settings
- Analytics

---

## 15. Technical Refactor Strategy

## Phase A - Decouple SN8

Objective:
Remove brand and domain assumptions from the current architecture.

Tasks:
- move prompts and copy into configuration
- identify hardcoded software-sales assumptions
- isolate quote logic behind a module boundary
- rename domain entities where necessary
- document tenant boundaries

## Phase B - Introduce SaaS core

Tasks:
- add workspace model
- add workspace membership model
- attach workspaceId to existing and new entities
- create bot configuration model
- create knowledge base models
- create flow models

## Phase C - Recompose product experience

Tasks:
- onboarding
- settings by workspace
- builder UI
- knowledge base UI
- bot test console
- channel configuration UI

## Phase D - Advanced monetizable modules

Tasks:
- offer/quote module
- industry templates
- analytics improvements
- advanced automation
- multi-channel support

---

## 16. Roadmap Recommendation

## Phase 1 - SaaS Foundation Refactor

Deliverables:
- workspace-aware domain model
- configuration extraction for branding/persona
- documented modular boundaries
- current SN8 flow still operating under one workspace

## Phase 2 - Sales Bot Core

Deliverables:
- bot configuration per workspace
- knowledge base module
- generic lead schema support
- reusable sales orchestration core

## Phase 3 - Builder MVP

Deliverables:
- visual flow editor with restricted blocks
- flow versioning
- publish/unpublish flow
- bot testing sandbox

## Phase 4 - SaaS Operating Surface

Deliverables:
- onboarding
- channels
- settings
- analytics basics
- workspace management

## Phase 5 - Premium Modules

Deliverables:
- offer generation
- PDF proposals
- industry templates
- advanced lead scoring
- additional channels

---

## 17. Main Risks

### Risk 1: Over-generalizing too early
If everything becomes configurable from day one, delivery slows down and product clarity suffers.

### Risk 2: Keeping too much SN8 DNA in the core
If core business logic stays tied to software-sales assumptions, every new customer becomes a custom implementation.

### Risk 3: Building an overly powerful builder
A builder that is too flexible becomes expensive to build, hard to support, and harder to sell.

### Risk 4: Treating quoting as the whole product
That would narrow the addressable market too early.

---

## 18. Recommended Product Thesis

The product thesis should be:

**A WhatsApp-first sales bot SaaS that lets businesses configure a commercial assistant using knowledge + simple visual flows, without code.**

That is more sellable, broader, and faster to MVP than trying to become a complete CRM or a full automation engine.

---

## 19. Immediate Next Steps

Recommended next step after this document:

1. define the new domain model and modular boundaries
2. design the first SaaS-oriented Prisma schema
3. map current tables to future equivalents
4. define the MVP builder block contract
5. define onboarding and bot configuration flow

## My recommendation

Do next:
**Create the initial SaaS domain map + Prisma schema proposal**

That will turn this direction into an implementable architecture.

---

## 20. Bottom Line

This project should not evolve into a generic CRM.
It should evolve into a **Sales Bot SaaS**.

The current codebase already contains the hardest early pieces: messaging, state, AI orchestration, review patterns, and operational inbox.

The key is now to:
- remove SN8-specific assumptions
- introduce workspace-based architecture
- make knowledge and flows first-class
- keep quoting optional
- ship a constrained but useful builder

That path is the most practical, most monetizable, and most aligned with a fast MVP strategy.
