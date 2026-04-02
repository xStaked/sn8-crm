# Fase 1: Conversación Fluida + Neuroventas

## Contexto
El bot comercial de SN8 Labs presenta conversaciones rígidas y mecánicas. El ejemplo crítico muestra a un usuario (Sergio) intentando cotizar una nueva app ("brújula veterinaria") pero el bot repite insistentemente información de una cotización anterior (CRM con IA), sin reconocer la intención de nuevo proyecto.

## Objetivos
1. **Corregir bug crítico**: El bot debe detectar intención de "nuevo proyecto" ANTES de responder con estado de cotización anterior
2. **Conversación fluida**: Mensajes naturales, variados, que reaccionan al contexto
3. **Neuroventas**: Integrar técnicas de ventas persuasivas (urgencia, storytelling, manejo de objeciones)
4. **Memoria conversacional**: Mantener contexto de la conversación actual, no solo el brief extraído

## Estado Inicial
- `conversation-flow.service.ts` maneja el flujo de cotización
- `bot-conversation.service.ts` maneja estados y transiciones
- Prompts en `src/ai-sales/prompts/` controlan respuestas de IA
- Bug confirmado: `detectsNewProjectIntent()` se evalúa después de verificar `quoteDrafts`

---

## Tareas

### Task 1: Fix Bug - Priorizar Detección de Nuevo Proyecto
**Archivos**: `src/ai-sales/conversation-flow.service.ts`

**Problema**: Líneas 98-103 verifican `quoteDrafts` antes de `detectsNewProjectIntent()`, causando que el bot responda con estado de cotización anterior ignorando la intención del usuario.

**Cambio requerido**:
```typescript
// BEFORE (buggy):
const latestDraft = currentBrief?.quoteDrafts[0];
if (latestDraft) {
  return { body: buildReviewStatusReply(...), ... };
}

// AFTER (fixed):
// 1. Primero detectar si es nuevo proyecto
if (currentBrief && this.detectsNewProjectIntent(input.inboundBody)) {
  await this.prisma.commercialBrief.delete({...});
  // ... resetear estado
}

// 2. Luego verificar drafts
const latestDraft = currentBrief?.quoteDrafts[0];
if (latestDraft) {
  return { body: buildReviewStatusReply(...), ... };
}
```

**Verify**: Test con conversación simulada donde usuario dice "quiero cotizar otro proyecto" teniendo una cotización previa en estado `delivered_to_customer`.

---

### Task 2: Sistema de Variantes de Mensajes
**Archivos**: 
- `src/bot-conversation/prompts/greeting-messages.ts`
- `src/ai-sales/conversation-flow.service.ts`

**Problema**: Mensajes estáticos son predecibles y robóticos.

**Implementación**:
1. Crear `MessageVariantService` que selecciona variantes basadas en:
   - Hash del conversationId (para consistencia)
   - Contexto de la conversación
   - Turno de conversación

2. Variantes para greeting:
   ```typescript
   const GREETING_VARIANTS = {
     first_contact: [
       "¿Qué proyecto tienes en mente? Me cuentas y vemos cómo te podemos ayudar.",
       "¡Hola! Cuéntame sobre tu proyecto — me interesa escuchar qué quieres construir.",
       "¿Buscas cotizar algo o quieres conocer primero cómo trabajamos?",
     ],
     returning_contact: [
       "¡Hola de nuevo! ¿Seguimos con lo mismo o hay algo nuevo en el radar?",
       "¿Cómo vas? ¿Avanzamos con lo que hablamos o surge algo más?",
     ]
   };
   ```

3. Variantes para `buildReadyForQuoteReply()`:
   - Eliminar "Perfecto. Con lo que tengo hasta ahora..." como única opción
   - Crear 5+ variantes con diferentes aperturas
   - Incluir técnicas de cierre suave

**Verify**: Cada conversación debe mostrar mensajes diferentes pero coherentes.

---

### Task 3: Prompt de Neuroventas para Discovery
**Archivos**: `src/ai-sales/prompts/discovery-reply.prompt.ts`

**Problema**: El prompt actual es funcional pero carece de técnicas de persuasión.

**Mejoras al prompt**:
1. Agregar técnicas de neuroventas:
   - **Reciprocidad**: Ofrecer valor antes de pedir información
   - **Autoridad**: Mencionar experiencia relevante brevemente
   - **Escasez**: Mencionar disponibilidad de equipo cuando aplique
   - **Commitment consistent**: Pequeños síes progresivos

2. Instrucciones específicas:
   ```
   - Usa el nombre del cliente si está disponible
   - Reconoce el esfuerzo/progreso del cliente: "Veo que ya tienes claro X"
   - Conecta emocionalmente con el problema de negocio
   - Si el proyecto es ambicioso, validar la visión antes de pedir detalles
   - Maneja objeciones implícitas (presupuesto, tiempo) de forma suave
   ```

3. Ejemplos few-shot en el prompt con conversaciones exitosas

**Verify**: Las respuestas deben sentirse más consultivas y menos interrogativas.

---

