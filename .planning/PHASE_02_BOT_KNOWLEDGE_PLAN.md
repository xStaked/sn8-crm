# Phase 02 - Bot and Knowledge Core Plan

## Phase Name
Bot and Knowledge Core

## Objective
Construir el núcleo funcional del producto SaaS alrededor de bots configurables por workspace y una knowledge base reusable, eliminando dependencias de identidad hardcodeada y permitiendo que cada cliente configure su propio asistente comercial.

---

## Why this phase exists

Sin esta fase el producto seguiría atado a una sola personalidad comercial y a un solo negocio. Esta fase convierte la IA comercial actual en un activo reusable por cliente, apoyado en conocimiento configurable y no en copy o prompts rígidos.

---

## Scope

### Included
- modelo `Bot`
- configuración de identidad, tono y objetivo del bot
- modelo `ChannelConnection`
- modelo `KnowledgeBase`
- modelo `KnowledgeDocument`
- relación bot ↔ knowledge
- contratos internos de retrieval/knowledge usage
- desacople de branding/prompts hardcodeados

### Not included
- builder visual completo
- ofertas/cotizaciones como módulo final
- analytics avanzados
- multi-channel real beyond initial design

---

## Main Deliverables

1. un workspace puede tener uno o más bots
2. cada bot tiene configuración propia
3. el bot consume conocimiento configurable del negocio
4. la lógica de respuesta deja de depender de SN8 como identidad fija
5. queda lista la base para conectar el flow builder en la siguiente fase

---

## Problems this phase solves

- elimina prompts y branding hardcodeados
- evita que cada cliente requiera lógica manual por negocio
- vuelve reusable el agente comercial
- hace de la knowledge base una pieza central del producto

---

## Workstreams

### Workstream A - Bot configuration
- definir modelo `Bot`
- definir campos de identidad comercial
- definir configuración operativa del bot
- definir estados draft/published/paused

### Workstream B - Knowledge model
- definir modelo `KnowledgeBase`
- definir `KnowledgeDocument`
- decidir contenido estructurado vs documental
- definir estrategia de publicación/versionado inicial

### Workstream C - AI integration
- adaptar el runtime actual para usar configuración por bot
- desacoplar prompts del negocio SN8
- definir contratos internos de consulta de knowledge

### Workstream D - Channel readiness
- introducir `ChannelConnection`
- definir cómo se liga bot ↔ canal
- preparar aislamiento por workspace

---

## Success Criteria

1. cada workspace puede definir su propio bot
2. cada bot puede consumir su propia knowledge base
3. tono, objetivo e identidad dejan de estar hardcodeados
4. el runtime conversacional puede responder en contexto usando conocimiento configurable
5. queda lista la base para que el flow builder no dependa de copy rígido

---

## Risks

### Risk 1
Hacer una KB demasiado compleja demasiado pronto.

### Mitigation
Comenzar con contenido simple: FAQ, service, policy, objection, document.

### Risk 2
Seguir mezclando prompt engineering con lógica de negocio.

### Mitigation
Separar configuración del bot, retrieval y runtime.

### Risk 3
No dejar clara la relación entre bot y canal.

### Mitigation
Definir explícitamente `ChannelConnection` como entidad del dominio.

---

## Exit Condition

No pasar a la Fase 03 hasta que:
- exista bot configurable por workspace
- exista una knowledge base utilizable
- el runtime ya no dependa de identidad fija de SN8
- haya una base clara para orquestación por flow
