# SNL-1 -- Diseño Bot de Cotizaciones (WhatsApp + CRM)

## 1) Diagnóstico de la base actual

Estado observado en `sn8-wpp-crm`:

- Ya existe pipeline funcional: WhatsApp inbound -> discovery -> brief estructurado -> draft -> revisión interna -> PDF.
- Módulos clave actuales:
  - `bot-conversation`: manejo de intención y respuestas discovery.
  - `ai-sales`: extracción de brief, generación de draft, orquestación y revisión owner.
  - `conversations`: APIs para CRM (aprobar, pedir cambios, reenviar PDF).
  - `quote-documents`: render de PDF de cotización.
- Buen guardrail comercial: no prometer precio/cierre sin revisión humana.
- Gap principal: `QUOTE_TEMPLATE` sigue en `pending-owner-template`, por lo que falta codificar una plantilla de pricing oficial y reglas comerciales cerradas.

Conclusión: no se parte de cero; conviene evolucionar la base actual a un motor de cotización paramétrico.

## 2) Flujo conversacional propuesto

Estados propuestos (por conversación):

1. `greeting`: saludo + propósito.
2. `qualification`: confirma tipo de proyecto y problema.
3. `discovery_scope`: define alcance MVP y plataforma.
4. `discovery_constraints`: integraciones, compliance, restricciones técnicas.
5. `discovery_budget_timeline`: rango de inversión y urgencia.
6. `scoring`: clasifica complejidad y riesgo.
7. `quote_draft_ready`: genera borrador estructurado.
8. `owner_review`: revisión interna en CRM.
9. `customer_delivery`: envío de propuesta aprobada.
10. `follow_up`: seguimiento y cierre.

Preguntas clave mínimas (sin fricción):

- ¿Qué quieres construir? (landing, app, SaaS, automatización, IA)
- ¿Qué problema de negocio resuelve?
- ¿Qué incluye el MVP sí o sí?
- ¿Web, mobile o ambos?
- ¿Qué integraciones necesitas? (CRM, pagos, ERP, WhatsApp, etc.)
- ¿Rango de presupuesto? (si no tiene, marcar `presupuesto abierto`)
- ¿Fecha objetivo?

Regla UX comercial:

- Máximo 1 pregunta por mensaje.
- Si cliente no define presupuesto/fecha tras 2 intentos, continuar sin bloquear.

## 3) Clasificación del tipo de proyecto

Taxonomía propuesta:

- `landing`
- `web_app`
- `mobile_app`
- `saas`
- `automation`
- `ai_solution`
- `hybrid`

Motor de clasificación:

- Primer nivel: intent classifier (rápido) basado en texto + keywords.
- Segundo nivel: LLM validation con salida JSON estricta.
- Tercer nivel: fallback a `hybrid` cuando hay ambigüedad.

Campos de clasificación persistidos:

- `projectCategory`
- `platforms[]`
- `featureBuckets[]`
- `integrationCount`
- `complianceLevel`

## 4) Estimación de precios por complejidad

Como hoy no hay matriz oficial codificada, propongo modelo paramétrico compatible con el estado actual:

`precio_estimado = base_categoria + complejidad + integraciones + urgencia + riesgo`

Componentes:

- `base_categoria`: valor base por tipo (landing/web/mobile/saas/automation/ai).
- `complejidad` (1-5): depende de features críticas, roles, flujos, datos.
- `integraciones`: costo por integración según dificultad.
- `urgencia`: multiplicador por timeline comprimido.
- `riesgo`: margen por incertidumbre técnica.

Salidas de pricing:

- `min`
- `target`
- `max`
- `confidence` (`low|medium|high`)
- `assumptions[]`

Regla de coherencia con precios actuales:

- Inicialmente usar el presupuesto del cliente + histórico de cotizaciones aprobadas para calibrar `base_categoria` y multiplicadores.
- No hardcodear rangos en prompts: persistir en tabla/config editable desde CRM.

## 5) Estructura automática de cotización

Formato de salida estándar:

1. Resumen ejecutivo
2. Objetivo de negocio
3. Alcance funcional (MVP / Fase 2 opcional)
4. Supuestos y exclusiones
5. Estimación comercial:
   - Rango de inversión (`min-target-max`)
   - Cronograma estimado por fases
6. Stack/arquitectura sugerida
7. Próximos pasos
8. Nota legal/comercial

