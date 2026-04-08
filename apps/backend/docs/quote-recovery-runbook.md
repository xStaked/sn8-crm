# Quote recovery runbook (CRM)

## Objetivo

Desbloquear conversaciones donde el CRM no muestra draft activo de cotización y asegurar continuidad comercial sin intervención técnica.

## Cuándo usarlo

Aplica cuando en el panel aparece `Sin draft activo` con estado de ciclo `brief_complete`, `quote_archived` o similar.

## Flujo operativo en CRM

1. Abrir la conversación afectada en Inbox.
2. Revisar el bloque de recuperación de cotización.
3. Ejecutar la acción según el estado:
- `Crear draft`: cuando hay brief completo y falta draft activo.
- `Reiniciar brief`: cuando el contexto quedó inconsistente o se cambió de proyecto.
- `Volver al chat`: para continuar conversación sin forzar cambios de cotización.
4. Confirmar resultado esperado:
- Si se creó draft, debe aparecer la tarjeta `Revision comercial lista dentro del CRM`.
- Si se reinició brief, el estado debe pasar a captura de brief y continuar recolección por chat.

## Diagnóstico rápido (telemetría)

Eventos a revisar en logs:

- `quote_draft_missing`
- `quote_state_mismatch`
- `quote_flow_restarted`

Campos mínimos para trazabilidad:

- `conversationId`
- `briefStatus`
- `lifecycleState`
- `trigger` o `reason` (cuando aplique)

## Escalación

Escalar a ingeniería cuando ocurra cualquiera de estos casos:

- Más de 2 reinicios de brief en la misma `conversationId` durante 24h.
- `quote_state_mismatch` repetido después de `Crear draft`.
- Error 4xx/5xx persistente al ejecutar `Crear draft` o `Reiniciar brief`.

Al escalar, incluir:

- `conversationId`
- marca de tiempo del último intento
- acción ejecutada
- captura breve del estado visible en CRM
