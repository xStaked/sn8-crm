# Phase 05 - Offers Module Plan

## Phase Name
Optional Offers Module

## Objective
Reintroducir el motor de ofertas/cotizaciones como un módulo opcional, desacoplado del core del producto SaaS y activable para workspaces que sí necesiten esa capacidad.

---

## Why this phase exists

El proyecto actual tiene valor real en el flujo de cotización, pero si esa lógica sigue dominando el core, reducirá la flexibilidad del SaaS y forzará una visión demasiado estrecha del producto. Esta fase rescata ese valor sin convertirlo en dependencia estructural.

---

## Scope

### Included
- modelo `OfferDraft`
- modelo `OfferReviewEvent`
- modelo `OfferDocument`
- modelo `PricingTemplate`
- activación opcional por workspace/plan
- integración con review humana
- reuso del PDF comercial como salida opcional

### Not included
- pricing universal para todas las industrias
- CPQ enterprise
- automatización comercial compleja beyond offer workflow

---

## Main Deliverables

1. el core del producto funciona sin offers module
2. workspaces seleccionados pueden activar ofertas/cotizaciones
3. la revisión humana se mantiene como capacidad premium
4. el PDF comercial se reaprovecha sin contaminar el core

---

## Problems this phase solves

- conserva el valor del trabajo ya hecho
- evita perder el módulo de cotización existente
- lo convierte en una capability premium y no en el centro del producto

---

## Workstreams

### Workstream A - Domain isolation
- renombrar quote domain a offer domain donde aplique
- documentar límites del módulo
- separar dependencias respecto al core

### Workstream B - Review workflow
- adaptar revisión humana al nuevo dominio
- definir estados y eventos del módulo
- asegurar trazabilidad por workspace

### Workstream C - Output and pricing
- adaptar PDFs a `OfferDocument`
- redefinir pricing como `PricingTemplate`
- decidir qué partes del pricing actual sobreviven al MVP

### Workstream D - Productization
- activar/desactivar módulo por workspace o plan
- decidir visibilidad UI según capacidades activadas

---

## Success Criteria

1. el producto sigue funcionando si offers module está deshabilitado
2. el módulo puede activarse sin acoplarse al core
3. agencias y negocios que sí cotizan pueden usarlo como premium feature
4. la lógica actual de revisión y PDF puede migrarse con límites claros

---

## Risks

### Risk 1
Reintroducir demasiada lógica del dominio viejo dentro del nuevo core.

### Mitigation
Mantener módulo de ofertas explícitamente aislado.

### Risk 2
Intentar hacer pricing multi-industria demasiado pronto.

### Mitigation
Mantener pricing templates simples y por vertical cuando haga falta.

### Risk 3
Volver a centrar el roadmap en cotización.

### Mitigation
Tratar offers como capability premium y no como corazón del SaaS.

---

## Exit Condition

La fase se considera bien cerrada cuando:
- el módulo es opcional de verdad
- el sistema no depende de offers para su operación principal
- la capacidad de oferta/cotización ya vive como feature premium reutilizable