Formato JSON interno sugerido:

- `quoteSummary`
- `scope.included[]`
- `scope.excluded[]`
- `pricing.{currency,min,target,max}`
- `timeline.phases[]`
- `assumptions[]`
- `risks[]`
- `nextSteps[]`

## 6) Arquitectura de sistema

Arquitectura objetivo:

- Canal:
  - `KapsoAdapter` (ya existente) para WhatsApp.
- Orquestación:
  - `ConversationFlowService` (estado y transición).
  - `QuoteEstimatorService` (nuevo) para scoring/pricing.
- IA:
  - `BriefExtraction` + `DiscoveryReply` + `QuoteDraft` (ya existente).
- Persistencia:
  - PostgreSQL (Prisma) + Redis/BullMQ.
- Documentos:
  - `quote-documents` para PDF.
- CRM:
  - Endpoints existentes de review + nuevos endpoints de pricing config.

Nuevos componentes recomendados:

- `pricing-rules` module:
  - CRUD de reglas por categoría/complejidad.
  - versionado de reglas.
- `quote-scoring` module:
  - calcula score y confidence.
- `quote-audit` module:
  - guarda por qué se calculó cada número (trazabilidad comercial).

## 7) Integración con CRM

Flujo CRM propuesto:

1. Ver conversación + brief + score + rango sugerido.
2. Ajustar supuestos/rango manualmente.
3. Aprobar o pedir cambios.
4. Emitir PDF final y enviar por WhatsApp.
5. Marcar resultado (`won|lost|pending`) para retroalimentar calibración.

Nuevos datos a mostrar en CRM:

- `complexityScore`
- `pricingBreakdown`
- `confidence`
- `ruleVersionUsed`
- `ownerAdjustments`

## 8) Escalabilidad multi-cliente

Para escalar en agencia/múltiples cuentas:

- Introducir `tenantId` en entidades comerciales (brief, draft, reglas, eventos).
- Versionar prompts y reglas por tenant.
- Separar colas por prioridad (discovery, draft, revision).
- Telemetría por tenant: tasa de conversión, tiempo de cotización, precisión estimada vs venta real.

## 9) Plan de implementación recomendado

Fase 1 (rápida, 1 semana):

- Formalizar `QuoteTemplate` oficial (quitar `pending-owner-template`).
- Crear schema `PricingRule` + `QuoteEstimateSnapshot`.
- Implementar `QuoteEstimatorService` con scoring básico.

Fase 2 (1-2 semanas):

- Integrar estimador en `AiSalesOrchestrator`.
- Exponer breakdown en APIs de `conversations` para CRM.
- Añadir trazabilidad (`ruleVersionUsed`, supuestos, confidence).

Fase 3 (1 semana):

- UI CRM para editar reglas de pricing.
- Métricas de calidad de estimación y feedback loop.

## 10) Cambios concretos sugeridos en este repo

Backend:

- `apps/backend/src/ai-sales/`:
  - añadir `quote-estimator.service.ts`
  - extender `ai-provider.interface.ts` para incluir `quoteEstimate` estructurado.
- `apps/backend/prisma/schema.prisma`:
  - modelos nuevos: `PricingRule`, `QuoteEstimateSnapshot`, `QuoteOutcome`.
- `apps/backend/src/conversations/`:
  - endpoints para leer/editar reglas y ver breakdown.
- `apps/backend/src/quote-documents/`:
  - mapear campos de `pricingBreakdown` en PDF final.

Operación:

- migrar pricing fijo de conocimiento tácito a reglas persistidas.
- correr backfill con cotizaciones históricas aprobadas para calibración inicial.

## 11) Riesgos y mitigaciones

Riesgos:

- Drift de precios por prompts no deterministas.
- Sobreestimación/subestimación sin retroalimentación real.
- Fricción comercial si el bot pregunta demasiado.

Mitigaciones:

- Pricing calculado por reglas deterministas (no por LLM libre).
- LLM solo propone alcance/resumen; precios salen del motor de reglas.
- Métricas y ajuste mensual de reglas con datos de cierres reales.

---

## Resultado esperado

Con esta evolución, SN8Labs pasa de un flujo de cotización asistido a un sistema de cotización automatizado, trazable y escalable, manteniendo coherencia con el proceso actual de revisión interna y control comercial.
