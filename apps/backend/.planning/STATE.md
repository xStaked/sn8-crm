# Estado del Proyecto SN8 CRM Bot

## Proyecto
SN8 Labs - CRM con Bot de Ventas WhatsApp

## Última Actualización
2026-04-01

## Fase Actual
**Fase 1: Conversación Fluida + Neuroventas** (✅ Completada)

## Estado de Fases
| Fase | Estado | Notas |
|------|--------|-------|
| 1 - Conversación Fluida + Neuroventas | ✅ Complete | Todas las tareas implementadas y testeadas |

## Resumen de Implementación Fase 1

### Task 1: Fix Bug - Priorizar Detección de Nuevo Proyecto ✅
- El código ya estaba corregido - `detectsNewProjectIntent()` se evalúa antes de verificar `quoteDrafts`
- Tests existentes verifican el comportamiento correcto

### Task 2: Sistema de Variantes de Mensajes ✅
- Creado `MessageVariantService` con variantes para:
  - Greetings (first_contact, returning_contact)
  - Ready-for-quote messages (5 variantes con técnicas de cierre suave)
  - Review status messages
- Actualizado `greeting-messages.ts` para usar variantes
- Integrado en `conversation-flow.service.ts`

### Task 3: Prompt de Neuroventas para Discovery ✅
- Actualizado `discovery-reply.prompt.ts` con:
  - Técnicas de neuroventas (reciprocidad, autoridad, compromiso)
  - Instrucciones para usar nombre del cliente
  - Validación emocional del proyecto
  - Variantes de acknowledgment (evita "Perfecto" repetitivo)
  - Estructura ACK + VALUE + QUESTION

### Task 4: Memoria de Contexto Conversacional ✅
- Extendido schema de Prisma: `conversationContext` Json field en `CommercialBrief`
- Implementada extracción de contexto en `conversation-flow.service.ts`:
  - Temas mencionados
  - Tono del cliente (formal/casual/técnico)
  - Preocupaciones/objeciones expresadas
- Contexto incluido en el prompt de discovery

### Task 5: Mejorar Manejo de "Off-Flow" ✅
- Actualizado `off-flow.prompt.ts` con:
  - Detección de tipo de desvío (precio temprano, cambio de tema, técnica, ejemplos)
  - Respuestas contextualizadas para cada tipo
  - Sistema de variantes para consistencia
- Tests creados para verificar detección y respuestas

### Task 6: Sistema de Seguimiento Post-Cotización ✅
- Creado `FollowUpService` con:
  - Mensajes diferenciados por estado (pending, changes, delivered)
  - Estrategia progresiva: gentle nudge → value-add → closing attempt
  - Lógica de timing para envío de follow-ups
  - Detección de cuándo escalar a humano
- Tests creados para todas las estrategias

## Tests
- Todos los tests nuevos pasan (53 tests)
- Tests existentes del flujo de conversación continúan pasando
- 1 test pre-existente falla (no relacionado con cambios de Fase 1 - problema de fecha expirada)

## Archivos Modificados/Creados
### Nuevos:
- `src/ai-sales/message-variant.service.ts`
- `src/ai-sales/message-variant.service.spec.ts`
- `src/ai-sales/follow-up.service.ts`
- `src/ai-sales/follow-up.service.spec.ts`
- `src/bot-conversation/prompts/off-flow.prompt.spec.ts`

### Modificados:
- `src/ai-sales/conversation-flow.service.ts`
- `src/ai-sales/conversation-flow.service.spec.ts`
- `src/ai-sales/prompts/discovery-reply.prompt.ts`
- `src/ai-sales/ai-provider.interface.ts`
- `src/ai-sales/ai-sales.module.ts`
- `src/bot-conversation/prompts/greeting-messages.ts`
- `src/bot-conversation/prompts/off-flow.prompt.ts`
- `prisma/schema.prisma`

## Próximos Pasos
- Ejecutar migración de Prisma para aplicar cambios de schema
- Probar conversaciones de ejemplo para verificar mejoras cualitativas
- Monitorear métricas: reducción de human handoff, incremento de briefs completados

## Bloqueadores
Ninguno actualmente

## Decisiones Tomadas
- Se prioriza fix del bug de "nuevo proyecto" antes de mejoras de UX
- Se extenderá schema de CommercialBrief para incluir contexto conversacional
- Se mantendrá compatibilidad con flujo actual mientras se migran mejoras
- Bug crítico confirmado: `detectsNewProjectIntent()` ejecutado después de verificar quoteDrafts
- Ejemplo de Sergio (brújula veterinaria) muestra el problema claramente
