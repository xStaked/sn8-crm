# Commercial KB v1 update runbook

Fecha: 2026-04-08  
Fuente base: [SNL-41](/SNL/issues/SNL-41) plan  
Archivo fuente: `apps/backend/src/ai-sales/knowledge/commercial-kb.v1.json`  
Esquema: `apps/backend/src/ai-sales/knowledge/commercial-kb.schema.v1.json`

## Objetivo

Mantener una unica fuente de verdad comercial para el bot IA con taxonomia cerrada y rangos de precio versionados.

## Flujo de actualizacion

1. Editar `commercial-kb.v1.json`.
2. Si cambia estructura/catalogo, editar tambien `commercial-kb.schema.v1.json`.
3. Ejecutar validacion:

```bash
cd apps/backend
npm run kb:validate
```

4. Confirmar salida esperada: `Commercial KB valid (...)`.
5. Crear commit separado por feature (data/schema/docs).

## Reglas que no se negocian

- `version` y `currency` deben coincidir con el esquema.
- Taxonomias permitidas:
  - categoria: `landing_marketing`, `web_operativa`, `crm_sales`, `vertical_saas`, `automation_ia`
  - complejidad: `low`, `medium`, `high`
  - integracion: `none`, `standard`, `advanced`
- Todo entry debe incluir `scopeIncluded`, `scopeExcluded`, `assumptions`, `risks`, `upsells`.
- Siempre usar rango de precio (`priceMin`, `priceTarget`, `priceMax`) con orden `min <= target <= max`.
- Cada registro debe apuntar a la fuente de gobernanza:
  - `source.issue = SNL-41`
  - `source.documentKey = plan`

## Criterios para nueva version

Crear `v2` (nuevo archivo y schema) cuando ocurra al menos una de estas:

- Cambia el catalogo de taxonomias.
- Cambia el modelo de precios (por ejemplo, nueva dimension de riesgo).
- Cambia el contrato minimo de campos obligatorios.

## Checklist de PR

- [ ] KB actualizada con alcance/supuestos/exclusiones claros.
- [ ] Validacion `npm run kb:validate` en verde.
- [ ] Cambios documentados en este runbook (si aplica).
- [ ] Commits separados por feature y mensaje convencional.
