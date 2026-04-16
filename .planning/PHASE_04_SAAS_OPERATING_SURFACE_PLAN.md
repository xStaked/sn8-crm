# Phase 04 - SaaS Operating Surface Plan

## Phase Name
SaaS Operating Surface

## Objective
Transformar la superficie actual del proyecto en una experiencia SaaS usable por clientes reales: onboarding, configuración, operación del bot e inbox multi-tenant.

---

## Why this phase exists

Aunque el backend tenga buen diseño, el producto no se percibirá como SaaS si la interfaz sigue pareciendo una herramienta interna. Esta fase convierte la experiencia en un producto operable por clientes.

---

## Scope

### Included
- onboarding inicial
- navegación SaaS
- pantalla de bots
- pantalla de knowledge base
- pantalla de channel connections
- inbox multi-tenant
- leads view
- settings del workspace
- estados de publicación/operación

### Not included
- billing avanzado
- analytics enterprise
- marketplace de templates
- automatizaciones complejas beyond MVP

---

## Main Deliverables

1. el producto se percibe como SaaS y no como herramienta interna
2. un cliente puede configurar su workspace y su bot
3. un cliente puede operar conversaciones desde el inbox
4. un cliente puede gestionar knowledge y canales sin tocar código

---

## Problems this phase solves

- elimina dependencia de repositorio/configuración manual para operar el producto
- crea una experiencia de onboarding real
- convierte la capa operativa actual en una experiencia productizable

---

## Workstreams

### Workstream A - Information architecture
- definir navegación SaaS
- separar configuración vs operación
- mantener inbox como centro operativo

### Workstream B - Onboarding
- crear flujo inicial de workspace
- creación/configuración básica de bot
- conexión guiada de canal inicial

### Workstream C - Management surfaces
- pantalla de bots
- pantalla de knowledge base
- pantalla de channels
- settings del workspace

### Workstream D - Operating surfaces
- inbox multi-tenant
- vista de leads
- visibilidad de estados del bot
- control AI ↔ humano desde la UI

---

## Success Criteria

1. un cliente puede entrar, entender y configurar el producto
2. la operación diaria del bot es posible desde la UI
3. la experiencia ya se ve como plataforma SaaS
4. la navegación está alineada al nuevo modelo de producto

---

## Risks

### Risk 1
Intentar rehacer toda la UI de una vez.

### Mitigation
Priorizar navegación, onboarding y superficies críticas.

### Risk 2
Perder el valor del inbox por intentar mover demasiado el foco.

### Mitigation
Mantener el inbox como pieza central operativa.

### Risk 3
Crear demasiadas pantallas antes de validar flujos clave.

### Mitigation
Construir primero el recorrido principal: onboarding → config → publish → operate.

---

## Exit Condition

No pasar a la Fase 05 hasta que:
- un cliente pueda configurar su bot desde la UI
- un cliente pueda operar conversaciones desde la UI
- la experiencia se sienta claramente SaaS