### Task 4: Memoria de Contexto Conversacional
**Archivos**:
- `src/ai-sales/conversation-flow.service.ts`
- `src/ai-sales/prompts/discovery-reply.prompt.ts`

**Problema**: El bot solo extrae campos del brief, pero pierde el hilo conversacional.

**Implementación**:
1. Extender `CommercialBrief` en schema.prisma:
   ```prisma
   model CommercialBrief {
     // ... campos existentes
     conversationContext Json? // Almacena temas mencionados, tono, preocupaciones
   }
   ```

2. En `planReply()`, extraer contexto adicional:
   - Temas mencionados por el cliente
   - Nivel de urgencia percibido
   - Preocupaciones/objeciones expresadas
   - Tono de la conversación (formal/casual/técnico)

3. Incluir contexto en el prompt de discovery:
   ```typescript
   export type DiscoveryReplyInput = {
     transcript: string;
     missingField: string;
     isFirstTouch: boolean;
     knownProjectType?: string | null;
     conversationContext?: {  // NUEVO
       previousTopics: string[];
       customerTone: 'formal' | 'casual' | 'technical';
       expressedConcerns: string[];
     };
   };
   ```

**Verify**: El bot debe recordar y referenciar temas mencionados 2-3 mensajes atrás.

---

### Task 5: Mejorar Manejo de "Off-Flow"
**Archivos**: `src/bot-conversation/prompts/off-flow.prompt.ts`

**Problema**: Mensajes de off-flow son genéricos y no guían efectivamente.

**Mejoras**:
1. Detectar tipo de desvío:
   - Pregunta sobre precio temprano
   - Cambio de tema
   - Pregunta técnica específica
   - Solicitud de ejemplo/caso

2. Respuestas contextualizadas:
   ```typescript
   const OFF_FLOW_RESPONSES = {
     early_price_question: [
       "Entiendo que el presupuesto es clave. Para darte un rango realista, necesito entender primero el alcance. ¿Me cuentas un poco más sobre qué necesitas?",
       "Claro, el precio importa. Depende mucho de los detalles del proyecto. ¿Qué alcance tienes en mente?",
     ],
     topic_switch: [
       "Me parece bien cambiar de tema. ¿Esto es parte del mismo proyecto o es algo aparte?",
       "Vale, entiendo. ¿Esto complementa lo que hablamos o es un proyecto diferente?",
     ],
     technical_question: [
       "Buena pregunta técnica. Depende de varios factores del proyecto. ¿Ya tienes definida la arquitectura o lo vemos juntos?",
     ],
   };
   ```

**Verify**: Las respuestas off-flow deben sentirse naturales, no como "vuelve al guión".

---

### Task 6: Sistema de Seguimiento Post-Cotización
**Archivos**: 
- `src/ai-sales/conversation-flow.service.ts`
- Nuevo: `src/ai-sales/follow-up.service.ts`

**Problema**: Cuando la cotización está en revisión, el bot no maneja bien el seguimiento.

**Implementación**:
1. Distinguir estados de follow-up:
   - Usuario pregunta por cotización pendiente → Estado actual
   - Usuario quiere modificar brief → `changes_requested`
   - Usuario quiere nuevo proyecto → Resetear (ya implementado en Task 1)

2. Mensajes más específicos por estado:
   ```typescript
   const FOLLOW_UP_RESPONSES = {
     pending_owner_review: [
       "Tu propuesta está en revisión interna. Usualmente tardamos 24-48h. Te aviso en cuanto tenga novedades.",
       "Estoy esperando feedback del equipo técnico. ¿Hay algo más que quieras agregar mientras tanto?",
     ],
     changes_requested: [
       "Estoy ajustando la propuesta con los cambios que pediste. ¿Algo más que deba considerar?",
     ],
     delivered_to_customer: [
       "¿Qué te pareció la propuesta? ¿Tienes dudas o quieres ajustar algo?",
       "¿Avanzamos con lo que enviamos o necesitas que revisemos algún punto?",
     ],
   };
   ```

**Verify**: Cada estado debe tener respuestas apropiadas que abran diálogo.

---

## Verification Criteria

- [ ] Bug de nuevo proyecto corregido: usuario puede iniciar nueva cotización teniendo una previa
- [ ] Mensajes variados: 3+ conversaciones paralelas muestran greetings diferentes
- [ ] Tono neuroventas: respuestas incluyen validación emocional y técnicas de persuasión
- [ ] Contexto conversacional: bot referencia temas mencionados anteriormente
- [ ] Off-flow natural: respuestas guían sin ser rígidas
- [ ] Tests pasan: `npm test` sin errores en módulos modificados

---

## Dependencias
- Schema de Prisma (para extensión de CommercialBrief)
- Servicio de IA existente (Deepseek)
- Sistema de mensajería WhatsApp

## Estimación
- Task 1: 2h (fix + tests)
- Task 2: 3h (sistema de variantes)
- Task 3: 2h (mejora de prompts)
- Task 4: 4h (contexto conversacional + migración)
- Task 5: 2h (off-flow mejorado)
- Task 6: 3h (follow-up service)

**Total: ~16 horas**
