# Quick Task 260401-o9d Summary

## Diagnosis

La causa raiz era de wiring en BullMQ: existian dos `WorkerHost` distintos escuchando la misma cola `ai-sales` (`AiSalesProcessor` y `OwnerReviewProcessor`). En BullMQ, los workers compiten por cualquier job de la cola; no se enrutan por `job.name`. Como ambos processors filtraban por nombre e ignoraban lo que no reconocian, un `process-qualified-conversation` podia ser consumido por el worker de owner review, quedar marcado como completado y no ejecutar `processQualifiedConversation()` ni fallar.

Eso encaja con el patron observado en produccion:

- `CommercialBrief` queda en `ready_for_quote`
- nunca aparece `QuoteDraft`
- nunca aparece `QuoteReviewEvent`
- CRM sigue devolviendo `pendingQuote: null` y `404` en `quote-review`

El flujo tambien prometia "revision interna" demasiado pronto, porque el mensaje al cliente salia apenas se encolaba el job, no cuando el `QuoteDraft` ya existia.

## Changes

- Se consolido el dispatch de la cola `ai-sales` en un solo processor (`AiSalesProcessor`) que enruta explicitamente por `job.name`.
- Se elimino `OwnerReviewProcessor` para evitar competencia entre workers sobre la misma cola.
- Se agrego logging estructurado `ai_sales_job_failed` para que un fallo de job quede visible en logs con `jobName`, `jobId` y `conversationId`.
- Se suavizo el copy al cliente en `ready_for_quote` para no afirmar que la propuesta ya esta en revision interna antes de crear el draft.
- Se agregaron tests del processor unificado para cubrir:
  - job de `process-qualified-conversation`
  - job de `process-owner-revision`
  - rechazo explicito de jobs desconocidos

## Verification

- `npx jest --config jest.config.cjs src/ai-sales/ai-sales.processor.spec.ts src/ai-sales/ai-sales.orchestrator.spec.ts src/ai-sales/conversation-flow.service.spec.ts`
- `npm run build`

Resultado: todo paso localmente.
