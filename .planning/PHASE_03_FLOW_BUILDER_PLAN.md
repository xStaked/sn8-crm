# Phase 03 - Flow Builder MVP Plan

## Phase Name
Flow Builder MVP

## Objective
Permitir que cada cliente defina el comportamiento comercial de su bot mediante un flujo configurable con bloques simples, sin requerir cambios en código por cada negocio.

---

## Why this phase exists

El producto no será SaaS real mientras cada lógica comercial siga implementándose manualmente. Esta fase convierte el comportamiento del bot en un sistema configurable y publicable.

---

## Scope

### Included
- modelo `Flow`
- modelo `FlowNode`
- modelo `FlowEdge`
- modelo `FlowExecution`
- contrato de bloques soportados
- motor de ejecución mínimo para flujo publicado
- versionado y publicación básica del flujo

### Not included
- builder universal tipo automation platform
- librería gigante de bloques
- branching ultra complejo
- marketplace de templates

---

## Recommended block set for MVP
- start
- send message
- ask question
- capture field
- condition
- search knowledge
- ai response
- qualify lead
- assign to human
- call to action / scheduling
- webhook
- end

---

## Main Deliverables

1. un bot puede ejecutar un flujo configurable
2. el flujo puede publicarse y versionarse
3. existe un contrato estable para los bloques
4. el runtime conversacional puede leer y ejecutar el flujo actual del bot

---

## Problems this phase solves

- evita desarrollo a medida por cliente
- reduce dependencia de copy hardcodeado
- vuelve repetible el onboarding de nuevos clientes
- habilita una propuesta no-code/light-code creíble

---

## Workstreams

### Workstream A - Flow domain
- definir modelos `Flow`, `FlowNode`, `FlowEdge`
- definir estados draft/published
- definir versionado mínimo

### Workstream B - Runtime contract
- definir DSL/config de nodos
- definir inputs/outputs por bloque
- definir cómo persiste `FlowExecution`

### Workstream C - Conversation integration
- conectar runtime actual con el flujo activo
- usar `ConversationState` y/o `FlowExecution` como continuidad de ejecución
- soportar captura y condiciones

### Workstream D - UI readiness
- preparar contrato para builder visual
- asegurar que el backend exponga representación usable para UI

---

## Success Criteria

1. el comportamiento comercial del bot puede modelarse sin tocar código
2. existe una versión publicada del flujo activa por bot
3. el bot responde y avanza según el flujo definido
4. el sistema soporta captura de datos y branching básico
5. el builder se mantiene simple y enfocado en ventas

---

## Risks

### Risk 1
Intentar construir un builder demasiado poderoso.

### Mitigation
Mantener el set de bloques limitado y enfocado en ventas.

### Risk 2
Romper el runtime actual sin transición clara.

### Mitigation
Integrar el flow runner de forma incremental.

### Risk 3
No definir bien el contrato de nodos.

### Mitigation
Diseñar el DSL del builder antes de ampliar la UI.

---

## Exit Condition

No pasar a la Fase 04 hasta que:
- un flujo publicado controle la conversación de forma real
- exista continuidad de ejecución
- el comportamiento por cliente ya no dependa de código manual
