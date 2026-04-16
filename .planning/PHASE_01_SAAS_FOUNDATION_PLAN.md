# Phase 01 - SaaS Foundation Plan

## Phase Name
SaaS Foundation Refactor

## Objective
Preparar el proyecto actual para operar como plataforma SaaS multi-tenant, desacoplando el dominio actual de SN8 Labs y estableciendo la base estructural para workspaces, aislamiento de configuración y modularidad de producto.

---

## Why this phase exists

Hoy el sistema sigue operando conceptualmente como una solución single-tenant, muy amarrada al negocio de SN8 Labs y a un flujo de venta de software. Antes de construir knowledge base SaaS, builder visual o bots configurables por cliente, es obligatorio definir y estabilizar el núcleo multi-tenant.

Esta fase existe para evitar que el producto escale como una colección de personalizaciones por cliente.

---

## Scope

### Included
- definición oficial del dominio SaaS base
- introducción conceptual y técnica de `Workspace`
- introducción de `WorkspaceMember`
- estrategia de `workspaceId` para el core
- definición de bounded contexts principales
- desacople conceptual entre core y módulo de ofertas
- mapa de transición del modelo actual hacia el modelo SaaS
- lineamientos de naming y ownership de entidades

### Not included
- UI final de onboarding SaaS
- flow builder
- knowledge base completa operativa
- multi-channel expansion
- offer/quote module rework completo
- billing y suscripciones completas

---

## Main Deliverables

1. dominio SaaS formalmente definido
2. criterio multi-tenant definido para entidades core
3. mapa de transición actual → SaaS
4. decisión explícita sobre qué queda en core y qué pasa a módulo opcional
5. propuesta base para evolución de schema y módulos backend/frontend

---

## Problems this phase solves

- elimina el supuesto de “un solo negocio”
- reduce acoplamiento a SN8 Labs
- evita seguir agregando features sobre un dominio incorrecto
- crea la base para workspaces, bots, knowledge y flows
- permite que la siguiente fase ya construya producto reusable y no lógica a medida

---

## Target Decisions for this phase

Al terminar esta fase deben quedar resueltas estas decisiones:

1. cuál es la entidad raíz del producto, `Workspace`
2. qué entidades deben llevar `workspaceId`
3. qué entidades actuales se conservan, renombran o deprecán
4. cómo se separa el core del módulo de ofertas/cotizaciones
5. cuál es el nuevo centro del dominio: workspace + bot + knowledge + flow + conversation + lead

---

## Proposed Workstreams

### Workstream A - Domain redesign
- definir bounded contexts
- definir entidades raíz
- definir ownership y relaciones principales
- documentar naming final recomendado

### Workstream B - Multi-tenant model
- definir estrategia de tenancy
- decidir uso obligatorio de `workspaceId`
- listar entidades que deben migrar a tenancy explícita
- definir reglas base de aislamiento de datos

### Workstream C - Current-to-target transition
- mapear modelos actuales
- decidir qué conservar
- decidir qué renombrar
- decidir qué mover a módulo opcional

### Workstream D - Technical refactor preparation
- preparar lineamientos para futura migración de Prisma
- preparar lineamientos para reorganización de módulos NestJS
- preparar lineamientos para nueva navegación SaaS en frontend

---

## Entity Decisions Expected in this phase

### Core entities to establish
- `Workspace`
- `WorkspaceMember`
- `Bot`
- `ChannelConnection`
- `KnowledgeBase`
- `Flow`
- `Conversation`
- `Lead`

### Existing entities to preserve with adaptation
- `User`
- `Message`
- `ConversationState`

### Existing entities to rename or reinterpret
- `CommercialBrief`
- `QuoteDraft`
- `QuoteReviewEvent`
- `PricingRule`

---

## Success Criteria

Esta fase se considera completa cuando:

1. existe un documento madre de transformación SaaS aceptado
2. existe un documento claro para esta fase con alcance y entregables
3. el dominio core ya no depende conceptualmente de SN8 Labs
4. queda definida la estrategia multi-tenant del sistema
5. queda clara la frontera entre core y offers module
6. queda lista la base para diseñar schema SaaS y módulos siguientes

---

## Risks

### Risk 1
Diseñar demasiado abstracto y no aterrizar a implementación.

### Mitigation
Forzar decisiones de entidades, ownership y límites modulares.

### Risk 2
Intentar migrar demasiado desde esta fase.

### Mitigation
Mantener esta fase como diseño estructural y preparación, no como reescritura masiva.

### Risk 3
Mantener demasiados términos del dominio actual.

### Mitigation
Documentar nombres nuevos y dejar explícitos los términos a deprecar.

---

## Recommended Outputs

Al cerrar esta fase deberían existir además:
- `SAAS_DOMAIN_MAP.md`
- `SAAS_PRISMA_PROPOSAL.md`
- backlog inicial de migración técnica

---

## Exit Condition

No pasar a la Fase 02 hasta que exista claridad suficiente para responder:
- quién es el tenant
- qué entidades viven dentro del tenant
- cuál es el centro del producto
- qué queda en core y qué queda como módulo opcional
